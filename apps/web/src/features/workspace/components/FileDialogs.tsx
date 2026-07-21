import { useEffect, useState, type FormEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { FileEntry } from "@/features/documents/lib/files";

export type CreateEntryKind = "markdown" | "folder" | "canvas";

export function CreateEntryDialog({
  kind,
  close,
  create,
}: {
  kind?: CreateEntryKind;
  close: () => void;
  create: (path: string) => string | undefined;
}) {
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setPath("");
    setError("");
  }, [kind]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const nextError = create(path);
    if (nextError) return setError(nextError);
    close();
  }

  const label = kind === "folder" ? "folder" : kind === "canvas" ? "Canvas" : "document";
  return (
    <Dialog open={Boolean(kind)} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New {label}</DialogTitle>
            <DialogDescription>You can enter a Vault path including folders.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              aria-label={`New ${label} path`}
              placeholder={kind === "folder" ? "notes" : `notes/New ${label}`}
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
            {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameFileDialog({
  entry,
  close,
  rename,
}: {
  entry?: FileEntry;
  close: () => void;
  rename: (name: string) => string | undefined;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const current = entry?.path.split("/").at(-1) ?? "";
    setName(entry?.kind === "markdown" ? current.replace(/\.md$/i, "") : current);
    setError("");
  }, [entry]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const nextError = rename(name);
    if (nextError) return setError(nextError);
    close();
  }

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new {entry?.kind === "folder" ? "folder" : "file"} name.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              aria-label="New file name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFileDialog({
  entry,
  close,
  remove,
}: {
  entry?: FileEntry;
  close: () => void;
  remove: () => void;
}) {
  const name = entry?.path.split("/").at(-1) ?? "";
  return (
    <AlertDialog open={Boolean(entry)} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete this {entry?.kind === "folder" ? "folder" : "file"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            “{name}”{entry?.kind === "folder" ? " and everything inside it" : ""} will be deleted
            from every device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
