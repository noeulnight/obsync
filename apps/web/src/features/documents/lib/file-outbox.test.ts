import type { FileOperation } from "@obsync/sync-core";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { BrowserFileOutbox } from "./file-outbox";

type OutboxInternals = {
  recoverConflict(index: number, operation: FileOperation): Promise<void>;
  cleanupConfirmed(): void;
  flush(): Promise<void>;
};

function outbox(operation: FileOperation, serverVersion = 2) {
  const document = new Y.Doc();
  const operations = document.getArray<FileOperation>("operations");
  operations.push([operation]);
  const target = Object.create(BrowserFileOutbox.prototype) as BrowserFileOutbox;
  Object.assign(target, {
    api: {
      listFiles: vi.fn().mockResolvedValue([
        {
          id: operation.fileId,
          kind: "markdown",
          path: "Server.md",
          deleted: false,
          version: serverVersion,
        },
      ]),
    },
    vaultId: "vault",
    document,
    operations,
    localPaths: () => ["Local.md"],
    manifestVersion: () => serverVersion,
    setStatus: vi.fn(),
  });
  return {
    target: target as unknown as OutboxInternals,
    operations,
    destroy: () => document.destroy(),
  };
}

describe("browser file outbox", () => {
  it("merges a colliding document create into the existing file", async () => {
    const operation: FileOperation = {
      operationId: "operation",
      fileId: "local-file",
      type: "create",
      kind: "markdown",
      path: "Note.md",
      createdAt: 1,
    };
    const document = new Y.Doc();
    const operations = document.getArray<FileOperation>("operations");
    operations.push([operation]);
    const mergeCreate = vi.fn().mockResolvedValue(undefined);
    const target = Object.create(BrowserFileOutbox.prototype) as BrowserFileOutbox;
    Object.assign(target, {
      api: {
        listFiles: vi
          .fn()
          .mockResolvedValue([
            { id: "server-file", kind: "markdown", path: "note.md", deleted: false, version: 1 },
          ]),
      },
      vaultId: "vault",
      document,
      operations,
      localPaths: () => ["Note.md"],
      mergeCreate,
      setStatus: vi.fn(),
    });

    await (target as unknown as OutboxInternals).recoverConflict(0, operation);

    expect(mergeCreate).toHaveBeenCalledWith(
      operation,
      expect.objectContaining({ id: "server-file" }),
    );
    expect(operations).toHaveLength(0);
    document.destroy();
  });

  it("rebases a stale rename onto the current server path", async () => {
    const operation: FileOperation = {
      operationId: "operation",
      fileId: "file",
      type: "rename",
      fromPath: "Old.md",
      path: "Local.md",
      baseVersion: 1,
      createdAt: 1,
    };
    const test = outbox(operation);

    await test.target.recoverConflict(0, operation);

    expect(test.operations.get(0)).toMatchObject({
      fileId: operation.fileId,
      fromPath: "Server.md",
      path: "Local.md",
      baseVersion: 2,
    });
    test.destroy();
  });

  it("removes confirmed operations after the manifest reaches their versions", () => {
    const test = outbox({
      operationId: "operation",
      fileId: "file",
      type: "rename",
      path: "Local.md",
      createdAt: 1,
      confirmedVersions: { file: 2 },
    });

    test.target.cleanupConfirmed();

    expect(test.operations).toHaveLength(0);
    test.destroy();
  });

  it("never sends queued operations from a read-only Vault", async () => {
    const document = new Y.Doc();
    const operations = document.getArray<FileOperation>("operations");
    operations.push([
      {
        operationId: "operation",
        fileId: "file",
        type: "delete",
        fromPath: "Note.md",
        createdAt: 1,
      },
    ]);
    const applyFileOperation = vi.fn();
    const target = Object.create(BrowserFileOutbox.prototype) as BrowserFileOutbox;
    Object.assign(target, {
      document,
      operations,
      api: { applyFileOperation },
      vaultId: "vault",
      readOnly: true,
      connected: true,
      flushing: false,
    });

    await (target as unknown as OutboxInternals).flush();

    expect(applyFileOperation).not.toHaveBeenCalled();
    document.destroy();
  });

  it("does not retry an in-flight request after the Vault is destroyed", async () => {
    let reject!: (error: Error) => void;
    const request = new Promise<never>((_resolve, rejectRequest) => {
      reject = rejectRequest;
    });
    const document = new Y.Doc();
    const operations = document.getArray<FileOperation>("operations");
    operations.push([
      {
        operationId: "operation",
        fileId: "file",
        type: "delete",
        fromPath: "Note.md",
        createdAt: 1,
      },
    ]);
    const target = Object.create(BrowserFileOutbox.prototype) as BrowserFileOutbox;
    Object.assign(target, {
      document,
      operations,
      api: { applyFileOperation: () => request },
      vaultId: "vault",
      readOnly: false,
      connected: true,
      flushing: false,
      persistence: { destroy: vi.fn() },
    });

    const flushing = (target as unknown as OutboxInternals).flush();
    target.destroy();
    reject(new Error("disconnected"));
    await flushing;

    expect((target as unknown as { retryTimer?: unknown }).retryTimer).toBeUndefined();
  });
});
