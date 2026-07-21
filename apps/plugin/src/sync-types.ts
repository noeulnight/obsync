import type { ApiClient, FileOperationRequest } from "./api";

export type MarkdownEntry = {
  id: string;
  kind: "markdown";
  path: string;
  deleted: boolean;
  updatedAt: number;
  version: number;
};

export type AttachmentEntry = {
  id: string;
  kind: "attachment";
  path: string;
  deleted: boolean;
  updatedAt: number;
  attachmentId: string;
  mimeType: string;
  sha256: string;
  size: number;
  version: number;
};

export type FolderEntry = {
  id: string;
  kind: "folder";
  path: string;
  deleted: boolean;
  updatedAt: number;
  version: number;
};

export type CanvasEntry = {
  id: string;
  kind: "canvas";
  path: string;
  deleted: boolean;
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

export type FileOperation = FileOperationRequest & {
  fromPath?: string;
  mimeType?: string;
  sha256?: string;
  size?: number;
  createdAt: number;
  failed?: boolean;
  confirmedVersions?: Record<string, number>;
};
