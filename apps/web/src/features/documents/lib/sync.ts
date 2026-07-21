import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import axios from "axios";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type {
  ApiClient,
  FileOperationRequest,
  RemoteFile,
  UploadedAttachment,
} from "@/lib/api/client";
import { WebCanvas } from "@/features/canvas/lib/sync";
import { randomUuid } from "@/lib/file-id";
import { vaultPathKey } from "@/lib/vault-path";
import { conflictPath, isWithin, moveWithin, validVaultPath, type FileEntry } from "./files";
import { WebDocument } from "./document";

export { WebDocument } from "./document";

export class WebVault {
  private readonly document = new Y.Doc();
  private readonly manifest = this.document.getMap<FileEntry>("files");
  private readonly cacheDocument = new Y.Doc();
  private readonly cacheManifest = this.cacheDocument.getMap<FileEntry>("files");
  private readonly cachePersistence: IndexeddbPersistence;
  private readonly operationsDocument = new Y.Doc();
  private readonly operations = this.operationsDocument.getArray<FileOperation>("operations");
  private readonly operationsPersistence: IndexeddbPersistence;
  private readonly socket: HocuspocusProviderWebsocket;
  private readonly provider: HocuspocusProvider;
  private readonly documents = new Map<string, WebDocument>();
  private readonly canvases = new Map<string, WebCanvas>();
  private readonly listeners = new Set<() => void>();
  private manifestLoaded = false;
  private manifestSynced = false;
  private flushing = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDelay = 1_000;
  private readonly preservingDeletes = new Set<string>();

  constructor(
    private readonly vaultId: string,
    private readonly api: ApiClient,
    private readonly userName: string,
    private readonly setStatus: (status: string) => void,
    private readonly readOnly = false,
  ) {
    this.socket = new HocuspocusProviderWebsocket({
      url: api.websocketUrl(),
      delay: 1_000,
      maxDelay: 5_000,
      maxAttempts: 0,
      onStatus: ({ status }) => {
        if (status === "disconnected") this.manifestSynced = false;
        setStatus(connectionStatus(status));
      },
    });
    this.cachePersistence = new IndexeddbPersistence(
      `obsync:${vaultId}:manifest-cache:v1${readOnly ? ":readonly" : ""}`,
      this.cacheDocument,
    );
    this.operationsPersistence = new IndexeddbPersistence(
      `obsync:${vaultId}:file-operations:v2${readOnly ? ":readonly" : ""}`,
      this.operationsDocument,
    );
    this.manifest.observe((event, transaction) => {
      if (this.manifestSynced) {
        this.cacheDocument.transact(() => {
          for (const id of event.keysChanged) {
            const entry = this.manifest.get(id);
            if (entry) this.cacheManifest.set(id, entry);
            else this.cacheManifest.delete(id);
          }
        });
      }
      if (!transaction.local) {
        for (const id of event.keysChanged) {
          const entry = this.manifest.get(id);
          if (entry?.deleted) this.preserveDeletedChanges(entry);
        }
      }
      this.cleanupConfirmed();
      this.notify();
    });
    this.operations.observe(() => this.notify());
    this.operationsPersistence.once("synced", () => void this.flush());
    this.cachePersistence.once("synced", () => {
      this.manifestLoaded = true;
      this.notify();
    });
    this.provider = new HocuspocusProvider({
      name: `vault:${vaultId}:manifest`,
      document: this.document,
      websocketProvider: this.socket,
      token: () => api.token(),
      onSynced: ({ state }) => {
        if (!state) return;
        this.manifestSynced = true;
        this.manifestLoaded = true;
        this.cacheDocument.transact(() => {
          this.cacheManifest.clear();
          for (const [id, entry] of this.manifest) this.cacheManifest.set(id, entry);
        });
        this.notify();
        setStatus("동기화됨");
        void this.flush();
      },
      onAuthenticationFailed: () => setStatus("인증 실패"),
    });
    this.provider.attach();
    this.provider.awareness?.setLocalStateField("user", { name: userName });
  }

  entries() {
    return this.projectedEntries().filter((entry) => !entry.deleted);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    listener();
    return () => this.listeners.delete(listener);
  }

  readyForNewEntries() {
    return this.manifestLoaded;
  }

  openDocument(entry: FileEntry, api: ApiClient, userName: string) {
    let document = this.documents.get(entry.id);
    if (!document) {
      document = new WebDocument(
        this.vaultId,
        entry.id,
        api,
        userName,
        this.socket,
        () => this.documents.delete(entry.id),
        this.readOnly,
      );
      this.documents.set(entry.id, document);
    }
    return document;
  }

  openCanvas(entry: FileEntry, api: ApiClient, userName: string) {
    let canvas = this.canvases.get(entry.id);
    if (!canvas) {
      canvas = new WebCanvas(
        this.vaultId,
        entry.id,
        entry.path,
        api,
        userName,
        this.socket,
        () => this.canvases.delete(entry.id),
        this.readOnly,
      );
      this.canvases.set(entry.id, canvas);
    }
    canvas.rename(entry.path);
    return canvas;
  }

  create(kind: "markdown" | "folder" | "canvas", requestedPath: string) {
    this.requireManifest();
    const path = validVaultPath(requestedPath);
    if (!path) throw new Error("올바른 Vault 경로를 입력하세요.");
    this.requireAvailablePath(path);
    const entry: FileEntry = {
      id: randomUuid(),
      kind,
      path,
      deleted: false,
      updatedAt: Date.now(),
      version: 0,
    };
    this.enqueue({
      operationId: randomUuid(),
      fileId: entry.id,
      type: "create",
      kind,
      path,
    });
    return entry;
  }

  addAttachment(upload: UploadedAttachment) {
    this.requireManifest();
    this.requireAvailablePath(upload.path);
    const entry: FileEntry = {
      id: randomUuid(),
      kind: "attachment",
      path: upload.path,
      deleted: false,
      updatedAt: Date.now(),
      attachmentId: upload.id,
      mimeType: upload.mimeType,
      sha256: upload.sha256,
      size: upload.size,
      version: 0,
    };
    this.enqueue({
      operationId: randomUuid(),
      fileId: entry.id,
      type: "create",
      kind: "attachment",
      path: upload.path,
      attachmentId: upload.id,
      mimeType: upload.mimeType,
      sha256: upload.sha256,
      size: upload.size,
    });
    return entry;
  }

  rename(entry: FileEntry, path: string) {
    const nextPath = validVaultPath(path);
    if (!nextPath) throw new Error("올바른 Vault 경로를 입력하세요.");
    if (entry.path === nextPath) return;
    const changed =
      entry.kind === "folder"
        ? this.entries().filter((item) => isWithin(item.path, entry.path))
        : [entry];
    const ids = new Set(changed.map((item) => item.id));
    const paths = changed.map((item) => moveWithin(item.path, entry.path, nextPath));
    if (
      this.entries().some(
        (item) => !ids.has(item.id) && paths.some((path) => samePath(item.path, path)),
      )
    ) {
      throw new Error("같은 이름의 파일이 이미 있습니다.");
    }
    this.enqueue({
      operationId: randomUuid(),
      fileId: entry.id,
      type: "rename",
      path: nextPath,
      fromPath: entry.path,
      baseVersion: entry.version ?? 1,
    });
  }

  delete(entry: FileEntry) {
    const changed =
      entry.kind === "folder"
        ? this.entries().filter((item) => isWithin(item.path, entry.path))
        : [entry];
    this.enqueue({
      operationId: randomUuid(),
      fileId: entry.id,
      type: "delete",
      fromPath: entry.path,
      baseVersion: entry.version ?? 1,
    });
    for (const item of changed) {
      this.documents.get(item.id)?.destroy();
      this.documents.delete(item.id);
      this.canvases.get(item.id)?.destroy();
      this.canvases.delete(item.id);
    }
    return changed;
  }

  destroy() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    for (const document of this.documents.values()) document.destroy();
    this.documents.clear();
    for (const canvas of this.canvases.values()) canvas.destroy();
    this.canvases.clear();
    this.provider.destroy();
    void this.cachePersistence.destroy();
    void this.operationsPersistence.destroy();
    this.socket.destroy();
    this.document.destroy();
    this.cacheDocument.destroy();
    this.operationsDocument.destroy();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  private preserveDeletedChanges(entry: FileEntry) {
    if (this.readOnly || this.preservingDeletes.has(entry.id)) return;
    const document = this.documents.get(entry.id);
    const canvas = this.canvases.get(entry.id);
    const source =
      entry.kind === "markdown" ? document : entry.kind === "canvas" ? canvas : undefined;
    if (!source?.hasUnsyncedChanges) return;

    this.preservingDeletes.add(entry.id);
    try {
      const path = conflictPath(
        entry.path,
        entry.id,
        this.entries().map((item) => item.path),
      );
      const copy = this.create(entry.kind as "markdown" | "canvas", path);
      if (entry.kind === "markdown" && document) {
        const next = this.openDocument(copy, this.api, this.userName);
        Y.applyUpdate(next.document, Y.encodeStateAsUpdate(document.document));
        document.destroy();
      } else if (entry.kind === "canvas" && canvas) {
        const next = this.openCanvas(copy, this.api, this.userName);
        next.applySnapshot(canvas.snapshot());
        canvas.destroy();
      }
      this.setStatus("삭제 충돌 사본 보존됨");
    } finally {
      this.preservingDeletes.delete(entry.id);
    }
  }

  private enqueue(operation: FileOperation) {
    this.operations.push([operation]);
    void this.flush();
  }

  private async flush() {
    if (this.flushing || !this.manifestSynced || this.readOnly) return;
    this.flushing = true;
    try {
      while (true) {
        const operations = this.operations.toArray();
        const index = operations.findIndex((operation) => !operation.confirmedVersions);
        if (index < 0) return;
        const operation = operations[index];
        try {
          const result = await this.api.applyFileOperation(
            this.vaultId,
            operationRequest(operation),
          );
          this.retryDelay = 1_000;
          this.confirm(index, operation, result.files);
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
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
    } catch {
      this.scheduleRetry();
    } finally {
      this.flushing = false;
    }
  }

  private async recoverConflict(index: number, operation: FileOperation) {
    const files = await this.api.listFiles(this.vaultId);
    const current = files.find((file) => file.id === operation.fileId && !file.deleted);
    if (operation.type === "create") {
      if (current) {
        this.confirm(index, operation, [current]);
        return;
      }
      const path = conflictPath(operation.path!, operation.fileId, this.occupiedPaths(files));
      this.rewritePendingPaths(operation.path!, path);
      this.replaceOperation(index, { ...operation, operationId: randomUuid(), path });
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
        (file) => !file.deleted && file.id !== operation.fileId && samePath(file.path, path!),
      )
    ) {
      const nextPath = conflictPath(path, operation.fileId, this.occupiedPaths(files));
      this.rewritePendingPaths(path, nextPath);
      path = nextPath;
      this.setStatus("충돌 사본 생성 중");
    }
    this.replaceOperation(index, {
      ...operation,
      operationId: randomUuid(),
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

  private occupiedPaths(files: RemoteFile[]) {
    return [...activePaths(files), ...this.entries().map((entry) => entry.path)];
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

  private scheduleRetry() {
    if (this.retryTimer || this.readOnly) return;
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

  private projectedEntries() {
    const source = this.manifestSynced ? this.manifest : this.cacheManifest;
    const entries = new Map([...source].map(([id, entry]) => [id, { ...entry }]));
    for (const operation of this.operations.toArray()) {
      if (operation.type === "create") {
        entries.set(operation.fileId, {
          id: operation.fileId,
          kind: operation.kind!,
          path: operation.path!,
          deleted: false,
          version: 0,
          attachmentId: operation.attachmentId,
          mimeType: operation.mimeType,
          sha256: operation.sha256,
          size: operation.size,
        });
        continue;
      }
      const target = entries.get(operation.fileId);
      if (!target) continue;
      if (operation.type === "rename") {
        for (const [id, entry] of entries) {
          if (
            id === target.id ||
            (target.kind === "folder" && isWithin(entry.path, operation.fromPath!))
          ) {
            entries.set(id, {
              ...entry,
              path:
                id === target.id
                  ? operation.path!
                  : moveWithin(entry.path, operation.fromPath!, operation.path!),
            });
          }
        }
      } else if (operation.type === "delete") {
        for (const [id, entry] of entries) {
          if (
            id === target.id ||
            (target.kind === "folder" && isWithin(entry.path, operation.fromPath!))
          ) {
            entries.set(id, { ...entry, deleted: true });
          }
        }
      } else {
        entries.set(target.id, {
          ...target,
          attachmentId: operation.attachmentId,
          mimeType: operation.mimeType,
          sha256: operation.sha256,
          size: operation.size,
        });
      }
    }
    return [...entries.values()];
  }

  private requireAvailablePath(path: string) {
    if (this.entries().some((entry) => samePath(entry.path, path))) {
      throw new Error("같은 이름의 파일이 이미 있습니다.");
    }
  }

  private requireManifest() {
    if (!this.manifestLoaded) throw new Error("로컬 Vault를 불러온 뒤 다시 시도하세요.");
  }
}

type FileOperation = FileOperationRequest & {
  fromPath?: string;
  mimeType?: string;
  sha256?: string;
  size?: number;
  failed?: boolean;
  confirmedVersions?: Record<string, number>;
};

function operationRequest(operation: FileOperation): FileOperationRequest {
  const {
    failed: _failed,
    fromPath: _fromPath,
    mimeType: _mimeType,
    sha256: _sha256,
    size: _size,
    confirmedVersions: _confirmedVersions,
    ...request
  } = operation;
  return request;
}

function activePaths(files: RemoteFile[]) {
  return files.filter((file) => !file.deleted).map((file) => file.path);
}

function connectionStatus(status: string) {
  if (status === "connected") return "동기화 중";
  if (status === "disconnected") return "오프라인";
  return "연결 중";
}

function samePath(left: string, right: string) {
  return vaultPathKey(left) === vaultPathKey(right);
}
