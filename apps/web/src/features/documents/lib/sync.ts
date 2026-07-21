import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  conflictPath,
  isWithin,
  moveWithin,
  pathKey,
  projectEntries,
  type FileOperation,
} from "@obsync/sync-core";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { ApiClient, UploadedAttachment } from "@/lib/api/client";
import { WebCanvas } from "@/features/canvas/lib/sync";
import { randomUuid } from "@/lib/file-id";
import { validVaultPath, type FileEntry } from "./files";
import { WebDocument } from "./document";
import { BrowserFileOutbox } from "./file-outbox";

export { WebDocument } from "./document";

export class WebVault {
  private readonly serverManifestDocument = new Y.Doc();
  private readonly serverManifest = this.serverManifestDocument.getMap<FileEntry>("files");
  private readonly cachedManifestDocument = new Y.Doc();
  private readonly cachedManifest = this.cachedManifestDocument.getMap<FileEntry>("files");
  private readonly cachePersistence: IndexeddbPersistence;
  private readonly outbox: BrowserFileOutbox;
  private readonly socket: HocuspocusProviderWebsocket;
  private readonly provider: HocuspocusProvider;
  private readonly documents = new Map<string, WebDocument>();
  private readonly canvases = new Map<string, WebCanvas>();
  private readonly listeners = new Set<() => void>();
  private manifestLoaded = false;
  private manifestSynced = false;
  private readonly preservingDeletes = new Set<string>();

  constructor(
    private readonly vaultId: string,
    private readonly api: ApiClient,
    private readonly userName: string,
    private readonly setStatus: (status: string) => void,
    private readonly setOnline: (online: boolean) => void,
    private readonly readOnly = false,
  ) {
    this.cachePersistence = new IndexeddbPersistence(
      `obsync:${vaultId}:manifest-cache:v1${readOnly ? ":readonly" : ""}`,
      this.cachedManifestDocument,
    );
    this.outbox = new BrowserFileOutbox(
      vaultId,
      api,
      readOnly,
      (fileId) => this.serverManifest.get(fileId)?.version ?? 0,
      () => this.entries().map((entry) => entry.path),
      setStatus,
      () => this.notify(),
    );
    this.socket = new HocuspocusProviderWebsocket({
      url: api.websocketUrl(),
      delay: 1_000,
      maxDelay: 5_000,
      maxAttempts: 0,
      onStatus: ({ status }) => {
        if (status !== "connected") this.setOnline(false);
        if (status === "disconnected") {
          this.manifestSynced = false;
          this.outbox.setConnected(false);
        }
        setStatus(connectionStatus(status));
      },
    });
    this.serverManifest.observe((event, transaction) => {
      if (this.manifestSynced) {
        this.cachedManifestDocument.transact(() => {
          for (const id of event.keysChanged) {
            const entry = this.serverManifest.get(id);
            if (entry) this.cachedManifest.set(id, entry);
            else this.cachedManifest.delete(id);
          }
        });
      }
      if (!transaction.local) {
        for (const id of event.keysChanged) {
          const entry = this.serverManifest.get(id);
          if (entry?.deleted) this.preserveDeletedChanges(entry);
        }
      }
      this.outbox.cleanupConfirmed();
      this.notify();
    });
    this.cachePersistence.once("synced", () => {
      this.manifestLoaded = true;
      this.notify();
    });
    this.provider = new HocuspocusProvider({
      name: `vault:${vaultId}:manifest`,
      document: this.serverManifestDocument,
      websocketProvider: this.socket,
      token: () => api.token(),
      onSynced: ({ state }) => {
        if (!state) return;
        this.manifestSynced = true;
        this.manifestLoaded = true;
        this.cachedManifestDocument.transact(() => {
          this.cachedManifest.clear();
          for (const [id, entry] of this.serverManifest) this.cachedManifest.set(id, entry);
        });
        this.notify();
        setStatus("동기화됨");
        this.setOnline(true);
        this.outbox.setConnected(true);
      },
      onAuthenticationFailed: () => {
        this.setOnline(false);
        setStatus("인증 실패");
      },
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
    for (const document of this.documents.values()) document.destroy();
    this.documents.clear();
    for (const canvas of this.canvases.values()) canvas.destroy();
    this.canvases.clear();
    this.provider.destroy();
    void this.cachePersistence.destroy();
    this.outbox.destroy();
    this.socket.destroy();
    this.serverManifestDocument.destroy();
    this.cachedManifestDocument.destroy();
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

  private enqueue(operation: Omit<FileOperation, "createdAt">) {
    this.outbox.enqueue(operation);
  }

  private projectedEntries() {
    const source = this.manifestSynced ? this.serverManifest : this.cachedManifest;
    return projectEntries(source, this.outbox.entries());
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

function connectionStatus(status: string) {
  if (status === "connected") return "동기화 중";
  if (status === "disconnected") return "오프라인";
  return "연결 중";
}

function samePath(left: string, right: string) {
  return pathKey(left) === pathKey(right);
}
