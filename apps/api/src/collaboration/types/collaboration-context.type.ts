export type CollaborationContext = {
  userId?: string;
  vaultId?: string;
  role?: 'OWNER' | 'EDITOR' | 'VIEWER';
};
