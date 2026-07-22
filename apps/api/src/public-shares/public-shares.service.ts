import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CollaborationServerService } from '../collaboration/collaboration-server.service';
import type { CanvasData } from '../collaboration/types/canvas-data.type';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { VaultAccessService } from '../vaults/vault-access.service';

const downloadExpirySeconds = 5 * 60;

@Injectable()
export class PublicSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: VaultAccessService,
    private readonly collaboration: CollaborationServerService,
    private readonly storage: StorageService,
  ) {}

  async status(userId: string, vaultId: string, fileId: string) {
    await this.access.requireRead(userId, vaultId);
    await this.file(vaultId, fileId);
    const share = await this.prisma.publicShare.findUnique({
      where: { fileId },
      select: { slug: true, createdAt: true },
    });
    return share ? this.response(share) : null;
  }

  async publish(userId: string, vaultId: string, fileId: string) {
    await this.access.requireOwner(userId, vaultId);
    await this.file(vaultId, fileId);
    const share = await this.prisma.publicShare.upsert({
      where: { fileId },
      create: { vaultId, fileId, slug: randomBytes(18).toString('base64url') },
      update: {},
      select: { slug: true, createdAt: true },
    });
    return this.response(share);
  }

  async unpublish(userId: string, vaultId: string, fileId: string) {
    await this.access.requireOwner(userId, vaultId);
    await this.prisma.publicShare.deleteMany({ where: { vaultId, fileId } });
  }

  async read(slug: string) {
    const shared = await this.shared(slug);
    const content =
      shared.file.kind === 'MARKDOWN'
        ? await this.collaboration.readDocument(shared.vaultId, shared.file.id)
        : undefined;
    const canvas =
      shared.file.kind === 'CANVAS'
        ? await this.collaboration.readCanvas(shared.vaultId, shared.file.id)
        : undefined;
    const attachments = await this.referencedAttachments(
      shared.vaultId,
      shared.file.path,
      content,
      canvas,
    );
    return {
      slug,
      vaultName: shared.vault.name,
      file: {
        id: shared.file.id,
        kind: shared.file.kind.toLowerCase(),
        path: shared.file.path,
      },
      content,
      canvas,
      attachments: attachments.map(({ id, path, mimeType }) => ({
        id,
        path,
        mimeType,
      })),
    };
  }

  async attachment(slug: string, attachmentId: string) {
    const shared = await this.shared(slug);
    const content =
      shared.file.kind === 'MARKDOWN'
        ? await this.collaboration.readDocument(shared.vaultId, shared.file.id)
        : undefined;
    const canvas =
      shared.file.kind === 'CANVAS'
        ? await this.collaboration.readCanvas(shared.vaultId, shared.file.id)
        : undefined;
    const attachments = await this.referencedAttachments(
      shared.vaultId,
      shared.file.path,
      content,
      canvas,
    );
    const attachment = attachments.find((item) => item.id === attachmentId);
    if (!attachment) throw new NotFoundException();
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

  private async file(vaultId: string, fileId: string) {
    const file = await this.prisma.vaultFile.findFirst({
      where: {
        id: fileId,
        vaultId,
        kind: { in: ['MARKDOWN', 'CANVAS'] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  private async shared(slug: string) {
    const share = await this.prisma.publicShare.findUnique({
      where: { slug },
      select: {
        vaultId: true,
        vault: { select: { name: true } },
        file: { select: { id: true, path: true, kind: true, deletedAt: true } },
      },
    });
    if (
      !share ||
      share.file.deletedAt ||
      !['MARKDOWN', 'CANVAS'].includes(share.file.kind)
    ) {
      throw new NotFoundException();
    }
    return share;
  }

  private async referencedAttachments(
    vaultId: string,
    sourcePath: string,
    content?: string,
    canvas?: CanvasData,
  ) {
    const attachments = await this.prisma.attachment.findMany({
      where: { vaultId, status: 'READY' },
      select: { id: true, path: true, mimeType: true, objectKey: true },
    });
    const targets = [
      ...(content ? embeddedTargets(content) : []),
      ...(canvas?.nodes.flatMap((node) =>
        node.type === 'file' && node.file ? [node.file] : [],
      ) ?? []),
    ];
    const referenced = new Map<string, (typeof attachments)[number]>();
    for (const target of targets) {
      const attachment = resolveAttachment(sourcePath, target, attachments);
      if (attachment) referenced.set(attachment.id, attachment);
    }
    return [...referenced.values()];
  }

  private response(share: { slug: string; createdAt: Date }) {
    return { slug: share.slug, createdAt: share.createdAt };
  }
}

function embeddedTargets(content: string) {
  return [
    ...content.matchAll(/!\[\[([^\]]+)\]\]/g),
    ...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g),
  ].map((match) => match[1].split('|')[0].split('#')[0].trim());
}

function resolveAttachment<T extends { path: string }>(
  sourcePath: string,
  rawTarget: string,
  attachments: T[],
) {
  const target = rawTarget.replace(/^\/+/, '');
  const folder = sourcePath.split('/').slice(0, -1).join('/');
  const candidates = [target, folder ? `${folder}/${target}` : target].map(
    normalizedPath,
  );
  const exact = attachments.find((attachment) =>
    candidates.includes(normalizedPath(attachment.path)),
  );
  if (exact || target.includes('/')) return exact;
  const byName = attachments.filter(
    (attachment) =>
      normalizedPath(attachment.path).split('/').at(-1) ===
      normalizedPath(target),
  );
  return byName.length === 1 ? byName[0] : undefined;
}

function normalizedPath(value: string) {
  const parts: string[] = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/').normalize('NFC').toLowerCase();
}
