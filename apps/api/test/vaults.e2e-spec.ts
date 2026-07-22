import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AppValidationPipe } from '../src/http/pipes/app-validation.pipe';

describe('Vaults (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails = ['vault-a@example.com', 'vault-b@example.com'];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  function json(text: string): Record<string, unknown> {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid response');
    }
    return value as Record<string, unknown>;
  }

  async function registerAndLogin(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(200);
    const token = json(response.text).accessToken;
    if (typeof token !== 'string') throw new Error('Missing access token');
    return token;
  }

  async function createVault(token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post('/api/vaults')
      .set('authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    const id = json(response.text).id;
    if (typeof id !== 'string') throw new Error('Missing vault id');
    return id;
  }

  it('supports multiple Vaults and isolates owners with identical 404s', async () => {
    const [tokenA, tokenB] = await Promise.all(
      emails.map((email) => registerAndLogin(email)),
    );
    const vaultA1 = await createVault(tokenA, 'One');
    const vaultA2 = await createVault(tokenA, 'Two');
    await createVault(tokenB, 'Other');

    const list = await request(app.getHttpServer())
      .get('/api/vaults')
      .set('authorization', `Bearer ${tokenA}`)
      .expect(200);
    const listed: unknown = JSON.parse(list.text);
    expect(Array.isArray(listed) && listed).toHaveLength(2);

    await request(app.getHttpServer())
      .get(`/api/vaults/${vaultA1}`)
      .set('authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/vaults/00000000-0000-4000-8000-000000000000')
      .set('authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/vaults/${vaultA1}`)
      .set('authorization', `Bearer ${tokenB}`)
      .send({ name: 'Stolen' })
      .expect(404);

    const invitation = await request(app.getHttpServer())
      .post(`/api/vaults/${vaultA1}/invitations`)
      .set('authorization', `Bearer ${tokenA}`)
      .send({ email: emails[1], role: 'EDITOR' })
      .expect(201);
    const invitationId = json(invitation.text).id;
    if (typeof invitationId !== 'string')
      throw new Error('Missing invitation id');

    const pending = await request(app.getHttpServer())
      .get('/api/invitations')
      .set('authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(JSON.parse(pending.text)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: invitationId, role: 'EDITOR' }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/api/invitations/${invitationId}/accept`)
      .set('authorization', `Bearer ${tokenB}`)
      .expect(201)
      .expect((response) => expect(json(response.text).role).toBe('EDITOR'));
    await request(app.getHttpServer())
      .get(`/api/vaults/${vaultA1}`)
      .set('authorization', `Bearer ${tokenB}`)
      .expect(200)
      .expect((response) => expect(json(response.text).role).toBe('EDITOR'));
    await request(app.getHttpServer())
      .patch(`/api/vaults/${vaultA1}`)
      .set('authorization', `Bearer ${tokenB}`)
      .send({ name: 'Still stolen' })
      .expect(404);

    const member = await prisma.user.findUniqueOrThrow({
      where: { email: emails[1] },
    });
    await request(app.getHttpServer())
      .patch(`/api/vaults/${vaultA1}/members/${member.id}`)
      .set('authorization', `Bearer ${tokenA}`)
      .send({ role: 'VIEWER' })
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/vaults/${vaultA1}/members/${member.id}`)
      .set('authorization', `Bearer ${tokenA}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/vaults/${vaultA1}`)
      .set('authorization', `Bearer ${tokenB}`)
      .expect(404);

    const roomName = `vault:${vaultA2}:manifest`;
    await prisma.yDocument.create({
      data: {
        vaultId: vaultA2,
        roomName,
        state: Y.encodeStateAsUpdate(new Y.Doc()),
      },
    });
    await request(app.getHttpServer())
      .delete(`/api/vaults/${vaultA2}`)
      .set('authorization', `Bearer ${tokenA}`)
      .expect(204);
    await expect(
      prisma.yDocument.findUnique({ where: { roomName } }),
    ).resolves.toBeNull();
  });
});
