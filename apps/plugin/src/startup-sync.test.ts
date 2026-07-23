import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TFile, type App } from "obsidian";
import { replaceText } from "@obsync/sync-core";

const mocks = vi.hoisted(() => ({
  providers: [] as Array<{
    attach: ReturnType<typeof vi.fn>;
    options: { onSynced?: (event: { state: boolean }) => void };
  }>,
  persistenceCallbacks: [] as Array<() => void>,
}));

vi.mock("@hocuspocus/provider", () => ({
  HocuspocusProvider: class {
    attach = vi.fn();
    awareness = { setLocalStateField: vi.fn() };
    hasUnsyncedChanges = false;

    constructor(readonly options: { onSynced?: (event: { state: boolean }) => void }) {
      mocks.providers.push(this);
    }

    destroy() {}
  },
}));

vi.mock("y-indexeddb", () => ({
  IndexeddbPersistence: class {
    once(_event: string, callback: () => void) {
      mocks.persistenceCallbacks.push(callback);
    }

    destroy() {}
  },
}));

vi.mock("obsidian", () => ({
  MarkdownView: class {},
  TFile: class {},
  TFolder: class {},
}));

import { CanvasSync } from "./canvas";
import { DocumentSync } from "./document";
import { VaultSync } from "./sync";
import type { SyncConnection } from "./sync-types";

const app = {
  vault: { getAbstractFileByPath: () => undefined },
  workspace: { getLeavesOfType: () => [] },
} as unknown as App;
const connection = {
  vaultId: "vault",
  token: async () => "token",
  userName: "User",
  readOnly: false,
} as SyncConnection;

describe("startup synchronization", () => {
  beforeEach(() => {
    mocks.providers.length = 0;
    mocks.persistenceCallbacks.length = 0;
  });

  it("does not connect Markdown before its local cache is loaded", () => {
    new DocumentSync(
      app,
      "id",
      "Note.md",
      "server",
      connection,
      {} as never,
      vi.fn(),
      new Set(),
      vi.fn(),
    );

    expect(mocks.providers[0]?.attach).not.toHaveBeenCalled();
    mocks.persistenceCallbacks[0]?.();
    expect(mocks.providers[0]?.attach).toHaveBeenCalledOnce();
  });

  it("does not connect Canvas before its local cache is loaded", () => {
    new CanvasSync(
      app,
      "id",
      "Board.canvas",
      "server",
      connection,
      {} as never,
      new Set(),
      vi.fn(),
      vi.fn(),
    );

    expect(mocks.providers[0]?.attach).not.toHaveBeenCalled();
    mocks.persistenceCallbacks[0]?.();
    expect(mocks.providers[0]?.attach).toHaveBeenCalledOnce();
  });

  it("keeps newer server Markdown when the stopped client did not edit locally", async () => {
    const file = new TFile();
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue("before"),
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new DocumentSync(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      "id",
      "Note.md",
      "merge",
      connection,
      {} as never,
      vi.fn(),
      new Set(),
      vi.fn(),
    );
    sync.text.insert(0, "before");

    mocks.persistenceCallbacks[0]?.();
    replaceText(sync.text, "after from web");
    mocks.providers[0]?.options.onSynced?.({ state: true });

    await vi.waitFor(() => expect(vault.modify).toHaveBeenCalledWith(file, "after from web"));
    expect(sync.text.toJSON()).toBe("after from web");
  });

  it("does not replace cached or server Markdown with an empty startup file", async () => {
    const file = new TFile();
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue(""),
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new DocumentSync(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      "id",
      "Note.md",
      "merge",
      connection,
      {} as never,
      vi.fn(),
      new Set(),
      vi.fn(),
    );
    sync.text.insert(0, "cached");

    mocks.persistenceCallbacks[0]?.();
    replaceText(sync.text, "server content");
    mocks.providers[0]?.options.onSynced?.({ state: true });

    await vi.waitFor(() => expect(vault.modify).toHaveBeenCalledWith(file, "server content"));
    expect(sync.text.toJSON()).toBe("server content");
  });

  it("does not reapply the local file after opening its merge session", async () => {
    const localChanged = vi.fn();
    const sync = Object.assign(Object.create(VaultSync.prototype), {
      files: {
        findPath: () => ({ id: "id", kind: "markdown", path: "Note.md" }),
        ensureMarkdown: vi.fn(),
      },
      sessions: { document: vi.fn(() => ({ localChanged })) },
    }) as {
      syncInitialFile(file: TFile, seedMode: "merge"): Promise<void>;
    };
    const file = Object.assign(new TFile(), { path: "Note.md", extension: "md" });

    await sync.syncInitialFile(file, "merge");

    expect(localChanged).not.toHaveBeenCalled();
  });
});
