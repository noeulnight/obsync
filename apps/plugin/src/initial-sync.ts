import { clearDocument } from "y-indexeddb";
import { TFolder, type App, type TFile } from "obsidian";
import { pathKey } from "@obsync/sync-core";
import type { FileOperationOutbox } from "./outbox";
import type { RemoteFileApplier } from "./remote-file-applier";
import type { FileEntry, InitialSyncMode, SeedMode, SyncConnection } from "./sync-types";

type InitialVaultSyncOptions = {
  app: App;
  connection: SyncConnection;
  outbox: FileOperationOutbox;
  remote: RemoteFileApplier;
  entries: () => FileEntry[];
  isApplying: (path: string) => boolean;
  ensureFolder: (path: string) => void;
  syncFile: (file: TFile, seedMode: SeedMode) => Promise<void>;
};

export class InitialVaultSync {
  constructor(private readonly options: InitialVaultSyncOptions) {}

  async run(mode?: InitialSyncMode) {
    const { app, connection, remote } = this.options;
    const initialMode = effectiveInitialMode(mode, connection.readOnly);
    if (initialMode === "server") {
      await this.clearContentCache();
      await this.clearLocalVault();
    }
    if (initialMode === "local") this.removeRemoteOnlyEntries();
    else if (!(await remote.applyBatch(this.options.entries().map((entry) => ({ entry }))))) {
      throw new Error("Some files are still being reapplied.");
    }
    if (connection.readOnly) return "Read only";
    if (initialMode === "server") return "Synced";

    const loaded = app.vault.getAllLoadedFiles();
    for (const folder of loaded
      .filter((item): item is TFolder => item instanceof TFolder && !item.isRoot())
      .sort((left, right) => depth(left.path) - depth(right.path))) {
      if (!this.options.isApplying(folder.path)) this.options.ensureFolder(folder.path);
    }

    const seedMode = initialMode === "local" || initialMode === "merge" ? initialMode : "server";
    for (const file of app.vault.getFiles()) {
      if (!this.options.isApplying(file.path)) await this.options.syncFile(file, seedMode);
    }
    return "Synced";
  }

  private async clearContentCache() {
    const { connection } = this.options;
    await Promise.all(
      this.options.entries().flatMap((entry) => {
        if (entry.deleted || (entry.kind !== "markdown" && entry.kind !== "canvas")) return [];
        const kind = entry.kind === "markdown" ? "doc" : "canvas";
        return [
          clearDocument(
            `obsync:${connection.vaultId}:${kind}:${entry.id}${connection.readOnly ? ":readonly" : ""}`,
          ),
        ];
      }),
    );
  }

  private async clearLocalVault() {
    const { app, remote } = this.options;
    const config = pathKey(app.vault.configDir);
    const roots = app.vault.getRoot().children.filter((entry) => pathKey(entry.path) !== config);
    await remote.whileApplying(
      roots.map((entry) => entry.path),
      async () => {
        for (const entry of roots) await app.vault.delete(entry, true);
        const remaining = await app.vault.adapter.list("");
        for (const file of remaining.files) {
          if (pathKey(file) !== config) await app.vault.adapter.remove(file);
        }
        for (const folder of remaining.folders) {
          if (pathKey(folder) !== config) await app.vault.adapter.rmdir(folder, true);
        }
      },
    );
  }

  private removeRemoteOnlyEntries() {
    const { app, outbox } = this.options;
    const localPaths = new Set(
      app.vault
        .getAllLoadedFiles()
        .filter((entry) => entry.path)
        .map((entry) => pathKey(entry.path)),
    );
    for (const entry of this.options.entries()) {
      if (!entry.deleted && !localPaths.has(pathKey(entry.path))) {
        outbox.enqueue({
          operationId: crypto.randomUUID(),
          fileId: entry.id,
          type: "delete",
          fromPath: entry.path,
          baseVersion: entry.version,
        });
      }
    }
  }
}

export function effectiveInitialMode(mode: InitialSyncMode | undefined, readOnly: boolean) {
  return readOnly ? "server" : mode;
}

function depth(path: string) {
  return path.split("/").length;
}
