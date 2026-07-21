import type { FileOperationRequest, RemoteFile } from "./api";
import { isWithin, moveWithin } from "./path";
import type { FileEntry, FileOperation } from "./sync-types";

export function projectEntries(
  manifest: Iterable<[string, FileEntry]>,
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
      } as FileEntry);
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
        attachmentId: operation.attachmentId!,
        mimeType: operation.mimeType!,
        sha256: operation.sha256!,
        size: operation.size!,
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
