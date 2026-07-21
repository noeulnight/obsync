import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AttachmentCleanupService } from '../src/attachments/attachment-cleanup.service';
import { PrismaService } from '../src/database/prisma.service';
import { AppValidationPipe } from '../src/http/pipes/app-validation.pipe';

describe('Attachments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cleanup: AttachmentCleanupService;
  let ownerToken: string;
  let otherToken: string;
  let vaultId: string;
  const emails = [
    'attachment-owner@example.com',
    'attachment-other@example.com',
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
    prisma = app.get(PrismaService);
    cleanup = app.get(AttachmentCleanupService);
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    [ownerToken, otherToken] = await Promise.all(emails.map(registerAndLogin));
    const vault = await request(app.getHttpServer())
      .post('/api/vaults')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Attachments' })
      .expect(201);
    vaultId = stringField(record(vault.text), 'id');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  function record(text: string): Record<string, unknown> {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid response');
    }
    return value as Record<string, unknown>;
  }

  function stringField(value: Record<string, unknown>, name: string) {
    const field = value[name];
    if (typeof field !== 'string') throw new Error(`Missing ${name}`);
    return field;
  }

  async function registerAndLogin(email: string) {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return stringField(record(response.text), 'accessToken');
  }

  async function presign(
    body: Buffer,
    path = 'assets/example.png',
    idempotencyKey = randomUUID(),
  ) {
    const sha256 = createHash('sha256').update(body).digest('hex');
    const response = await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/presign-upload`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey,
        path,
        size: body.length,
        mimeType: 'image/png',
        sha256,
      })
      .expect(201);
    const result = record(response.text);
    const attachment = result.attachment;
    const uploadHeaders = result.uploadHeaders;
    if (
      !attachment ||
      typeof attachment !== 'object' ||
      Array.isArray(attachment)
    ) {
      throw new Error('Missing attachment');
    }
    if (
      !uploadHeaders ||
      typeof uploadHeaders !== 'object' ||
      Array.isArray(uploadHeaders)
    ) {
      throw new Error('Missing upload headers');
    }
    return {
      id: stringField(attachment as Record<string, unknown>, 'id'),
      uploadUrl: stringField(result, 'uploadUrl'),
      uploadHeaders: uploadHeaders as Record<string, string>,
      idempotencyKey,
      sha256,
    };
  }

  it('uploads, downloads, retries idempotently, and soft deletes', async () => {
    const body = Buffer.from('attachment-data');
    const upload = await presign(body);
    const uploaded = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.uploadHeaders,
      body,
    });
    if (!uploaded.ok) {
      throw new Error(
        `Upload failed (${uploaded.status}): ${await uploaded.text()}`,
      );
    }

    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/${upload.id}/complete`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(201)
      .expect((response) => expect(response.text).toContain('READY'));
    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/${upload.id}/complete`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/attachments/${upload.id}/download`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const downloaded = await fetch(
      stringField(record(response.text), 'downloadUrl'),
    );
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(body);
    await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/attachments/${upload.id}/download`)
      .set('authorization', `Bearer ${otherToken}`)
      .expect(404);

    const retry = await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/presign-upload`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: upload.idempotencyKey,
        path: 'assets/example.png',
        size: body.length,
        mimeType: 'image/png',
        sha256: upload.sha256,
      })
      .expect(201);
    const retryBody = record(retry.text);
    const retryAttachment = retryBody.attachment;
    if (!retryAttachment || typeof retryAttachment !== 'object') {
      throw new Error('Missing retry attachment');
    }
    expect(stringField(retryAttachment as Record<string, unknown>, 'id')).toBe(
      upload.id,
    );
    expect(retryBody.uploadUrl).toBeNull();

    const duplicate = await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/presign-upload`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: randomUUID(),
        path: 'assets/example.png',
        size: body.length,
        mimeType: 'image/png',
        sha256: upload.sha256,
      })
      .expect(201);
    const duplicateAttachment = record(duplicate.text).attachment;
    if (!duplicateAttachment || typeof duplicateAttachment !== 'object') {
      throw new Error('Missing duplicate attachment');
    }
    expect(
      stringField(duplicateAttachment as Record<string, unknown>, 'id'),
    ).toBe(upload.id);

    await request(app.getHttpServer())
      .delete(`/api/vaults/${vaultId}/attachments/${upload.id}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/vaults/${vaultId}/attachments/${upload.id}`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/vaults/${vaultId}/attachments/${upload.id}/download`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(404);

    await prisma.attachment.update({
      where: { id: upload.id },
      data: { deletedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    await cleanup.run();
    await expect(
      prisma.attachment.findUnique({ where: { id: upload.id } }),
    ).resolves.toBeNull();
  });

  it('accepts generic files and rejects unsafe paths and mismatched metadata', async () => {
    const body = Buffer.from('x');
    const sha256 = createHash('sha256').update(body).digest('hex');
    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/presign-upload`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: randomUUID(),
        path: '../x.png',
        size: 1,
        mimeType: 'image/png',
        sha256,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/presign-upload`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: randomUUID(),
        path: 'report.docx',
        size: 1,
        mimeType: 'application/octet-stream',
        sha256,
      })
      .expect(201);

    const upload = await presign(Buffer.from('xx'), 'assets/mismatch.png');
    await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.uploadHeaders,
      body,
    });
    await request(app.getHttpServer())
      .post(`/api/vaults/${vaultId}/attachments/${upload.id}/complete`)
      .set('authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('expires stale pending uploads', async () => {
    const upload = await presign(Buffer.from('pending'), 'assets/pending.png');
    await prisma.attachment.update({
      where: { id: upload.id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    await cleanup.run();
    await expect(
      prisma.attachment.findUnique({ where: { id: upload.id } }),
    ).resolves.toBeNull();
  });
});
