import { describe, expect, it, vi } from "vite-plus/test";
import type { App } from "obsidian";
import {
  createBinaryFile,
  createFolder,
  createTextFile,
  renameVaultPath,
  trashVaultPath,
} from "./vault-io";

function app(...types: Array<"file" | "folder" | undefined>) {
  const error = new Error("already exists");
  const vault = {
    create: vi.fn().mockRejectedValue(error),
    createBinary: vi.fn().mockRejectedValue(error),
    createFolder: vi.fn().mockRejectedValue(error),
    adapter: {
      stat: vi
        .fn()
        .mockResolvedValueOnce(types[0] ? { type: types[0] } : null)
        .mockResolvedValue(types[1] ? { type: types[1] } : null),
      writeBinary: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      trashLocal: vi.fn().mockResolvedValue(undefined),
    },
    getAbstractFileByPath: vi.fn().mockReturnValue(null),
    rename: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
  };
  return { app: { vault } as unknown as App, error, vault };
}

describe("vault creation", () => {
  it("uses storage state instead of the delayed Obsidian index", async () => {
    const target = app("folder");
    await expect(createFolder(target.app, "folder")).resolves.toBeUndefined();
    expect(target.vault.createFolder).not.toHaveBeenCalled();
  });

  it("accepts a file won by a concurrent creator", async () => {
    const target = app(undefined, "file");
    await expect(createTextFile(target.app, "note.md", "")).resolves.toBeUndefined();
  });

  it("finishes a concurrent binary download with the remote content", async () => {
    const target = app("file");
    const content = new ArrayBuffer(1);
    await createBinaryFile(target.app, "image.png", content);
    expect(target.vault.adapter.writeBinary).toHaveBeenCalledWith("image.png", content);
  });

  it("preserves real path conflicts", async () => {
    const target = app("file");
    await expect(createFolder(target.app, "conflict")).rejects.toThrow(
      "Folder path conflicts with a file: conflict",
    );
  });
});

describe("vault path operations", () => {
  it("renames a stored path missing from the Obsidian index", async () => {
    const target = app("file");
    await renameVaultPath(target.app, ".hidden", ".renamed");
    expect(target.vault.adapter.rename).toHaveBeenCalledWith(".hidden", ".renamed");
  });

  it("trashes a stored path missing from the Obsidian index", async () => {
    const target = app("file");
    await trashVaultPath(target.app, ".hidden");
    expect(target.vault.adapter.trashLocal).toHaveBeenCalledWith(".hidden");
  });
});
