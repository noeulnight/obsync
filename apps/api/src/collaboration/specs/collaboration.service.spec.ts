import * as Y from 'yjs';
import { replaceSharedText } from '../collaboration-server.service';
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
