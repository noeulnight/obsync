import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import type { FileEntry } from "./files";
import { WebVault } from "./sync";

type VaultInternals = {
  projectedEntries(): FileEntry[];
  preserveDeletedChanges(entry: FileEntry): void;
};

function vault(entry: FileEntry) {
  const serverManifestDocument = new Y.Doc();
  const serverManifest = serverManifestDocument.getMap<FileEntry>("files");
  serverManifest.set(entry.id, entry);
  const cachedManifestDocument = new Y.Doc();
  const cachedManifest = cachedManifestDocument.getMap<FileEntry>("files");
  const target = Object.create(WebVault.prototype) as WebVault;
  Object.assign(target, {
    serverManifest,
    cachedManifest,
    manifestSynced: true,
    outbox: { entries: () => [] },
  });
  return {
    target: target as unknown as VaultInternals,
    destroy: () => {
      serverManifestDocument.destroy();
      cachedManifestDocument.destroy();
    },
  };
}

describe("offline manifest cache", () => {
  it("uses the separate cache offline without merging it into the server manifest", () => {
    const server: FileEntry = {
      id: "server",
      kind: "markdown",
      path: "Server.md",
      deleted: false,
      version: 2,
    };
    const cached: FileEntry = {
      id: "cached",
      kind: "canvas",
      path: "Cached.canvas",
      deleted: false,
      version: 1,
    };
    const test = vault(server);
    Object.assign(test.target, { manifestSynced: false });
    const cache = (test.target as unknown as { cachedManifest: Y.Map<FileEntry> }).cachedManifest;
    cache.set(cached.id, cached);

    expect(test.target.projectedEntries()).toEqual([cached]);
    test.destroy();
  });

  it("preserves unsent document text when the server deletes its file", () => {
    const deleted: FileEntry = {
      id: "deleted",
      kind: "markdown",
      path: "Deleted.md",
      deleted: true,
      version: 2,
    };
    const source = new Y.Doc();
    source.getText("content").insert(0, "offline edit");
    const copy = new Y.Doc();
    const target = Object.create(WebVault.prototype) as WebVault;
    const create = vi.fn(() => ({ ...deleted, id: "copy", path: "Deleted (conflict).md" }));
    const setStatus = vi.fn();
    Object.assign(target, {
      readOnly: false,
      preservingDeletes: new Set<string>(),
      documents: new Map([
        [deleted.id, { document: source, hasUnsyncedChanges: true, destroy: vi.fn() }],
      ]),
      canvases: new Map(),
      entries: () => [],
      create,
      openDocument: () => ({ document: copy }),
      api: {},
      userName: "user",
      setStatus,
    });

    (target as unknown as VaultInternals).preserveDeletedChanges(deleted);

    expect(create).toHaveBeenCalledOnce();
    expect(copy.getText("content").toJSON()).toBe("offline edit");
    expect(setStatus).toHaveBeenCalledWith("Deleted conflict copy preserved");
    source.destroy();
    copy.destroy();
  });
});
