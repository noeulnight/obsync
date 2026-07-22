import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type VaultRole } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useVaultMembers(vaultId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.vaultMembers(vaultId),
    queryFn: () => api.vaultMembers(vaultId),
    enabled: enabled && Boolean(vaultId),
  });
}

export function useVaultInvitations(vaultId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.vaultInvitations(vaultId),
    queryFn: () => api.vaultInvitations(vaultId),
    enabled: enabled && Boolean(vaultId),
  });
}

export function usePendingInvitations(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.invitations,
    queryFn: () => api.pendingInvitations(),
    enabled,
  });
}

export function useInviteToVault(vaultId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Invitation sent." },
    mutationFn: ({ email, role }: { email: string; role: VaultRole }) =>
      api.inviteToVault(vaultId, email, role),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.vaultInvitations(vaultId) }),
  });
}

export function useUpdateVaultMember(vaultId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Member role updated." },
    mutationFn: ({ userId, role }: { userId: string; role: VaultRole }) =>
      api.updateVaultMember(vaultId, userId, role),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.vaultMembers(vaultId) }),
  });
}

export function useRemoveVaultMember(vaultId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Member removed." },
    mutationFn: (userId: string) => api.removeVaultMember(vaultId, userId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.vaultMembers(vaultId) }),
  });
}

export function useCancelVaultInvitation(vaultId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Invitation canceled." },
    mutationFn: (invitationId: string) => api.cancelVaultInvitation(vaultId, invitationId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.vaultInvitations(vaultId) }),
  });
}

export function useAnswerInvitation() {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Invitation updated." },
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (accept) await api.acceptInvitation(id);
      else await api.rejectInvitation(id);
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.invitations }),
        client.invalidateQueries({ queryKey: queryKeys.vaults }),
      ]);
    },
  });
}
