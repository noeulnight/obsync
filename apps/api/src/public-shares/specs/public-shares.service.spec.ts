import type { PrismaService } from '../../database/prisma.service';
import type { StorageService } from '../../storage/storage.service';
import type { VaultAccessService } from '../../vaults/vault-access.service';
import type { CollaborationServerService } from '../../collaboration/collaboration-server.service';
import { PublicSharesService } from '../public-shares.service';

const userId = '11111111-1111-4111-8111-111111111111';
const vaultId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';
const attachmentId = '44444444-4444-4444-8444-444444444444';

describe('PublicSharesService', () => {
  it('publishes a Markdown file only after owner access is verified', async () => {
    const { service, access, prisma } = setup();
    prisma.vaultFile.findFirst.mockResolvedValue({ id: fileId });
    prisma.publicShare.upsert.mockResolvedValue({
      slug: 'public-slug',
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
    });

    await expect(service.publish(userId, vaultId, fileId)).resolves.toEqual({
      slug: 'public-slug',
      createdAt: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(access.requireOwner).toHaveBeenCalledWith(userId, vaultId);
    expect(prisma.publicShare.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fileId } }),
    );
  });

  it('returns only attachments embedded by the shared document', async () => {
    const { service, prisma, collaboration } = setup();
    prisma.publicShare.findUnique.mockResolvedValue({
      vaultId,
      vault: { name: 'Shared Vault' },
      file: {
        id: fileId,
        path: 'Notes/Public.md',
        kind: 'MARKDOWN',
        deletedAt: null,
      },
    });
    collaboration.readDocument.mockResolvedValue(
      '![[image.png]]\n![[../private.png]]',
    );
    prisma.attachment.findMany.mockResolvedValue([
      {
        id: attachmentId,
        path: 'Notes/image.png',
        mimeType: 'image/png',
        objectKey: 'allowed',
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        path: 'secret.png',
        mimeType: 'image/png',
        objectKey: 'private',
      },
    ]);

    await expect(service.read('public-slug')).resolves.toMatchObject({
      content: '![[image.png]]\n![[../private.png]]',
      attachments: [
        { id: attachmentId, path: 'Notes/image.png', mimeType: 'image/png' },
      ],
    });
  });

  it('includes Markdown documents embedded by a shared Canvas', async () => {
    const { service, prisma, collaboration } = setup();
    prisma.publicShare.findUnique.mockResolvedValue({
      vaultId,
      vault: { name: 'Shared Vault' },
      file: {
        id: fileId,
        path: 'Boards/Public.canvas',
        kind: 'CANVAS',
        deletedAt: null,
      },
    });
    collaboration.readCanvas.mockResolvedValue({
      meta: {},
      nodes: [{ id: 'node', type: 'file', file: '../Notes/Embedded.md' }],
      edges: [],
    });
    prisma.attachment.findMany.mockResolvedValue([]);
    prisma.vaultFile.findMany.mockResolvedValue([
      { id: '55555555-5555-4555-8555-555555555555', path: 'Notes/Embedded.md' },
    ]);
    collaboration.readDocument.mockResolvedValue('# Embedded');

    await expect(service.read('public-canvas')).resolves.toMatchObject({
      documents: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          path: 'Notes/Embedded.md',
          content: '# Embedded',
        },
      ],
    });
  });
});

function setup() {
  const prisma = {
    vaultFile: { findFirst: jest.fn(), findMany: jest.fn() },
    publicShare: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    attachment: { findMany: jest.fn() },
  };
  const access = { requireRead: jest.fn(), requireOwner: jest.fn() };
  const collaboration = { readDocument: jest.fn(), readCanvas: jest.fn() };
  const service = new PublicSharesService(
    prisma as unknown as PrismaService,
    access as unknown as VaultAccessService,
    collaboration as unknown as CollaborationServerService,
    {} as StorageService,
  );
  return { service, prisma, access, collaboration };
}
