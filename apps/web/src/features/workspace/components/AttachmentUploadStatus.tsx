import { LoaderCircle } from "lucide-react";

export type UploadProgress = {
  name: string;
  completed: number;
  total: number;
  progress: number;
};

export function AttachmentUploadStatus({ upload }: { upload?: UploadProgress }) {
  if (!upload) return null;
  const percent = Math.round(upload.progress * 100);
  return (
    <div
      role="status"
      className="fixed top-2 right-3 z-30 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
    >
      <LoaderCircle className="size-3.5 animate-spin" />
      <span className="max-w-40 truncate">Uploading {upload.name}</span>
      <span className="text-muted-foreground">
        {upload.total > 1 ? `${upload.completed}/${upload.total} · ` : ""}
        {percent}%
      </span>
    </div>
  );
}
