import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { PrismaService } from '../database/prisma.service';
import {
  markdownLinkTargets,
  resolveMarkdownTarget,
  unresolvedMarkdownPath,
  type MarkdownFile,
} from './utils/markdown-links';

@Injectable()
export class VaultLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async reindex(vaultId: string, sourceFileId: string, content: string) {
    const files = await this.files(vaultId);
    const source = files.find((file) => file.id === sourceFileId);
    if (!source) {
      await this.prisma.vaultFileLink.deleteMany({ where: { sourceFileId } });
      return;
    }
    await this.prisma.$transaction((transaction) =>
      this.replace(transaction, vaultId, source, files, content),
    );
  }

  async refreshTargets(vaultId: string) {
    const files = await this.files(vaultId);
    const byId = new Map(files.map((file) => [file.id, file]));
    const links = await this.prisma.vaultFileLink.findMany({
      where: { vaultId },
      select: { id: true, sourceFileId: true, rawTarget: true },
    });
    await this.prisma.$transaction(async (transaction) => {
      if (!files.length) {
        await transaction.vaultFileLink.deleteMany({ where: { vaultId } });
        return;
      }
      await transaction.vaultFileLink.deleteMany({
        where: { vaultId, sourceFileId: { notIn: [...byId.keys()] } },
      });
      await Promise.all(
        links.map((link) => {
          const source = byId.get(link.sourceFileId);
          if (!source) return Promise.resolve();
          const target = resolveMarkdownTarget(
            source.path,
            link.rawTarget,
            files,
          );
          return transaction.vaultFileLink.update({
            where: { id: link.id },
            data: { targetFileId: target?.id ?? null },
          });
        }),
      );
    });
  }

  async backlinks(vaultId: string, targetFileId: string) {
    await this.ensureIndexed(vaultId);
    return this.prisma.vaultFileLink.findMany({
      where: {
        vaultId,
        targetFileId,
        source: { deletedAt: null, kind: 'MARKDOWN' },
      },
      distinct: ['sourceFileId'],
      select: { source: { select: { id: true, path: true } } },
      orderBy: { source: { path: 'asc' } },
    });
  }

  async graph(vaultId: string) {
    await this.ensureIndexed(vaultId);
    const [files, links] = await Promise.all([
      this.files(vaultId),
      this.prisma.vaultFileLink.findMany({
        where: {
          vaultId,
          source: { deletedAt: null, kind: 'MARKDOWN' },
        },
        select: {
          sourceFileId: true,
          targetFileId: true,
          rawTarget: true,
          source: { select: { path: true } },
          target: { select: { deletedAt: true, kind: true } },
        },
      }),
    ]);
    const nodes = files.map((file) => ({ ...file, exists: true }));
    const missing = new Map<
      string,
      { id: string; path: string; exists: false }
    >();
    const edges = [
      ...new Map(
        links.flatMap((link) => {
          const resolved =
            link.target?.kind === 'MARKDOWN' && !link.target.deletedAt;
          let target = link.targetFileId!;
          if (!resolved) {
            const fallback = resolveMarkdownTarget(
              link.source.path,
              link.rawTarget,
              files,
            );
            if (fallback) target = fallback.id;
            else {
              const path = unresolvedMarkdownPath(
                link.source.path,
                link.rawTarget,
              );
              target = `missing:${path.normalize('NFC').toLowerCase()}`;
              if (!missing.has(target))
                missing.set(target, { id: target, path, exists: false });
            }
          }
          return [
            [
              `${link.sourceFileId}:${target}`,
              { source: link.sourceFileId, target },
            ],
          ];
        }),
      ).values(),
    ];
    return { nodes: [...nodes, ...missing.values()], edges };
  }

  private async ensureIndexed(vaultId: string) {
    const files = await this.files(vaultId);
    const pending = await this.prisma.vaultFile.findMany({
      where: {
        vaultId,
        kind: 'MARKDOWN',
        deletedAt: null,
        linksIndexedAt: null,
      },
      select: { id: true },
    });
    if (!pending.length) return;
    const states = await this.prisma.yDocument.findMany({
      where: {
        roomName: {
          in: pending.map((file) => `vault:${vaultId}:doc:${file.id}`),
        },
      },
      select: { roomName: true, state: true },
    });
    const byRoom = new Map(
      states.map((state) => [state.roomName, state.state]),
    );
    await this.prisma.$transaction(async (transaction) => {
      for (const file of pending) {
        await this.replace(
          transaction,
          vaultId,
          files.find((entry) => entry.id === file.id)!,
          files,
          documentText(byRoom.get(`vault:${vaultId}:doc:${file.id}`)),
        );
      }
    });
  }

  private async replace(
    transaction: Prisma.TransactionClient,
    vaultId: string,
    source: MarkdownFile,
    files: MarkdownFile[],
    content: string,
  ) {
    const links = markdownLinkTargets(content).map((rawTarget) => ({
      vaultId,
      sourceFileId: source.id,
      targetFileId:
        resolveMarkdownTarget(source.path, rawTarget, files)?.id ?? null,
      rawTarget,
    }));
    await transaction.vaultFileLink.deleteMany({
      where: { sourceFileId: source.id },
    });
    if (links.length)
      await transaction.vaultFileLink.createMany({ data: links });
    await transaction.vaultFile.update({
      where: { id: source.id },
      data: { linksIndexedAt: new Date() },
    });
  }

  private files(vaultId: string) {
    return this.prisma.vaultFile.findMany({
      where: { vaultId, kind: 'MARKDOWN', deletedAt: null },
      select: { id: true, path: true },
      orderBy: { path: 'asc' },
    });
  }
}

function documentText(state?: Uint8Array) {
  if (!state) return '';
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  return document.getText('content').toJSON();
}
