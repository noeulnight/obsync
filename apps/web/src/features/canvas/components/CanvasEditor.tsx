import { useEffect, useState, type ReactNode } from "react";
import type { FileEntry } from "@/features/documents/lib/files";
import type { WebDocument } from "@/features/documents/lib/sync";
import { FileHeader } from "@/features/workspace/components/FileHeader";
import { CollaboratorsMenu } from "@/features/workspace/components/CollaboratorsMenu";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import type { WebCanvas } from "../lib/sync";
import { CanvasSurface } from "./CanvasSurface";

export function CanvasEditor({
  session,
  fileId,
  vaultId,
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
  canShare = false,
  headerLeading,
  userName = "You",
  pinned = false,
  onTogglePinned = () => undefined,
}: {
  session: WebCanvas;
  fileId?: string;
  vaultId?: string;
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
  canShare?: boolean;
  headerLeading?: ReactNode;
  userName?: string;
  pinned?: boolean;
  onTogglePinned?: () => void;
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
        leading={headerLeading}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={pinned ? "Unpin Canvas" : "Pin Canvas"}
              onClick={onTogglePinned}
            >
              <Star className={pinned ? "fill-current" : undefined} />
            </Button>
            <CollaboratorsMenu userName={userName} session={session} />
            {canShare && vaultId && fileId && <ShareButton vaultId={vaultId} fileId={fileId} />}
          </>
        }
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
