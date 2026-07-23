import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useVaultGraph(api: ApiClient, vaultId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vaultGraph(vaultId),
    queryFn: () => api.vaultGraph(vaultId),
    enabled,
    refetchInterval: enabled ? 5_000 : false,
  });
}
