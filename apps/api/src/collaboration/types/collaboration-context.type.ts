export type CollaborationContext = {
  vaultId: string;
  userId?: string;
  role?: 'OWNER' | 'EDITOR' | 'VIEWER';
};
