import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useVaults(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.vaults,
    queryFn: () => api.listVaults(),
    initialData: () => api.cachedVaults(),
    enabled,
  });
}

export function useCreateVault() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createVault(name),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.vaults });
    },
  });
}

export function useUpdateVault() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateVault(id, name),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.vaults });
    },
  });
}

export function useDeleteVault() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteVault(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.vaults });
    },
  });
}
