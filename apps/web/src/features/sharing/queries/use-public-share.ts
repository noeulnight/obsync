import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function usePublicShareStatus(vaultId: string, fileId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.publicShareStatus(vaultId, fileId),
    queryFn: () => api.publicShareStatus(vaultId, fileId),
    enabled,
  });
}

export function usePublishFile(vaultId: string, fileId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Published to the web." },
    mutationFn: () => api.publishFile(vaultId, fileId),
    onSuccess: (share) => client.setQueryData(queryKeys.publicShareStatus(vaultId, fileId), share),
  });
}

export function useUnpublishFile(vaultId: string, fileId: string) {
  const client = useQueryClient();
  return useMutation({
    meta: { successMessage: "Public access disabled." },
    mutationFn: () => api.unpublishFile(vaultId, fileId),
    onSuccess: () => client.setQueryData(queryKeys.publicShareStatus(vaultId, fileId), null),
  });
}

export function usePublicShare(slug: string) {
  return useQuery({
    queryKey: queryKeys.publicShare(slug),
    queryFn: () => api.publicShare(slug),
    enabled: Boolean(slug),
    retry: false,
  });
}
