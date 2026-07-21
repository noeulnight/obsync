import { useEffect, useState } from "react";
import type { FileEntry } from "@/features/documents/lib/files";
import type { WebDocument } from "@/features/documents/lib/sync";
import { FileHeader } from "@/features/workspace/components/FileHeader";
import type { WebCanvas } from "../lib/sync";
import { CanvasSurface } from "./CanvasSurface";

export function CanvasEditor({
  session,
  vaultName,
  path,
  onRename,
  onDelete,
  openDocument,
  onNavigate,
  resolveAsset,
  resolveFileAsset,
  files,
  onAddFile,
  readOnly = false,
}: {
  session: WebCanvas;
  vaultName: string;
  path: string;
  onRename: () => void;
  onDelete: () => void;
  openDocument: (file: string) => WebDocument | undefined;
  onNavigate: (file: string, href: string) => void;
  resolveAsset: (file: string, href: string) => Promise<string | undefined>;
  resolveFileAsset: (file: string) => Promise<string | undefined>;
  files: FileEntry[];
  onAddFile: () => void;
  readOnly?: boolean;
}) {
  const [, render] = useState(0);

  useEffect(() => session.subscribe(() => render((value) => value + 1)), [session]);
  useEffect(() => session.subscribePresence(() => render((value) => value + 1)), [session]);
  useEffect(() => () => session.destroy(), [session]);

  return (
    <div className="flex h-full flex-col">
      <FileHeader
        vaultName={vaultName}
        path={path}
        onRename={readOnly ? undefined : onRename}
        onDelete={readOnly ? undefined : onDelete}
      />
      <CanvasSurface
        session={session}
        openDocument={openDocument}
        onNavigate={onNavigate}
        resolveAsset={resolveAsset}
        resolveFileAsset={resolveFileAsset}
        files={files}
        onAddFile={onAddFile}
        readOnly={readOnly}
      />
    </div>
  );
}
