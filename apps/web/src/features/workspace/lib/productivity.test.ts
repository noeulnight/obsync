import { describe, expect, it } from "vite-plus/test";
import { recordRecent, togglePinned } from "./productivity";

describe("workspace productivity state", () => {
  it("keeps pins and recent files unique", () => {
    expect(togglePinned({ pinned: ["a"], recent: [] }, "a").pinned).toEqual([]);
    expect(recordRecent({ pinned: [], recent: ["a", "b"] }, "b").recent).toEqual(["b", "a"]);
  });
});
