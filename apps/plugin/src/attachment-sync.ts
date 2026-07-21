import { requestUrl, type App, type TFile } from "obsidian";
import { mimeType } from "./mime";
import { fileId } from "./path";
import type { AttachmentEntry, FileEntry, FileOperation, SyncConnection } from "./sync-types";
import { createBinaryFile } from "./vault-io";

export async function uploadAttachment(
  app: App,
  connection: SyncConnection,
  file: TFile,
  current?: FileEntry,
): Promise<Omit<FileOperation, "createdAt"> | undefined> {
  const mime = mimeType(file.path);
  const data = await app.vault.readBinary(file);
  const digest = await sha256(data);
  if (current?.kind === "attachment" && current.sha256 === digest) return;
  const approval = await connection.api.presignUpload(connection.vaultId, {
    idempotencyKey: fileId(connection.vaultId, `attachment\0${file.path}\0${digest}`),
    path: file.path,
    size: data.byteLength,
    mimeType: mime,
    sha256: digest,
  });
  if (approval.uploadUrl) {
    const response = await requestUrl({
      url: approval.uploadUrl,
      method: "PUT",
      headers: approval.uploadHeaders,
      body: data,
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`첨부 업로드 실패 (${response.status})`);
    }
    await connection.api.completeUpload(connection.vaultId, approval.attachment.id);
  }
  return {
    operationId: crypto.randomUUID(),
    fileId: current?.id ?? crypto.randomUUID(),
    type: current?.kind === "attachment" ? "updateAttachment" : "create",
    kind: "attachment",
    path: file.path,
    baseVersion: current?.kind === "attachment" ? current.version : undefined,
    attachmentId: approval.attachment.id,
    mimeType: mime,
    sha256: digest,
    size: data.byteLength,
  };
}

export async function downloadAttachment(
  app: App,
  connection: SyncConnection,
  entry: AttachmentEntry,
  local: TFile | undefined,
  ensureParent: () => Promise<void>,
  write: (work: () => Promise<void>) => Promise<void>,
) {
  const url = await connection.api.downloadUrl(connection.vaultId, entry.attachmentId);
  const response = await requestUrl({ url, throw: false });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`첨부 다운로드 실패 (${response.status})`);
  }
  if ((await sha256(response.arrayBuffer)) !== entry.sha256) {
    throw new Error(`첨부 해시 불일치: ${entry.path}`);
  }
  await ensureParent();
  await write(async () => {
    if (local) await app.vault.modifyBinary(local, response.arrayBuffer);
    else await createBinaryFile(app, entry.path, response.arrayBuffer);
  });
}

export async function sha256(data: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
