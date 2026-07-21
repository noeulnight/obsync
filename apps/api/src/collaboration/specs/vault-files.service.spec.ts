import 'reflect-metadata';
import type {
  Attachment,
  Prisma,
  VaultFile,
  VaultFileOperation,
  YDocument,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { VaultAccessService } from '../../vaults/vault-access.service';
import { CollaborationServerService } from '../collaboration-server.service';
import {
  FileKind,
  FileOperationType,
  type FileOperationDto,
} from '../dto/file-operation.dto';
import { VaultFilesService } from '../vault-files.service';

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
    },
    vaultFileOperation: {
      create:
        jest.fn<
          (
            input: Prisma.VaultFileOperationCreateArgs,
          ) => Promise<VaultFileOperation>
        >(),
    },
    attachment: {
      findFirst:
        jest.fn<
          (input: Prisma.AttachmentFindFirstArgs) => Promise<Attachment | null>
        >(),
    },
    yDocument: {
      findUnique: jest
        .fn<
          (input: Prisma.YDocumentFindUniqueArgs) => Promise<YDocument | null>
        >()
        .mockResolvedValue(null),
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
    vaultFile: { findMany: jest.fn() },
    $transaction: jest.fn(
      (callback: (client: Prisma.TransactionClient) => Promise<VaultFile[]>) =>
        callback(transaction as unknown as Prisma.TransactionClient),
    ),
  };
  const requireWrite = jest.fn().mockResolvedValue(undefined);
  const publishFiles = jest.fn().mockResolvedValue(undefined);
  const service = new VaultFilesService(
    prisma as unknown as PrismaService,
    { requireWrite } as unknown as VaultAccessService,
    { publishFiles } as unknown as CollaborationServerService,
  );
  return { service, prisma, publishFiles };
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
