import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import {
  canvasNodeTextName,
  cleanupConfirmedOperations,
  confirmOperation,
  conflictPath,
  isWithin,
  moveWithin,
  normalizeVaultPath,
  operationRequest,
  pathKey,
  presenceColor,
  projectEntries,
  rebaseOperation,
  replaceText,
  rewriteOperationPaths,
  type FileEntry,
  type FileOperation,
  type RemoteFile,
} from "./index.js";

describe("sync core", () => {
  it("projects pending folder operations and local timestamps", () => {
    const manifest: Array<[string, FileEntry]> = [
      ["folder", { id: "folder", kind: "folder", path: "notes", deleted: false, version: 1 }],
      [
        "document",
        { id: "document", kind: "markdown", path: "notes/today.md", deleted: false, version: 1 },
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
        operationId: "create",
        fileId: "new",
        type: "create",
        kind: "markdown",
        path: "archive/new.md",
        createdAt: 3,
      },
    ];

    expect(projectEntries(manifest, operations)).toEqual([
      expect.objectContaining({ id: "folder", path: "archive" }),
      expect.objectContaining({ id: "document", path: "archive/today.md" }),
      expect.objectContaining({ id: "new", path: "archive/new.md", updatedAt: 3 }),
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

  it("uses one normalized path and conflict rule", () => {
    expect(normalizeVaultPath(" notes/한글.md ")).toBe("notes/한글.md");
    expect(normalizeVaultPath("../notes.md")).toBeUndefined();
    expect(normalizeVaultPath("notes\\windows.md")).toBeUndefined();
    expect(pathKey("NOTES/한글.md")).toBe(pathKey("notes/한글.md"));
    expect(isWithin("notes/a.md", "NOTES")).toBe(true);
    expect(moveWithin("notes/a.md", "notes", "archive")).toBe("archive/a.md");
    expect(
      conflictPath("notes/Work.md", "12345678-rest", ["NOTES/work (conflict 12345678).md"]),
    ).toBe("notes/Work (conflict 12345678) 2.md");
  });

  it("minimally replaces shared text and exposes shared canvas/presence rules", () => {
    const document = new Y.Doc();
    const text = document.getText(canvasNodeTextName("note"));
    text.insert(0, "hello world");
    const updates: Uint8Array[] = [];
    document.on("update", (update) => updates.push(update));

    replaceText(text, "hello sync world");

    expect(text.toJSON()).toBe("hello sync world");
    expect(updates).toHaveLength(1);
    expect(presenceColor(0)).toBe("#7c6cff");
    document.destroy();
  });

  it("rewrites nested pending paths without changing operation metadata", () => {
    const operation: FileOperation = {
      operationId: "operation",
      fileId: "file",
      type: "rename",
      fromPath: "notes/old.md",
      path: "notes/new.md",
      baseVersion: 1,
      createdAt: 7,
    };

    expect(rewriteOperationPaths([operation], "notes", "archive")).toEqual([
      {
        ...operation,
        fromPath: "archive/old.md",
        path: "archive/new.md",
      },
    ]);
  });

  it("confirms, rebases following versions, and cleans up only after manifest convergence", () => {
    const operation: FileOperation = {
      operationId: "first",
      fileId: "file",
      type: "rename",
      path: "Local.md",
      baseVersion: 1,
      createdAt: 1,
    };
    const following: FileOperation = {
      ...operation,
      operationId: "second",
      path: "Later.md",
    };
    const confirmed = confirmOperation([operation, following], 0, operation, [
      { id: "file", version: 2 },
    ]);

    expect(confirmed).toEqual([
      expect.objectContaining({ confirmedVersions: { file: 2 }, baseVersion: 2 }),
      expect.objectContaining({ operationId: "second", baseVersion: 2 }),
    ]);
    expect(cleanupConfirmedOperations(confirmed, () => 1)).toHaveLength(2);
    expect(cleanupConfirmedOperations(confirmed, () => 2)).toEqual([confirmed[1]]);
  });

  it("returns deterministic rebase actions for rename conflicts and remote deletes", () => {
    const operation: FileOperation = {
      operationId: "old-operation",
      fileId: "file",
      type: "rename",
      fromPath: "Old.md",
      path: "Taken.md",
      baseVersion: 1,
      createdAt: 3,
    };
    const files: RemoteFile[] = [
      { id: "file", path: "Server.md", deleted: false, version: 2 },
      { id: "other", path: "taken.md", deleted: false, version: 1 },
    ];

    expect(
      rebaseOperation(
        operation,
        files,
        files.map((file) => file.path),
        "new-operation",
      ),
    ).toEqual({
      type: "replace",
      operation: {
        ...operation,
        operationId: "new-operation",
        baseVersion: 2,
        fromPath: "Server.md",
        path: "Taken (conflict file).md",
      },
      conflict: { from: "Taken.md", to: "Taken (conflict file).md" },
    });
    expect(rebaseOperation(operation, [], [], "new-operation")).toEqual({ type: "discard" });

    const create: FileOperation = {
      operationId: "create",
      fileId: "new-file",
      type: "create",
      kind: "markdown",
      path: "New.md",
      createdAt: 9,
    };
    expect(
      rebaseOperation(
        { ...create, kind: "folder", path: "New" },
        [{ id: "server-folder", kind: "folder", path: "new", deleted: false, version: 1 }],
        ["New"],
        "create-retry",
      ),
    ).toEqual({
      type: "merge",
      file: {
        id: "server-folder",
        kind: "folder",
        path: "new",
        deleted: false,
        version: 1,
      },
    });
    expect(
      rebaseOperation(
        create,
        [{ id: "server-file", kind: "markdown", path: "new.md", deleted: false, version: 1 }],
        ["New.md"],
        "create-retry",
      ),
    ).toEqual({
      type: "merge",
      file: {
        id: "server-file",
        kind: "markdown",
        path: "new.md",
        deleted: false,
        version: 1,
      },
    });
    expect(rebaseOperation(create, [], ["New.md"], "create-retry")).toEqual({
      type: "replace",
      operation: {
        ...create,
        operationId: "create-retry",
        path: "New (conflict new-file).md",
      },
      conflict: { from: "New.md", to: "New (conflict new-file).md" },
    });
  });
});
