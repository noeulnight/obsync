import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("obsidian", () => ({ TFolder: class {} }));

import { effectiveInitialMode } from "./initial-sync";

describe("effectiveInitialMode", () => {
  it.each([
    ["local", false, "local"],
    ["server", false, "server"],
    ["merge", false, "merge"],
    ["local", true, "merge"],
  ] as const)("resolves %s with readOnly=%s to %s", (mode, readOnly, expected) => {
    expect(effectiveInitialMode(mode, readOnly)).toBe(expected);
  });
});
