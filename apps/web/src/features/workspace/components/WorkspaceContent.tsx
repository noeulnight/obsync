import { lazy, Suspense } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import type { WebCanvas } from "@/features/canvas/lib/sync";
import type { FileEntry } from "@/features/documents/lib/files";
import type { WebDocument } from "@/features/documents/lib/sync";
import type { ApiClient } from "@/lib/api/client";
import { AttachmentPreview } from "./AttachmentPreview";

const DocumentEditor = lazy(() =>
  import("./DocumentEditor").then((module) => ({ default: module.DocumentEditor })),
);
const CanvasEditor = lazy(() =>
  import("@/features/canvas/components/CanvasEditor").then((module) => ({
    default: module.CanvasEditor,
  })),
);

export function WorkspaceContent({
  api,
  vaultId,
  vaultName,
  entries,
  active,
  activeEntry,
  notice,
  documentSession,
  canvasSession,
  canWrite,
  onRenamePath,
  onRename,
  onDelete,
  onNavigate,
  resolveAsset,
  openCanvasDocument,
  navigateFromCanvas,
  resolveCanvasAsset,
  resolveCanvasFileAsset,
}: {
  api: ApiClient;
  vaultId: string;
  vaultName: string;
  entries: FileEntry[];
  active: string;
  activeEntry?: FileEntry;
  notice: string;
  documentSession?: WebDocument;
  canvasSession?: WebCanvas;
  canWrite: boolean;
  onRenamePath: (path: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onNavigate: (href: string) => void;
  resolveAsset: (href: string) => Promise<string | undefined>;
  openCanvasDocument: (file: string) => WebDocument | undefined;
  navigateFromCanvas: (file: string, href: string) => void;
  resolveCanvasAsset: (file: string, href: string) => Promise<string | undefined>;
  resolveCanvasFileAsset: (file: string) => Promise<string | undefined>;
}) {
  return (
    <SidebarInset className="h-svh min-w-0 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {notice ? (
          <EmptyState>{notice}</EmptyState>
        ) : documentSession && activeEntry ? (
          <Suspense fallback={<EditorLoading />}>
            <DocumentEditor
              key={active}
              entry={activeEntry}
              vaultName={vaultName}
              session={documentSession}
              onRename={onRenamePath}
              onRequestRename={onRename}
              onDelete={onDelete}
              onNavigate={onNavigate}
              resolveAsset={resolveAsset}
              readOnly={!canWrite}
            />
          </Suspense>
        ) : canvasSession && activeEntry ? (
          <Suspense fallback={<EditorLoading />}>
            <CanvasEditor
              key={active}
              session={canvasSession}
              vaultName={vaultName}
              path={activeEntry.path}
              onRename={onRename}
              onDelete={onDelete}
              openDocument={openCanvasDocument}
              onNavigate={navigateFromCanvas}
              resolveAsset={resolveCanvasAsset}
              resolveFileAsset={resolveCanvasFileAsset}
              files={entries}
              readOnly={!canWrite}
            />
          </Suspense>
        ) : activeEntry?.kind === "attachment" ? (
          <AttachmentPreview
            api={api}
            vaultId={vaultId}
            vaultName={vaultName}
            entry={activeEntry}
            onRename={canWrite ? onRename : undefined}
            onDelete={canWrite ? onDelete : undefined}
          />
        ) : (
          <EmptyState>Select a document from the sidebar.</EmptyState>
        )}
      </div>
    </SidebarInset>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">{children}</div>
  );
}

function EditorLoading() {
  return <EmptyState>Loading editor…</EmptyState>;
}
