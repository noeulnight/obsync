import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { FileEntry } from "@/features/documents/lib/files";
import { useVaultSearch } from "../queries/use-vault-search";
import type { ApiClient, DocumentSearchResult } from "@/lib/api/client";

export type SearchMode = "open" | "search" | "canvas";

export function VaultSearchDialog({
  api,
  vaultId,
  mode,
  entries,
  close,
  open,
}: {
  api: ApiClient;
  vaultId: string;
  mode?: SearchMode;
  entries: FileEntry[];
  close: () => void;
  open: (entry: FileEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setQuery("");
    setDebounced("");
    setSelected(0);
  }, [mode]);

  useEffect(() => {
    if (mode !== "search") return;
    const timeout = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [mode, query]);

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
        .sort((left, right) => left.path.localeCompare(right.path))
        .map((entry) => ({ id: entry.id, path: entry.path, excerpt: "" })),
    [entries, mode, query],
  );
  const search = useVaultSearch(api, vaultId, debounced, mode === "search");
  const results = mode === "search" ? (search.data ?? []) : local;

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
          {mode === "search" ? "Search Vault" : mode === "canvas" ? "Add to Canvas" : "Quick open"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {mode === "search"
            ? "Search document titles and contents."
            : mode === "canvas"
              ? "Add a document or Canvas to the Canvas."
              : "Open a Vault file."}
        </DialogDescription>
        <Input
          autoFocus
          aria-label={
            mode === "search" ? "Search Vault" : mode === "canvas" ? "Add to Canvas" : "Quick open"
          }
          className="h-12 rounded-none border-0 bg-transparent px-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder={
            mode === "search"
              ? "Search titles and contents…"
              : mode === "canvas"
                ? "Add a document or Canvas…"
                : "Open a file…"
          }
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
        <div className="max-h-[min(420px,60vh)] overflow-y-auto border-t p-1">
          {mode === "search" && !query.trim() ? (
            <Message>Type to search the Vault.</Message>
          ) : search.isFetching && !results.length ? (
            <Message>Searching…</Message>
          ) : !results.length ? (
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
