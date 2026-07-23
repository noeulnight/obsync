import { History, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetResizeHandle,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ApiClient, FileVersion } from "@/lib/api/client";
import {
  useFileVersion,
  useFileVersions,
  useRestoreFileVersion,
} from "../queries/use-file-versions";

export function VersionHistorySheet({
  api,
  vaultId,
  fileId,
  readOnly,
}: {
  api: ApiClient;
  vaultId: string;
  fileId: string;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [width, setWidth] = useState(() => Math.min(672, window.innerWidth - 24));
  const versions = useFileVersions(api, vaultId, fileId, open);
  const items = versions.data ?? [];
  const selected = useFileVersion(api, vaultId, fileId, selectedId);
  const restore = useRestoreFileVersion(api, vaultId, fileId);

  useEffect(() => {
    if (items.length && !items.some((version) => version.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const selectedItem = items.find((version) => version.id === selectedId);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Version history">
          <History />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-full max-w-[calc(100vw-24px)] gap-0 overflow-hidden sm:max-w-none"
        style={{ width, maxWidth: "calc(100vw - 24px)" }}
      >
        <SheetResizeHandle label="Resize version history" width={width} onWidthChange={setWidth} />
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[180px_1fr] overflow-hidden">
          <div className="overflow-y-auto border-r p-2">
            {versions.isPending ? (
              <Message>Loading history…</Message>
            ) : !items.length ? (
              <Message>No versions yet.</Message>
            ) : (
              items.map((version) => (
                <VersionButton
                  key={version.id}
                  version={version}
                  selected={version.id === selectedId}
                  onSelect={() => setSelectedId(version.id)}
                />
              ))
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
              <span className="truncate text-sm text-muted-foreground">
                {selectedItem ? authorName(selectedItem) : "Select a version"}
              </span>
              {!readOnly && selectedItem?.hasContent && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={restore.isPending}>
                      <RotateCcw />
                      Restore
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore this version?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The current document will be saved in history before it is replaced.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => restore.mutate(selectedItem.id)}>
                        Restore version
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {selected.isPending ? (
                <Message>Loading version…</Message>
              ) : selected.data ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
                  {selected.data.content || "This version is empty."}
                </pre>
              ) : (
                <Message>Select a version to preview it.</Message>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VersionButton({
  version,
  selected,
  onSelect,
}: {
  version: FileVersion;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`mb-1 block w-full rounded-md px-2 py-2 text-left text-sm ${
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
      }`}
      onClick={onSelect}
    >
      <span className="block font-medium">{formatDate(version.createdAt)}</span>
      <span className="block truncate text-xs text-muted-foreground">{authorName(version)}</span>
    </button>
  );
}

function Message({ children }: { children: string }) {
  return <p className="px-2 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function authorName(version: FileVersion) {
  return version.createdBy?.displayName || version.createdBy?.email || "Automatic snapshot";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
