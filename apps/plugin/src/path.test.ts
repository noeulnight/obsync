import { describe, expect, it } from "vite-plus/test";
import { conflictPath } from "./path";

describe("conflictPath", () => {
  it("preserves extensions and avoids occupied conflict names", () => {
    expect(conflictPath("notes/Work.md", "12345678-rest", [])).toBe(
      "notes/Work (conflict 12345678).md",
    );
    expect(
      conflictPath("notes/Work.md", "12345678-rest", ["NOTES/work (conflict 12345678).md"]),
    ).toBe("notes/Work (conflict 12345678) 2.md");
  });
});
