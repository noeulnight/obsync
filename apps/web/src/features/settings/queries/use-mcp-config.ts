import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useMcpConfig(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.mcpConfig,
    queryFn: () => api.mcpConfig(),
    enabled,
  });
}

export function useMcpApps(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.mcpApps,
    queryFn: () => api.mcpApps(),
    enabled,
  });
}

export function useRevokeMcpApp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => api.revokeMcpApp(clientId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.mcpApps }),
  });
}
