import { describe, expect, it } from "vite-plus/test";
import {
  conflictPath,
  fileTree,
  isWithin,
  markdownLinkOptions,
  moveWithin,
  newEntryPath,
  imagePath,
  renamedFilePath,
  renamedMarkdownPath,
  resolveFileLink,
  resolveMarkdownLink,
  validVaultPath,
  type FileEntry,
} from "./files";
import { fileId, randomUuid } from "@/lib/file-id";
import { pathKey } from "@obsync/sync-core";

describe("fileTree", () => {
  it("groups implicit folders and ignores deleted entries", () => {
    const entries: FileEntry[] = [
      { id: "1", kind: "markdown", path: "notes/a.md", deleted: false },
      { id: "2", kind: "attachment", path: "notes/image.png", deleted: false },
      { id: "3", kind: "markdown", path: "gone.md", deleted: true },
    ];
    expect(fileTree(entries)).toMatchObject([
      {
        name: "notes",
        children: [{ name: "a.md" }, { name: "image.png" }],
      },
    ]);
  });
});

describe("resolveMarkdownLink", () => {
  const entries: FileEntry[] = [
    { id: "1", kind: "markdown", path: "notes/a.md", deleted: false },
    { id: "2", kind: "markdown", path: "shared/b.md", deleted: false },
    {
      id: "3",
      kind: "attachment",
      path: "assets/photo.png",
      attachmentId: "photo",
      deleted: false,
    },
  ];

  it.each([
    ["[[name]] target", "a", "1"],
    ["wiki alias and heading", "a#제목|별칭", "1"],
    ["relative markdown link", "../shared/b.md#section", "2"],
    ["vault path", "shared/b.md", "2"],
  ])("resolves %s", (_name, href, expected) => {
    expect(resolveMarkdownLink(entries, "notes/current.md", href)?.id).toBe(expected);
  });

  it("resolves an attachment relative to the current document", () => {
    expect(resolveFileLink(entries, "notes/current.md", "../assets/photo.png")?.id).toBe("3");
  });

  it("recognizes an Obsidian image embed", () => {
    expect(imagePath("assets/photo.png|400")).toBe("assets/photo.png");
    expect(imagePath("document.pdf")).toBeUndefined();
  });

  it("builds wiki-link completions from active Markdown files", () => {
    expect(markdownLinkOptions(entries)).toEqual([
      { label: "a", detail: "notes/a.md", target: "notes/a" },
      { label: "b", detail: "shared/b.md", target: "shared/b" },
    ]);
  });

  it("renames a Markdown file inside its current folder", () => {
    expect(renamedMarkdownPath("notes/old.md", "New title")).toBe("notes/New title.md");
    expect(renamedMarkdownPath("old.md", "folder/name")).toBeUndefined();
  });

  it("renames an attachment without changing its folder", () => {
    expect(renamedFilePath("assets/old.png", "new.webp")).toBe("assets/new.webp");
    expect(renamedFilePath("old.png", "folder/name.png")).toBeUndefined();
  });
});

describe("Vault paths", () => {
  it("validates paths and moves complete folder subtrees", () => {
    expect(validVaultPath(" notes/a.md ")).toBe("notes/a.md");
    expect(validVaultPath("../a.md")).toBeUndefined();
    expect(isWithin("notes/a.md", "notes")).toBe(true);
    expect(isWithin("notes-old/a.md", "notes")).toBe(false);
    expect(moveWithin("notes/a.md", "notes", "archive")).toBe("archive/a.md");
  });

  it("creates a stable UUID-shaped file id", () => {
    const id = fileId("434fca61-f9de-461c-8b93-40d3be30b5f7", "notes/a.md");
    expect(id).toBe("5d896a48-5284-563c-af0d-0c74b00dd084");
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(fileId("434fca61-f9de-461c-8b93-40d3be30b5f7", "NOTES/한글.md")).toBe(
      fileId("434fca61-f9de-461c-8b93-40d3be30b5f7", "notes/한글.md"),
    );
    expect(pathKey("NOTES/한글.md")).toBe(pathKey("notes/한글.md"));
  });

  it("requires a visible name before adding document extensions", () => {
    expect(newEntryPath("markdown", "   ")).toBeUndefined();
    expect(newEntryPath("markdown", ".md")).toBeUndefined();
    expect(newEntryPath("markdown", "notes/ .md")).toBeUndefined();
    expect(newEntryPath("markdown", "notes/My Note")).toBe("notes/My Note.md");
    expect(newEntryPath("canvas", "Board")).toBe("Board.canvas");
    expect(newEntryPath("folder", "notes")).toBe("notes");
  });

  it("creates random UUIDs without randomUUID", () => {
    expect(randomUuid()).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  });

  it("preserves extensions and avoids occupied conflict names", () => {
    expect(conflictPath("assets/photo.png", "12345678-rest", [])).toBe(
      "assets/photo (conflict 12345678).png",
    );
    expect(
      conflictPath("assets/photo.png", "12345678-rest", ["ASSETS/photo (conflict 12345678).png"]),
    ).toBe("assets/photo (conflict 12345678) 2.png");
  });
});
