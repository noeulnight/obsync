export const queryKeys = {
  session: ["session"] as const,
  account: ["account"] as const,
  accountSessions: ["account", "sessions"] as const,
  vaults: ["vaults"] as const,
  invitations: ["invitations"] as const,
  vaultMembers: (vaultId: string) => ["vaults", vaultId, "members"] as const,
  vaultInvitations: (vaultId: string) => ["vaults", vaultId, "invitations"] as const,
  attachment: (vaultId: string, attachmentId: string) =>
    ["attachments", vaultId, attachmentId] as const,
};
