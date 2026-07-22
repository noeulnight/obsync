import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AppValidationPipe } from '../src/http/pipes/app-validation.pipe';

describe('Public shares (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = 'public-share@example.com';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('publishes and revokes an anonymous document URL', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(200);
    const token = response(login.text).accessToken;
    if (!token) throw new Error('Missing access token');
    const createdVault = await request(app.getHttpServer())
      .post('/api/vaults')
      .set('authorization', `Bearer ${token}`)
      .send({ name: 'Public Vault' })
      .expect(201);
    const vaultId = response(createdVault.text).id;
    if (!vaultId) throw new Error('Missing Vault ID');
    const fileId = randomUUID();
    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/files/operations`)
      .set('authorization', `Bearer ${token}`)
      .send({
        operationId: randomUUID(),
        fileId,
        type: 'create',
        kind: 'markdown',
        path: 'Public.md',
      })
      .expect(201);

    const published = await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/files/${fileId}/share`)
      .set('authorization', `Bearer ${token}`)
      .expect(201);
    const slug = response(published.text).slug;
    if (!slug) throw new Error('Missing public slug');
    await request(app.getHttpServer())
      .get(`/api/public/shares/${slug}`)
      .expect(200)
      .expect((result) =>
        expect(result.body).toMatchObject({
          vaultName: 'Public Vault',
          file: { id: fileId, kind: 'markdown', path: 'Public.md' },
        }),
      );

    await request(app.getHttpServer())
      .delete(`/api/vaults/${vaultId}/files/${fileId}/share`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/public/shares/${slug}`)
      .expect(404);
  });
});

function response(text: string) {
  return JSON.parse(text) as {
    accessToken?: string;
    id?: string;
    slug?: string;
  };
}
