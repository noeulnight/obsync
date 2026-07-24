import { useMutation, useQuery } from "@tanstack/react-query";
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

export function useUploadAttachment(api: ApiClient, vaultId: string) {
  return useMutation({
    mutationFn: ({
      file,
      path,
      onProgress,
    }: {
      file: File;
      path: string;
      onProgress?: (progress: number) => void;
    }) => api.uploadAttachment(vaultId, file, path, onProgress),
  });
}
