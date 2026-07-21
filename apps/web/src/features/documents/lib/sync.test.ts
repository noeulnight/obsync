import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import type { FileOperationRequest } from "@/lib/api/client";
import type { FileEntry } from "./files";
import { WebVault } from "./sync";

type PendingOperation = FileOperationRequest & {
  fromPath?: string;
  confirmedVersions?: Record<string, number>;
};

type VaultInternals = {
  recoverConflict(index: number, operation: PendingOperation): Promise<void>;
  projectedEntries(): FileEntry[];
};

function vault(entry: FileEntry, operation: PendingOperation | undefined, files: FileEntry[]) {
  const manifestDocument = new Y.Doc();
  const manifest = manifestDocument.getMap<FileEntry>("files");
  manifest.set(entry.id, entry);
  const cacheDocument = new Y.Doc();
  const cacheManifest = cacheDocument.getMap<FileEntry>("files");
  const operationsDocument = new Y.Doc();
  const operations = operationsDocument.getArray<PendingOperation>("operations");
  if (operation) operations.push([operation]);
  const target = Object.create(WebVault.prototype) as WebVault;
  Object.assign(target, {
    api: { listFiles: vi.fn().mockResolvedValue(files) },
    manifest,
    cacheManifest,
    manifestSynced: true,
    operations,
    operationsDocument,
    setStatus: vi.fn(),
  });
  return {
    target: target as unknown as VaultInternals,
    operations,
    destroy: () => {
      manifestDocument.destroy();
      cacheDocument.destroy();
      operationsDocument.destroy();
    },
  };
}

describe("offline file operation recovery", () => {
  it("rebases a stale rename onto the current server path", async () => {
    const entry: FileEntry = {
      id: "file",
      kind: "markdown",
      path: "Server.md",
      deleted: false,
      version: 2,
    };
    const operation: PendingOperation = {
      operationId: "operation",
      fileId: entry.id,
      type: "rename",
      fromPath: "Old.md",
      path: "Local.md",
      baseVersion: 1,
    };
    const test = vault(entry, operation, [entry]);

    await test.target.recoverConflict(0, operation);

    expect(test.operations.get(0)).toMatchObject({
      fileId: entry.id,
      fromPath: "Server.md",
      path: "Local.md",
      baseVersion: 2,
    });
    expect(test.target.projectedEntries()[0]?.path).toBe("Local.md");
    test.destroy();
  });

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
    const test = vault(server, undefined, []);
    Object.assign(test.target, { manifestSynced: false });
    const cache = (test.target as unknown as { cacheManifest: Y.Map<FileEntry> }).cacheManifest;
    cache.set(cached.id, cached);

    expect(test.target.projectedEntries()).toEqual([cached]);
    test.destroy();
  });
});
