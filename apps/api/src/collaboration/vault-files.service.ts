import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type VaultFile, type VaultFileKind } from '@prisma/client';
import * as Y from 'yjs';
import { PrismaService } from '../database/prisma.service';
import { VaultAccessService } from '../vaults/vault-access.service';
import { vaultPath, vaultPathKey } from '../vaults/utils/vault-path';
import {
  FileKind,
  FileOperationDto,
  FileOperationType,
} from './dto/file-operation.dto';
import { CollaborationServerService } from './collaboration-server.service';

@Injectable()
export class VaultFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: VaultAccessService,
    private readonly collaboration: CollaborationServerService,
  ) {}

  async list(userId: string, vaultId: string) {
    await this.access.requireRead(userId, vaultId);
    const files = await this.prisma.vaultFile.findMany({
      where: { vaultId },
      orderBy: { path: 'asc' },
    });
    return files.map(fileResponse);
  }

  async search(userId: string, vaultId: string, query: string) {
    await this.access.requireRead(userId, vaultId);
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const documents = await this.markdownDocuments(vaultId);
    return documents
      .map((document) => {
        const pathMatch = document.path.toLowerCase().includes(term);
        const contentIndex = document.content.toLowerCase().indexOf(term);
        return pathMatch || contentIndex >= 0
          ? {
              id: document.id,
              path: document.path,
              excerpt: excerpt(document.content, contentIndex, term.length),
              pathMatch,
            }
          : undefined;
      })
      .filter((result) => result !== undefined)
      .sort(
        (left, right) =>
          Number(right.pathMatch) - Number(left.pathMatch) ||
          left.path.localeCompare(right.path),
      )
      .slice(0, 50)
      .map((result) => ({
        id: result.id,
        path: result.path,
        excerpt: result.excerpt,
      }));
  }

  async backlinks(userId: string, vaultId: string, fileId: string) {
    await this.access.requireRead(userId, vaultId);
    const documents = await this.markdownDocuments(vaultId);
    const target = documents.find((document) => document.id === fileId);
    if (!target) throw new NotFoundException('File not found');
    return documents
      .filter(
        (document) =>
          document.id !== fileId &&
          markdownLinks(document.content).some((link) =>
            resolvesMarkdownLink(document.path, link, target.path),
          ),
      )
      .map((document) => ({
        id: document.id,
        path: document.path,
        excerpt: linkExcerpt(document.content, target.path),
      }));
  }

  async apply(userId: string, vaultId: string, input: FileOperationDto) {
    await this.access.requireWrite(userId, vaultId);

    const completed = await this.prisma.vaultFileOperation.findUnique({
      where: { id: input.operationId },
      include: { file: true },
    });
    if (completed) {
      if (completed.vaultId !== vaultId) throw new NotFoundException();
      const files =
        completed.file.kind === 'FOLDER'
          ? await this.prisma.vaultFile.findMany({
              where: {
                vaultId,
                OR: [
                  { path: completed.file.path },
                  { path: { startsWith: `${completed.file.path}/` } },
                ],
              },
            })
          : [completed.file];
      await this.collaboration.publishFiles(vaultId, files);
      return { files: files.map(fileResponse) };
    }

    try {
      const files = await this.prisma.$transaction(
        (transaction) =>
          this.applyTransaction(transaction, userId, vaultId, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await this.collaboration.publishFiles(vaultId, files);
      return { files: files.map(fileResponse) };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        throw new ConflictException('A file with this name already exists.');
      }
      throw error;
    }
  }

  async versions(userId: string, vaultId: string, fileId: string) {
    await this.access.requireRead(userId, vaultId);
    const file = await this.prisma.vaultFile.findFirst({
      where: { id: fileId, vaultId },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('File not found');
    return this.prisma.vaultFileVersion.findMany({
      where: { fileId },
      select: {
        id: true,
        version: true,
        path: true,
        deletedAt: true,
        attachmentId: true,
        createdAt: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { version: 'desc' },
    });
  }

  private async applyTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    vaultId: string,
    input: FileOperationDto,
  ): Promise<VaultFile[]> {
    if (input.type === FileOperationType.CREATE) {
      return [await this.create(transaction, userId, vaultId, input)];
    }

    const file = await transaction.vaultFile.findFirst({
      where: { id: input.fileId, vaultId },
    });
    if (!file) throw new NotFoundException('File not found');
    if (input.baseVersion === undefined) {
      throw new BadRequestException('baseVersion is required');
    }
    if (file.version !== input.baseVersion) {
      throw new ConflictException('The file was changed on another device.');
    }

    if (input.type === FileOperationType.RENAME) {
      return this.rename(transaction, userId, vaultId, file, input);
    }
    if (input.type === FileOperationType.UPDATE_ATTACHMENT) {
      return [
        await this.updateAttachment(transaction, userId, vaultId, file, input),
      ];
    }
    return this.delete(transaction, userId, vaultId, file, input.operationId);
  }

  private async create(
    transaction: Prisma.TransactionClient,
    userId: string,
    vaultId: string,
    input: FileOperationDto,
  ) {
    if (!input.kind || !input.path) {
      throw new BadRequestException('kind and path are required');
    }
    const path = vaultPath(input.path);
    const attachment =
      input.kind === FileKind.ATTACHMENT
        ? await this.attachment(transaction, vaultId, input.attachmentId)
        : undefined;
    const file = await transaction.vaultFile.create({
      data: {
        id: input.fileId,
        vaultId,
        kind: databaseKind(input.kind),
        path,
        activePathKey: vaultPathKey(path),
        attachmentId: attachment?.id,
        mimeType: attachment?.mimeType,
        sha256: attachment?.sha256,
        size: attachment?.size,
        versions: {
          create: await versionSnapshot(transaction, userId, vaultId, {
            fileId: input.fileId,
            kind: input.kind,
            version: 1,
            path,
            attachmentId: attachment?.id,
          }),
        },
      },
    });
    await transaction.vaultFileOperation.create({
      data: { id: input.operationId, vaultId, fileId: file.id },
    });
    return file;
  }

  private async rename(
    transaction: Prisma.TransactionClient,
    userId: string,
    vaultId: string,
    file: VaultFile,
    input: FileOperationDto,
  ) {
    if (!input.path) throw new BadRequestException('path is required');
    if (file.deletedAt)
      throw new ConflictException('This file has been deleted.');
    const path = vaultPath(input.path);
    const affected =
      file.kind === 'FOLDER'
        ? await transaction.vaultFile.findMany({
            where: {
              vaultId,
              deletedAt: null,
              OR: [
                { path: file.path },
                { path: { startsWith: `${file.path}/` } },
              ],
            },
            orderBy: { path: 'asc' },
          })
        : [file];
    const ids = affected.map((entry) => entry.id);
    const paths = affected.map((entry) =>
      movePath(entry.path, file.path, path),
    );
    const collision = await transaction.vaultFile.findFirst({
      where: {
        vaultId,
        deletedAt: null,
        id: { notIn: ids },
        activePathKey: { in: paths.map(vaultPathKey) },
      },
      select: { id: true },
    });
    if (collision)
      throw new ConflictException('A file with this name already exists.');

    const changed: VaultFile[] = [];
    for (const [index, entry] of affected.entries()) {
      const nextPath = paths[index];
      const version = entry.version + 1;
      changed.push(
        await transaction.vaultFile.update({
          where: { id: entry.id },
          data: {
            path: nextPath,
            activePathKey: vaultPathKey(nextPath),
            version,
            versions: {
              create: await versionSnapshot(transaction, userId, vaultId, {
                fileId: entry.id,
                kind: clientKind(entry.kind),
                version,
                path: nextPath,
                attachmentId: entry.attachmentId,
              }),
            },
          },
        }),
      );
    }
    await transaction.vaultFileOperation.create({
      data: { id: input.operationId, vaultId, fileId: file.id },
    });
    return changed;
  }

  private async delete(
    transaction: Prisma.TransactionClient,
    userId: string,
    vaultId: string,
    file: VaultFile,
    operationId: string,
  ) {
    const affected =
      file.kind === 'FOLDER'
        ? await transaction.vaultFile.findMany({
            where: {
              vaultId,
              deletedAt: null,
              OR: [
                { path: file.path },
                { path: { startsWith: `${file.path}/` } },
              ],
            },
          })
        : [file];
    const now = new Date();
    const changed: VaultFile[] = [];
    for (const entry of affected) {
      const version = entry.version + 1;
      changed.push(
        await transaction.vaultFile.update({
          where: { id: entry.id },
          data: {
            activePathKey: null,
            deletedAt: now,
            version,
            versions: {
              create: await versionSnapshot(transaction, userId, vaultId, {
                fileId: entry.id,
                kind: clientKind(entry.kind),
                version,
                path: entry.path,
                deletedAt: now,
                attachmentId: entry.attachmentId,
              }),
            },
          },
        }),
      );
    }
    await transaction.vaultFileOperation.create({
      data: { id: operationId, vaultId, fileId: file.id },
    });
    return changed;
  }

  private async updateAttachment(
    transaction: Prisma.TransactionClient,
    userId: string,
    vaultId: string,
    file: VaultFile,
    input: FileOperationDto,
  ) {
    if (file.kind !== 'ATTACHMENT' || file.deletedAt) {
      throw new ConflictException('This file is not an attachment.');
    }
    const attachment = await this.attachment(
      transaction,
      vaultId,
      input.attachmentId,
    );
    const version = file.version + 1;
    const changed = await transaction.vaultFile.update({
      where: { id: file.id },
      data: {
        version,
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        sha256: attachment.sha256,
        size: attachment.size,
        versions: {
          create: await versionSnapshot(transaction, userId, vaultId, {
            fileId: file.id,
            kind: FileKind.ATTACHMENT,
            version,
            path: file.path,
            attachmentId: attachment.id,
          }),
        },
      },
    });
    await transaction.vaultFileOperation.create({
      data: { id: input.operationId, vaultId, fileId: file.id },
    });
    return changed;
  }

  private async attachment(
    transaction: Prisma.TransactionClient,
    vaultId: string,
    attachmentId?: string,
  ) {
    if (!attachmentId)
      throw new BadRequestException('attachmentId is required');
    const attachment = await transaction.attachment.findFirst({
      where: { id: attachmentId, vaultId, status: 'READY' },
    });
    if (!attachment) throw new BadRequestException('Attachment is not ready');
    return attachment;
  }

  private async markdownDocuments(vaultId: string) {
    // ponytail: A linear scan is enough for personal Vaults. Add a persisted
    // search index only after measured latency shows this path is too slow.
    const files = await this.prisma.vaultFile.findMany({
      where: { vaultId, kind: 'MARKDOWN', deletedAt: null },
      select: { id: true, path: true },
      orderBy: { path: 'asc' },
    });
    const states = await this.prisma.yDocument.findMany({
      where: {
        roomName: {
          in: files.map((file) => `vault:${vaultId}:doc:${file.id}`),
        },
      },
      select: { roomName: true, state: true },
    });
    const byRoom = new Map(
      states.map((state) => [state.roomName, state.state]),
    );
    return files.map((file) => ({
      ...file,
      content: documentText(byRoom.get(`vault:${vaultId}:doc:${file.id}`)),
    }));
  }
}

function documentText(state?: Uint8Array) {
  if (!state) return '';
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return document.getText('content').toJSON();
}

function excerpt(content: string, index: number, length: number) {
  if (index < 0) return '';
  const compact = content.replace(/\s+/g, ' ').trim();
  const compactIndex = compact
    .toLowerCase()
    .indexOf(content.slice(index, index + length).toLowerCase());
  const match = Math.max(0, compactIndex);
  const start = Math.max(0, match - 45);
  const end = Math.min(compact.length, match + length + 75);
  return `${start ? '…' : ''}${compact.slice(start, end)}${end < compact.length ? '…' : ''}`;
}

function markdownLinks(content: string) {
  return [
    ...[...content.matchAll(/!?\[\[([^\]]+)\]\]/g)].map((match) => match[1]),
    ...[...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(
      (match) => match[1],
    ),
  ];
}

function resolvesMarkdownLink(
  sourcePath: string,
  href: string,
  targetPath: string,
) {
  const raw = decodeLink(href).split('|')[0].split('#')[0].trim();
  if (!raw || /^[a-z][a-z\d+.-]*:/i.test(raw)) return false;
  const target = normalizedMarkdownPath(targetPath.split('/'));
  const folder = sourcePath.split('/').slice(0, -1);
  const link = raw.replace(/^\/+/, '');
  const candidates = link.startsWith('.')
    ? [normalizedMarkdownPath([...folder, ...link.split('/')])]
    : [
        normalizedMarkdownPath(link.split('/')),
        normalizedMarkdownPath([...folder, ...link.split('/')]),
      ];
  return (
    candidates.includes(target) ||
    (!link.includes('/') &&
      target.split('/').at(-1) === normalizedMarkdownPath([link]))
  );
}

function normalizedMarkdownPath(parts: string[]) {
  const path: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') path.pop();
    else path.push(part);
  }
  return path.join('/').replace(/\.md$/i, '').normalize('NFC').toLowerCase();
}

function decodeLink(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function linkExcerpt(content: string, targetPath: string) {
  const target =
    targetPath.split('/').at(-1)?.replace(/\.md$/i, '') ?? targetPath;
  const index = content.toLowerCase().indexOf(target.toLowerCase());
  return excerpt(content, Math.max(0, index), target.length);
}

function movePath(path: string, from: string, to: string) {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}

function databaseKind(kind: FileKind): VaultFileKind {
  return kind.toUpperCase() as VaultFileKind;
}

function clientKind(kind: VaultFileKind): FileKind {
  return kind.toLowerCase() as FileKind;
}

async function versionSnapshot(
  transaction: Prisma.TransactionClient,
  userId: string,
  vaultId: string,
  file: {
    fileId: string;
    kind: FileKind;
    version: number;
    path: string;
    deletedAt?: Date;
    attachmentId?: string | null;
  },
) {
  return {
    version: file.version,
    path: file.path,
    deletedAt: file.deletedAt,
    attachmentId: file.attachmentId,
    createdById: userId,
    state: await documentState(transaction, vaultId, file.fileId, file.kind),
  };
}

async function documentState(
  transaction: Prisma.TransactionClient,
  vaultId: string,
  fileId: string,
  kind: FileKind,
) {
  if (kind !== FileKind.MARKDOWN && kind !== FileKind.CANVAS) return undefined;
  const roomName = `vault:${vaultId}:${kind === FileKind.MARKDOWN ? 'doc' : 'canvas'}:${fileId}`;
  return (
    await transaction.yDocument.findUnique({
      where: { roomName },
      select: { state: true },
    })
  )?.state;
}

function fileResponse(file: VaultFile) {
  return {
    id: file.id,
    kind: file.kind.toLowerCase(),
    path: file.path,
    deleted: file.deletedAt !== null,
    version: file.version,
    updatedAt: file.updatedAt,
    attachmentId: file.attachmentId,
    mimeType: file.mimeType,
    sha256: file.sha256,
    size: file.size === null ? null : Number(file.size),
  };
}
