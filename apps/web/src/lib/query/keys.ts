export const queryKeys = {
  session: ["session"] as const,
  account: ["account"] as const,
  accountSessions: ["account", "sessions"] as const,
  vaults: ["vaults"] as const,
  invitations: ["invitations"] as const,
  vaultMembers: (vaultId: string) => ["vaults", vaultId, "members"] as const,
  vaultInvitations: (vaultId: string) => ["vaults", vaultId, "invitations"] as const,
  vaultSearch: (vaultId: string, query: string) => ["vaults", vaultId, "search", query] as const,
  backlinks: (vaultId: string, fileId: string) =>
    ["vaults", vaultId, "files", fileId, "backlinks"] as const,
  attachment: (vaultId: string, attachmentId: string) =>
    ["attachments", vaultId, attachmentId] as const,
};
