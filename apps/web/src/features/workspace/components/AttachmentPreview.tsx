import { Button } from "@/components/ui/button";
import { useAttachmentDownload } from "@/features/attachments/queries/use-attachments";
import { imagePath, type FileEntry } from "@/features/documents/lib/files";
import type { ApiClient } from "@/lib/api/client";
import { FileHeader } from "./FileHeader";

export function AttachmentPreview({
  api,
  vaultId,
  entry,
  vaultName,
  onRename,
  onDelete,
  headerLeading,
}: {
  api: ApiClient;
  vaultId: string;
  entry: FileEntry;
  vaultName: string;
  onRename?: () => void;
  onDelete?: () => void;
  headerLeading?: ReactNode;
}) {
  const attachmentId = entry.attachmentId ?? "";
  const download = useAttachmentDownload(api, vaultId, attachmentId);

  if (download.error) {
    return (
      <div className="flex h-full flex-col">
        <FileHeader
          vaultName={vaultName}
          path={entry.path}
          leading={headerLeading}
          onRename={onRename}
          onDelete={onDelete}
        />
        <div className="grid flex-1 place-items-center text-sm text-destructive">
          {download.error.message}
        </div>
      </div>
    );
  }
  if (!download.data) {
    return (
      <div className="flex h-full flex-col">
        <FileHeader
          vaultName={vaultName}
          path={entry.path}
          leading={headerLeading}
          onRename={onRename}
          onDelete={onDelete}
        />
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <FileHeader
        vaultName={vaultName}
        path={entry.path}
        leading={headerLeading}
        onRename={onRename}
        onDelete={onDelete}
      />
      {imagePath(entry.path) ? (
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-6">
          <img
            className="max-h-full max-w-full rounded-lg object-contain"
            src={download.data}
            alt={basename(entry.path)}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center">
          <Button asChild>
            <a href={download.data} target="_blank" rel="noreferrer">
              Open file
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

function basename(path: string) {
  return path.split("/").at(-1) ?? path;
}
import type { ReactNode } from "react";
