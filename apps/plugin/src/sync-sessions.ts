import type { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { yCollab } from "y-codemirror.next";
import type { App } from "obsidian";
import { CanvasSync } from "./canvas";
import { DocumentSync } from "./document";
import type { ApplyingPaths } from "./remote-file-applier";
import type { CanvasEntry, FileEntry, MarkdownEntry, SeedMode, SyncConnection } from "./sync-types";
import { editorBindingKey } from "./sync-types";

export class VaultSessions {
  private readonly documents = new Map<string, DocumentSync>();
  private readonly canvases = new Map<string, CanvasSync>();

  constructor(
    private readonly app: App,
    private readonly connection: SyncConnection,
    private readonly socket: HocuspocusProviderWebsocket,
    private readonly applying: ApplyingPaths,
    private readonly setStatus: (status: string) => void,
    private readonly onReady: () => void,
  ) {}

  destroy() {
    for (const document of this.documents.values()) document.destroy();
    this.documents.clear();
    for (const canvas of this.canvases.values()) canvas.destroy();
    this.canvases.clear();
  }

  extension(entry: MarkdownEntry, editorText: string, changed = false, onDetached?: () => void) {
    const document = this.document(entry);
    if (changed) document.editorChanged(editorText);
    const key = editorBindingKey(entry.id);
    if (!document.ready) return { key, extension: [] as Extension, text: editorText, ready: false };
    return {
      key,
      ready: true,
      text: document.text.toJSON(),
      extension: [
        yCollab(document.text, document.provider.awareness),
        ViewPlugin.fromClass(
          class {
            constructor() {
              document.openEditor();
            }

            destroy() {
              document.closeEditor();
              onDetached?.();
            }
          },
        ),
      ] as Extension,
    };
  }

  canvasTextExtension(
    entry: CanvasEntry,
    nodeId: string,
    editorText: string,
    changed = false,
    onDetached?: () => void,
  ) {
    const key = editorBindingKey(entry.id, nodeId);
    const binding = this.canvas(entry).textExtension(nodeId, editorText, changed);
    return {
      key,
      ...binding,
      extension: binding.ready
        ? [
            binding.extension,
            ViewPlugin.fromClass(
              class {
                destroy() {
                  onDetached?.();
                }
              },
            ),
          ]
        : binding.extension,
    };
  }

  document(entry: MarkdownEntry, seedMode: SeedMode = "merge") {
    let document = this.documents.get(entry.id);
    if (!document) {
      document = new DocumentSync(
        this.app,
        entry.id,
        entry.path,
        seedMode,
        this.connection,
        this.socket,
        this.setStatus,
        this.applying,
        this.onReady,
      );
      this.documents.set(entry.id, document);
    }
    return document;
  }

  canvas(entry: CanvasEntry, seedMode: SeedMode = "merge") {
    let canvas = this.canvases.get(entry.id);
    if (!canvas) {
      canvas = new CanvasSync(
        this.app,
        entry.id,
        entry.path,
        seedMode,
        this.connection,
        this.socket,
        this.applying,
        this.setStatus,
        this.onReady,
      );
      this.canvases.set(entry.id, canvas);
    }
    return canvas;
  }

  refreshCanvases() {
    for (const canvas of this.canvases.values()) canvas.bindOpenViews();
  }

  rename(entry: FileEntry, path: string) {
    if (entry.kind === "markdown") this.documents.get(entry.id)?.rename(path);
    if (entry.kind === "canvas") this.canvases.get(entry.id)?.rename(path);
  }

  delete(entry: FileEntry) {
    if (entry.kind === "markdown") {
      this.documents.get(entry.id)?.destroy();
      this.documents.delete(entry.id);
    }
    if (entry.kind === "canvas") {
      this.canvases.get(entry.id)?.destroy();
      this.canvases.delete(entry.id);
    }
  }

  hasUnsyncedChanges(entry: FileEntry) {
    if (entry.kind === "markdown") return this.documents.get(entry.id)?.hasUnsyncedChanges ?? false;
    if (entry.kind === "canvas") return this.canvases.get(entry.id)?.hasUnsyncedChanges ?? false;
    return false;
  }
}
