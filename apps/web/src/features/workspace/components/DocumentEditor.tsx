import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Editor } from "@/features/documents/components/Editor";
import { renamedMarkdownPath, type FileEntry } from "@/features/documents/lib/files";
import type { WebDocument } from "@/features/documents/lib/sync";
import { errorMessage } from "@/lib/error";
import { FileHeader } from "./FileHeader";

export function DocumentEditor({
  entry,
  vaultName,
  session,
  onRename,
  onRequestRename,
  onDelete,
  onNavigate,
  resolveAsset,
  readOnly = false,
}: {
  entry: FileEntry;
  vaultName: string;
  session: WebDocument;
  onRename: (path: string) => void;
  onRequestRename: () => void;
  onDelete: () => void;
  onNavigate: (href: string) => void;
  resolveAsset: (href: string) => Promise<string | undefined>;
  readOnly?: boolean;
}) {
  const original = basename(entry.path);
  const [title, setTitle] = useState(original);
  const [error, setError] = useState("");

  useEffect(() => setTitle(original), [original]);

  function commit() {
    const path = renamedMarkdownPath(entry.path, title);
    if (!path) {
      setError("제목에 / 또는 \\ 문자를 사용할 수 없습니다.");
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
        onRename={readOnly ? undefined : onRequestRename}
        onDelete={readOnly ? undefined : onDelete}
      />
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-[min(700px,calc(100%_-_64px))] pt-8">
          <Input
            className="mb-4 h-auto rounded-none border-0 bg-transparent px-0 py-0 !text-[2rem] !leading-[1.2] font-bold tracking-[-0.015em] shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
            aria-label="문서 제목"
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
