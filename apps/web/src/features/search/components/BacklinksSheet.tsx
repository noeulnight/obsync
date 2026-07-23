import { Link2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ApiClient } from "@/lib/api/client";
import { useBacklinks } from "../queries/use-vault-search";

export function BacklinksSheet({
  api,
  vaultId,
  fileId,
  openDocument,
}: {
  api: ApiClient;
  vaultId: string;
  fileId: string;
  openDocument: (fileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const backlinks = useBacklinks(api, vaultId, fileId);
  const results = backlinks.data ?? [];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Backlinks (${results.length})`}>
          <Link2 />
          {results.length}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Backlinks</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {backlinks.isPending ? (
            <Message>Loading backlinks…</Message>
          ) : !results.length ? (
            <Message>No backlinks yet.</Message>
          ) : (
            results.map((result) => (
              <button
                key={result.id}
                type="button"
                className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  openDocument(result.id);
                  setOpen(false);
                }}
              >
                <span className="block truncate font-medium">{displayName(result.path)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {result.excerpt || result.path}
                </span>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Message({ children }: { children: string }) {
  return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function displayName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
}
