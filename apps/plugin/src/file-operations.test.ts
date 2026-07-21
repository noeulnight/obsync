import { describe, expect, it } from "vite-plus/test";
import { operationRequest, projectEntries } from "./file-operations";
import type { FileEntry, FileOperation } from "./sync-types";

describe("file operations", () => {
  it("projects pending folder operations onto the manifest", () => {
    const manifest: Array<[string, FileEntry]> = [
      [
        "folder",
        {
          id: "folder",
          kind: "folder",
          path: "notes",
          deleted: false,
          updatedAt: 1,
          version: 1,
        },
      ],
      [
        "document",
        {
          id: "document",
          kind: "markdown",
          path: "notes/today.md",
          deleted: false,
          updatedAt: 1,
          version: 1,
        },
      ],
    ];
    const operations: FileOperation[] = [
      {
        operationId: "rename",
        fileId: "folder",
        type: "rename",
        fromPath: "notes",
        path: "archive",
        createdAt: 2,
      },
      {
        operationId: "delete",
        fileId: "folder",
        type: "delete",
        fromPath: "archive",
        createdAt: 3,
      },
    ];

    expect(projectEntries(manifest, operations)).toEqual([
      expect.objectContaining({ id: "folder", path: "archive", deleted: true }),
      expect.objectContaining({ id: "document", path: "archive/today.md", deleted: true }),
    ]);
  });

  it("removes local queue metadata from server requests", () => {
    expect(
      operationRequest({
        operationId: "rename",
        fileId: "document",
        type: "rename",
        path: "next.md",
        fromPath: "old.md",
        createdAt: 1,
        confirmedVersions: { document: 2 },
      }),
    ).toEqual({
      operationId: "rename",
      fileId: "document",
      type: "rename",
      path: "next.md",
    });
  });
});
