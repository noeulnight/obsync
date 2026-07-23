import { describe, expect, it } from "vite-plus/test";
import { startupMerge } from "./startup-merge";

describe("startupMerge", () => {
  it("keeps the server unless only the local projection changed", () => {
    expect(startupMerge("before", "before", "server")).toBe("server");
    expect(startupMerge("before", "local", "before")).toBe("local");
    expect(startupMerge("before", "local", "server")).toBe("conflict");
    expect(startupMerge("before", "", "server")).toBe("server");
  });
});
