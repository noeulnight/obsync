import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { verify } from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AppValidationPipe } from '../src/http/pipes/app-validation.pipe';

type Tokens = { accessToken: string; refreshToken: string };

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = 'auth-e2e@example.com';
  const accountEmail = 'account-e2e@example.com';
  const changedEmail = 'changed-e2e@example.com';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({
      where: { email: { in: [email, accountEmail, changedEmail] } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [email, accountEmail, changedEmail] } },
    });
    await app.close();
  });

  function parseTokens(text: string): Tokens {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') throw new Error('Invalid tokens');
    const record = value as Record<string, unknown>;
    if (
      typeof record.accessToken !== 'string' ||
      typeof record.refreshToken !== 'string'
    ) {
      throw new Error('Invalid tokens');
    }
    return {
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
    };
  }

  it('registers once without storing plaintext or returning a hash', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'AUTH-E2E@EXAMPLE.COM', password: 'password123' })
      .expect(201);
    expect(response.text).not.toContain('password');

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toBe('password123');
    await expect(verify(user.passwordHash, 'password123')).resolves.toBe(true);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(409);
  });

  it('exposes public authentication capabilities', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/oidc/config')
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          enabled: unknown;
          registrationEnabled: boolean;
        };
        expect(body).toMatchObject({ registrationEnabled: true });
        expect(typeof body.enabled).toBe('boolean');
      });
  });

  it('protects me and rotates, expires, and revokes refresh tokens', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    const first = parseTokens(login.text);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('authorization', `Bearer ${first.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.text).not.toContain('passwordHash');
      });

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    const second = parseTokens(refreshed.text);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const expired = await app.get(JwtService).signAsync(
      { sub: user.id, type: 'refresh', sid: crypto.randomUUID() },
      {
        secret: 'dev-refresh-secret-change-before-production',
        expiresIn: -1,
      },
    );
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: expired })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refreshToken: second.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);
  });

  it('keeps the web refresh token in a rotating HttpOnly cookie', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/web/login')
      .send({ email, password: 'password123' })
      .expect(200);
    expect(parseWebAccess(login.text).accessToken).toBeTruthy();
    const firstCookie = webCookie(login.headers['set-cookie']);
    expect(firstCookie).toContain('HttpOnly');
    expect(firstCookie).toContain('SameSite=Lax');
    expect(firstCookie).toContain('Path=/api/auth/web');

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/web/refresh')
      .set('cookie', firstCookie)
      .expect(200);
    expect(parseWebAccess(refreshed.text).accessToken).toBeTruthy();
    const secondCookie = webCookie(refreshed.headers['set-cookie']);
    expect(secondCookie).not.toBe(firstCookie);

    await request(app.getHttpServer())
      .post('/api/auth/web/refresh')
      .set('cookie', firstCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/web/logout')
      .set('cookie', secondCookie)
      .expect(204)
      .expect((response) => {
        expect(webCookie(response.headers['set-cookie'])).toContain(
          'obsync_refresh=;',
        );
      });
    await request(app.getHttpServer())
      .post('/api/auth/web/refresh')
      .set('cookie', secondCookie)
      .expect(401);
  });

  it('authorizes an Obsidian device without exposing tokens in the browser', async () => {
    const webLogin = await request(app.getHttpServer())
      .post('/api/auth/web/login')
      .send({ email, password: 'password123' })
      .expect(200);
    const webAccessToken = parseWebAccess(webLogin.text).accessToken;
    const started = await request(app.getHttpServer())
      .post('/api/auth/device/code')
      .send({})
      .expect(201);
    const authorization = started.body as {
      deviceCode: string;
      userCode: string;
      verificationUri: string;
    };
    expect(authorization.verificationUri).toBe('http://localhost:5173/device');

    await request(app.getHttpServer())
      .post('/api/auth/device/token')
      .send({ deviceCode: authorization.deviceCode })
      .expect(200)
      .expect({ status: 'pending' });

    await request(app.getHttpServer())
      .post('/api/auth/device/approve')
      .set('authorization', `Bearer ${webAccessToken}`)
      .send({ userCode: authorization.userCode })
      .expect(204)
      .expect((response) => {
        expect(response.text).not.toContain('accessToken');
        expect(response.text).not.toContain('refreshToken');
      });

    const authorized = await request(app.getHttpServer())
      .post('/api/auth/device/token')
      .send({ deviceCode: authorization.deviceCode })
      .expect(200);
    expect(parseTokens(authorized.text).accessToken).toBeTruthy();
    await request(app.getHttpServer())
      .post('/api/auth/device/token')
      .send({ deviceCode: authorization.deviceCode })
      .expect(400);

    const stored = await prisma.deviceAuthorization.findFirstOrThrow({
      where: { userCodeHash: { not: '' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored.deviceCodeHash).not.toContain(authorization.deviceCode);
    expect(stored.userCodeHash).not.toContain(authorization.userCode);
  });

  it('rejects invalid login and unknown DTO fields', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123', admin: true })
      .expect(400);
  });

  it('updates account details, manages sessions, changes password, and deletes the account', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: accountEmail, password: 'password123' })
      .expect(201);
    const first = parseTokens(
      (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .set('user-agent', 'Obsync Web')
          .send({ email: accountEmail, password: 'password123' })
          .expect(200)
      ).text,
    );
    const authorization = `Bearer ${first.accessToken}`;

    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('authorization', authorization)
      .send({ displayName: 'Noeul' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          email: accountEmail,
          displayName: 'Noeul',
        });
        expect(response.text).not.toContain('passwordHash');
      });
    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('authorization', authorization)
      .send({ email: 'changed-e2e@example.com' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/auth/me')
      .set('authorization', authorization)
      .send({
        email: 'changed-e2e@example.com',
        currentPassword: 'password123',
      })
      .expect(200)
      .expect((response) =>
        expect(response.body as { email: string }).toMatchObject({
          email: 'changed-e2e@example.com',
        }),
      );

    const second = parseTokens(
      (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .set('user-agent', 'Obsidian')
          .send({ email: 'changed-e2e@example.com', password: 'password123' })
          .expect(200)
      ).text,
    );
    const sessions = await request(app.getHttpServer())
      .get('/api/auth/sessions')
      .set('authorization', authorization)
      .expect(200);
    expect(sessions.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userAgent: 'Obsync Web', current: true }),
        expect.objectContaining({ userAgent: 'Obsidian', current: false }),
      ]),
    );
    const obsidian = (
      sessions.body as Array<{ id: string; userAgent: string }>
    ).find((session) => session.userAgent === 'Obsidian');
    expect(obsidian).toBeDefined();
    await request(app.getHttpServer())
      .delete(`/api/auth/sessions/${obsidian?.id}`)
      .set('authorization', authorization)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .patch('/api/auth/password')
      .set('authorization', authorization)
      .send({ currentPassword: 'password123', newPassword: 'new-password123' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'changed-e2e@example.com', password: 'password123' })
      .expect(401);
    const final = parseTokens(
      (
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'changed-e2e@example.com',
            password: 'new-password123',
          })
          .expect(200)
      ).text,
    );
    await request(app.getHttpServer())
      .delete('/api/auth/me')
      .set('authorization', `Bearer ${final.accessToken}`)
      .send({ password: 'new-password123' })
      .expect(204);
    await expect(
      prisma.user.findUnique({ where: { email: 'changed-e2e@example.com' } }),
    ).resolves.toBeNull();
  });
});

function webCookie(value: string | string[] | undefined) {
  const cookie = Array.isArray(value) ? value[0] : value;
  if (!cookie) throw new Error('Missing web session cookie');
  return cookie;
}

function parseWebAccess(text: string) {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('Invalid web token');
  const record = value as Record<string, unknown>;
  if (typeof record.accessToken !== 'string' || 'refreshToken' in record) {
    throw new Error('Invalid web token');
  }
  return { accessToken: record.accessToken };
}
