import {
  activePaths,
  cleanupConfirmedOperations,
  confirmOperation,
  operationRequest,
  rebaseOperation,
  rewriteOperationPaths,
  type FileOperation,
  type RemoteFile,
} from "@obsync/sync-core";
import axios from "axios";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { ApiClient } from "@/lib/api/client";
import { randomUuid } from "@/lib/file-id";

export class BrowserFileOutbox {
  private readonly document = new Y.Doc();
  private readonly operations = this.document.getArray<FileOperation>("operations");
  private readonly persistence: IndexeddbPersistence;
  private connected = false;
  private flushing = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryDelay = 1_000;
  private destroyed = false;

  constructor(
    private readonly vaultId: string,
    private readonly api: ApiClient,
    private readonly readOnly: boolean,
    private readonly manifestVersion: (fileId: string) => number,
    private readonly localPaths: () => string[],
    private readonly setStatus: (status: string) => void,
    notify: () => void,
  ) {
    this.persistence = new IndexeddbPersistence(
      `obsync:${vaultId}:file-operations:v2${readOnly ? ":readonly" : ""}`,
      this.document,
    );
    this.operations.observe(notify);
    this.persistence.once("synced", () => void this.flush());
  }

  entries() {
    return this.operations.toArray();
  }

  enqueue(operation: Omit<FileOperation, "createdAt">) {
    this.operations.push([{ ...operation, createdAt: Date.now() }]);
    void this.flush();
  }

  setConnected(connected: boolean) {
    this.connected = connected;
    if (connected) void this.flush();
  }

  cleanupConfirmed() {
    const next = cleanupConfirmedOperations(this.operations.toArray(), this.manifestVersion);
    if (next.length === this.operations.length) return;
    this.document.transact(() => this.applyOperations(next));
  }

  destroy() {
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    void this.persistence.destroy();
    this.document.destroy();
  }

  private async flush() {
    if (this.destroyed || this.flushing || !this.connected || this.readOnly) return;
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
          if (this.destroyed) return;
          this.retryDelay = 1_000;
          this.confirm(index, operation, result.files);
        } catch (error) {
          if (this.destroyed) return;
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
    const result = rebaseOperation(operation, files, this.occupiedPaths(files), randomUuid());
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
      this.rewritePendingPaths(result.conflict.from, result.conflict.to);
      this.setStatus("Creating conflict copy");
    }
    this.replaceOperation(index, result.operation);
  }

  private occupiedPaths(files: RemoteFile[]) {
    return [...activePaths(files), ...this.localPaths()];
  }

  private rewritePendingPaths(from: string, to: string) {
    this.document.transact(() => {
      this.applyOperations(rewriteOperationPaths(this.operations.toArray(), from, to));
    });
  }

  private replaceOperation(index: number, operation: FileOperation) {
    this.operations.delete(index, 1);
    this.operations.insert(index, [operation]);
  }

  private scheduleRetry() {
    if (this.destroyed || this.retryTimer || this.readOnly) return;
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

  private applyOperations(operations: FileOperation[]) {
    operations.forEach((operation, index) => {
      if (this.operations.get(index) !== operation) this.replaceOperation(index, operation);
    });
    if (this.operations.length > operations.length) {
      this.operations.delete(operations.length, this.operations.length - operations.length);
    }
  }
}
