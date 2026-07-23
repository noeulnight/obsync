import type * as Y from "yjs";

export type FileKind = "markdown" | "attachment" | "folder" | "canvas";

export type FileEntry = {
  id: string;
  kind: FileKind;
  path: string;
  deleted: boolean;
  updatedAt?: number;
  version?: number;
  attachmentId?: string;
  mimeType?: string;
  sha256?: string;
  size?: number;
};

export type FileOperationRequest = {
  operationId: string;
  fileId: string;
  type: "create" | "rename" | "delete" | "updateAttachment";
  kind?: FileKind;
  path?: string;
  baseVersion?: number;
  attachmentId?: string;
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

export type RemoteFile = {
  id: string;
  kind?: FileKind;
  path: string;
  deleted: boolean;
  version: number;
};

export function projectEntries<T extends FileEntry>(
  manifest: Iterable<[string, T]>,
  operations: FileOperation[],
) {
  const entries = new Map([...manifest].map(([id, entry]) => [id, { ...entry }]));
  for (const operation of operations) {
    if (operation.type === "create") {
      entries.set(operation.fileId, {
        id: operation.fileId,
        kind: operation.kind!,
        path: operation.path!,
        deleted: false,
        updatedAt: operation.createdAt,
        version: 0,
        attachmentId: operation.attachmentId,
        mimeType: operation.mimeType,
        sha256: operation.sha256,
        size: operation.size,
      } as T);
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
    } else if (target.kind === "attachment") {
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

export function operationRequest(operation: FileOperation): FileOperationRequest {
  const {
    failed: _failed,
    fromPath: _fromPath,
    mimeType: _mimeType,
    sha256: _sha256,
    size: _size,
    createdAt: _createdAt,
    confirmedVersions: _confirmedVersions,
    ...request
  } = operation;
  return request;
}

export function activePaths(files: RemoteFile[]) {
  return files.filter((file) => !file.deleted).map((file) => file.path);
}

export function rewriteOperationPaths(operations: FileOperation[], from: string, to: string) {
  return operations.map((operation) => {
    const path =
      operation.path && isWithin(operation.path, from)
        ? moveWithin(operation.path, from, to)
        : operation.path;
    const fromPath =
      operation.fromPath && isWithin(operation.fromPath, from)
        ? moveWithin(operation.fromPath, from, to)
        : operation.fromPath;
    return path === operation.path && fromPath === operation.fromPath
      ? operation
      : { ...operation, path, fromPath };
  });
}

export function confirmOperation(
  operations: FileOperation[],
  index: number,
  operation: FileOperation,
  files: Array<{ id: string; version: number }>,
) {
  const versions = Object.fromEntries(files.map((file) => [file.id, file.version]));
  const confirmed = [...operations];
  confirmed[index] = { ...operation, confirmedVersions: versions };
  return confirmed.map((item) => {
    const version = versions[item.fileId];
    return version === undefined || item.baseVersion === undefined
      ? item
      : { ...item, baseVersion: version };
  });
}

export function cleanupConfirmedOperations(
  operations: FileOperation[],
  manifestVersion: (fileId: string) => number,
) {
  return operations.filter((operation) => {
    const versions = operation.confirmedVersions;
    return !(
      versions && Object.entries(versions).every(([id, version]) => manifestVersion(id) >= version)
    );
  });
}

export type FileOperationRebase =
  | { type: "confirm"; file: RemoteFile }
  | { type: "merge"; file: RemoteFile }
  | { type: "discard" }
  | {
      type: "replace";
      operation: FileOperation;
      conflict?: { from: string; to: string };
    };

export function rebaseOperation(
  operation: FileOperation,
  files: RemoteFile[],
  occupiedPaths: Iterable<string>,
  nextOperationId: string,
): FileOperationRebase {
  const current = files.find((file) => file.id === operation.fileId && !file.deleted);
  if (operation.type === "create") {
    if (current) return { type: "confirm", file: current };
    const samePath = files.find(
      (file) =>
        !file.deleted &&
        file.kind === operation.kind &&
        pathKey(file.path) === pathKey(operation.path!),
    );
    if (
      samePath &&
      (operation.kind === "folder" || operation.kind === "markdown" || operation.kind === "canvas")
    ) {
      return { type: "merge", file: samePath };
    }
    const path = conflictPath(operation.path!, operation.fileId, occupiedPaths);
    return {
      type: "replace",
      operation: { ...operation, operationId: nextOperationId, path },
      conflict: { from: operation.path!, to: path },
    };
  }
  if (!current) return { type: "discard" };
  if (operation.type === "delete") return { type: "discard" };

  let path = operation.path;
  let conflict: { from: string; to: string } | undefined;
  if (
    operation.type === "rename" &&
    path &&
    files.some(
      (file) =>
        !file.deleted && file.id !== operation.fileId && pathKey(file.path) === pathKey(path!),
    )
  ) {
    const nextPath = conflictPath(path, operation.fileId, occupiedPaths);
    conflict = { from: path, to: nextPath };
    path = nextPath;
  }
  return {
    type: "replace",
    operation: {
      ...operation,
      operationId: nextOperationId,
      baseVersion: current.version,
      fromPath: operation.type === "rename" ? current.path : operation.fromPath,
      path,
    },
    conflict,
  };
}

export function normalizeVaultPath(path: string) {
  const value = path.trim().normalize("NFC");
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    return undefined;
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return undefined;
  return parts.join("/");
}

export function pathKey(path: string) {
  return path.normalize("NFC").toLowerCase();
}

export function isWithin(path: string, folder: string) {
  const value = pathKey(path);
  const parent = pathKey(folder);
  return value === parent || value.startsWith(`${parent}/`);
}

export function moveWithin(path: string, from: string, to: string) {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}

export function conflictPath(path: string, id: string, occupied: Iterable<string>) {
  const used = new Set([...occupied].map(pathKey));
  const separator = path.lastIndexOf("/");
  const folder = separator < 0 ? "" : path.slice(0, separator + 1);
  const name = separator < 0 ? path : path.slice(separator + 1);
  const extension = name.lastIndexOf(".");
  const stem = extension > 0 ? name.slice(0, extension) : name;
  const suffix = extension > 0 ? name.slice(extension) : "";
  const base = `${folder}${stem} (conflict ${id.slice(0, 8)})`;
  let candidate = `${base}${suffix}`;
  for (let number = 2; used.has(pathKey(candidate)); number += 1) {
    candidate = `${base} ${number}${suffix}`;
  }
  return candidate;
}

export function replaceText(text: Y.Text, next: string) {
  const previous = text.toJSON();
  if (previous === next) return;

  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  text.doc?.transact(() => {
    const removed = previous.length - prefix - suffix;
    if (removed > 0) text.delete(prefix, removed);
    const inserted = next.slice(prefix, next.length - suffix);
    if (inserted) text.insert(prefix, inserted);
  });
}

export function canvasNodeTextName(nodeId: string) {
  return `canvas-node:${nodeId}:text`;
}

export const presencePalette = [
  "#7c6cff",
  "#e06c75",
  "#56b6c2",
  "#98c379",
  "#d19a66",
  "#c678dd",
] as const;

export function presenceColor(clientId: number) {
  return presencePalette[clientId % presencePalette.length];
}
