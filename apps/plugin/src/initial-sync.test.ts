import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {} }));

import { TFile, type App } from "obsidian";
import { effectiveInitialMode, InitialVaultSync } from "./initial-sync";

describe("effectiveInitialMode", () => {
  it.each([
    ["local", false, "local"],
    ["server", false, "server"],
    ["merge", false, "merge"],
    ["local", true, "server"],
    ["merge", true, "server"],
  ] as const)("resolves %s with readOnly=%s to %s", (mode, readOnly, expected) => {
    expect(effectiveInitialMode(mode, readOnly)).toBe(expected);
  });

  it("uses the server as the source on a normal restart", async () => {
    const file = Object.assign(new TFile(), { path: "Note.md" });
    const syncFile = vi.fn().mockResolvedValue(undefined);
    const sync = new InitialVaultSync({
      app: {
        vault: {
          getAllLoadedFiles: () => [file],
          getFiles: () => [file],
        },
      } as unknown as App,
      connection: { readOnly: false } as never,
      outbox: {} as never,
      remote: { applyBatch: vi.fn().mockResolvedValue(true) } as never,
      entries: () => [],
      isApplying: () => false,
      ensureFolder: vi.fn(),
      syncFile,
    });

    await sync.run();

    expect(syncFile).toHaveBeenCalledWith(file, "server");
  });
});
