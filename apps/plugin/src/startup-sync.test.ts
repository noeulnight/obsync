import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { MarkdownView, TFile, type App } from "obsidian";
import { replaceText } from "@obsync/sync-core";
import * as Y from "yjs";

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
    vi.stubGlobal("window", globalThis);
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

  it("ignores Markdown Vault events until the server document is ready", async () => {
    const file = new TFile();
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue("stale local"),
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

    mocks.persistenceCallbacks[0]?.();
    await sync.localChanged();

    expect(vault.read).not.toHaveBeenCalled();
    expect(sync.text.toJSON()).toBe("");
  });

  it("ignores Canvas Vault events until the server document is ready", async () => {
    const file = new TFile();
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue(
        JSON.stringify({
          nodes: [{ id: "node", type: "text", x: 0, y: 0, width: 100, height: 100, text: "stale" }],
          edges: [],
        }),
      ),
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new CanvasSync(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      "id",
      "Board.canvas",
      "merge",
      connection,
      {} as never,
      new Set(),
      vi.fn(),
      vi.fn(),
    );

    mocks.persistenceCallbacks[0]?.();
    await sync.localChanged();

    expect(vault.read).not.toHaveBeenCalled();
  });

  it("renders remote Canvas node text without opening its editor", async () => {
    const file = new TFile();
    const setData = vi.fn();
    const controller = {
      nodes: new Map([["node", { setData }]]),
      edges: new Map(),
      getData: () => ({ nodes: [], edges: [] }),
      importData: vi.fn(),
      requestSave: vi.fn(),
    };
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue('{"nodes":[],"edges":[]}'),
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new CanvasSync(
      {
        vault,
        workspace: {
          getLeavesOfType: () => [{ view: { file: { path: "Board.canvas" }, canvas: controller } }],
        },
      } as unknown as App,
      "id",
      "Board.canvas",
      "server",
      connection,
      {} as never,
      new Set(),
      vi.fn(),
      vi.fn(),
    );
    const document = (sync as unknown as { document: Y.Doc }).document;
    const peer = new Y.Doc();
    const node = new Y.Map<unknown>();
    for (const [key, value] of Object.entries({
      id: "node",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })) {
      node.set(key, value);
    }
    peer.getMap("nodes").set("node", node);
    peer.getText("canvas-node:node:text").insert(0, "before");
    Y.applyUpdate(document, Y.encodeStateAsUpdate(peer));
    mocks.persistenceCallbacks[0]?.();
    mocks.providers[0]?.options.onSynced?.({ state: true });
    await vi.waitFor(() => expect(setData).toHaveBeenCalled());
    setData.mockClear();

    replaceText(peer.getText("canvas-node:node:text"), "after from web");
    Y.applyUpdate(document, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(document)));

    await vi.waitFor(() =>
      expect(setData).toHaveBeenCalledWith(expect.objectContaining({ text: "after from web" })),
    );
    expect(vault.modify).not.toHaveBeenCalled();
    sync.destroy();
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

  it("drops a delayed Markdown read after the document path changes", async () => {
    let resolveRead!: (content: string) => void;
    const file = new TFile();
    const read = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const vault = {
      getAbstractFileByPath: () => file,
      getAllLoadedFiles: () => [],
      read,
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new DocumentSync(
      {
        vault,
        workspace: {
          getLeavesOfType: () => [
            {
              view: Object.assign(new MarkdownView({} as never), { file: { path: "Renamed.md" } }),
            },
          ],
        },
      } as unknown as App,
      "id",
      "Note.md",
      "server",
      connection,
      {} as never,
      vi.fn(),
      new Set(),
      vi.fn(),
    );
    sync.openEditor();
    mocks.persistenceCallbacks[0]?.();
    mocks.providers[0]?.options.onSynced?.({ state: true });
    await vi.waitFor(() => expect(sync.ready).toBe(true));

    const pending = sync.localChanged();
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    sync.rename("Renamed.md");
    resolveRead("content from the old path");
    await pending;

    expect(sync.text.toJSON()).toBe("");
    sync.destroy();
  });

  it("drops a queued Canvas snapshot after the document path changes", async () => {
    const sync = new CanvasSync(
      {
        vault: { getAbstractFileByPath: () => undefined },
        workspace: { getLeavesOfType: () => [] },
      } as unknown as App,
      "id",
      "Board.canvas",
      "server",
      connection,
      {} as never,
      new Set(),
      vi.fn(),
      vi.fn(),
    );
    mocks.persistenceCallbacks[0]?.();
    mocks.providers[0]?.options.onSynced?.({ state: true });
    await vi.waitFor(() =>
      expect((sync as unknown as { initialized: boolean }).initialized).toBe(true),
    );

    const pending = sync.localChanged({
      meta: {},
      nodes: [{ id: "node", type: "text", x: 0, y: 0, width: 100, height: 100, text: "old" }],
      edges: [],
    });
    sync.rename("Renamed.canvas");
    await pending;

    const document = (sync as unknown as { document: Y.Doc }).document;
    expect(document.getMap("nodes").size).toBe(0);
    sync.destroy();
  });
});
