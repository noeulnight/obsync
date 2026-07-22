import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useRebuildVaultGraph() {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Graph index rebuilt." },
    mutationFn: (vaultId: string) => api.rebuildVaultGraph(vaultId),
    onSuccess: async (_, vaultId) => {
      await client.invalidateQueries({ queryKey: queryKeys.vaultGraph(vaultId) });
    },
  });
}

export function useResetVault() {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Vault reset." },
    mutationFn: (vaultId: string) => api.resetVault(vaultId),
    onSuccess: async (_, vaultId) => {
      await client.invalidateQueries({ queryKey: queryKeys.vaultGraph(vaultId) });
    },
  });
}
