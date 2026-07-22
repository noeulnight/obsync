export const queryKeys = {
  session: ["session"] as const,
  account: ["account"] as const,
  accountSessions: ["account", "sessions"] as const,
  mcpConfig: ["mcp", "config"] as const,
  mcpApps: ["mcp", "apps"] as const,
  vaults: ["vaults"] as const,
  invitations: ["invitations"] as const,
  mcpAuthorization: (id: string) => ["mcp", "authorization", id] as const,
  vaultMembers: (vaultId: string) => ["vaults", vaultId, "members"] as const,
  vaultInvitations: (vaultId: string) => ["vaults", vaultId, "invitations"] as const,
  vaultSearch: (vaultId: string, query: string) => ["vaults", vaultId, "search", query] as const,
  backlinks: (vaultId: string, fileId: string) =>
    ["vaults", vaultId, "files", fileId, "backlinks"] as const,
  vaultGraph: (vaultId: string) => ["vaults", vaultId, "graph"] as const,
  fileVersions: (vaultId: string, fileId: string) =>
    ["vaults", vaultId, "files", fileId, "versions"] as const,
  fileVersion: (vaultId: string, fileId: string, versionId: string) =>
    ["vaults", vaultId, "files", fileId, "versions", versionId] as const,
  attachment: (vaultId: string, attachmentId: string) =>
    ["attachments", vaultId, attachmentId] as const,
  publicShareStatus: (vaultId: string, fileId: string) =>
    ["vaults", vaultId, "files", fileId, "share"] as const,
  publicShare: (slug: string) => ["public", "shares", slug] as const,
};
