import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import type { FileEntry } from "../lib/files";

export function useRestoreDeletedFile(api: ApiClient, vaultId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entry: FileEntry) => api.restoreDeletedFile(vaultId, entry.id),
    onSuccess: async (_, entry) => {
      const invalidations = [
        client.invalidateQueries({ queryKey: queryKeys.vaultGraph(vaultId) }),
        client.invalidateQueries({ queryKey: queryKeys.fileVersions(vaultId, entry.id) }),
      ];
      if (entry.attachmentId) {
        invalidations.push(
          client.invalidateQueries({ queryKey: queryKeys.attachment(vaultId, entry.attachmentId) }),
        );
      }
      await Promise.all(invalidations);
    },
  });
}

export function usePermanentlyDeleteFile(api: ApiClient, vaultId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entry: FileEntry) => api.permanentlyDeleteFile(vaultId, entry.id),
    onSuccess: async (_, entry) => {
      await client.invalidateQueries({ queryKey: queryKeys.vaultGraph(vaultId) });
      client.removeQueries({ queryKey: queryKeys.fileVersions(vaultId, entry.id) });
      if (entry.attachmentId) {
        client.removeQueries({ queryKey: queryKeys.attachment(vaultId, entry.attachmentId) });
      }
    },
  });
}
