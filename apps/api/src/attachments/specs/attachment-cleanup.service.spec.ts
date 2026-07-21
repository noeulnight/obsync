import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AttachmentCleanupService } from '../attachment-cleanup.service';

describe('AttachmentCleanupService', () => {
  it('keeps the database record when object deletion fails and retries later', async () => {
    const findMany = jest.fn(() =>
      Promise.resolve([
        {
          id: 'attachment-id',
          vaultId: 'vault-id',
          objectKey: 'object-key',
          status: 'DELETED' as const,
        },
      ]),
    );
    const deleteMany = jest.fn(() => Promise.resolve({ count: 1 }));
    const prisma = {
      attachment: {
        findMany,
        updateMany: jest.fn(),
        update: jest.fn(),
        deleteMany,
      },
      vaultFile: { findMany: jest.fn(() => Promise.resolve([])) },
      vaultFileVersion: { findMany: jest.fn(() => Promise.resolve([])) },
    } as unknown as PrismaService;
    const deleteObject = jest.fn(() =>
      Promise.reject(new Error('storage unavailable')),
    );
    const storage = { deleteObject } as unknown as StorageService;
    const service = new AttachmentCleanupService(prisma, storage);

    await service.run();
    expect(deleteMany).not.toHaveBeenCalled();

    deleteObject.mockImplementation(() => Promise.resolve());
    await service.run();
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('marks an old unreferenced ready upload for delayed deletion', async () => {
    const now = new Date('2026-07-20T00:00:00.000Z');
    const updateMany = jest.fn<(input: unknown) => Promise<{ count: number }>>(
      () => Promise.resolve({ count: 1 }),
    );
    const prisma = {
      attachment: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'orphan-id',
              vaultId: 'vault-id',
              objectKey: 'orphan-key',
              status: 'READY' as const,
            },
          ]),
        ),
        updateMany,
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      vaultFile: { findMany: jest.fn(() => Promise.resolve([])) },
      vaultFileVersion: { findMany: jest.fn(() => Promise.resolve([])) },
    } as unknown as PrismaService;
    const deleteObject = jest.fn();
    const storage = { deleteObject } as unknown as StorageService;

    await new AttachmentCleanupService(prisma, storage).run(now);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'orphan-id', status: 'READY' },
      data: { status: 'DELETED', deletedAt: now },
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('keeps an attachment referenced by file history', async () => {
    const updateMany = jest.fn();
    const prisma = {
      attachment: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'historical-id',
              vaultId: 'vault-id',
              objectKey: 'historical-key',
              status: 'READY' as const,
            },
          ]),
        ),
        updateMany,
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      vaultFile: { findMany: jest.fn(() => Promise.resolve([])) },
      vaultFileVersion: {
        findMany: jest.fn(() =>
          Promise.resolve([{ attachmentId: 'historical-id' }]),
        ),
      },
    } as unknown as PrismaService;
    const deleteObject = jest.fn();
    const storage = { deleteObject } as unknown as StorageService;

    await new AttachmentCleanupService(prisma, storage).run();

    expect(updateMany).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
