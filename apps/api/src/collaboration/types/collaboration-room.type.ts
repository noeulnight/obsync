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
const roomPattern = new RegExp(
  `^vault:(${uuid}):(manifest|(doc|canvas):(${uuid}))$`,
  'i',
);

export function parseCollaborationRoom(
  roomName: string,
): CollaborationRoom | null {
  const match = roomPattern.exec(roomName);
  if (!match) return null;

  const vaultId = match[1].toLowerCase();
  const roomKind = match[3]?.toLowerCase();
  const documentId = match[4]?.toLowerCase();

  if (!documentId) return { kind: 'manifest', vaultId };
  return {
    kind: roomKind === 'canvas' ? 'canvas' : 'document',
    vaultId,
    documentId,
  };
}
