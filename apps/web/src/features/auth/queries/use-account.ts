import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useAccount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: () => api.account(),
    initialData: () => api.cachedAccount(),
    enabled,
  });
}

export function useUpdateAccount() {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Account updated." },
    mutationFn: (input: { displayName?: string; email?: string; currentPassword?: string }) =>
      api.updateAccount(input),
    onSuccess: (account) => client.setQueryData(queryKeys.account, account),
  });
}

export function useChangePassword() {
  return useMutation({
    meta: { successMessage: "Password changed." },
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => api.changePassword(currentPassword, newPassword),
  });
}

export function useAccountSessions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.accountSessions,
    queryFn: () => api.accountSessions(),
    enabled,
  });
}

export function useRevokeSession() {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Session revoked." },
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.accountSessions });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: (password: string) => api.deleteAccount(password) });
}
