export type CollaborationRoom =
  | {
      kind: 'manifest';
      vaultId: string;
    }
  | {
      kind: 'document';
      vaultId: string;
      documentId: string;
    }
  | {
      kind: 'canvas';
      vaultId: string;
      documentId: string;
    };

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${uuid}$`, 'i');
const roomPattern = new RegExp(`^(manifest|(doc|canvas):(${uuid}))$`, 'i');
const storedRoomPattern = new RegExp(
  `^vault:(${uuid}):(manifest|(doc|canvas):(${uuid}))$`,
  'i',
);

export function parseCollaborationRoom(
  roomName: string,
  vaultId: string,
): CollaborationRoom | null {
  if (!uuidPattern.test(vaultId)) return null;
  const match = roomPattern.exec(roomName);
  if (!match) return null;

  vaultId = vaultId.toLowerCase();
  const roomKind = match[2]?.toLowerCase();
  const documentId = match[3]?.toLowerCase();

  if (!documentId) return { kind: 'manifest', vaultId };
  return {
    kind: roomKind === 'canvas' ? 'canvas' : 'document',
    vaultId,
    documentId,
  };
}

export function storedCollaborationRoom(room: CollaborationRoom) {
  if (room.kind === 'manifest') return `vault:${room.vaultId}:manifest`;
  const kind = room.kind === 'canvas' ? 'canvas' : 'doc';
  return `vault:${room.vaultId}:${kind}:${room.documentId}`;
}

export function parseStoredCollaborationRoom(roomName: string) {
  const match = storedRoomPattern.exec(roomName);
  if (!match) return null;
  return parseCollaborationRoom(match[2], match[1]);
}
