import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FileEntry } from "@/features/documents/lib/files";
import { useVaultSearch } from "@/features/search/queries/use-vault-search";
import type { ApiClient } from "@/lib/api/client";

export function WorkspaceSearchPanel({
  api,
  vaultId,
  entries,
  open,
  close,
}: {
  api: ApiClient;
  vaultId: string;
  entries: FileEntry[];
  open: (entry: FileEntry) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const search = useVaultSearch(api, vaultId, debounced, true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 items-center gap-1 px-2">
        <Search className="ml-1 size-4 text-muted-foreground" />
        <Input
          autoFocus
          aria-label="Search Vault"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder="Search titles and contents…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button variant="ghost" size="icon-xs" aria-label="Show files" onClick={close}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t p-1">
        {!query.trim() ? (
          <Message>Search titles and contents.</Message>
        ) : search.isFetching ? (
          <Message>Searching…</Message>
        ) : search.isError ? (
          <Message>Search failed.</Message>
        ) : !search.data?.length ? (
          <Message>No results found.</Message>
        ) : (
          search.data.map((result) => {
            const entry = entries.find((item) => item.id === result.id);
            if (!entry) return null;
            return (
              <button
                key={result.id}
                type="button"
                className="block w-full rounded-md px-2 py-2 text-left hover:bg-sidebar-accent"
                onClick={() => open(entry)}
              >
                <span className="block truncate text-sm font-medium">
                  {displayName(result.path)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{result.path}</span>
                {result.excerpt && (
                  <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                    {result.excerpt}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Message({ children }: { children: string }) {
  return <p className="px-2 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function displayName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.[^./]+$/i, "");
}
