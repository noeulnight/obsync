import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useMcpAuthorization(id: string) {
  return useQuery({
    queryKey: queryKeys.mcpAuthorization(id),
    queryFn: () => api.mcpAuthorization(id),
    enabled: Boolean(id),
  });
}

export function useMcpAuthorizationDecision(id: string) {
  return useMutation({
    meta: { toast: false },
    mutationFn: (decision: "approve" | "deny") => api.mcpAuthorizationDecision(id, decision),
    onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
  });
}
