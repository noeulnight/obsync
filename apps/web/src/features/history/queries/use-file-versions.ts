import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";

export function useFileVersions(api: ApiClient, vaultId: string, fileId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.fileVersions(vaultId, fileId),
    queryFn: () => api.fileVersions(vaultId, fileId),
    enabled,
    refetchInterval: enabled ? 10_000 : false,
  });
}

export function useFileVersion(api: ApiClient, vaultId: string, fileId: string, versionId: string) {
  return useQuery({
    queryKey: queryKeys.fileVersion(vaultId, fileId, versionId),
    queryFn: () => api.fileVersion(vaultId, fileId, versionId),
    enabled: Boolean(versionId),
  });
}

export function useRestoreFileVersion(api: ApiClient, vaultId: string, fileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => api.restoreFileVersion(vaultId, fileId, versionId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.fileVersions(vaultId, fileId) }),
  });
}
