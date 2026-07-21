import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { MarkdownView, TFile, type App } from "obsidian";
import * as Y from "yjs";
import type { SeedMode, SyncConnection } from "./sync-types";
import { replaceText } from "./text";

export class DocumentSync {
  readonly document = new Y.Doc();
  readonly text = this.document.getText("content");
  readonly provider: HocuspocusProvider;
  private readonly persistence: IndexeddbPersistence;
  private writePending = false;
  private destroyed = false;
  private initialized = false;
  private persistenceSynced = false;
  private providerSynced = false;
  private openEditors = 0;
  private pendingEditorText?: string;
  private readonly readOnly: boolean;

  constructor(
    private readonly app: App,
    id: string,
    private path: string,
    private readonly seedMode: SeedMode,
    connection: SyncConnection,
    socket: HocuspocusProviderWebsocket,
    setStatus: (status: string) => void,
    private readonly applying: Set<string>,
    private readonly onReady: () => void,
  ) {
    this.readOnly = connection.readOnly;
    this.persistence = new IndexeddbPersistence(
      `obsync:${connection.vaultId}:doc:${id}${connection.readOnly ? ":readonly" : ""}`,
      this.document,
    );
    this.provider = new HocuspocusProvider({
      name: `vault:${connection.vaultId}:doc:${id}`,
      document: this.document,
      websocketProvider: socket,
      token: connection.token,
      onSynced: ({ state }) => {
        if (!state) return;
        this.providerSynced = true;
        void this.initialize();
      },
      onAuthenticationFailed: () => setStatus("인증 실패"),
    });
    this.provider.attach();
    this.provider.awareness?.setLocalStateField("user", {
      name: connection.userName,
      color: color(this.document.clientID),
    });
    this.persistence.once("synced", () => {
      this.persistenceSynced = true;
      void this.initialize();
    });
    this.text.observe(() => this.scheduleWrite());
  }

  openEditor() {
    this.openEditors += 1;
  }

  get ready() {
    return this.initialized;
  }

  get hasUnsyncedChanges() {
    return this.provider.hasUnsyncedChanges;
  }

  closeEditor() {
    this.openEditors = Math.max(0, this.openEditors - 1);
    if (this.openEditors === 0) this.clearCursor();
    setTimeout(() => void this.writeFile(), 250);
  }

  rename(path: string) {
    this.path = path;
  }

  async localChanged() {
    if (this.readOnly) return;
    if (this.destroyed || !this.persistenceSynced || this.applying.has(this.path)) return;
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    replaceText(this.text, await this.app.vault.read(file));
  }

  editorChanged(content: string) {
    if (this.destroyed || this.readOnly) return;
    if (!this.initialized) {
      this.pendingEditorText = content;
      return;
    }
    replaceText(this.text, content);
  }

  clearCursor() {
    this.provider.awareness?.setLocalStateField("cursor", null);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearCursor();
    this.provider.destroy();
    void this.persistence.destroy();
    this.document.destroy();
  }

  private scheduleWrite() {
    if (this.writePending) return;
    this.writePending = true;
    queueMicrotask(() => {
      this.writePending = false;
      void this.writeFile();
    });
  }

  private async writeFile() {
    if (this.destroyed || !this.initialized || this.openEditors > 0 || this.isOpen()) return;
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    const next = this.text.toJSON();
    if ((await this.app.vault.read(file)) === next) return;
    this.applying.add(this.path);
    try {
      await this.app.vault.modify(file, next);
    } finally {
      this.applying.delete(this.path);
    }
  }

  private isOpen() {
    return this.app.workspace
      .getLeavesOfType("markdown")
      .some((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === this.path);
  }

  private async initialize() {
    if (this.destroyed || this.initialized || !this.persistenceSynced) return;
    if (this.seedMode !== "merge" && !this.providerSynced) return;
    if (!this.readOnly && this.pendingEditorText !== undefined) {
      replaceText(this.text, this.pendingEditorText);
      this.pendingEditorText = undefined;
    } else if (this.seedMode !== "server") await this.localChanged();
    this.initialized = true;
    this.onReady();
    await this.writeFile();
  }
}

function color(clientId: number) {
  const colors = ["#30bced", "#6eeb83", "#ffbc42", "#ee6352", "#9ac2c9"];
  return colors[clientId % colors.length];
}
