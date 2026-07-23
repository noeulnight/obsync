import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import {
  activePaths,
  cleanupConfirmedOperations,
  confirmOperation,
  operationRequest,
  projectEntries,
  rebaseOperation,
  rewriteOperationPaths,
  type RemoteFile,
} from "@obsync/sync-core";
import { ApiRequestError } from "./api";
import type { FileEntry, FileOperation, SyncConnection } from "./sync-types";

export class FileOperationOutbox {
  private readonly document = new Y.Doc();
  private readonly operations = this.document.getArray<FileOperation>("operations");
  private readonly persistence: IndexeddbPersistence;
  private synced = false;
  private flushing = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDelay = 1_000;
  private destroyed = false;

  constructor(
    private readonly connection: SyncConnection,
    private readonly manifest: Y.Map<FileEntry>,
    private readonly localPaths: () => string[],
    private readonly moveLocalConflict: (from: string, to: string) => Promise<void>,
    private readonly setStatus: (status: string) => void,
    private readonly report: (error: unknown) => void,
  ) {
    this.persistence = new IndexeddbPersistence(
      `obsync:${connection.vaultId}:file-operations:v2${connection.readOnly ? ":readonly" : ""}`,
      this.document,
    );
    this.persistence.once("synced", () => void this.flush());
  }

  destroy() {
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    void this.persistence.destroy();
    this.document.destroy();
  }

  setSynced(synced: boolean) {
    this.synced = synced;
    if (synced) void this.flush();
  }

  entries() {
    return projectEntries(this.manifest, this.operations.toArray()) as FileEntry[];
  }

  enqueue(operation: Omit<FileOperation, "createdAt">) {
    this.operations.push([{ ...operation, createdAt: Date.now() }]);
    void this.flush();
  }

  hasPendingAttachment(fileId: string) {
    return this.operations
      .toArray()
      .some((operation) => operation.fileId === fileId && operation.type === "updateAttachment");
  }

  manifestChanged() {
    this.cleanupConfirmed();
  }

  private async flush() {
    if (this.destroyed || this.flushing || !this.synced || this.connection.readOnly) return;
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
          if (this.destroyed) return;
          this.retryDelay = 1_000;
          this.confirm(index, operation, result.files);
        } catch (error) {
          if (this.destroyed) return;
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
    const result = rebaseOperation(
      operation,
      files,
      this.occupiedPaths(files),
      crypto.randomUUID(),
    );
    if (result.type === "confirm") {
      this.confirm(index, operation, [result.file]);
      return;
    }
    if (result.type === "merge") {
      this.operations.delete(index, 1);
      this.setStatus("Merged with existing folder");
      return;
    }
    if (result.type === "discard") {
      this.operations.delete(index, 1);
      this.setStatus("Server changes applied");
      return;
    }
    if (result.conflict) {
      await this.moveLocalConflict(result.conflict.from, result.conflict.to);
      this.rewritePendingPaths(result.conflict.from, result.conflict.to);
      this.setStatus("Creating conflict copy");
    }
    this.replaceOperation(index, result.operation);
  }

  private replaceOperation(index: number, operation: FileOperation) {
    this.operations.delete(index, 1);
    this.operations.insert(index, [operation]);
  }

  private rewritePendingPaths(from: string, to: string) {
    this.document.transact(() => {
      this.applyOperations(rewriteOperationPaths(this.operations.toArray(), from, to));
    });
  }

  private occupiedPaths(files: RemoteFile[]) {
    return [...activePaths(files), ...this.localPaths()];
  }

  private scheduleRetry() {
    if (this.retryTimer || this.destroyed || this.connection.readOnly) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    this.setStatus("Waiting to reconnect");
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
    this.document.transact(() => {
      this.applyOperations(confirmOperation(this.operations.toArray(), index, operation, files));
    });
    this.cleanupConfirmed();
  }

  private cleanupConfirmed() {
    const next = cleanupConfirmedOperations(
      this.operations.toArray(),
      (id) => this.manifest.get(id)?.version ?? 0,
    );
    if (next.length === this.operations.length) return;
    this.document.transact(() => this.applyOperations(next));
  }

  private applyOperations(operations: FileOperation[]) {
    operations.forEach((operation, index) => {
      if (this.operations.get(index) !== operation) this.replaceOperation(index, operation);
    });
    if (this.operations.length > operations.length) {
      this.operations.delete(operations.length, this.operations.length - operations.length);
    }
  }
}
