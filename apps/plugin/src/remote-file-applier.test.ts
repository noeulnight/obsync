import { describe, expect, it, vi } from "vite-plus/test";
import type { FileEntry } from "./sync-types";
import { RemoteFileApplier } from "./remote-file-applier";

function entry(id: string, kind: FileEntry["kind"], path: string, deleted = false): FileEntry {
  return { id, kind, path, deleted, updatedAt: 0, version: 0 } as FileEntry;
}

describe("remote file applier", () => {
  it("creates folders first and deletes folders last", async () => {
    const applied: string[] = [];
    const applier = new RemoteFileApplier(
      async (file) => {
        applied.push(file.id);
      },
      vi.fn(),
      vi.fn(),
    );

    await applier.applyBatch([
      { entry: entry("deleted-folder", "folder", "old", true) },
      { entry: entry("file", "markdown", "notes/a.md") },
      { entry: entry("deleted-file", "markdown", "old/a.md", true) },
      { entry: entry("folder", "folder", "notes") },
    ]);

    expect(applied).toEqual(["folder", "file", "deleted-file", "deleted-folder"]);
    applier.destroy();
  });

  it("serializes work for the same path and releases applying markers", async () => {
    let release!: () => void;
    let markStarted!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const order: string[] = [];
    const applier = new RemoteFileApplier(vi.fn(), vi.fn(), vi.fn());
    const pending = applier.queue("note.md", async () => {
      order.push("first-start");
      markStarted();
      await first;
      order.push("first-end");
    });
    const next = applier.queue("note.md", async () => {
      order.push("second");
    });

    await started;
    expect(order).toEqual(["first-start"]);
    release();
    await Promise.all([pending, next]);
    expect(order).toEqual(["first-start", "first-end", "second"]);

    await expect(
      applier.whileApplying(["note.md"], async () => {
        expect(applier.applying.has("note.md")).toBe(true);
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");
    expect(applier.applying.size).toBe(0);

    await applier.whileApplying(["note.md"], () =>
      applier.whileApplying(["note.md"], async () => {
        expect(applier.applying.has("note.md")).toBe(true);
      }),
    );
    expect(applier.applying.size).toBe(0);
    applier.destroy();
  });
});
