import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useVaultSearch(api: ApiClient, vaultId: string, query: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.vaultSearch(vaultId, query),
    queryFn: () => api.searchVault(vaultId, query),
    enabled: enabled && Boolean(query),
  });
}

export function useBacklinks(api: ApiClient, vaultId: string, fileId: string) {
  return useQuery({
    queryKey: queryKeys.backlinks(vaultId, fileId),
    queryFn: () => api.backlinks(vaultId, fileId),
    enabled: Boolean(fileId),
    refetchInterval: 5_000,
  });
}
