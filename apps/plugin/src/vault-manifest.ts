import { isWithin, moveWithin, pathKey } from "@obsync/sync-core";
import type { FileOperationOutbox } from "./outbox";
import type { VaultSessions } from "./sync-sessions";
import type { CanvasEntry, FolderEntry, MarkdownEntry } from "./sync-types";

export class VaultManifest {
  constructor(
    private readonly outbox: FileOperationOutbox,
    private readonly sessions: VaultSessions,
  ) {}

  entries() {
    return this.outbox.entries();
  }

  findPath(path: string) {
    const key = pathKey(path);
    return this.entries().find((entry) => !entry.deleted && pathKey(entry.path) === key);
  }

  ensureMarkdown(path: string): MarkdownEntry {
    const existing = this.findPath(path);
    if (existing?.kind === "markdown" && !existing.deleted) return existing;
    return this.create({
      id: crypto.randomUUID(),
      kind: "markdown",
      path,
      deleted: false,
      updatedAt: Date.now(),
      version: 0,
    });
  }

  ensureCanvas(path: string): CanvasEntry {
    const existing = this.findPath(path);
    if (existing?.kind === "canvas" && !existing.deleted) return existing;
    return this.create({
      id: existing?.id ?? crypto.randomUUID(),
      kind: "canvas",
      path,
      deleted: false,
      updatedAt: Date.now(),
      version: 0,
    });
  }

  ensureFolder(path: string): FolderEntry {
    const existing = this.findPath(path);
    if (existing?.kind === "folder" && !existing.deleted) return existing;
    return this.create({
      id: crypto.randomUUID(),
      kind: "folder",
      path,
      deleted: false,
      updatedAt: Date.now(),
      version: 0,
    });
  }

  renameFolder(oldPath: string, newPath: string) {
    const changed = this.entries().filter(
      (entry) => !entry.deleted && isWithin(entry.path, oldPath),
    );
    const folder = changed.find((entry) => entry.kind === "folder" && entry.path === oldPath);
    if (!folder) {
      this.ensureFolder(newPath);
      return;
    }
    this.outbox.enqueue({
      operationId: crypto.randomUUID(),
      fileId: folder.id,
      type: "rename",
      path: newPath,
      fromPath: oldPath,
      baseVersion: folder.version,
    });
    for (const entry of changed) {
      this.sessions.rename(entry, moveWithin(entry.path, oldPath, newPath));
    }
  }

  deleteFolder(path: string) {
    const changed = this.entries().filter((entry) => !entry.deleted && isWithin(entry.path, path));
    const folder = changed.find((entry) => entry.kind === "folder" && entry.path === path);
    if (!folder) return;
    this.outbox.enqueue({
      operationId: crypto.randomUUID(),
      fileId: folder.id,
      type: "delete",
      fromPath: path,
      baseVersion: folder.version,
    });
    for (const entry of changed) this.sessions.delete(entry);
  }

  private create<T extends MarkdownEntry | CanvasEntry | FolderEntry>(entry: T) {
    this.outbox.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: "create",
      kind: entry.kind,
      path: entry.path,
    });
    return entry;
  }
}
