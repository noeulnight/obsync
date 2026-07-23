import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";

vi.mock("y-indexeddb", () => ({
  IndexeddbPersistence: class {
    once() {}
    destroy() {}
  },
}));
vi.mock("obsidian", () => ({ requestUrl: vi.fn() }));

import { FileOperationOutbox } from "./outbox";
import type { FileOperation } from "./sync-types";

describe("file operation outbox", () => {
  it("preserves a same-path create as a conflict copy", async () => {
    const operation: FileOperation = {
      operationId: "create",
      fileId: "local",
      type: "create",
      kind: "markdown",
      path: "Note.md",
      createdAt: 1,
    };
    const move = vi.fn().mockResolvedValue(undefined);
    const manifestDocument = new Y.Doc();
    const outbox = new FileOperationOutbox(
      {
        vaultId: "vault",
        readOnly: false,
        api: {
          listFiles: vi.fn().mockResolvedValue([
            {
              id: "server",
              kind: "markdown",
              path: "Note.md",
              deleted: false,
              version: 1,
            },
          ]),
        },
      } as never,
      manifestDocument.getMap("files"),
      () => ["Note.md"],
      move,
      vi.fn(),
      vi.fn(),
    );
    outbox.enqueue({
      operationId: operation.operationId,
      fileId: operation.fileId,
      type: operation.type,
      kind: operation.kind,
      path: operation.path,
    });

    await (
      outbox as unknown as {
        recoverConflict(index: number, operation: FileOperation): Promise<void>;
      }
    ).recoverConflict(0, operation);

    expect(move).toHaveBeenCalledWith("Note.md", expect.stringContaining("conflict"));
    expect(outbox.entries()).toEqual([
      expect.objectContaining({ id: "local", kind: "markdown", deleted: false }),
    ]);
  });
});
