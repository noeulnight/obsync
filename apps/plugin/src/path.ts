import { pathKey } from "@obsync/sync-core";

export { conflictPath, isWithin, moveWithin, pathKey } from "@obsync/sync-core";

export function parentPath(path: string) {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? undefined : path.slice(0, separator);
}

export function fileId(vaultId: string, path: string) {
  const input = new TextEncoder().encode(`${vaultId}\0${pathKey(path)}`);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of input) {
    first = Math.imul(first ^ byte, 0x01000193);
    second = Math.imul(second ^ byte, 0x85ebca6b);
  }
  const hex = [first, second, first ^ second, first + second]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
