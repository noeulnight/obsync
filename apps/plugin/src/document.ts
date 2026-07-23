import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { MarkdownView, TFile, type App } from "obsidian";
import * as Y from "yjs";
import { presenceColor, replaceText } from "@obsync/sync-core";
import type { SeedMode, SyncConnection } from "./sync-types";

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
  private persistedText = "";
  private projectedText?: string;
  private openEditors = 0;
  private readonly readOnly: boolean;
  private fileChain: Promise<void> = Promise.resolve();

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
      name: `doc:${id}`,
      document: this.document,
      websocketProvider: socket,
      token: connection.token,
      onSynced: ({ state }) => {
        if (!state) return;
        this.providerSynced = true;
        void this.initialize();
      },
      onAuthenticationFailed: () => {
        if (!this.destroyed) setStatus("Authentication failed");
      },
    });
    this.provider.awareness?.setLocalStateField("user", {
      name: connection.userName,
      color: presenceColor(this.document.clientID),
    });
    this.persistence.once("synced", () => {
      if (this.destroyed) return;
      this.persistedText = this.text.toJSON();
      this.persistenceSynced = true;
      this.provider.attach();
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
    setTimeout(() => void this.enqueueFileWrite(), 250);
  }

  rename(path: string) {
    this.path = path;
  }

  async localChanged(allowOpenEditor = true) {
    await this.enqueueFileTask(() => this.applyLocalFile(allowOpenEditor));
  }

  private async applyLocalFile(allowOpenEditor: boolean) {
    if (this.readOnly) return;
    if (this.destroyed || !this.persistenceSynced || this.applying.has(this.path)) return;
    if (!allowOpenEditor && (this.openEditors > 0 || this.isOpen())) return;
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    const content = await this.app.vault.read(file);
    if (content === this.projectedText) return;
    const current = this.text.toJSON();
    if (this.projectedText !== undefined && current !== this.projectedText) {
      this.projectedText = current;
      await this.writeFile();
      return;
    }
    replaceText(this.text, content);
    this.projectedText = content;
  }

  editorChanged(content: string) {
    if (this.destroyed || this.readOnly || !this.initialized) return;
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
      void this.enqueueFileWrite();
    });
  }

  private enqueueFileWrite() {
    return this.enqueueFileTask(() => this.writeFile());
  }

  private enqueueFileTask(work: () => Promise<void>) {
    const next = this.fileChain.catch(() => undefined).then(work);
    this.fileChain = next;
    return next;
  }

  private async writeFile() {
    if (this.destroyed || !this.initialized || this.openEditors > 0 || this.isOpen()) return;
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    const next = this.text.toJSON();
    if ((await this.app.vault.read(file)) === next) {
      this.projectedText = next;
      return;
    }
    this.applying.add(this.path);
    try {
      await this.app.vault.modify(file, next);
      this.projectedText = next;
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
    if (this.seedMode === "merge" && !this.providerSynced) return;
    if (this.seedMode === "local") await this.localChanged();
    else if (this.seedMode === "merge") await this.mergeLocalChanges();
    this.initialized = true;
    this.onReady();
    await this.enqueueFileWrite();
  }

  private async mergeLocalChanges() {
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    const local = await this.app.vault.read(file);
    const server = this.text.toJSON();
    if (local === server || local === this.persistedText) {
      this.projectedText = server;
      return;
    }
    if (server === this.persistedText) {
      replaceText(this.text, local);
      this.projectedText = local;
      return;
    }

    this.projectedText = server;
  }
}
