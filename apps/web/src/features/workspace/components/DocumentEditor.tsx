import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Editor } from "@/features/documents/components/Editor";
import { renamedMarkdownPath, type FileEntry } from "@/features/documents/lib/files";
import type { WebDocument } from "@/features/documents/lib/sync";
import { BacklinksSheet } from "@/features/search/components/BacklinksSheet";
import { VersionHistorySheet } from "@/features/history/components/VersionHistorySheet";
import type { ApiClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/error";
import { FileHeader } from "./FileHeader";

export function DocumentEditor({
  entry,
  api,
  vaultId,
  files,
  vaultName,
  session,
  onRename,
  onRequestRename,
  onDelete,
  onNavigate,
  resolveAsset,
  onOpenDocument,
  readOnly = false,
}: {
  entry: FileEntry;
  api: ApiClient;
  vaultId: string;
  files: FileEntry[];
  vaultName: string;
  session: WebDocument;
  onRename: (path: string) => void;
  onRequestRename: () => void;
  onDelete: () => void;
  onNavigate: (href: string) => void;
  resolveAsset: (href: string) => Promise<string | undefined>;
  onOpenDocument: (fileId: string) => void;
  readOnly?: boolean;
}) {
  const original = basename(entry.path);
  const [title, setTitle] = useState(original);
  const [error, setError] = useState("");

  useEffect(() => setTitle(original), [original]);

  function commit() {
    const path = renamedMarkdownPath(entry.path, title);
    if (!path) {
      setError("Titles cannot contain / or \\ characters.");
      setTitle(original);
      return;
    }
    try {
      onRename(path);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
      setTitle(original);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FileHeader
        vaultName={vaultName}
        path={entry.path}
        title={title}
        actions={
          <>
            <BacklinksSheet
              api={api}
              vaultId={vaultId}
              fileId={entry.id}
              openDocument={onOpenDocument}
            />
            <VersionHistorySheet
              api={api}
              vaultId={vaultId}
              fileId={entry.id}
              readOnly={readOnly}
            />
          </>
        }
        onRename={readOnly ? undefined : onRequestRename}
        onDelete={readOnly ? undefined : onDelete}
      />
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-[min(700px,calc(100%_-_64px))] pt-8">
          <Input
            className="mb-4 h-auto rounded-none border-0 bg-transparent px-0 py-0 !text-[2rem] !leading-[1.2] font-semibold tracking-[-0.015em] shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
            aria-label="Document title"
            value={title}
            readOnly={readOnly}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => !readOnly && commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(original);
                event.currentTarget.blur();
              }
            }}
          />
          {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
        </div>
        <Editor
          session={session}
          files={files}
          onNavigate={onNavigate}
          resolveAsset={resolveAsset}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}

function basename(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
}
