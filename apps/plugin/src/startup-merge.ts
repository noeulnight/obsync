export type StartupMerge = "server" | "local" | "conflict";

export function startupMerge(baseline: string, local: string, server: string): StartupMerge {
  if (local === baseline || local === server) return "server";
  if (!local && (baseline || server)) return "server";
  if (server === baseline) return "local";
  return "conflict";
}
