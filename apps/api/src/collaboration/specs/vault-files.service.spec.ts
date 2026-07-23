import 'reflect-metadata';
import type {
  Attachment,
  Prisma,
  VaultFile,
  VaultFileOperation,
  YDocument,
} from '@prisma/client';
import * as Y from 'yjs';
import { PrismaService } from '../../database/prisma.service';
import { VaultAccessService } from '../../vaults/vault-access.service';
import { CollaborationServerService } from '../collaboration-server.service';
import {
  FileKind,
  FileOperationType,
  type FileOperationDto,
} from '../dto/file-operation.dto';
import { VaultFilesService } from '../vault-files.service';
import { VaultLinksService } from '../vault-links.service';

const userId = '11111111-1111-4111-8111-111111111111';
const vaultId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';
const childId = '44444444-4444-4444-8444-444444444444';
const operationId = '55555555-5555-4555-8555-555555555555';
const attachmentId = '66666666-6666-4666-8666-666666666666';

describe('VaultFilesService', () => {
  it('creates a normalized file, initial version, and operation atomically', async () => {
    const state = Buffer.from('document-state');
    const created = file({ path: 'notes/café.md' });
    const transaction = transactionMock();
    let createdWith: Prisma.VaultFileCreateArgs | undefined;
    transaction.vaultFile.create.mockImplementation(
      (input: Prisma.VaultFileCreateArgs) => {
        createdWith = input;
        return Promise.resolve(created);
      },
    );
    transaction.yDocument.findUnique.mockResolvedValue({ state });
    const { service, publishFiles } = setup(transaction);

    await expect(
      service.apply(
        userId,
        vaultId,
        operation({
          type: FileOperationType.CREATE,
          kind: FileKind.MARKDOWN,
          path: ' notes/cafe\u0301.md ',
        }),
      ),
    ).resolves.toEqual({ files: [response(created)] });

    if (!createdWith) throw new Error('File was not created');
    const createData = createdWith.data;
    expect(createData).toMatchObject({
      id: fileId,
      vaultId,
      kind: 'MARKDOWN',
      path: 'notes/café.md',
      activePathKey: 'notes/café.md',
    });
    expect(createdVersion(createData)).toEqual({
      version: 1,
      path: 'notes/café.md',
      attachmentId: undefined,
      createdById: userId,
      state,
    });
    expect(transaction.vaultFileOperation.create).toHaveBeenCalledWith({
      data: { id: operationId, vaultId, fileId },
    });
    expect(publishFiles).toHaveBeenCalledWith(vaultId, [created]);
  });

  it('renames a folder and versions every descendant', async () => {
    const root = file({ kind: 'FOLDER', path: 'Old', version: 2 });
    const child = file({
      id: childId,
      path: 'Old/Child.md',
      version: 4,
    });
    const renamedRoot = file({
      kind: 'FOLDER',
      path: 'New',
      version: 3,
    });
    const renamedChild = file({
      id: childId,
      path: 'New/Child.md',
      version: 5,
    });
    const transaction = transactionMock();
    transaction.vaultFileVersion.findFirst
      .mockResolvedValueOnce({ version: 2 })
      .mockResolvedValueOnce({ version: 4 });
    transaction.vaultFile.findFirst
      .mockResolvedValueOnce(root)
      .mockResolvedValueOnce(null);
    transaction.vaultFile.findMany.mockResolvedValue([root, child]);
    const updates: Prisma.VaultFileUpdateArgs[] = [];
    transaction.vaultFile.update.mockImplementation(
      (input: Prisma.VaultFileUpdateArgs) => {
        updates.push(input);
        return Promise.resolve(
          updates.length === 1 ? renamedRoot : renamedChild,
        );
      },
    );
    const { service } = setup(transaction);

    const result = await service.apply(
      userId,
      vaultId,
      operation({
        type: FileOperationType.RENAME,
        path: 'New',
        baseVersion: 2,
      }),
    );

    expect(result.files).toEqual([
      response(renamedRoot),
      response(renamedChild),
    ]);
    expect(updates[0]).toMatchObject({
      where: { id: fileId },
      data: { path: 'New', version: 3 },
    });
    expect(updates[1]).toMatchObject({
      where: { id: childId },
      data: { path: 'New/Child.md', version: 5 },
    });
    expect(createdVersion(updates[0].data)).toEqual(
      expect.objectContaining({ version: 3, path: 'New' }),
    );
    expect(createdVersion(updates[1].data)).toEqual(
      expect.objectContaining({ version: 5, path: 'New/Child.md' }),
    );
  });

  it('soft deletes a folder and versions every descendant', async () => {
    const root = file({ kind: 'FOLDER', path: 'Folder' });
    const child = file({ id: childId, path: 'Folder/Child.md', version: 3 });
    const deletedAt = new Date();
    const deletedRoot = file({
      kind: 'FOLDER',
      path: 'Folder',
      version: 2,
      deletedAt,
      activePathKey: null,
    });
    const deletedChild = file({
      id: childId,
      path: 'Folder/Child.md',
      version: 4,
      deletedAt,
      activePathKey: null,
    });
    const transaction = transactionMock();
    transaction.vaultFileVersion.findFirst
      .mockResolvedValueOnce({ version: 1 })
      .mockResolvedValueOnce({ version: 3 });
    transaction.vaultFile.findFirst.mockResolvedValue(root);
    transaction.vaultFile.findMany.mockResolvedValue([root, child]);
    const updates: Prisma.VaultFileUpdateArgs[] = [];
    transaction.vaultFile.update.mockImplementation(
      (input: Prisma.VaultFileUpdateArgs) => {
        updates.push(input);
        return Promise.resolve(
          updates.length === 1 ? deletedRoot : deletedChild,
        );
      },
    );
    const { service } = setup(transaction);

    const result = await service.apply(
      userId,
      vaultId,
      operation({ type: FileOperationType.DELETE, baseVersion: 1 }),
    );

    expect(result.files).toEqual([
      response(deletedRoot),
      response(deletedChild),
    ]);
    expect(transaction.vaultFile.update).toHaveBeenCalledTimes(2);
    expect(createdVersion(updates[0].data)).toEqual(
      expect.objectContaining({ version: 2, path: 'Folder' }),
    );
    expect(createdVersion(updates[1].data)).toEqual(
      expect.objectContaining({ version: 4, path: 'Folder/Child.md' }),
    );
  });

  it('resets every active file through owner-only manifest tombstones', async () => {
    const first = file({ path: 'First.md' });
    const second = file({ id: childId, kind: 'CANVAS', path: 'Board.canvas' });
    const deletedFirst = {
      ...first,
      deletedAt: new Date(),
      activePathKey: null,
    };
    const deletedSecond = {
      ...second,
      deletedAt: new Date(),
      activePathKey: null,
    };
    const transaction = transactionMock();
    transaction.vaultFile.findMany.mockResolvedValue([first, second]);
    transaction.vaultFile.update
      .mockResolvedValueOnce(deletedFirst)
      .mockResolvedValueOnce(deletedSecond);
    const { service, requireOwner, publishFiles, refreshTargets } =
      setup(transaction);

    await expect(service.reset(userId, vaultId)).resolves.toEqual({
      deleted: 2,
    });

    expect(requireOwner).toHaveBeenCalledWith(userId, vaultId);
    expect(publishFiles).toHaveBeenCalledWith(vaultId, [
      deletedFirst,
      deletedSecond,
    ]);
    expect(refreshTargets).toHaveBeenCalledWith(vaultId);
  });

  it('restores a deleted file with its identity and history intact', async () => {
    const deletedAt = new Date('2026-07-22T00:00:00.000Z');
    const deleted = file({ deletedAt, activePathKey: null, version: 2 });
    const restored = file({ version: 3 });
    const transaction = transactionMock();
    transaction.vaultFile.findFirst
      .mockResolvedValueOnce(deleted)
      .mockResolvedValueOnce(null);
    let updatedWith: Prisma.VaultFileUpdateArgs | undefined;
    transaction.vaultFile.update.mockImplementation(
      (input: Prisma.VaultFileUpdateArgs) => {
        updatedWith = input;
        return Promise.resolve(restored);
      },
    );
    const { service, requireWrite, publishFiles } = setup(transaction);

    await expect(service.restore(userId, vaultId, fileId)).resolves.toEqual({
      files: [response(restored)],
    });

    expect(requireWrite).toHaveBeenCalledWith(userId, vaultId);
    expect(updatedWith?.where).toEqual({ id: fileId });
    expect(updatedWith?.data).toMatchObject({
      activePathKey: 'note.md',
      deletedAt: null,
      version: 3,
    });
    expect(publishFiles).toHaveBeenCalledWith(vaultId, [restored]);
  });

  it('permanently deletes a tombstone and removes it from the manifest', async () => {
    const deleted = file({ deletedAt: new Date(), activePathKey: null });
    const transaction = transactionMock();
    transaction.vaultFile.findFirst.mockResolvedValue(deleted);
    const { service, requireOwner, removeFiles } = setup(transaction);

    await expect(
      service.permanentlyDelete(userId, vaultId, fileId),
    ).resolves.toEqual({ deleted: 1 });

    expect(requireOwner).toHaveBeenCalledWith(userId, vaultId);
    expect(transaction.vaultFile.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [fileId] } },
    });
    expect(removeFiles).toHaveBeenCalledWith(vaultId, [fileId]);
  });

  it('rebuilds the graph index for the Vault owner', async () => {
    const { service, requireOwner, rebuild } = setup(transactionMock());

    await expect(service.rebuildGraph(userId, vaultId)).resolves.toEqual({
      nodes: [],
      edges: [],
    });

    expect(requireOwner).toHaveBeenCalledWith(userId, vaultId);
    expect(rebuild).toHaveBeenCalledWith(vaultId);
  });

  it('updates a ready attachment and records its next version', async () => {
    const current = file({
      kind: 'ATTACHMENT',
      path: 'assets/image.png',
      version: 2,
    });
    const attachment = attachmentRecord();
    const changed = file({
      ...current,
      version: 3,
      attachmentId,
      mimeType: attachment.mimeType,
      sha256: attachment.sha256,
      size: attachment.size,
    });
    const transaction = transactionMock();
    transaction.vaultFileVersion.findFirst.mockResolvedValue({ version: 2 });
    transaction.vaultFile.findFirst.mockResolvedValue(current);
    transaction.attachment.findFirst.mockResolvedValue(attachment);
    let updatedWith: Prisma.VaultFileUpdateArgs | undefined;
    transaction.vaultFile.update.mockImplementation(
      (input: Prisma.VaultFileUpdateArgs) => {
        updatedWith = input;
        return Promise.resolve(changed);
      },
    );
    const { service } = setup(transaction);

    await service.apply(
      userId,
      vaultId,
      operation({
        type: FileOperationType.UPDATE_ATTACHMENT,
        baseVersion: 2,
        attachmentId,
      }),
    );

    expect(transaction.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: attachmentId, vaultId, status: 'READY' },
    });
    if (!updatedWith) throw new Error('Attachment was not updated');
    const updateData = updatedWith;
    expect(updateData).toMatchObject({
      where: { id: fileId },
      data: {
        version: 3,
        attachmentId,
        mimeType: 'image/png',
        sha256: 'abc',
        size: 42n,
      },
    });
    expect(createdVersion(updateData.data)).toEqual({
      version: 3,
      path: 'assets/image.png',
      attachmentId,
      createdById: userId,
    });
  });

  it('returns and republishes a completed folder operation without replaying it', async () => {
    const root = file({ kind: 'FOLDER', path: 'Folder' });
    const child = file({ id: childId, path: 'Folder/Child.md' });
    const transaction = transactionMock();
    const { service, prisma, publishFiles } = setup(transaction, {
      id: operationId,
      vaultId,
      fileId,
      createdAt: new Date(),
      file: root,
    });
    prisma.vaultFile.findMany.mockResolvedValue([root, child]);

    await expect(
      service.apply(
        userId,
        vaultId,
        operation({ type: FileOperationType.DELETE, baseVersion: 1 }),
      ),
    ).resolves.toEqual({ files: [response(root), response(child)] });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(publishFiles).toHaveBeenCalledWith(vaultId, [root, child]);
  });

  it('returns decoded content for a version in the requested Vault', async () => {
    const transaction = transactionMock();
    const { service, prisma } = setup(transaction);
    const state = documentRecord(fileId, 'Earlier content').state;
    prisma.vaultFileVersion.findFirst.mockResolvedValue({
      id: operationId,
      version: 2,
      path: 'Note.md',
      deletedAt: null,
      createdAt: new Date('2026-07-21T10:00:00.000Z'),
      state,
      createdBy: null,
    });

    await expect(
      service.version(userId, vaultId, fileId, operationId),
    ).resolves.toMatchObject({ content: 'Earlier content', state: undefined });
    expect(prisma.vaultFileVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: operationId, fileId, file: { vaultId } },
      }),
    );
  });

  it('restores a saved Markdown state through the collaboration document', async () => {
    const transaction = transactionMock();
    const { service, prisma, restoreDocument, requireWrite } =
      setup(transaction);
    const state = documentRecord(fileId, 'Earlier content').state;
    prisma.vaultFileVersion.findFirst.mockResolvedValue({ state });

    await expect(
      service.restoreVersion(userId, vaultId, fileId, operationId),
    ).resolves.toEqual({ restored: true });
    expect(requireWrite).toHaveBeenCalledWith(userId, vaultId);
    expect(restoreDocument).toHaveBeenCalledWith(
      vaultId,
      fileId,
      state,
      userId,
    );
  });

  it('searches document text and resolves wiki backlinks', async () => {
    const project = file({ path: 'Projects/Roadmap.md' });
    const daily = file({ id: childId, path: 'Daily/Today.md' });
    const { service, prisma, requireRead, backlinks, graph } =
      setup(transactionMock());
    prisma.vaultFile.findMany.mockResolvedValue([daily, project]);
    prisma.vaultFile.findFirst.mockResolvedValue({ path: project.path });
    prisma.yDocument.findMany.mockResolvedValue([
      documentRecord(project.id, '# Roadmap\nAlpha release'),
      documentRecord(daily.id, 'Continue [[Roadmap]] after the alpha review.'),
    ]);
    backlinks.mockResolvedValue([
      { source: { id: daily.id, path: daily.path } },
    ]);
    graph.mockResolvedValue({
      nodes: [
        { id: project.id, path: project.path, exists: true },
        { id: daily.id, path: daily.path, exists: true },
      ],
      edges: [{ source: daily.id, target: project.id }],
    });

    await expect(service.search(userId, vaultId, 'alpha')).resolves.toEqual([
      {
        id: childId,
        path: 'Daily/Today.md',
        excerpt: 'Continue [[Roadmap]] after the alpha review.',
      },
      {
        id: fileId,
        path: 'Projects/Roadmap.md',
        excerpt: '# Roadmap Alpha release',
      },
    ]);
    await expect(service.backlinks(userId, vaultId, fileId)).resolves.toEqual([
      {
        id: childId,
        path: 'Daily/Today.md',
        excerpt: 'Continue [[Roadmap]] after the alpha review.',
      },
    ]);
    await expect(
      service.context(userId, vaultId, 'alpha roadmap', 1, 200),
    ).resolves.toEqual({
      question: 'alpha roadmap',
      documents: [
        {
          id: fileId,
          path: 'Projects/Roadmap.md',
          score: 6,
          excerpt: '# Roadmap Alpha release',
          content: '# Roadmap\nAlpha release',
          truncated: false,
        },
      ],
      related: [{ id: childId, path: 'Daily/Today.md', exists: true }],
    });
    expect(requireRead).toHaveBeenCalledWith(userId, vaultId);
  });
});

function operation(overrides: Partial<FileOperationDto>): FileOperationDto {
  return {
    operationId,
    fileId,
    type: FileOperationType.CREATE,
    ...overrides,
  };
}

function file(overrides: Partial<VaultFile> = {}): VaultFile {
  const now = new Date('2026-07-21T00:00:00.000Z');
  return {
    id: fileId,
    vaultId,
    kind: 'MARKDOWN',
    path: 'Note.md',
    activePathKey: 'note.md',
    version: 1,
    attachmentId: null,
    mimeType: null,
    sha256: null,
    size: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function attachmentRecord(): Attachment {
  const now = new Date('2026-07-21T00:00:00.000Z');
  return {
    id: attachmentId,
    vaultId,
    path: 'assets/image.png',
    objectKey: 'vault/attachment',
    size: 42n,
    mimeType: 'image/png',
    sha256: 'abc',
    etag: null,
    idempotencyKey: '77777777-7777-4777-8777-777777777777',
    status: 'READY',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function response(value: VaultFile) {
  return {
    id: value.id,
    kind: value.kind.toLowerCase(),
    path: value.path,
    deleted: value.deletedAt !== null,
    version: value.version,
    updatedAt: value.updatedAt,
    attachmentId: value.attachmentId,
    mimeType: value.mimeType,
    sha256: value.sha256,
    size: value.size === null ? null : Number(value.size),
  };
}

function transactionMock() {
  return {
    vaultFile: {
      findFirst:
        jest.fn<
          (input: Prisma.VaultFileFindFirstArgs) => Promise<VaultFile | null>
        >(),
      findMany:
        jest.fn<
          (input: Prisma.VaultFileFindManyArgs) => Promise<VaultFile[]>
        >(),
      create:
        jest.fn<(input: Prisma.VaultFileCreateArgs) => Promise<VaultFile>>(),
      update:
        jest.fn<(input: Prisma.VaultFileUpdateArgs) => Promise<VaultFile>>(),
      deleteMany: jest.fn(),
    },
    vaultFileOperation: {
      create:
        jest.fn<
          (
            input: Prisma.VaultFileOperationCreateArgs,
          ) => Promise<VaultFileOperation>
        >(),
    },
    vaultFileVersion: {
      findFirst: jest
        .fn<
          (
            input: Prisma.VaultFileVersionFindFirstArgs,
          ) => Promise<{ version: number } | null>
        >()
        .mockResolvedValue(null),
    },
    attachment: {
      findFirst:
        jest.fn<
          (input: Prisma.AttachmentFindFirstArgs) => Promise<Attachment | null>
        >(),
      updateMany: jest.fn(),
    },
    yDocument: {
      findUnique: jest
        .fn<
          (input: Prisma.YDocumentFindUniqueArgs) => Promise<YDocument | null>
        >()
        .mockResolvedValue(null),
      deleteMany: jest.fn(),
    },
  };
}

function setup(
  transaction: ReturnType<typeof transactionMock>,
  completed: object | null = null,
) {
  const prisma = {
    vaultFileOperation: {
      findUnique: jest.fn().mockResolvedValue(completed),
    },
    vaultFile: { findMany: jest.fn(), findFirst: jest.fn() },
    vaultFileVersion: { findMany: jest.fn(), findFirst: jest.fn() },
    yDocument: { findMany: jest.fn() },
    $transaction: jest.fn(
      (callback: (client: Prisma.TransactionClient) => Promise<VaultFile[]>) =>
        callback(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  const requireRead = jest.fn().mockResolvedValue(undefined);
  const requireWrite = jest.fn().mockResolvedValue(undefined);
  const requireOwner = jest.fn().mockResolvedValue(undefined);
  const publishFiles = jest.fn().mockResolvedValue(undefined);
  const removeFiles = jest.fn().mockResolvedValue(undefined);
  const restoreDocument = jest.fn().mockResolvedValue(undefined);
  const refreshTargets = jest.fn().mockResolvedValue(undefined);
  const backlinks = jest.fn().mockResolvedValue([]);
  const graph = jest.fn().mockResolvedValue({ nodes: [], edges: [] });
  const rebuild = jest.fn().mockResolvedValue({ nodes: [], edges: [] });
  const service = new VaultFilesService(
    prisma as unknown as PrismaService,
    {
      requireRead,
      requireWrite,
      requireOwner,
    } as unknown as VaultAccessService,
    {
      publishFiles,
      removeFiles,
      restoreDocument,
    } as unknown as CollaborationServerService,
    {
      refreshTargets,
      backlinks,
      graph,
      rebuild,
    } as unknown as VaultLinksService,
  );
  return {
    service,
    prisma,
    publishFiles,
    removeFiles,
    restoreDocument,
    refreshTargets,
    backlinks,
    graph,
    requireRead,
    requireWrite,
    requireOwner,
    rebuild,
  };
}

function documentRecord(id: string, content: string) {
  const document = new Y.Doc();
  document.getText('content').insert(0, content);
  return {
    roomName: `vault:${vaultId}:doc:${id}`,
    state: Buffer.from(Y.encodeStateAsUpdate(document)),
  };
}

type VersionCreate = {
  version: number;
  path: string;
  attachmentId?: string | null;
  createdById: string;
  state?: Uint8Array;
};

function createdVersion(
  data: Prisma.VaultFileCreateArgs['data'] | Prisma.VaultFileUpdateArgs['data'],
) {
  return (data as unknown as { versions: { create: VersionCreate } }).versions
    .create;
}
