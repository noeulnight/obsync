import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useMcpConfig(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.mcpConfig,
    queryFn: () => api.mcpConfig(),
    enabled,
  });
}
