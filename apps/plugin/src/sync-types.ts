import type { FileEntry as BaseFileEntry, FileOperation } from "@obsync/sync-core";
import type { ApiClient } from "./api";

export type MarkdownEntry = BaseFileEntry & {
  kind: "markdown";
  updatedAt: number;
  version: number;
};

export type AttachmentEntry = BaseFileEntry & {
  kind: "attachment";
  updatedAt: number;
  attachmentId: string;
  mimeType: string;
  sha256: string;
  size: number;
  version: number;
};

export type FolderEntry = BaseFileEntry & {
  kind: "folder";
  updatedAt: number;
  version: number;
};

export type CanvasEntry = BaseFileEntry & {
  kind: "canvas";
  updatedAt: number;
  version: number;
};

export type FileEntry = MarkdownEntry | AttachmentEntry | FolderEntry | CanvasEntry;
export type InitialSyncMode = "local" | "server" | "merge";
export type SeedMode = InitialSyncMode;

export function editorBindingKey(fileId: string, nodeId?: string) {
  return nodeId ? `${fileId}#${nodeId}` : fileId;
}

export type SyncConnection = {
  api: ApiClient;
  serverUrl: string;
  token: () => Promise<string>;
  userName: string;
  vaultId: string;
  readOnly: boolean;
  initialMode?: InitialSyncMode;
};

export type { FileOperation };
