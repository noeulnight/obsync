import type { App } from "obsidian";

export async function createFolder(app: App, path: string) {
  const existing = await app.vault.adapter.stat(path);
  if (existing?.type === "folder") return;
  if (existing) throw new Error(`폴더 경로가 파일과 충돌합니다: ${path}`);
  try {
    await app.vault.createFolder(path);
  } catch (error) {
    if ((await app.vault.adapter.stat(path))?.type !== "folder") throw error;
  }
}

export async function createTextFile(app: App, path: string, content: string) {
  const existing = await app.vault.adapter.stat(path);
  if (existing?.type === "file") return;
  if (existing) throw new Error(`파일 경로가 폴더와 충돌합니다: ${path}`);
  try {
    await app.vault.create(path, content);
  } catch (error) {
    if ((await app.vault.adapter.stat(path))?.type !== "file") throw error;
  }
}

export async function createBinaryFile(app: App, path: string, content: ArrayBuffer) {
  const existing = await app.vault.adapter.stat(path);
  if (existing?.type === "file") {
    await app.vault.adapter.writeBinary(path, content);
    return;
  }
  if (existing) throw new Error(`첨부파일 경로가 폴더와 충돌합니다: ${path}`);
  try {
    await app.vault.createBinary(path, content);
  } catch (error) {
    if ((await app.vault.adapter.stat(path))?.type !== "file") throw error;
    await app.vault.adapter.writeBinary(path, content);
  }
}

export async function renameVaultPath(app: App, from: string, to: string) {
  const indexed = app.vault.getAbstractFileByPath(from);
  if (indexed) {
    await app.vault.rename(indexed, to);
    return;
  }
  if (await app.vault.adapter.stat(from)) await app.vault.adapter.rename(from, to);
}

export async function trashVaultPath(app: App, path: string) {
  const indexed = app.vault.getAbstractFileByPath(path);
  if (indexed) {
    await app.vault.trash(indexed, false);
    return;
  }
  if (await app.vault.adapter.stat(path)) await app.vault.adapter.trashLocal(path);
}
