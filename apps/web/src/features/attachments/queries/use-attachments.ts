import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function attachmentDownloadOptions(api: ApiClient, vaultId: string, attachmentId: string) {
  return {
    queryKey: queryKeys.attachment(vaultId, attachmentId),
    queryFn: () => api.downloadUrl(vaultId, attachmentId),
    staleTime: 4 * 60 * 1000,
  };
}

export function useAttachmentDownload(api: ApiClient, vaultId: string, attachmentId: string) {
  return useQuery({
    ...attachmentDownloadOptions(api, vaultId, attachmentId),
    enabled: Boolean(attachmentId),
  });
}

export function useAttachmentUrlResolver(api: ApiClient, vaultId: string) {
  const client = useQueryClient();
  return useCallback(
    (attachmentId: string) =>
      client.fetchQuery(attachmentDownloadOptions(api, vaultId, attachmentId)),
    [api, client, vaultId],
  );
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
