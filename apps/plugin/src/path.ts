export function parentPath(path: string) {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? undefined : path.slice(0, separator);
}

export function isWithin(path: string, folder: string) {
  const value = pathKey(path);
  const parent = pathKey(folder);
  return value === parent || value.startsWith(`${parent}/`);
}

export function moveWithin(path: string, from: string, to: string) {
  return path === from ? to : `${to}${path.slice(from.length)}`;
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

export function pathKey(path: string) {
  return path.normalize("NFC").toLowerCase();
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
