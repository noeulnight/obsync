import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TFile, type App } from "obsidian";
import * as Y from "yjs";
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
import { VaultSessions } from "./sync-sessions";
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

  it("loads Markdown from its local cache before connecting", async () => {
    const sync = new DocumentSync(
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
    await vi.waitFor(() => expect(sync.ready).toBe(true));
  });

  it("loads Canvas from its local cache before connecting", async () => {
    const sync = new CanvasSync(
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
    await vi.waitFor(() =>
      expect((sync as unknown as { initialized: boolean }).initialized).toBe(true),
    );
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

  it("keeps the server authoritative when both cached and local Markdown diverged", async () => {
    const file = new TFile();
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue("local offline edit"),
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new DocumentSync(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      "document-id",
      "Note.md",
      "merge",
      connection,
      {} as never,
      vi.fn(),
      new Set(),
      vi.fn(),
    );
    sync.text.insert(0, "cached base");

    mocks.persistenceCallbacks[0]?.();
    replaceText(sync.text, "server edit");
    mocks.providers[0]?.options.onSynced?.({ state: true });

    expect(sync.text.toJSON()).toBe("server edit");
    await vi.waitFor(() => expect(vault.modify).toHaveBeenCalledWith(file, "server edit"));
  });

  it("does not reapply a stale local file over a newer remote update", async () => {
    const file = new TFile();
    let disk = "base";
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn(() => Promise.resolve(disk)),
      modify: vi.fn(async (_file: TFile, content: string) => {
        disk = content;
      }),
    };
    const sync = new DocumentSync(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      "id",
      "Note.md",
      "server",
      connection,
      {} as never,
      vi.fn(),
      new Set(),
      vi.fn(),
    );
    sync.text.insert(0, "base");
    mocks.persistenceCallbacks[0]?.();
    mocks.providers[0]?.options.onSynced?.({ state: true });
    await vi.waitFor(() => expect(sync.ready).toBe(true));

    disk = "";
    replaceText(sync.text, "remote update");
    await sync.localChanged();

    expect(sync.text.toJSON()).toBe("remote update");
    await vi.waitFor(() => expect(disk).toBe("remote update"));
  });

  it("serializes Markdown file projections so an older write cannot finish last", async () => {
    const file = new TFile();
    let disk = "base";
    const writes: Array<{ content: string; finish: () => void }> = [];
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn(() => Promise.resolve(disk)),
      modify: vi.fn(
        (_file: TFile, content: string) =>
          new Promise<void>((resolve) => {
            writes.push({
              content,
              finish: () => {
                disk = content;
                resolve();
              },
            });
          }),
      ),
    };
    const sync = new DocumentSync(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      "id",
      "Note.md",
      "server",
      connection,
      {} as never,
      vi.fn(),
      new Set(),
      vi.fn(),
    );
    sync.text.insert(0, "base");
    mocks.persistenceCallbacks[0]?.();
    mocks.providers[0]?.options.onSynced?.({ state: true });
    await vi.waitFor(() => expect(sync.ready).toBe(true));

    replaceText(sync.text, "first remote update");
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    replaceText(sync.text, "second remote update");
    await Promise.resolve();
    expect(writes).toHaveLength(1);

    writes[0]?.finish();
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    writes[1]?.finish();
    await vi.waitFor(() => expect(disk).toBe("second remote update"));
  });

  it("keeps applying partial Canvas snapshots without treating them as remote changes", async () => {
    const file = new TFile();
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue(
        JSON.stringify({
          nodes: [
            { id: "one", type: "text", text: "one", x: 1 },
            { id: "two", type: "text", text: "two", x: 2 },
          ],
          edges: [],
        }),
      ),
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sync = new CanvasSync(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      "id",
      "Board.canvas",
      "local",
      connection,
      {} as never,
      new Set(),
      vi.fn(),
      vi.fn(),
    );
    mocks.persistenceCallbacks[0]?.();
    await vi.waitFor(() =>
      expect((sync as unknown as { initialized: boolean }).initialized).toBe(true),
    );

    await sync.localChanged(
      { meta: {}, nodes: [{ id: "one", type: "text", text: "one", x: 10 }], edges: [] },
      false,
      false,
    );
    await sync.localChanged(
      { meta: {}, nodes: [{ id: "one", type: "text", text: "one", x: 20 }], edges: [] },
      false,
      false,
    );

    const nodes = (sync as unknown as { nodes: Y.Map<Y.Map<unknown>> }).nodes;
    expect(nodes.get("one")?.get("x")).toBe(20);
    expect(nodes.has("two")).toBe(true);
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

  it("uses the server for sessions opened during a normal restart", async () => {
    const file = new TFile();
    const vault = {
      getAbstractFileByPath: () => file,
      read: vi.fn().mockResolvedValue("stale local"),
      modify: vi.fn().mockResolvedValue(undefined),
    };
    const sessions = new VaultSessions(
      { vault, workspace: { getLeavesOfType: () => [] } } as unknown as App,
      connection,
      {} as never,
      new Set(),
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
    } as const;

    const session = sessions.document(entry);

    session.text.insert(0, "cached");
    mocks.persistenceCallbacks[0]?.();
    replaceText(session.text, "server");
    mocks.providers[0]?.options.onSynced?.({ state: true });

    await vi.waitFor(() => expect(session.ready).toBe(true));
    expect(session.text.toJSON()).toBe("server");
    await vi.waitFor(() => expect(vault.modify).toHaveBeenCalledWith(file, "server"));
  });

  it("does not bind an editor before the first synchronization choice is applied", () => {
    const sync = Object.assign(Object.create(VaultSync.prototype), {
      initialMode: "merge",
    }) as VaultSync;
    const file = Object.assign(new TFile(), { path: "Note.md" });

    expect(sync.extension(file, "local text")).toEqual({
      extension: [],
      text: "local text",
      ready: false,
    });
  });

  it.each([
    ["md", "markdown", "document"],
    ["canvas", "canvas", "canvas"],
  ] as const)(
    "seeds a newly created %s file from its local content",
    async (extension, kind, sessionName) => {
      const localChanged = vi.fn().mockResolvedValue(undefined);
      const session = vi.fn(() => ({ localChanged }));
      const entry = { id: "id", kind, path: `Note.${extension}` };
      const sync = Object.assign(Object.create(VaultSync.prototype), {
        connection: { readOnly: false },
        manifestLoaded: true,
        remote: { applying: new Set<string>() },
        files: {
          findPath: vi.fn(),
          ensureMarkdown: () => entry,
          ensureCanvas: () => entry,
        },
        sessions: { [sessionName]: session },
      }) as VaultSync;
      const file = Object.assign(new TFile(), { path: entry.path, extension });

      await sync.created(file);

      expect(session).toHaveBeenCalledWith(entry, "local");
      expect(localChanged).toHaveBeenCalledOnce();
    },
  );

  it("moves the active content session with a rebased conflict path", async () => {
    const entry = {
      id: "id",
      kind: "markdown",
      path: "Note.md",
      deleted: false,
      updatedAt: 0,
      version: 0,
    } as const;
    const moveLocalConflict = vi.fn().mockResolvedValue(undefined);
    const rename = vi.fn();
    const sync = Object.assign(Object.create(VaultSync.prototype), {
      files: { findPath: () => entry },
      writer: { moveLocalConflict },
      sessions: { rename },
    }) as VaultSync;

    await (
      sync as unknown as {
        moveQueuedFile(from: string, to: string): Promise<void>;
      }
    ).moveQueuedFile("Note.md", "Note (conflict id).md");

    expect(moveLocalConflict).toHaveBeenCalledWith("Note.md", "Note (conflict id).md");
    expect(rename).toHaveBeenCalledWith(entry, "Note (conflict id).md");
  });
});
