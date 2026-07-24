import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { FileEntry } from "@/features/documents/lib/files";
import type { DocumentSearchResult } from "@/lib/api/client";

export type SearchMode = "open" | "canvas";

export type VaultQuickAction = {
  label: string;
  shortcut?: string;
  run: () => void;
};

export function VaultSearchDialog({
  mode,
  entries,
  actions = [],
  priorityIds = [],
  close,
  open,
}: {
  mode?: SearchMode;
  entries: FileEntry[];
  actions?: VaultQuickAction[];
  priorityIds?: string[];
  close: () => void;
  open: (entry: FileEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setQuery("");
    setSelected(0);
  }, [mode]);

  const local = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            !entry.deleted &&
            entry.kind !== "folder" &&
            (mode !== "canvas" || entry.kind === "markdown" || entry.kind === "canvas") &&
            entry.path.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((left, right) => {
          if (mode === "open" && !query.trim()) {
            const leftPriority = priorityIds.indexOf(left.id);
            const rightPriority = priorityIds.indexOf(right.id);
            if (leftPriority !== rightPriority) {
              return (
                (leftPriority < 0 ? Number.MAX_SAFE_INTEGER : leftPriority) -
                (rightPriority < 0 ? Number.MAX_SAFE_INTEGER : rightPriority)
              );
            }
          }
          return left.path.localeCompare(right.path);
        })
        .map((entry) => ({ id: entry.id, path: entry.path, excerpt: "" })),
    [entries, mode, priorityIds, query],
  );
  const results = local;

  useEffect(() => setSelected(0), [mode, query, results.length]);

  function choose(result: DocumentSearchResult) {
    const entry = entries.find((item) => item.id === result.id);
    if (!entry) return;
    open(entry);
    close();
  }

  return (
    <Dialog open={Boolean(mode)} onOpenChange={(value) => !value && close()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">
          {mode === "canvas" ? "Add to Canvas" : "Quick open"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {mode === "canvas" ? "Add a document or Canvas to the Canvas." : "Open a Vault file."}
        </DialogDescription>
        <Input
          autoFocus
          aria-label={mode === "canvas" ? "Add to Canvas" : "Quick open"}
          className="h-12 rounded-none border-0 bg-transparent px-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder={mode === "canvas" ? "Add a document or Canvas…" : "Open a file…"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !results.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((value) => (value + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((value) => (value - 1 + results.length) % results.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(results[selected] ?? results[0]);
            }
          }}
        />
        {mode === "open" && !query.trim() && actions.length > 0 && (
          <div className="border-t p-1">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  close();
                  action.run();
                }}
              >
                {action.label}
                {action.shortcut && (
                  <span className="text-xs text-muted-foreground">{action.shortcut}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="max-h-[min(420px,60vh)] overflow-y-auto border-t p-1">
          {!results.length ? (
            <Message>No results found.</Message>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent aria-selected:bg-accent"
                aria-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(result)}
              >
                <span className="block truncate font-medium">{displayName(result.path)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {result.excerpt || result.path}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Message({ children }: { children: string }) {
  return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function displayName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.[^./]+$/i, "");
}
