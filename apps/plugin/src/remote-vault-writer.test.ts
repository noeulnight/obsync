import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("obsidian", () => ({
  TFile: class {},
  TFolder: class {},
}));

import { TFile, type App } from "obsidian";
import { RemoteVaultWriter } from "./remote-vault-writer";
import type { MarkdownEntry, SyncConnection } from "./sync-types";

describe("remote Vault writer", () => {
  it("creates a server file when the Obsidian index is stale", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(new TFile()),
        adapter: { stat: vi.fn().mockResolvedValue(null) },
        create,
      },
    } as unknown as App;
    const remote = {
      applying: new Set<string>(),
      queue: (_path: string, work: () => Promise<void>) => work(),
      whileApplying: (_paths: string[], work: () => Promise<void>) => work(),
    };
    const document = vi.fn();
    const writer = new RemoteVaultWriter(
      app,
      { readOnly: false } as SyncConnection,
      {} as never,
      remote as never,
      { document } as never,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    const entry = {
      id: "id",
      kind: "markdown",
      path: "Untitled.md",
      deleted: false,
      updatedAt: 0,
      version: 1,
    } satisfies MarkdownEntry;

    await writer.apply(entry);

    expect(create).toHaveBeenCalledWith("Untitled.md", "");
    expect(document).toHaveBeenCalledWith(entry, "server");
  });

  it("opens an existing local file from the server state", async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(new TFile()),
        adapter: { stat: vi.fn().mockResolvedValue({ type: "file" }) },
      },
    } as unknown as App;
    const remote = {
      queue: (_path: string, work: () => Promise<void>) => work(),
    };
    const document = vi.fn();
    const writer = new RemoteVaultWriter(
      app,
      { readOnly: false } as SyncConnection,
      {} as never,
      remote as never,
      { document } as never,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    const entry = {
      id: "id",
      kind: "markdown",
      path: "Note.md",
      deleted: false,
      updatedAt: 0,
      version: 1,
    } satisfies MarkdownEntry;

    await writer.apply(entry);

    expect(document).toHaveBeenCalledWith(entry, "server");
  });

  it("does not delete an active replacement at the same path", async () => {
    const indexed = new TFile();
    const trash = vi.fn().mockResolvedValue(undefined);
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(indexed),
        adapter: { stat: vi.fn().mockResolvedValue({ type: "file" }) },
        trash,
      },
    } as unknown as App;
    const remote = {
      applying: new Set<string>(),
      queue: (_path: string, work: () => Promise<void>) => work(),
      whileApplying: (_paths: string[], work: () => Promise<void>) => work(),
    };
    const replacement = {
      id: "current",
      kind: "markdown",
      path: "Untitled.md",
      deleted: false,
      updatedAt: 1,
      version: 1,
    } satisfies MarkdownEntry;
    const removeSession = vi.fn();
    const writer = new RemoteVaultWriter(
      app,
      { readOnly: false } as SyncConnection,
      { entries: () => [replacement] } as never,
      remote as never,
      { delete: removeSession } as never,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    const tombstone = {
      ...replacement,
      id: "old",
      deleted: true,
      version: 2,
    } satisfies MarkdownEntry;

    await writer.apply(tombstone);

    expect(removeSession).toHaveBeenCalledWith(tombstone);
    expect(trash).not.toHaveBeenCalled();
  });
});
