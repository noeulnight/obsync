import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Extension } from "@codemirror/state";
import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import * as Y from "yjs";
import { isWithin } from "@obsync/sync-core";
import { sha256, uploadAttachment } from "./attachment-sync";
import { InitialVaultSync } from "./initial-sync";
import { FileOperationOutbox } from "./outbox";
import { RemoteFileApplier } from "./remote-file-applier";
import { RemoteVaultWriter } from "./remote-vault-writer";
import { VaultSessions } from "./sync-sessions";
import { VaultManifest } from "./vault-manifest";
import type { FileEntry, InitialSyncMode, SeedMode, SyncConnection } from "./sync-types";

export type { InitialSyncMode, SyncConnection } from "./sync-types";

export class VaultSync {
  private readonly manifestDocument = new Y.Doc();
  private readonly manifest = this.manifestDocument.getMap<FileEntry>("files");
  private readonly socket: HocuspocusProviderWebsocket;
  private readonly manifestProvider: HocuspocusProvider;
  private readonly outbox: FileOperationOutbox;
  private readonly remote: RemoteFileApplier;
  private readonly writer: RemoteVaultWriter;
  private readonly initialSync: InitialVaultSync;
  private readonly sessions: VaultSessions;
  private readonly files: VaultManifest;
  private initialMode?: InitialSyncMode;
  private manifestLoaded = false;
  private manifestSynced = false;
  private reconciling?: Promise<void>;
  private reconcileAgain = false;
  private reconcileTimer?: ReturnType<typeof setTimeout>;
  private reconcileDelay = 1_000;
  private destroyed = false;

  constructor(
    private readonly app: App,
    private readonly connection: SyncConnection,
    private readonly setStatus: (status: string) => void,
    private readonly refreshEditors: () => void,
    private readonly onInitialSyncComplete: () => Promise<void>,
  ) {
    this.initialMode = connection.initialMode;
    this.socket = new HocuspocusProviderWebsocket({
      url: withVaultId(connection.serverUrl, connection.vaultId),
      delay: 1_000,
      maxDelay: 5_000,
      maxAttempts: 0,
      onStatus: ({ status }) => {
        if (status === "disconnected") {
          this.manifestSynced = false;
          this.outbox?.setSynced(false);
        }
        this.setStatus(connectionStatus(status));
      },
    });
    this.outbox = new FileOperationOutbox(
      connection,
      this.manifest,
      () => this.app.vault.getAllLoadedFiles().map((file) => file.path),
      (from, to) => this.writer.moveLocalConflict(from, to),
      setStatus,
      (error) => this.report(error),
    );
    this.remote = new RemoteFileApplier(
      (entry, previous) => this.writer.apply(entry, previous),
      () => this.startReconcile(),
      (error) => this.report(error),
    );
    this.sessions = new VaultSessions(
      app,
      connection,
      this.socket,
      this.remote.applying,
      setStatus,
      this.refreshEditors,
    );
    this.files = new VaultManifest(this.outbox, this.sessions);
    this.writer = new RemoteVaultWriter(
      app,
      connection,
      this.outbox,
      this.remote,
      this.sessions,
      (path) => this.files.ensureMarkdown(path),
      (path) => this.files.ensureCanvas(path),
      () => this.scheduleReconcile(),
      setStatus,
    );
    this.initialSync = new InitialVaultSync({
      app,
      connection,
      outbox: this.outbox,
      remote: this.remote,
      entries: () => this.files.entries(),
      isApplying: (path) => this.isApplying(path),
      ensureFolder: (path) => void this.files.ensureFolder(path),
      syncFile: (file, seedMode) => this.syncInitialFile(file, seedMode),
    });
    this.manifest.observe((event, transaction) => {
      if (transaction.local || !this.manifestSynced) return;
      this.outbox.manifestChanged();
      const changes: Array<{ entry: FileEntry; previous?: FileEntry }> = [];
      for (const [id, change] of event.changes.keys) {
        const entry = this.manifest.get(id);
        if (entry)
          changes.push({
            entry,
            previous: change.oldValue as FileEntry | undefined,
          });
      }
      void this.remote.applyBatch(changes).catch((error) => this.report(error));
    });
    this.manifestProvider = this.provider("manifest", this.manifestDocument, () => {
      this.manifestLoaded = true;
      this.manifestSynced = true;
      if (this.initialMode !== "server") this.outbox.setSynced(true);
      this.startReconcile();
    });
  }

  destroy() {
    this.destroyed = true;
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.remote.destroy();
    this.sessions.destroy();
    this.manifestProvider.destroy();
    this.outbox.destroy();
    this.socket.destroy();
    this.manifestDocument.destroy();
  }

  get isOnline() {
    return this.socket.status === "connected" && this.manifestSynced;
  }

  extension(
    file: TFile,
    editorText: string,
    changed = false,
    onDetached?: () => void,
  ): { key?: string; extension: Extension; text: string; ready: boolean } {
    // Obsidian exposes CodeMirror instances for embeds and other internal views.
    // Only a real Markdown file may own a document Y.Text binding.
    if (file.extension !== "md") {
      return { extension: [], text: editorText, ready: false };
    }
    const existing = this.files.findPath(file.path);
    if (!existing && !this.manifestLoaded) {
      return { extension: [], text: editorText, ready: false };
    }
    const entry =
      existing?.kind === "markdown" && !existing.deleted
        ? existing
        : this.connection.readOnly
          ? undefined
          : this.files.ensureMarkdown(file.path);
    if (!entry) return { extension: [], text: editorText, ready: false };
    return this.sessions.extension(entry, editorText, changed, onDetached);
  }

  listFiles() {
    return this.files
      .entries()
      .filter((entry) => !entry.deleted)
      .map((entry) => entry.path)
      .sort();
  }

  refreshCanvases() {
    this.sessions.refreshCanvases();
  }

  canvasTextExtension(
    canvasFile: TFile,
    nodeId: string,
    editorText: string,
    changed = false,
    onDetached?: () => void,
  ) {
    const entry = this.files.findPath(canvasFile.path);
    if (entry?.kind !== "canvas" || entry.deleted) {
      return { extension: [] as Extension, text: editorText, ready: false };
    }
    return this.sessions.canvasTextExtension(entry, nodeId, editorText, changed, onDetached);
  }

  async created(file: TAbstractFile) {
    if (this.connection.readOnly) return;
    if (this.isApplying(file.path)) return;
    if (!this.manifestLoaded && !this.files.findPath(file.path)) return;
    if (file instanceof TFolder) {
      this.files.ensureFolder(file.path);
      return;
    }
    if (!(file instanceof TFile)) return;
    if (file.extension === "md") {
      const entry = this.files.ensureMarkdown(file.path);
      await this.sessions.document(entry, "local").localChanged();
      return;
    }
    if (file.extension === "canvas") {
      await this.sessions.canvas(this.files.ensureCanvas(file.path), "local").localChanged();
      return;
    }
    await this.remote.queue(file.path, () => this.upload(file));
  }

  async modified(file: TFile) {
    if (this.connection.readOnly) return;
    if (this.isApplying(file.path)) return;
    if (!this.manifestLoaded && !this.files.findPath(file.path)) return;
    if (file.extension === "md") {
      const entry = this.files.ensureMarkdown(file.path);
      await this.sessions.document(entry, "local").localChanged(false);
      return;
    }
    if (file.extension === "canvas") {
      await this.sessions.canvas(this.files.ensureCanvas(file.path), "local").fileChanged();
      return;
    }
    await this.remote.queue(file.path, () => this.upload(file));
  }

  async renamed(file: TAbstractFile, oldPath: string) {
    if (this.connection.readOnly) return;
    if (this.isApplying(oldPath) || this.isApplying(file.path)) return;
    if (file instanceof TFolder) {
      if (!this.manifestLoaded && !this.files.findPath(oldPath)) return;
      this.files.renameFolder(oldPath, file.path);
      return;
    }
    if (!(file instanceof TFile)) return;
    const entry = this.files.findPath(oldPath);
    if (!entry) {
      if (!this.manifestLoaded) return;
      return this.created(file);
    }

    if (entry.kind === "markdown" && file.extension === "md") {
      this.outbox.enqueue({
        operationId: crypto.randomUUID(),
        fileId: entry.id,
        type: "rename",
        path: file.path,
        fromPath: oldPath,
        baseVersion: entry.version,
      });
      this.sessions.rename(entry, file.path);
      return;
    }

    if (entry.kind === "canvas" && file.extension === "canvas") {
      this.outbox.enqueue({
        operationId: crypto.randomUUID(),
        fileId: entry.id,
        type: "rename",
        path: file.path,
        fromPath: oldPath,
        baseVersion: entry.version,
      });
      this.sessions.rename(entry, file.path);
      return;
    }

    if (entry.kind === "attachment" && file.extension !== "md" && file.extension !== "canvas") {
      this.outbox.enqueue({
        operationId: crypto.randomUUID(),
        fileId: entry.id,
        type: "rename",
        path: file.path,
        fromPath: oldPath,
        baseVersion: entry.version,
      });
      return;
    }

    this.outbox.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: "delete",
      fromPath: oldPath,
      baseVersion: entry.version,
    });
    await this.created(file);
  }

  async deleted(file: TAbstractFile) {
    if (this.connection.readOnly) return;
    if (this.isApplying(file.path)) return;
    if (file instanceof TFolder) {
      this.files.deleteFolder(file.path);
      return;
    }
    if (!(file instanceof TFile)) return;
    const entry = this.files.findPath(file.path);
    if (!entry) return;
    this.outbox.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: "delete",
      fromPath: file.path,
      baseVersion: entry.version,
    });
    this.sessions.delete(entry);
  }

  private provider(name: string, document: Y.Doc, synced?: () => void) {
    const provider = new HocuspocusProvider({
      name,
      document,
      websocketProvider: this.socket,
      token: this.connection.token,
      onSynced: ({ state }) => {
        if (state) synced?.();
      },
      onAuthenticationFailed: () => this.setStatus("Authentication failed"),
    });
    provider.attach();
    return provider;
  }

  private async reconcile() {
    if (this.destroyed) return;
    const status = await this.initialSync.run(this.initialMode);
    await this.completeInitialSync();
    this.setStatus(status);
  }

  private async syncInitialFile(file: TFile, seedMode: SeedMode) {
    const entry = this.files.findPath(file.path);
    if (file.extension === "md") {
      const markdown = entry?.kind === "markdown" ? entry : this.files.ensureMarkdown(file.path);
      this.sessions.document(markdown, seedMode);
      return;
    }
    if (file.extension === "canvas") {
      this.sessions.canvas(this.files.ensureCanvas(file.path), seedMode);
      return;
    }
    await this.remote.queue(file.path, async () => {
      if (entry?.kind !== "attachment" || entry.deleted) await this.upload(file);
      else if ((await sha256(await this.app.vault.readBinary(file))) !== entry.sha256) {
        await this.upload(file);
      }
    });
  }

  private async completeInitialSync() {
    if (!this.initialMode || this.destroyed) return;
    await this.onInitialSyncComplete();
    this.initialMode = undefined;
    this.outbox.setSynced(true);
  }

  private startReconcile() {
    if (this.reconciling) {
      this.reconcileAgain = true;
      return;
    }
    this.reconciling ??= this.reconcile()
      .then(() => {
        this.reconcileDelay = 1_000;
      })
      .catch((error) => {
        this.report(error);
        this.scheduleReconcile();
      })
      .finally(() => {
        this.reconciling = undefined;
        if (this.reconcileAgain) {
          this.reconcileAgain = false;
          this.scheduleReconcile();
        }
      });
  }

  private scheduleReconcile() {
    if (this.destroyed || this.reconcileTimer) return;
    const delay = this.reconcileDelay;
    this.reconcileDelay = Math.min(this.reconcileDelay * 2, 30_000);
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = undefined;
      this.startReconcile();
    }, delay);
  }

  private async upload(file: TFile) {
    const current = this.files.findPath(file.path);
    const operation = await uploadAttachment(this.app, this.connection, file, current);
    if (operation) this.outbox.enqueue(operation);
  }

  private isApplying(path: string) {
    return [...this.remote.applying].some((root) => isWithin(path, root));
  }

  private report(error: unknown) {
    this.setStatus("Error");
    console.error("Obsync", error);
  }
}

function withVaultId(serverUrl: string, vaultId: string) {
  const url = new URL(serverUrl);
  url.searchParams.set("vaultId", vaultId);
  return url.toString();
}

function connectionStatus(status: string) {
  if (status === "connected") return "Synchronizing";
  if (status === "disconnected") return "Offline";
  return "Connecting";
}
