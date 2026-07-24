import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export type AuthAction = "login" | "register";
export type Credentials = { email: string; password: string; action: AuthAction };

export function useSession() {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: queryKeys.session,
    queryFn: () => api.restoreSession(),
    staleTime: Infinity,
  });
  const authenticate = useMutation({
    meta: { toast: false },
    mutationFn: ({ email, password, action }: Credentials) => api[action](email, password),
    onSuccess: async () => {
      client.setQueryData(queryKeys.session, true);
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.account }),
        client.invalidateQueries({ queryKey: queryKeys.accountSessions }),
        client.invalidateQueries({ queryKey: queryKeys.vaults }),
      ]);
    },
  });
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      client.setQueryData(queryKeys.session, false);
      client.removeQueries({ queryKey: queryKeys.account });
      client.removeQueries({ queryKey: queryKeys.accountSessions });
      client.removeQueries({ queryKey: queryKeys.vaults });
    },
  });
  return { session, authenticate, logout };
}

export function useOidcConfig() {
  return useQuery({
    queryKey: queryKeys.oidcConfig,
    queryFn: () => api.oidcConfig(),
    staleTime: Infinity,
  });
}

export function useApproveDevice(userCode: string) {
  return useMutation({
    meta: { toast: false },
    mutationFn: () => api.approveDevice(userCode),
  });
}
