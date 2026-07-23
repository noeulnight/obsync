import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type VaultFile, type VaultFileKind } from '@prisma/client';
import * as Y from 'yjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { VaultAccessService } from '../vaults/vault-access.service';
import { vaultPath, vaultPathKey } from '../vaults/utils/vault-path';
import {
  FileKind,
  FileOperationDto,
  FileOperationType,
} from './dto/file-operation.dto';
import { CollaborationServerService } from './collaboration-server.service';
import { nextFileRevision } from './vault-file-version';
import { VaultLinksService } from './vault-links.service';
import type { CanvasData } from './types/canvas-data.type';
import {
  appendMarkdown,
  markdownDocumentMap,
  markdownFrontmatter,
  markdownTarget,
  markdownTags,
  patchMarkdown,
  type MarkdownPatchOperation,
  type MarkdownPatchTarget,
} from './utils/markdown-document';

@Injectable()
export class VaultFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: VaultAccessService,
    private readonly collaboration: CollaborationServerService,
    private readonly links: VaultLinksService,
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

  async context(
    userId: string,
    vaultId: string,
    question: string,
    maxDocuments = 5,
    maxCharacters = 4_000,
  ) {
    await this.access.requireRead(userId, vaultId);
    const terms = [
      ...new Set(
        (question.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter(
          (term: string) => term.length > 1,
        ),
      ),
    ].slice(0, 12);
    const documents = (await this.markdownDocuments(vaultId))
      .map((document) => {
        const path = document.path.toLowerCase();
        const content = document.content.toLowerCase();
        const score = terms.reduce(
          (total, term) =>
            total + (path.includes(term) ? 4 : 0) + occurrences(content, term),
          0,
        );
        const term = terms.find((candidate) => content.includes(candidate));
        return {
          ...document,
          score,
          excerpt: term
            ? excerpt(document.content, content.indexOf(term), term.length)
            : '',
        };
      })
      .filter((document) => document.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.path.localeCompare(right.path),
      )
      .slice(0, maxDocuments);
    const graph = await this.links.graph(vaultId);
    const selected = new Set(documents.map((document) => document.id));
    const relatedIds = new Set(
      graph.edges.flatMap((edge) => {
        if (selected.has(edge.source)) return [edge.target];
        if (selected.has(edge.target)) return [edge.source];
        return [];
      }),
    );
    return {
      question,
      documents: documents.map(({ id, path, content, score, excerpt }) => ({
        id,
        path,
        score,
        excerpt,
        content: content.slice(0, maxCharacters),
        truncated: content.length > maxCharacters,
      })),
      related: graph.nodes
        .filter((node) => relatedIds.has(node.id) && !selected.has(node.id))
        .slice(0, 20),
    };
  }

  async readMarkdown(userId: string, vaultId: string, rawPath: string) {
    await this.access.requireRead(userId, vaultId);
    const path = vaultPath(rawPath);
    const file = await this.prisma.vaultFile.findFirst({
      where: {
        vaultId,
        activePathKey: vaultPathKey(path),
        kind: 'MARKDOWN',
        deletedAt: null,
      },
      select: { id: true, path: true },
    });
    if (!file) throw new NotFoundException('File not found');
    return {
      ...file,
      content: await this.collaboration.readDocument(vaultId, file.id),
    };
  }

  async writeMarkdown(
    userId: string,
    vaultId: string,
    rawPath: string,
    content: string,
  ) {
    await this.access.requireWrite(userId, vaultId);
    const path = vaultPath(rawPath);
    let file = await this.prisma.vaultFile.findFirst({
      where: {
        vaultId,
        activePathKey: vaultPathKey(path),
        deletedAt: null,
      },
      select: { id: true, path: true, kind: true },
    });
    if (file && file.kind !== 'MARKDOWN') {
      throw new ConflictException('The path is not a Markdown document.');
    }
    if (!file) {
      const fileId = randomUUID();
      await this.apply(userId, vaultId, {
        operationId: randomUUID(),
        fileId,
        type: FileOperationType.CREATE,
        kind: FileKind.MARKDOWN,
        path,
      });
      file = { id: fileId, path, kind: 'MARKDOWN' };
    }
    await this.collaboration.writeDocument(vaultId, file.id, content, userId);
    return { id: file.id, path: file.path };
  }

  async appendMarkdown(
    userId: string,
    vaultId: string,
    rawPath: string,
    content: string,
  ) {
    await this.access.requireWrite(userId, vaultId);
    const file = await this.liveFile(vaultId, rawPath, 'MARKDOWN');
    await this.collaboration.updateDocument(
      vaultId,
      file.id,
      userId,
      (current) => appendMarkdown(current, content),
    );
    return file;
  }

  async patchMarkdown(
    userId: string,
    vaultId: string,
    rawPath: string,
    targetType: MarkdownPatchTarget,
    target: string,
    operation: MarkdownPatchOperation,
    content: string,
    expectedTargetHash?: string,
  ) {
    await this.access.requireWrite(userId, vaultId);
    const file = await this.liveFile(vaultId, rawPath, 'MARKDOWN');
    let changed = false;
    let previousTargetHash = '';
    const updated = await this.collaboration.updateDocument(
      vaultId,
      file.id,
      userId,
      (current) => {
        previousTargetHash = markdownTarget(current, targetType, target).hash;
        if (expectedTargetHash && expectedTargetHash !== previousTargetHash) {
          throw new ConflictException('Patch target changed');
        }
        const next = patchMarkdown(
          current,
          targetType,
          target,
          operation,
          content,
        );
        changed = current !== next;
        return next;
      },
    );
    const result = markdownTarget(updated, targetType, target);
    return {
      ...file,
      changed,
      previousTargetHash,
      targetHash: result.hash,
      result: result.content,
    };
  }

  async documentMap(userId: string, vaultId: string, rawPath: string) {
    const document = await this.readMarkdown(userId, vaultId, rawPath);
    return {
      id: document.id,
      path: document.path,
      ...markdownDocumentMap(document.content),
    };
  }

  async tags(userId: string, vaultId: string) {
    await this.access.requireRead(userId, vaultId);
    const counts = new Map<string, number>();
    for (const document of await this.markdownDocuments(vaultId)) {
      for (const tag of new Set(markdownTags(document.content)))
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => left.tag.localeCompare(right.tag));
  }

  async structuredSearch(
    userId: string,
    vaultId: string,
    query: {
      path?: string;
      content?: string;
      tag?: string;
      frontmatterKey?: string;
      frontmatterValue?: string;
    },
  ) {
    await this.access.requireRead(userId, vaultId);
    if (!Object.values(query).some(Boolean)) {
      throw new BadRequestException('At least one search filter is required');
    }
    if (query.frontmatterValue && !query.frontmatterKey) {
      throw new BadRequestException(
        'frontmatterKey is required with frontmatterValue',
      );
    }
    const matches = (value: string, term: string) =>
      value.toLowerCase().includes(term.toLowerCase());
    return (await this.markdownDocuments(vaultId))
      .filter((document) => {
        const properties = markdownFrontmatter(document.content);
        return (
          (!query.path || matches(document.path, query.path)) &&
          (!query.content || matches(document.content, query.content)) &&
          (!query.tag || markdownTags(document.content).includes(query.tag)) &&
          (!query.frontmatterKey || query.frontmatterKey in properties) &&
          (!query.frontmatterValue ||
            (query.frontmatterKey !== undefined &&
              matches(
                properties[query.frontmatterKey] ?? '',
                query.frontmatterValue,
              )))
        );
      })
      .slice(0, 100)
      .map(({ id, path }) => ({ id, path }));
  }

  async readCanvas(userId: string, vaultId: string, rawPath: string) {
    await this.access.requireRead(userId, vaultId);
    const file = await this.liveFile(vaultId, rawPath, 'CANVAS');
    return {
      id: file.id,
      path: file.path,
      data: await this.collaboration.readCanvas(vaultId, file.id),
    };
  }

  async writeCanvas(
    userId: string,
    vaultId: string,
    rawPath: string,
    data: CanvasData,
  ) {
    await this.access.requireWrite(userId, vaultId);
    const path = vaultPath(rawPath);
    let file = await this.prisma.vaultFile.findFirst({
      where: { vaultId, activePathKey: vaultPathKey(path), deletedAt: null },
      select: { id: true, path: true, kind: true },
    });
    if (file && file.kind !== 'CANVAS') {
      throw new ConflictException('The path is not a Canvas document.');
    }
    if (!file) {
      const fileId = randomUUID();
      await this.apply(userId, vaultId, {
        operationId: randomUUID(),
        fileId,
        type: FileOperationType.CREATE,
        kind: FileKind.CANVAS,
        path,
      });
      file = { id: fileId, path, kind: 'CANVAS' };
    }
    await this.collaboration.writeCanvas(vaultId, file.id, data, userId);
    return { id: file.id, path: file.path };
  }

  async backlinks(userId: string, vaultId: string, fileId: string) {
    await this.access.requireRead(userId, vaultId);
    const target = await this.prisma.vaultFile.findFirst({
      where: { id: fileId, vaultId, kind: 'MARKDOWN', deletedAt: null },
      select: { path: true },
    });
    if (!target) throw new NotFoundException('File not found');
    const sources = (await this.links.backlinks(vaultId, fileId)).map(
      (link) => link.source,
    );
    const documents = await this.markdownDocuments(
      vaultId,
      sources.map((source) => source.id),
    );
    const byId = new Map(documents.map((document) => [document.id, document]));
    return sources.map((source) => ({
      ...source,
      excerpt: linkExcerpt(byId.get(source.id)?.content ?? '', target.path),
    }));
  }

  async graph(userId: string, vaultId: string) {
    await this.access.requireRead(userId, vaultId);
    return this.links.graph(vaultId);
  }

  async rebuildGraph(userId: string, vaultId: string) {
    await this.access.requireOwner(userId, vaultId);
    return this.links.rebuild(vaultId);
  }

  async reset(userId: string, vaultId: string) {
    await this.access.requireOwner(userId, vaultId);
    const files = await this.prisma.$transaction(async (transaction) => {
      const active = await transaction.vaultFile.findMany({
        where: { vaultId, deletedAt: null },
      });
      return this.deleteFiles(transaction, userId, vaultId, active);
    });
    if (files.length) await this.collaboration.publishFiles(vaultId, files);
    await this.links.refreshTargets(vaultId);
    return { deleted: files.length };
  }

  async restore(userId: string, vaultId: string, fileId: string) {
    await this.access.requireWrite(userId, vaultId);
    const files = await this.prisma.$transaction(
      async (transaction) => {
        const root = await transaction.vaultFile.findFirst({
          where: { id: fileId, vaultId, deletedAt: { not: null } },
        });
        if (!root) throw new NotFoundException('Deleted file not found');
        const affected = await this.deletedFiles(transaction, vaultId, root);
        const collision = await transaction.vaultFile.findFirst({
          where: {
            vaultId,
            deletedAt: null,
            activePathKey: {
              in: affected.map((file) => vaultPathKey(file.path)),
            },
          },
          select: { id: true },
        });
        if (collision) {
          throw new ConflictException('A file with this name already exists.');
        }

        const restored: VaultFile[] = [];
        for (const file of affected) {
          const version = file.version + 1;
          restored.push(
            await transaction.vaultFile.update({
              where: { id: file.id },
              data: {
                activePathKey: vaultPathKey(file.path),
                deletedAt: null,
                version,
                versions: {
                  create: await versionSnapshot(transaction, userId, vaultId, {
                    fileId: file.id,
                    kind: clientKind(file.kind),
                    version,
                    path: file.path,
                    attachmentId: file.attachmentId,
                  }),
                },
              },
            }),
          );
        }
        const attachmentIds = restored.flatMap((file) =>
          file.attachmentId ? [file.attachmentId] : [],
        );
        if (attachmentIds.length) {
          await transaction.attachment.updateMany({
            where: { id: { in: attachmentIds } },
            data: { status: 'READY', deletedAt: null },
          });
        }
        return restored;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.collaboration.publishFiles(vaultId, files);
    await this.links.refreshTargets(vaultId);
    return { files: files.map(fileResponse) };
  }

  async permanentlyDelete(userId: string, vaultId: string, fileId: string) {
    await this.access.requireOwner(userId, vaultId);
    const ids = await this.prisma.$transaction(async (transaction) => {
      const root = await transaction.vaultFile.findFirst({
        where: { id: fileId, vaultId, deletedAt: { not: null } },
      });
      if (!root) throw new NotFoundException('Deleted file not found');
      const files = await this.deletedFiles(transaction, vaultId, root);
      const roomNames = files.flatMap((file) => {
        if (file.kind === 'MARKDOWN')
          return [`vault:${vaultId}:doc:${file.id}`];
        if (file.kind === 'CANVAS')
          return [`vault:${vaultId}:canvas:${file.id}`];
        return [];
      });
      if (roomNames.length) {
        await transaction.yDocument.deleteMany({
          where: { roomName: { in: roomNames } },
        });
      }
      const fileIds = files.map((file) => file.id);
      await transaction.vaultFile.deleteMany({
        where: { id: { in: fileIds } },
      });
      return fileIds;
    });
    await this.collaboration.removeFiles(vaultId, ids);
    await this.links.refreshTargets(vaultId);
    return { deleted: ids.length };
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
      await this.links.refreshTargets(vaultId);
      return { files: files.map(fileResponse) };
    }

    try {
      const files = await this.prisma.$transaction(
        (transaction) =>
          this.applyTransaction(transaction, userId, vaultId, input),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await this.collaboration.publishFiles(vaultId, files);
      await this.links.refreshTargets(vaultId);
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
    const versions = await this.prisma.vaultFileVersion.findMany({
      where: { fileId },
      select: {
        id: true,
        version: true,
        path: true,
        deletedAt: true,
        attachmentId: true,
        state: true,
        createdAt: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { version: 'desc' },
    });
    return versions.map(({ state, ...version }) => ({
      ...version,
      hasContent: state !== null,
    }));
  }

  async version(
    userId: string,
    vaultId: string,
    fileId: string,
    versionId: string,
  ) {
    await this.access.requireRead(userId, vaultId);
    const version = await this.prisma.vaultFileVersion.findFirst({
      where: { id: versionId, fileId, file: { vaultId } },
      select: {
        id: true,
        version: true,
        path: true,
        deletedAt: true,
        createdAt: true,
        state: true,
        createdBy: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!version) throw new NotFoundException('Version not found');
    return {
      ...version,
      state: undefined,
      content: documentContent(version.state),
    };
  }

  async restoreVersion(
    userId: string,
    vaultId: string,
    fileId: string,
    versionId: string,
  ) {
    await this.access.requireWrite(userId, vaultId);
    const version = await this.prisma.vaultFileVersion.findFirst({
      where: {
        id: versionId,
        fileId,
        state: { not: null },
        file: { vaultId, kind: 'MARKDOWN', deletedAt: null },
      },
      select: { state: true },
    });
    if (!version?.state) throw new NotFoundException('Version not found');
    await this.collaboration.restoreDocument(
      vaultId,
      fileId,
      version.state,
      userId,
    );
    return { restored: true };
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

  private deletedFiles(
    transaction: Prisma.TransactionClient,
    vaultId: string,
    root: VaultFile,
  ) {
    if (root.kind !== 'FOLDER') return Promise.resolve([root]);
    return transaction.vaultFile.findMany({
      where: {
        vaultId,
        deletedAt: root.deletedAt,
        OR: [{ path: root.path }, { path: { startsWith: `${root.path}/` } }],
      },
      orderBy: { path: 'asc' },
    });
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
    const changed = await this.deleteFiles(
      transaction,
      userId,
      vaultId,
      affected,
    );
    await transaction.vaultFileOperation.create({
      data: { id: operationId, vaultId, fileId: file.id },
    });
    return changed;
  }

  private async deleteFiles(
    transaction: Prisma.TransactionClient,
    userId: string,
    vaultId: string,
    files: VaultFile[],
  ) {
    const now = new Date();
    const changed: VaultFile[] = [];
    for (const entry of files) {
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

  private async markdownDocuments(vaultId: string, ids?: string[]) {
    // ponytail: A linear scan is enough for personal Vaults. Add a persisted
    // search index only after measured latency shows this path is too slow.
    const files = await this.prisma.vaultFile.findMany({
      where: {
        vaultId,
        kind: 'MARKDOWN',
        deletedAt: null,
        ...(ids ? { id: { in: ids } } : {}),
      },
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

  private async liveFile(
    vaultId: string,
    rawPath: string,
    kind: VaultFileKind,
  ) {
    const path = vaultPath(rawPath);
    const file = await this.prisma.vaultFile.findFirst({
      where: {
        vaultId,
        activePathKey: vaultPathKey(path),
        kind,
        deletedAt: null,
      },
      select: { id: true, path: true },
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
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

function occurrences(value: string, term: string) {
  let count = 0;
  for (
    let index = value.indexOf(term);
    index >= 0;
    index = value.indexOf(term, index + term.length)
  ) {
    count += 1;
  }
  return count;
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
  const state = await documentState(
    transaction,
    vaultId,
    file.fileId,
    file.kind,
  );
  return {
    version: await nextFileRevision(transaction, file.fileId),
    path: file.path,
    attachmentId: file.attachmentId,
    createdById: userId,
    ...(file.deletedAt ? { deletedAt: file.deletedAt } : {}),
    ...(state ? { state } : {}),
  };
}

function documentContent(state: Uint8Array | null) {
  if (!state) return '';
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return document.getText('content').toJSON();
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
