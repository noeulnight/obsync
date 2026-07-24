import { Maximize2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  const isImage = imagePath(entry.path);

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
        <div className="grid min-h-0 flex-1 place-items-center p-6">
          {isImage ? (
            <ImageSkeleton />
          ) : (
            <span className="text-sm text-muted-foreground">Loading…</span>
          )}
        </div>
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
      {isImage ? (
        <ImagePreview key={download.data} src={download.data} alt={basename(entry.path)} />
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

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="relative grid min-h-0 flex-1 place-items-center overflow-auto bg-muted/20 p-6">
        {!loaded && !failed && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <ImageSkeleton />
          </div>
        )}
        {failed ? (
          <p className="text-sm text-destructive">Could not load image.</p>
        ) : (
          <button
            type="button"
            className="relative max-h-full max-w-full cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${alt} full size`}
            onClick={() => setExpanded(true)}
          >
            <img
              className={`max-h-full max-w-full rounded-lg border bg-background object-contain shadow-sm transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
              src={src}
              alt={alt}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
            {loaded && (
              <span className="absolute right-2 bottom-2 rounded-md bg-background/80 p-1.5 text-foreground shadow-sm">
                <Maximize2 className="size-4" />
                <span className="sr-only">Open full size</span>
              </span>
            )}
          </button>
        )}
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="h-[calc(100svh-2rem)] max-w-[calc(100vw-2rem)] place-items-center bg-background/95 p-4 sm:max-w-[calc(100vw-4rem)]">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img className="max-h-full max-w-full object-contain" src={src} alt={alt} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImageSkeleton() {
  return (
    <div className="h-[min(65vh,36rem)] w-[min(80vw,56rem)] animate-pulse rounded-lg bg-muted" />
  );
}

function basename(path: string) {
  return path.split("/").at(-1) ?? path;
}
