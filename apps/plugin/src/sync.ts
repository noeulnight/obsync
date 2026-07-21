import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { clearDocument, IndexeddbPersistence } from "y-indexeddb";
import { yCollab } from "y-codemirror.next";
import { requestUrl, TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import * as Y from "yjs";
import { ApiRequestError, type RemoteFile } from "./api";
import { CanvasSync } from "./canvas";
import { DocumentSync } from "./document";
import { activePaths, operationRequest, projectEntries } from "./file-operations";
import { mimeType } from "./mime";
import { conflictPath, fileId, isWithin, moveWithin, parentPath, pathKey } from "./path";
import type {
  AttachmentEntry,
  CanvasEntry,
  FileEntry,
  FileOperation,
  FolderEntry,
  InitialSyncMode,
  MarkdownEntry,
  SeedMode,
  SyncConnection,
} from "./sync-types";
import { editorBindingKey } from "./sync-types";
import {
  createBinaryFile,
  createFolder,
  createTextFile,
  renameVaultPath,
  trashVaultPath,
} from "./vault-io";

export type { InitialSyncMode, SyncConnection } from "./sync-types";

export class VaultSync {
  private readonly manifestDocument = new Y.Doc();
  private readonly manifest = this.manifestDocument.getMap<FileEntry>("files");
  private readonly operationsDocument = new Y.Doc();
  private readonly operations = this.operationsDocument.getArray<FileOperation>("operations");
  private readonly operationsPersistence: IndexeddbPersistence;
  private readonly socket: HocuspocusProviderWebsocket;
  private readonly manifestProvider: HocuspocusProvider;
  private readonly documents = new Map<string, DocumentSync>();
  private readonly canvases = new Map<string, CanvasSync>();
  private readonly applying = new Set<string>();
  private readonly queues = new Map<string, Promise<void>>();
  private initialMode?: InitialSyncMode;
  private manifestLoaded = false;
  private manifestSynced = false;
  private flushing = false;
  private reconciling?: Promise<void>;
  private reconcileAgain = false;
  private remoteApply: Promise<unknown> = Promise.resolve();
  private readonly remoteAttempts = new Map<string, number>();
  private readonly remoteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDelay = 1_000;
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
      url: connection.serverUrl,
      delay: 1_000,
      maxDelay: 5_000,
      maxAttempts: 0,
      onStatus: ({ status }) => {
        if (status === "disconnected") this.manifestSynced = false;
        this.setStatus(connectionStatus(status));
      },
    });
    this.operationsPersistence = new IndexeddbPersistence(
      `obsync:${connection.vaultId}:file-operations:v2${connection.readOnly ? ":readonly" : ""}`,
      this.operationsDocument,
    );
    this.operationsPersistence.once("synced", () => void this.flush());
    this.manifest.observe((event, transaction) => {
      if (transaction.local || !this.manifestSynced) return;
      this.cleanupConfirmed();
      const changes: Array<{ entry: FileEntry; previous?: FileEntry }> = [];
      for (const [id, change] of event.changes.keys) {
        const entry = this.manifest.get(id);
        if (entry)
          changes.push({
            entry,
            previous: change.oldValue as FileEntry | undefined,
          });
      }
      void this.applyRemoteBatch(changes).catch((error) => this.report(error));
    });
    this.manifestProvider = this.provider(
      `vault:${connection.vaultId}:manifest`,
      this.manifestDocument,
      () => {
        this.manifestLoaded = true;
        this.manifestSynced = true;
        void this.flush();
        this.startReconcile();
      },
    );
  }

  destroy() {
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    for (const timer of this.remoteTimers.values()) clearTimeout(timer);
    this.remoteTimers.clear();
    for (const document of this.documents.values()) document.destroy();
    this.documents.clear();
    for (const canvas of this.canvases.values()) canvas.destroy();
    this.canvases.clear();
    this.manifestProvider.destroy();
    void this.operationsPersistence.destroy();
    this.socket.destroy();
    this.manifestDocument.destroy();
    this.operationsDocument.destroy();
  }

  extension(
    file: TFile,
    editorText: string,
    changed = false,
  ): { key?: string; extension: Extension; text: string; ready: boolean } {
    const existing = this.findPath(file.path);
    if (!existing && !this.manifestLoaded) {
      return { extension: [], text: editorText, ready: false };
    }
    const entry =
      existing?.kind === "markdown" && !existing.deleted
        ? existing
        : this.connection.readOnly
          ? undefined
          : this.ensureMarkdown(file.path);
    if (!entry) return { extension: [], text: editorText, ready: false };
    const document = this.document(entry);
    if (changed) document.editorChanged(editorText);
    const key = editorBindingKey(entry.id);
    if (!document.ready) return { key, extension: [], text: editorText, ready: false };
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
            }
          },
        ),
      ],
    };
  }

  listFiles() {
    return this.entries()
      .filter((entry) => !entry.deleted)
      .map((entry) => entry.path)
      .sort();
  }

  refreshCanvases() {
    for (const canvas of this.canvases.values()) canvas.bindOpenViews();
  }

  canvasTextExtension(canvasFile: TFile, nodeId: string, editorText: string, changed = false) {
    const entry = this.findPath(canvasFile.path);
    if (entry?.kind !== "canvas" || entry.deleted) {
      return { extension: [] as Extension, text: editorText, ready: false };
    }
    return {
      key: editorBindingKey(entry.id, nodeId),
      ...this.canvas(entry).textExtension(nodeId, editorText, changed),
    };
  }

  async created(file: TAbstractFile) {
    if (this.connection.readOnly) return;
    if (this.isApplying(file.path)) return;
    if (!this.manifestLoaded && !this.findPath(file.path)) return;
    if (file instanceof TFolder) {
      this.ensureFolder(file.path);
      return;
    }
    if (!(file instanceof TFile)) return;
    if (file.extension === "md") {
      const entry = this.ensureMarkdown(file.path);
      await this.document(entry).localChanged();
      return;
    }
    if (file.extension === "canvas") {
      await this.ensureCanvasFile(file).localChanged();
      return;
    }
    await this.queue(file.path, () => this.upload(file));
  }

  async modified(file: TFile) {
    if (this.connection.readOnly) return;
    if (this.isApplying(file.path)) return;
    if (!this.manifestLoaded && !this.findPath(file.path)) return;
    if (file.extension === "md") {
      const entry = this.ensureMarkdown(file.path);
      await this.document(entry).localChanged();
      return;
    }
    if (file.extension === "canvas") {
      await this.ensureCanvasFile(file).localChanged();
      return;
    }
    await this.queue(file.path, () => this.upload(file));
  }

  async renamed(file: TAbstractFile, oldPath: string) {
    if (this.connection.readOnly) return;
    if (this.isApplying(oldPath) || this.isApplying(file.path)) return;
    if (file instanceof TFolder) {
      if (!this.manifestLoaded && !this.findPath(oldPath)) return;
      this.renameFolder(oldPath, file.path);
      return;
    }
    if (!(file instanceof TFile)) return;
    const entry = this.findPath(oldPath);
    if (!entry) {
      if (!this.manifestLoaded) return;
      return this.created(file);
    }

    if (entry.kind === "markdown" && file.extension === "md") {
      this.enqueue({
        operationId: crypto.randomUUID(),
        fileId: entry.id,
        type: "rename",
        path: file.path,
        fromPath: oldPath,
        baseVersion: entry.version,
      });
      this.documents.get(entry.id)?.rename(file.path);
      return;
    }

    if (entry.kind === "canvas" && file.extension === "canvas") {
      this.enqueue({
        operationId: crypto.randomUUID(),
        fileId: entry.id,
        type: "rename",
        path: file.path,
        fromPath: oldPath,
        baseVersion: entry.version,
      });
      this.canvases.get(entry.id)?.rename(file.path);
      return;
    }

    if (entry.kind === "attachment" && file.extension !== "md" && file.extension !== "canvas") {
      this.enqueue({
        operationId: crypto.randomUUID(),
        fileId: entry.id,
        type: "rename",
        path: file.path,
        fromPath: oldPath,
        baseVersion: entry.version,
      });
      return;
    }

    this.enqueue({
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
      this.deleteFolder(file.path);
      return;
    }
    if (!(file instanceof TFile)) return;
    const entry = this.findPath(file.path);
    if (!entry) return;
    this.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: "delete",
      fromPath: file.path,
      baseVersion: entry.version,
    });
    this.documents.get(entry.id)?.destroy();
    this.documents.delete(entry.id);
    this.canvases.get(entry.id)?.destroy();
    this.canvases.delete(entry.id);
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
      onAuthenticationFailed: () => this.setStatus("인증 실패"),
    });
    provider.attach();
    return provider;
  }

  private async reconcile() {
    if (this.destroyed) return;
    const initialMode =
      this.connection.readOnly && this.initialMode === "local" ? "merge" : this.initialMode;
    if (initialMode === "server") {
      await this.clearContentCache();
      await this.clearLocalVault();
    }
    if (initialMode === "local") this.removeRemoteOnlyEntries();
    else if (!(await this.applyRemoteBatch(this.entries().map((entry) => ({ entry }))))) {
      throw new Error("일부 파일을 다시 적용하는 중입니다.");
    }
    if (this.connection.readOnly) {
      await this.completeInitialSync();
      this.setStatus("읽기 전용");
      return;
    }
    if (initialMode === "server") {
      await this.completeInitialSync();
      this.setStatus("동기화됨");
      return;
    }

    const loaded = this.app.vault.getAllLoadedFiles();
    for (const folder of loaded
      .filter((item): item is TFolder => item instanceof TFolder && !item.isRoot())
      .sort((left, right) => depth(left.path) - depth(right.path))) {
      if (!this.isApplying(folder.path)) this.ensureFolder(folder.path);
    }

    for (const file of this.app.vault.getFiles()) {
      if (this.isApplying(file.path)) continue;
      const entry = this.findPath(file.path);
      if (file.extension === "md") {
        const markdown = entry?.kind === "markdown" ? entry : this.ensureMarkdown(file.path);
        const document = this.document(markdown, initialMode === "local" ? "local" : "merge");
        await document.localChanged();
      } else if (file.extension === "canvas") {
        const canvas = this.canvas(
          this.ensureCanvas(file.path),
          initialMode === "local" ? "local" : "merge",
        );
        await canvas.localChanged();
      } else {
        await this.queue(file.path, async () => {
          if (entry?.kind !== "attachment" || entry.deleted) await this.upload(file);
          else if ((await hash(await this.app.vault.readBinary(file))) !== entry.sha256) {
            await this.upload(file);
          }
        });
      }
    }
    await this.completeInitialSync();
    this.setStatus("동기화됨");
  }

  private async completeInitialSync() {
    if (!this.initialMode || this.destroyed) return;
    await this.onInitialSyncComplete();
    this.initialMode = undefined;
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

  private async clearContentCache() {
    await Promise.all(
      this.entries()
        .filter(
          (entry): entry is MarkdownEntry | CanvasEntry =>
            !entry.deleted && (entry.kind === "markdown" || entry.kind === "canvas"),
        )
        .map((entry) =>
          clearDocument(
            `obsync:${this.connection.vaultId}:${entry.kind === "markdown" ? "doc" : "canvas"}:${entry.id}${this.connection.readOnly ? ":readonly" : ""}`,
          ),
        ),
    );
  }

  private async clearLocalVault() {
    const config = pathKey(this.app.vault.configDir);
    const roots = this.app.vault
      .getRoot()
      .children.filter((entry) => pathKey(entry.path) !== config);
    await this.applyingPaths(
      roots.map((entry) => entry.path),
      async () => {
        for (const entry of roots) await this.app.vault.delete(entry, true);
        const remaining = await this.app.vault.adapter.list("");
        for (const file of remaining.files) {
          if (pathKey(file) !== config) await this.app.vault.adapter.remove(file);
        }
        for (const folder of remaining.folders) {
          if (pathKey(folder) !== config) await this.app.vault.adapter.rmdir(folder, true);
        }
      },
    );
  }

  private removeRemoteOnlyEntries() {
    const localPaths = new Set(
      this.app.vault
        .getAllLoadedFiles()
        .filter((entry) => entry.path)
        .map((entry) => pathKey(entry.path)),
    );
    for (const entry of this.entries()) {
      if (!entry.deleted && !localPaths.has(pathKey(entry.path))) {
        this.enqueue({
          operationId: crypto.randomUUID(),
          fileId: entry.id,
          type: "delete",
          fromPath: entry.path,
          baseVersion: entry.version,
        });
      }
    }
  }

  private applyRemoteBatch(changes: Array<{ entry: FileEntry; previous?: FileEntry }>) {
    const next = this.remoteApply
      .catch(() => undefined)
      .then(async () => {
        changes.sort(({ entry: left }, { entry: right }) => {
          if (left.deleted !== right.deleted) return left.deleted ? 1 : -1;
          if (left.kind === "folder" && right.kind !== "folder") return left.deleted ? 1 : -1;
          if (right.kind === "folder" && left.kind !== "folder") return right.deleted ? -1 : 1;
          return depth(left.path) - depth(right.path);
        });
        let complete = true;
        for (const change of changes) {
          try {
            await this.applyRemote(change.entry, change.previous);
            this.remoteAttempts.delete(change.entry.id);
            const timer = this.remoteTimers.get(change.entry.id);
            if (timer) clearTimeout(timer);
            this.remoteTimers.delete(change.entry.id);
          } catch (error) {
            complete = false;
            this.report(error);
            this.scheduleRemote(change);
          }
        }
        return complete;
      });
    this.remoteApply = next;
    return next;
  }

  private scheduleRemote(change: { entry: FileEntry; previous?: FileEntry }) {
    if (this.destroyed || this.remoteTimers.has(change.entry.id)) return;
    const attempt = (this.remoteAttempts.get(change.entry.id) ?? 0) + 1;
    this.remoteAttempts.set(change.entry.id, attempt);
    const timer = setTimeout(
      () => {
        this.remoteTimers.delete(change.entry.id);
        void this.applyRemoteBatch([change]).then((complete) => {
          if (complete) this.startReconcile();
        });
      },
      Math.min(1_000 * 2 ** (attempt - 1), 30_000),
    );
    this.remoteTimers.set(change.entry.id, timer);
  }

  private async applyRemote(entry: FileEntry, previous?: FileEntry) {
    await this.queue(entry.path, async () => {
      if (previous && !previous.deleted && previous.path !== entry.path) {
        const oldFile = this.app.vault.getAbstractFileByPath(previous.path);
        if (oldFile || (await this.app.vault.adapter.stat(previous.path))) {
          const occupied = await this.app.vault.adapter.stat(entry.path);
          if (occupied) {
            await this.preserveLocalPath(entry.path, entry.id);
          }
          await this.applyingPaths([previous.path, entry.path], () =>
            renameVaultPath(this.app, previous.path, entry.path),
          );
        }
        if (entry.kind === "markdown") this.documents.get(entry.id)?.rename(entry.path);
        if (entry.kind === "canvas") this.canvases.get(entry.id)?.rename(entry.path);
      }

      let local = this.app.vault.getAbstractFileByPath(entry.path);
      if (entry.deleted) {
        const document = this.documents.get(entry.id);
        const canvas = this.canvases.get(entry.id);
        const pendingAttachment =
          entry.kind === "attachment" &&
          this.operations
            .toArray()
            .some(
              (operation) => operation.fileId === entry.id && operation.type === "updateAttachment",
            );
        if (
          local instanceof TFile &&
          (document?.hasUnsyncedChanges || canvas?.hasUnsyncedChanges || pendingAttachment)
        ) {
          const path = await this.preserveLocalPath(entry.path, entry.id);
          if (entry.kind === "markdown") {
            await this.document(this.ensureMarkdown(path), "local").localChanged();
          } else if (entry.kind === "canvas") {
            await this.canvas(this.ensureCanvas(path), "local").localChanged();
          }
          local = null;
          this.setStatus("삭제 충돌 사본 보존됨");
        }
        if (entry.kind === "markdown") {
          this.documents.get(entry.id)?.destroy();
          this.documents.delete(entry.id);
        }
        if (entry.kind === "canvas") {
          this.canvases.get(entry.id)?.destroy();
          this.canvases.delete(entry.id);
        }
        if (local || (await this.app.vault.adapter.stat(entry.path))) {
          await this.applyingPaths([entry.path], () => trashVaultPath(this.app, entry.path));
        }
        return;
      }

      const expectsFolder = entry.kind === "folder";
      if (local && (expectsFolder ? !(local instanceof TFolder) : !(local instanceof TFile))) {
        await this.preserveLocalPath(entry.path, entry.id);
        local = null;
      }

      if (entry.kind === "folder") {
        if (!local) {
          await this.ensureParent(entry.path);
          await this.applyingPaths([entry.path], () => createFolder(this.app, entry.path));
        }
        return;
      }

      if (entry.kind === "markdown") {
        if (!local) {
          await this.ensureParent(entry.path);
          await this.applyingPaths([entry.path], () => createTextFile(this.app, entry.path, ""));
        }
        this.document(entry, Boolean(local) && !this.connection.readOnly ? "merge" : "server");
        return;
      }

      if (entry.kind === "canvas") {
        if (!local) {
          await this.ensureParent(entry.path);
          await this.applyingPaths([entry.path], () =>
            createTextFile(this.app, entry.path, "{}\n"),
          );
        }
        this.canvas(entry, Boolean(local) && !this.connection.readOnly ? "merge" : "server");
        return;
      }

      let localSha: string | undefined;
      if (local instanceof TFile) {
        localSha = await hash(await this.app.vault.readBinary(local));
        const previousSha = previous?.kind === "attachment" ? previous.sha256 : undefined;
        if (localSha !== entry.sha256 && localSha !== previousSha) {
          await this.preserveLocalPath(entry.path, entry.id);
          local = null;
        }
      }
      if (!(local instanceof TFile) || localSha !== entry.sha256) {
        await this.download(entry, local instanceof TFile ? local : undefined);
      }
    });
  }

  private document(entry: MarkdownEntry, seedMode: SeedMode = "merge") {
    let document = this.documents.get(entry.id);
    if (!document) {
      document = new DocumentSync(
        this.app,
        entry.id,
        entry.path,
        seedMode,
        this.connection,
        this.socket,
        (status) => this.setStatus(status),
        this.applying,
        this.refreshEditors,
      );
      this.documents.set(entry.id, document);
    }
    return document;
  }

  private canvas(entry: CanvasEntry, seedMode: SeedMode = "merge") {
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
        (status) => this.setStatus(status),
        this.refreshEditors,
      );
      this.canvases.set(entry.id, canvas);
    }
    return canvas;
  }

  private ensureCanvasFile(file: TFile) {
    const entry = this.ensureCanvas(file.path);
    return this.canvas(entry);
  }

  private ensureMarkdown(path: string): MarkdownEntry {
    const existing = this.findPath(path);
    if (existing?.kind === "markdown" && !existing.deleted) return existing;
    const entry: MarkdownEntry = {
      id: crypto.randomUUID(),
      kind: "markdown",
      path,
      deleted: false,
      updatedAt: Date.now(),
      version: 0,
    };
    this.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: "create",
      kind: "markdown",
      path,
    });
    return entry;
  }

  private ensureCanvas(path: string): CanvasEntry {
    const existing = this.findPath(path);
    if (existing?.kind === "canvas" && !existing.deleted) return existing;
    const entry: CanvasEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      kind: "canvas",
      path,
      deleted: false,
      updatedAt: Date.now(),
      version: 0,
    };
    this.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: "create",
      kind: "canvas",
      path,
    });
    return entry;
  }

  private ensureFolder(path: string): FolderEntry {
    const existing = this.findPath(path);
    if (existing?.kind === "folder" && !existing.deleted) return existing;
    const entry: FolderEntry = {
      id: crypto.randomUUID(),
      kind: "folder",
      path,
      deleted: false,
      updatedAt: Date.now(),
      version: 0,
    };
    this.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: "create",
      kind: "folder",
      path,
    });
    return entry;
  }

  private renameFolder(oldPath: string, newPath: string) {
    const changed = this.entries().filter(
      (entry) => !entry.deleted && isWithin(entry.path, oldPath),
    );
    const folder = changed.find((entry) => entry.kind === "folder" && entry.path === oldPath);
    if (!folder) {
      this.ensureFolder(newPath);
      return;
    }
    this.enqueue({
      operationId: crypto.randomUUID(),
      fileId: folder.id,
      type: "rename",
      path: newPath,
      fromPath: oldPath,
      baseVersion: folder.version,
    });
    for (const entry of changed) {
      const path = moveWithin(entry.path, oldPath, newPath);
      if (entry.kind === "markdown") this.documents.get(entry.id)?.rename(path);
      if (entry.kind === "canvas") this.canvases.get(entry.id)?.rename(path);
    }
  }

  private deleteFolder(path: string) {
    const changed = this.entries().filter((entry) => !entry.deleted && isWithin(entry.path, path));
    const folder = changed.find((entry) => entry.kind === "folder" && entry.path === path);
    if (!folder) return;
    this.enqueue({
      operationId: crypto.randomUUID(),
      fileId: folder.id,
      type: "delete",
      fromPath: path,
      baseVersion: folder.version,
    });
    for (const entry of changed) {
      if (entry.kind === "markdown") {
        this.documents.get(entry.id)?.destroy();
        this.documents.delete(entry.id);
      }
      if (entry.kind === "canvas") {
        this.canvases.get(entry.id)?.destroy();
        this.canvases.delete(entry.id);
      }
    }
  }

  private findPath(path: string) {
    const key = pathKey(path);
    return this.entries().find((entry) => !entry.deleted && pathKey(entry.path) === key);
  }

  private async upload(file: TFile) {
    const mime = mimeType(file.path);
    const data = await this.app.vault.readBinary(file);
    const sha256 = await hash(data);
    const current = this.findPath(file.path);
    if (current?.kind === "attachment" && current.sha256 === sha256) return;
    const approval = await this.connection.api.presignUpload(this.connection.vaultId, {
      idempotencyKey: fileId(this.connection.vaultId, `attachment\0${file.path}\0${sha256}`),
      path: file.path,
      size: data.byteLength,
      mimeType: mime,
      sha256,
    });
    if (approval.uploadUrl) {
      const response = await requestUrl({
        url: approval.uploadUrl,
        method: "PUT",
        headers: approval.uploadHeaders,
        body: data,
        throw: false,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`첨부 업로드 실패 (${response.status})`);
      }
      await this.connection.api.completeUpload(this.connection.vaultId, approval.attachment.id);
    }
    const entry: AttachmentEntry = {
      id: current?.id ?? crypto.randomUUID(),
      kind: "attachment",
      path: file.path,
      deleted: false,
      updatedAt: Date.now(),
      attachmentId: approval.attachment.id,
      mimeType: mime,
      sha256,
      size: data.byteLength,
      version: current?.version ?? 0,
    };
    this.enqueue({
      operationId: crypto.randomUUID(),
      fileId: entry.id,
      type: current?.kind === "attachment" ? "updateAttachment" : "create",
      kind: "attachment",
      path: entry.path,
      baseVersion: current?.kind === "attachment" ? current.version : undefined,
      attachmentId: entry.attachmentId,
      mimeType: entry.mimeType,
      sha256: entry.sha256,
      size: entry.size,
    });
  }

  private async download(entry: AttachmentEntry, local?: TFile) {
    const url = await this.connection.api.downloadUrl(this.connection.vaultId, entry.attachmentId);
    const response = await requestUrl({ url, throw: false });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`첨부 다운로드 실패 (${response.status})`);
    }
    if ((await hash(response.arrayBuffer)) !== entry.sha256) {
      throw new Error(`첨부 해시 불일치: ${entry.path}`);
    }
    await this.ensureParent(entry.path);
    await this.applyingPaths([entry.path], async () => {
      if (local) await this.app.vault.modifyBinary(local, response.arrayBuffer);
      else await createBinaryFile(this.app, entry.path, response.arrayBuffer);
    });
  }

  private async ensureParent(path: string) {
    const parent = parentPath(path);
    if (parent && !this.app.vault.getAbstractFileByPath(parent)) {
      const parents = parent
        .split("/")
        .map((_, index, parts) => parts.slice(0, index + 1).join("/"));
      await this.queue(parent, () =>
        this.applyingPaths(parents, () => createFolder(this.app, parent)),
      );
    }
  }

  private queue(path: string, work: () => Promise<void>) {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(path, next);
    const cleanup = () => {
      if (this.queues.get(path) === next) this.queues.delete(path);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  private async applyingPaths<T>(paths: string[], work: () => Promise<T>) {
    for (const path of paths) this.applying.add(path);
    try {
      return await work();
    } finally {
      for (const path of paths) this.applying.delete(path);
    }
  }

  private isApplying(path: string) {
    return [...this.applying].some((root) => isWithin(path, root));
  }

  private entries() {
    return projectEntries(this.manifest, this.operations.toArray());
  }

  private enqueue(operation: Omit<FileOperation, "createdAt">) {
    this.operations.push([{ ...operation, createdAt: Date.now() }]);
    void this.flush();
  }

  private async flush() {
    if (this.flushing || !this.manifestSynced || this.connection.readOnly) return;
    this.flushing = true;
    try {
      while (true) {
        const operations = this.operations.toArray();
        const index = operations.findIndex((operation) => !operation.confirmedVersions);
        if (index < 0) return;
        const operation = operations[index];
        try {
          const result = await this.connection.api.applyFileOperation(
            this.connection.vaultId,
            operationRequest(operation),
          );
          this.retryDelay = 1_000;
          this.confirm(index, operation, result.files);
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 409) {
            try {
              await this.recoverConflict(index, operation);
              continue;
            } catch {
              this.scheduleRetry();
              return;
            }
          }
          this.scheduleRetry();
          return;
        }
      }
    } catch (error) {
      this.report(error);
      this.scheduleRetry();
    } finally {
      this.flushing = false;
    }
  }

  private async recoverConflict(index: number, operation: FileOperation) {
    const files = await this.connection.api.listFiles(this.connection.vaultId);
    const current = files.find((file) => file.id === operation.fileId && !file.deleted);
    if (operation.type === "create") {
      if (current) {
        this.confirm(index, operation, [current]);
        return;
      }
      const path = conflictPath(operation.path!, operation.fileId, this.occupiedPaths(files));
      await this.moveLocalConflict(operation.path!, path);
      this.rewritePendingPaths(operation.path!, path);
      this.replaceOperation(index, { ...operation, operationId: crypto.randomUUID(), path });
      this.setStatus("충돌 사본 생성 중");
      return;
    }
    if (!current) {
      this.operations.delete(index, 1);
      this.setStatus("서버 변경 적용됨");
      return;
    }
    let path = operation.path;
    if (
      operation.type === "rename" &&
      path &&
      files.some(
        (file) =>
          !file.deleted && file.id !== operation.fileId && pathKey(file.path) === pathKey(path!),
      )
    ) {
      const nextPath = conflictPath(path, operation.fileId, this.occupiedPaths(files));
      await this.moveLocalConflict(path, nextPath);
      this.rewritePendingPaths(path, nextPath);
      path = nextPath;
      this.setStatus("충돌 사본 생성 중");
    }
    this.replaceOperation(index, {
      ...operation,
      operationId: crypto.randomUUID(),
      baseVersion: current.version,
      fromPath:
        operation.type === "rename" || operation.type === "delete"
          ? current.path
          : operation.fromPath,
      path,
    });
  }

  private replaceOperation(index: number, operation: FileOperation) {
    this.operations.delete(index, 1);
    this.operations.insert(index, [operation]);
  }

  private rewritePendingPaths(from: string, to: string) {
    this.operationsDocument.transact(() => {
      this.operations.toArray().forEach((operation, index) => {
        const path =
          operation.path && isWithin(operation.path, from)
            ? moveWithin(operation.path, from, to)
            : operation.path;
        const fromPath =
          operation.fromPath && isWithin(operation.fromPath, from)
            ? moveWithin(operation.fromPath, from, to)
            : operation.fromPath;
        if (path === operation.path && fromPath === operation.fromPath) return;
        this.replaceOperation(index, { ...operation, path, fromPath });
      });
    });
  }

  private async moveLocalConflict(from: string, to: string) {
    if (!(await this.app.vault.adapter.stat(from))) return;
    await this.ensureParent(to);
    await this.applyingPaths([from, to], () => renameVaultPath(this.app, from, to));
  }

  private occupiedPaths(files: RemoteFile[] = []) {
    return [...activePaths(files), ...this.app.vault.getAllLoadedFiles().map((file) => file.path)];
  }

  private async preserveLocalPath(path: string, id: string) {
    const next = conflictPath(path, id, this.occupiedPaths());
    await this.moveLocalConflict(path, next);
    this.setStatus("경로 충돌 사본 보존됨");
    this.scheduleReconcile();
    return next;
  }

  private scheduleRetry() {
    if (this.retryTimer || this.destroyed || this.connection.readOnly) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    this.setStatus("재연결 대기");
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.flush();
    }, delay);
  }

  private confirm(
    index: number,
    operation: FileOperation,
    files: Array<{ id: string; version: number }>,
  ) {
    const versions = Object.fromEntries(files.map((file) => [file.id, file.version]));
    this.operationsDocument.transact(() => {
      this.operations.delete(index, 1);
      this.operations.insert(index, [{ ...operation, confirmedVersions: versions }]);
      const pending = this.operations.toArray();
      pending.forEach((item, itemIndex) => {
        const version = versions[item.fileId];
        if (version === undefined || item.baseVersion === undefined) return;
        this.operations.delete(itemIndex, 1);
        this.operations.insert(itemIndex, [{ ...item, baseVersion: version }]);
      });
    });
    this.cleanupConfirmed();
  }

  private cleanupConfirmed() {
    for (let index = this.operations.length - 1; index >= 0; index -= 1) {
      const operation = this.operations.get(index);
      const versions = operation.confirmedVersions;
      if (
        versions &&
        Object.entries(versions).every(
          ([id, version]) => (this.manifest.get(id)?.version ?? 0) >= version,
        )
      ) {
        this.operations.delete(index, 1);
      }
    }
  }

  private report(error: unknown) {
    this.setStatus("오류");
    console.error("Obsync", error);
  }
}

async function hash(data: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function depth(path: string) {
  return path.split("/").length;
}

function connectionStatus(status: string) {
  if (status === "connected") return "동기화 중";
  if (status === "disconnected") return "오프라인";
  return "연결 중";
}
