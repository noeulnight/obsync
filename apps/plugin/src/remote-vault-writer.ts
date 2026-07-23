import { TFile, TFolder, type App } from "obsidian";
import { conflictPath, pathKey } from "@obsync/sync-core";
import { downloadAttachment, sha256 } from "./attachment-sync";
import type { FileOperationOutbox } from "./outbox";
import { parentPath } from "./path";
import type { RemoteFileApplier } from "./remote-file-applier";
import type { VaultSessions } from "./sync-sessions";
import type { CanvasEntry, FileEntry, MarkdownEntry, SyncConnection } from "./sync-types";
import { createFolder, createTextFile, renameVaultPath, trashVaultPath } from "./vault-io";

export class RemoteVaultWriter {
  constructor(
    private readonly app: App,
    private readonly connection: SyncConnection,
    private readonly outbox: FileOperationOutbox,
    private readonly remote: RemoteFileApplier,
    private readonly sessions: VaultSessions,
    private readonly ensureMarkdown: (path: string) => MarkdownEntry,
    private readonly ensureCanvas: (path: string) => CanvasEntry,
    private readonly recovered: () => void,
    private readonly setStatus: (status: string) => void,
  ) {}

  async apply(entry: FileEntry, previous?: FileEntry) {
    await this.remote.queue(entry.path, async () => {
      if (previous && !previous.deleted && previous.path !== entry.path) {
        const oldFile = this.app.vault.getAbstractFileByPath(previous.path);
        if (oldFile || (await this.app.vault.adapter.stat(previous.path))) {
          if (await this.app.vault.adapter.stat(entry.path)) {
            await this.preserveLocalPath(entry.path, entry.id);
          }
          await this.remote.whileApplying([previous.path, entry.path], () =>
            renameVaultPath(this.app, previous.path, entry.path),
          );
        }
        this.sessions.rename(entry, entry.path);
      }

      let local = this.app.vault.getAbstractFileByPath(entry.path);
      if (entry.deleted) {
        const replacement = this.outbox
          .entries()
          .some(
            (candidate) =>
              candidate.id !== entry.id &&
              !candidate.deleted &&
              pathKey(candidate.path) === pathKey(entry.path),
          );
        if (replacement) {
          this.sessions.delete(entry);
          return;
        }
        const pendingAttachment =
          entry.kind === "attachment" && this.outbox.hasPendingAttachment(entry.id);
        if (
          local instanceof TFile &&
          (this.sessions.hasUnsyncedChanges(entry) || pendingAttachment)
        ) {
          const path = await this.preserveLocalPath(entry.path, entry.id);
          if (entry.kind === "markdown") {
            await this.sessions.document(this.ensureMarkdown(path), "local").localChanged();
          } else if (entry.kind === "canvas") {
            await this.sessions.canvas(this.ensureCanvas(path), "local").localChanged();
          }
          local = null;
          this.setStatus("Deleted conflict copy preserved");
        }
        this.sessions.delete(entry);
        if (local || (await this.app.vault.adapter.stat(entry.path))) {
          await this.remote.whileApplying([entry.path], () => trashVaultPath(this.app, entry.path));
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
          await this.remote.whileApplying([entry.path], () => createFolder(this.app, entry.path));
        }
        return;
      }

      if (entry.kind === "markdown" || entry.kind === "canvas") {
        const stored = await this.app.vault.adapter.stat(entry.path);
        if (!stored) {
          await this.ensureParent(entry.path);
          await this.remote.whileApplying([entry.path], () =>
            createTextFile(this.app, entry.path, entry.kind === "markdown" ? "" : "{}\n"),
          );
        }
        if (entry.kind === "markdown") this.sessions.document(entry, "server");
        else this.sessions.canvas(entry, "server");
        return;
      }

      let localSha: string | undefined;
      if (local instanceof TFile) {
        localSha = await sha256(await this.app.vault.readBinary(local));
        const previousSha = previous?.kind === "attachment" ? previous.sha256 : undefined;
        if (localSha !== entry.sha256 && localSha !== previousSha) {
          await this.preserveLocalPath(entry.path, entry.id);
          local = null;
        }
      }
      if (!(local instanceof TFile) || localSha !== entry.sha256) {
        await downloadAttachment(
          this.app,
          this.connection,
          entry,
          local instanceof TFile ? local : undefined,
          () => this.ensureParent(entry.path),
          (work) => this.remote.whileApplying([entry.path], work),
        );
      }
    });
  }

  async moveLocalConflict(from: string, to: string) {
    if (!(await this.app.vault.adapter.stat(from))) return;
    await this.ensureParent(to);
    await this.remote.whileApplying([from, to], () => renameVaultPath(this.app, from, to));
  }

  private async ensureParent(path: string) {
    const parent = parentPath(path);
    if (parent && !this.app.vault.getAbstractFileByPath(parent)) {
      const parents = parent
        .split("/")
        .map((_, index, parts) => parts.slice(0, index + 1).join("/"));
      await this.remote.whileApplying(parents, () => createFolder(this.app, parent));
    }
  }

  private async preserveLocalPath(path: string, id: string) {
    const next = conflictPath(
      path,
      id,
      this.app.vault.getAllLoadedFiles().map((file) => file.path),
    );
    await this.moveLocalConflict(path, next);
    this.setStatus("Path conflict copy preserved");
    this.recovered();
    return next;
  }
}
