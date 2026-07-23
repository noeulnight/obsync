import * as Y from 'yjs';
import {
  CollaborationServerService,
  replaceSharedText,
  shouldCheckpointBefore,
} from '../collaboration-server.service';
import {
  parseCollaborationRoom,
  storedCollaborationRoom,
} from '../types/collaboration-room.type';

const vaultId = '8f0d6f4e-6c5b-4af7-90c2-61a7aa3bb122';
const documentId = '7c1aba21-81c8-5c82-bffd-794bad878623';

describe('parseCollaborationRoom', () => {
  it('parses a manifest room', () => {
    expect(parseCollaborationRoom('manifest', vaultId)).toEqual({
      kind: 'manifest',
      vaultId,
    });
  });

  it('parses a document room', () => {
    expect(parseCollaborationRoom(`doc:${documentId}`, vaultId)).toEqual({
      kind: 'document',
      vaultId,
      documentId,
    });
  });

  it('parses a canvas room', () => {
    expect(parseCollaborationRoom(`canvas:${documentId}`, vaultId)).toEqual({
      kind: 'canvas',
      vaultId,
      documentId,
    });
  });

  it.each([
    'manifest:extra',
    'doc',
    'doc:not-a-uuid',
    'canvas:not-a-uuid',
    'other:manifest',
    '',
  ])('rejects invalid room %s', (roomName) => {
    expect(parseCollaborationRoom(roomName, vaultId)).toBeNull();
  });

  it('rejects an invalid Vault query and preserves the stored room key', () => {
    expect(parseCollaborationRoom('manifest', 'not-a-uuid')).toBeNull();
    const room = parseCollaborationRoom(`doc:${documentId}`, vaultId);
    expect(room && storedCollaborationRoom(room)).toBe(
      `vault:${vaultId}:doc:${documentId}`,
    );
  });
});

describe('replaceSharedText', () => {
  it('preserves unchanged Yjs characters around the edited range', () => {
    const document = new Y.Doc();
    const text = document.getText('content');
    text.insert(0, 'before middle after');
    const updates: unknown[] = [];
    text.observe((event) => updates.push(event.delta));

    replaceSharedText(text, 'before changed after');

    expect(text.toJSON()).toBe('before changed after');
    expect(updates).toHaveLength(1);
  });
});

describe('destructive checkpoints', () => {
  const state = (content: string) => {
    const document = new Y.Doc();
    document.getText('content').insert(0, content);
    return Y.encodeStateAsUpdate(document);
  };

  it('checkpoints before a document is emptied or mostly removed', () => {
    expect(shouldCheckpointBefore(state('important'), state(''))).toBe(true);
    expect(shouldCheckpointBefore(state('a'.repeat(300)), state('short'))).toBe(
      true,
    );
    expect(
      shouldCheckpointBefore(state('important'), state('important!')),
    ).toBe(false);
  });
});

describe('permanent collaboration cleanup', () => {
  it('closes content rooms and deletes any store that raced with permanent deletion', async () => {
    const closeConnections = jest.fn();
    const transact = jest.fn(
      (update: (document: Y.Doc) => void | Promise<void>) =>
        update(new Y.Doc()),
    );
    const disconnect = jest.fn();
    const deleteMany = jest.fn();
    const upsert = jest.fn();
    const service = Object.create(
      CollaborationServerService.prototype,
    ) as CollaborationServerService;
    Object.assign(service, {
      hocuspocus: new Map([
        [
          vaultId,
          {
            closeConnections,
            openDirectConnection: jest.fn().mockResolvedValue({
              transact,
              disconnect,
            }),
          },
        ],
      ]),
      removedRooms: new Set(),
      storeChains: new Map(),
      prisma: { yDocument: { deleteMany, upsert } },
    });

    await service.removeFiles(vaultId, [documentId]);
    await (
      service as unknown as {
        store(
          roomName: string,
          state: Uint8Array,
          userId: string,
          clientsCount: number,
        ): Promise<void>;
      }
    ).store(
      `vault:${vaultId}:doc:${documentId}`,
      new Uint8Array(),
      'server',
      0,
    );

    expect(closeConnections).toHaveBeenCalledWith(`doc:${documentId}`);
    expect(closeConnections).toHaveBeenCalledWith(`canvas:${documentId}`);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        roomName: {
          in: [
            `vault:${vaultId}:doc:${documentId}`,
            `vault:${vaultId}:canvas:${documentId}`,
          ],
        },
      },
    });
    expect(disconnect).toHaveBeenCalledWith({ unloadImmediately: true });
    expect(upsert).not.toHaveBeenCalled();
  });
});
