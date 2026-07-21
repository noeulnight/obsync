import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useVaultGraph(api: ApiClient, vaultId: string) {
  return useQuery({
    queryKey: queryKeys.vaultGraph(vaultId),
    queryFn: () => api.vaultGraph(vaultId),
    refetchInterval: 5_000,
  });
}
