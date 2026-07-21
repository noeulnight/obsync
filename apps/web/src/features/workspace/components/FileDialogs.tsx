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

  const label = kind === "folder" ? "폴더" : kind === "canvas" ? "Canvas" : "문서";
  return (
    <Dialog open={Boolean(kind)} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>새 {label}</DialogTitle>
            <DialogDescription>폴더를 포함한 Vault 경로를 입력할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              aria-label={`새 ${label} 경로`}
              placeholder={kind === "folder" ? "notes" : `notes/새 ${label}`}
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
            {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit">생성</Button>
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
            <DialogTitle>이름 변경</DialogTitle>
            <DialogDescription>
              새 {entry?.kind === "folder" ? "폴더" : "파일"} 이름을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              aria-label="새 파일 이름"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit">변경</Button>
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
            {entry?.kind === "folder" ? "폴더" : "파일"}를 삭제할까요?
          </AlertDialogTitle>
          <AlertDialogDescription>
            “{name}”{entry?.kind === "folder" ? "와 내부 항목이" : " 파일이"} 모든 기기에서
            삭제됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={remove}>
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
