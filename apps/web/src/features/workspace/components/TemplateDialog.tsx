import { useEffect, useMemo, useState, type FormEvent } from "react";
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

export function TemplateDialog({
  entries,
  open,
  close,
  create,
}: {
  entries: FileEntry[];
  open: boolean;
  close: () => void;
  create: (template: FileEntry, path: string) => string | undefined;
}) {
  const templates = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.kind === "markdown" && entry.path.startsWith("Templates/") && !entry.deleted,
      ),
    [entries],
  );
  const [templateId, setTemplateId] = useState("");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setTemplateId(templates[0]?.id ?? "");
    setPath("");
    setError("");
  }, [open, templates]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return setError("Create a Markdown document in Templates first.");
    const nextError = create(template, path);
    if (nextError) return setError(nextError);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New from template</DialogTitle>
            <DialogDescription>
              Templates are Markdown documents in the Templates folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {templates.length ? (
              <div className="grid gap-1">
                {templates.map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    variant={template.id === templateId ? "secondary" : "ghost"}
                    className="justify-start"
                    onClick={() => setTemplateId(template.id)}
                  >
                    {template.path.replace(/^Templates\//, "").replace(/\.md$/i, "")}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No templates found in Templates.</p>
            )}
            <Input
              autoFocus={Boolean(templates.length)}
              aria-label="New document path"
              placeholder="projects/New note"
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!templates.length}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
