import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Attachment } from '@prisma/client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { VaultAccessService } from '../vaults/vault-access.service';
import { vaultPath } from '../vaults/utils/vault-path';
import type {
  AttachmentResponseDto,
  DownloadResponseDto,
  PresignUploadResponseDto,
} from './dto/attachment-response.dto';
import type { PresignUploadDto } from './dto/presign-upload.dto';

const uploadExpirySeconds = 15 * 60;
const downloadExpirySeconds = 5 * 60;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: VaultAccessService,
  ) {}

  async presignUpload(
    ownerId: string,
    vaultId: string,
    input: PresignUploadDto,
  ): Promise<PresignUploadResponseDto> {
    await this.access.requireWrite(ownerId, vaultId);
    const path = vaultPath(input.path);
    const sha256 = input.sha256.toLowerCase();
    let attachment = await this.prisma.attachment.findFirst({
      where: {
        vaultId,
        OR: [{ idempotencyKey: input.idempotencyKey }, { path, sha256 }],
      },
    });
    if (attachment?.idempotencyKey === input.idempotencyKey) {
      if (
        attachment.path !== path ||
        attachment.size !== BigInt(input.size) ||
        attachment.mimeType !== input.mimeType ||
        attachment.sha256 !== sha256
      ) {
        throw new ConflictException('Idempotency key payload differs');
      }
    }
    if (!attachment) {
      const id = randomUUID();
      try {
        attachment = await this.prisma.attachment.create({
          data: {
            id,
            vaultId,
            path,
            objectKey: this.storage.objectKey(vaultId, id),
            size: input.size,
            mimeType: input.mimeType,
            sha256,
            idempotencyKey: input.idempotencyKey,
          },
        });
      } catch (error: unknown) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        attachment = await this.prisma.attachment.findFirst({
          where: {
            vaultId,
            OR: [{ idempotencyKey: input.idempotencyKey }, { path, sha256 }],
          },
        });
        if (!attachment) throw error;
      }
    }
    if (attachment.status === 'DELETED') {
      attachment = await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: { status: 'PENDING', deletedAt: null },
      });
    }
    if (attachment.status === 'READY') {
      return {
        attachment: this.response(attachment),
        uploadUrl: null,
        uploadHeaders: {},
        expiresIn: 0,
        alreadyReady: true,
      };
    }
    const uploadHeaders = {
      'content-type': attachment.mimeType,
    };
    const uploadUrl = await getSignedUrl(
      this.storage.publicClient,
      new PutObjectCommand({
        Bucket: this.storage.bucket,
        Key: attachment.objectKey,
        ContentType: attachment.mimeType,
        Metadata: { sha256: attachment.sha256 },
      }),
      {
        expiresIn: uploadExpirySeconds,
        signableHeaders: new Set(['content-type']),
      },
    );
    return {
      attachment: this.response(attachment),
      uploadUrl,
      uploadHeaders,
      expiresIn: uploadExpirySeconds,
      alreadyReady: false,
    };
  }

  async complete(
    ownerId: string,
    vaultId: string,
    attachmentId: string,
  ): Promise<AttachmentResponseDto> {
    await this.access.requireWrite(ownerId, vaultId);
    const attachment = await this.findOwned(vaultId, attachmentId);
    if (attachment.status === 'READY') return this.response(attachment);

    let head;
    try {
      head = await this.storage.client.send(
        new HeadObjectCommand({
          Bucket: this.storage.bucket,
          Key: attachment.objectKey,
        }),
      );
    } catch {
      throw new BadRequestException('Uploaded object is unavailable');
    }
    if (
      BigInt(head.ContentLength ?? -1) !== attachment.size ||
      head.ContentType !== attachment.mimeType ||
      head.Metadata?.sha256?.toLowerCase() !== attachment.sha256
    ) {
      throw new BadRequestException('Uploaded object metadata does not match');
    }
    const ready = await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: { status: 'READY', etag: head.ETag?.replaceAll('"', '') },
    });
    return this.response(ready);
  }

  async download(
    ownerId: string,
    vaultId: string,
    attachmentId: string,
  ): Promise<DownloadResponseDto> {
    await this.access.requireRead(ownerId, vaultId);
    const attachment = await this.findOwned(vaultId, attachmentId);
    if (attachment.status !== 'READY') throw new NotFoundException();
    return {
      downloadUrl: await getSignedUrl(
        this.storage.publicClient,
        new GetObjectCommand({
          Bucket: this.storage.bucket,
          Key: attachment.objectKey,
        }),
        { expiresIn: downloadExpirySeconds },
      ),
      expiresIn: downloadExpirySeconds,
    };
  }

  async delete(
    ownerId: string,
    vaultId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.access.requireWrite(ownerId, vaultId);
    const attachment = await this.findAnyOwned(vaultId, attachmentId);
    if (attachment.status === 'DELETED') return;
    await this.prisma.attachment.updateMany({
      where: { id: attachment.id, vaultId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
  }

  private async findOwned(vaultId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        vaultId,
        status: { not: 'DELETED' },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  private async findAnyOwned(vaultId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, vaultId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  private response(attachment: Attachment): AttachmentResponseDto {
    return {
      id: attachment.id,
      path: attachment.path,
      size: Number(attachment.size),
      mimeType: attachment.mimeType,
      sha256: attachment.sha256,
      status: attachment.status,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt,
    };
  }
}
