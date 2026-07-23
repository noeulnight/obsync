import {
  File,
  FileImage,
  FileText,
  Folder,
  LayoutDashboard,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
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
import type { FileEntry } from "@/features/documents/lib/files";
import { VersionHistorySheet } from "@/features/history/components/VersionHistorySheet";
import type { ApiClient } from "@/lib/api/client";

export function TrashView({
  api,
  vaultId,
  entries,
  canRestore,
  canPermanentlyDelete,
  restore,
  permanentlyDelete,
  headerLeading,
}: {
  api: ApiClient;
  vaultId: string;
  entries: FileEntry[];
  canRestore: boolean;
  canPermanentlyDelete: boolean;
  restore: (entry: FileEntry) => Promise<void>;
  permanentlyDelete: (entry: FileEntry) => Promise<void>;
  headerLeading?: ReactNode;
}) {
  const [pending, setPending] = useState("");
  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    try {
      await action();
    } finally {
      setPending("");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        {headerLeading}
        <Trash2 className="size-4 text-muted-foreground" />
        <span className="text-sm">Trash</span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">Trash</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Deleted files keep their history until they are permanently deleted.
          </p>
          <div className="mt-8 divide-y rounded-lg border">
            {!entries.length ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                Trash is empty.
              </p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="flex min-w-0 items-center gap-3 px-4 py-3">
                  <EntryIcon entry={entry} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.path}</p>
                    <p className="text-xs capitalize text-muted-foreground">{entry.kind}</p>
                  </div>
                  {entry.kind === "markdown" && (
                    <VersionHistorySheet api={api} vaultId={vaultId} fileId={entry.id} readOnly />
                  )}
                  {canRestore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(pending)}
                      onClick={() => void run(`restore:${entry.id}`, () => restore(entry))}
                    >
                      <RotateCcw />
                      Restore
                    </Button>
                  )}
                  {canPermanentlyDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Permanently delete ${entry.path}`}
                          disabled={Boolean(pending)}
                        >
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Permanently delete this item?</AlertDialogTitle>
                          <AlertDialogDescription>
                            “{entry.path}” and its complete history cannot be recovered afterward.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              void run(`delete:${entry.id}`, () => permanentlyDelete(entry))
                            }
                          >
                            Delete permanently
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function EntryIcon({ entry }: { entry: FileEntry }) {
  const Icon =
    entry.kind === "markdown"
      ? FileText
      : entry.kind === "folder"
        ? Folder
        : entry.kind === "canvas"
          ? LayoutDashboard
          : entry.mimeType?.startsWith("image/")
            ? FileImage
            : File;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
