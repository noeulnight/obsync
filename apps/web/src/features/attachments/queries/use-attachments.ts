import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useAttachmentDownload(api: ApiClient, vaultId: string, attachmentId: string) {
  return useQuery({
    queryKey: queryKeys.attachment(vaultId, attachmentId),
    queryFn: () => api.downloadUrl(vaultId, attachmentId),
    enabled: Boolean(attachmentId),
    staleTime: 4 * 60 * 1000,
  });
}

export function useDeleteAttachment(api: ApiClient, vaultId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(vaultId, attachmentId),
    onSuccess: (_, attachmentId) => {
      client.removeQueries({ queryKey: queryKeys.attachment(vaultId, attachmentId) });
    },
  });
}

export function useUploadAttachment(api: ApiClient, vaultId: string) {
  return useMutation({
    mutationFn: ({ file, path }: { file: File; path: string }) =>
      api.uploadAttachment(vaultId, file, path),
  });
}
