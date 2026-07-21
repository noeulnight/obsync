export type FileEntry = {
  id: string;
  kind: "markdown" | "attachment" | "folder" | "canvas";
  path: string;
  deleted: boolean;
  attachmentId?: string;
  mimeType?: string;
  sha256?: string;
  size?: number;
  version?: number;
  updatedAt?: number;
};

export type TreeNode = {
  name: string;
  path: string;
  entry?: FileEntry;
  children: TreeNode[];
};

type MutableNode = Omit<TreeNode, "children"> & {
  children: Map<string, MutableNode>;
};

export function fileTree(entries: FileEntry[]): TreeNode[] {
  const root = new Map<string, MutableNode>();
  for (const entry of entries.filter((item) => !item.deleted)) {
    const parts = entry.path.split("/");
    let children = root;
    let path = "";
    parts.forEach((name, index) => {
      path = path ? `${path}/${name}` : name;
      let node = children.get(name);
      if (!node) {
        node = { name, path, children: new Map() };
        children.set(name, node);
      }
      if (index === parts.length - 1) node.entry = entry;
      children = node.children;
    });
  }
  return finish(root);
}

export function resolveMarkdownLink(
  entries: FileEntry[],
  currentPath: string,
  href: string,
): FileEntry | undefined {
  return resolveFileLink(entries, currentPath, href, true);
}

export function resolveFileLink(
  entries: FileEntry[],
  currentPath: string,
  href: string,
  markdown = false,
): FileEntry | undefined {
  const raw = safeDecode(href).split("|")[0].split("#")[0].trim();
  if (!raw) return undefined;

  const target = raw.replace(/^\/+/, "");
  const folder = currentPath.split("/").slice(0, -1);
  const normalize = (path: string[]) => {
    const value = normalizePath(path);
    return markdown ? value.replace(/\.md$/i, "") : value;
  };
  const relative = normalize([...folder, ...target.split("/")]);
  const direct = normalize(target.split("/"));
  const candidates = target.startsWith(".") ? [relative] : [direct, relative];

  return entries.find((entry) => {
    if (entry.deleted || (markdown && entry.kind !== "markdown")) return false;
    const path = normalize(entry.path.split("/"));
    const name = path.split("/").at(-1);
    return candidates.includes(path) || (!target.includes("/") && name === normalize([target]));
  });
}

export function imagePath(href: string) {
  const path = href.split("|")[0].split("#")[0].trim();
  return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path) ? path : undefined;
}

export function renamedMarkdownPath(path: string, title: string) {
  const name = title.trim();
  if (!name || /[\\/]/.test(name)) return undefined;
  return renamedFilePath(path, `${name}.md`);
}

export function renamedFilePath(path: string, fileName: string) {
  const name = fileName.trim();
  if (!name || /[\\/]/.test(name)) return undefined;
  return [...path.split("/").slice(0, -1), name].join("/");
}

export function validVaultPath(path: string) {
  const value = path.trim().normalize("NFC");
  if (!value || value.startsWith("/") || value.includes("\0")) return undefined;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return undefined;
  return parts.join("/");
}

export function isWithin(path: string, folder: string) {
  const value = vaultPathKey(path);
  const parent = vaultPathKey(folder);
  return value === parent || value.startsWith(`${parent}/`);
}

export function moveWithin(path: string, from: string, to: string) {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}

export function conflictPath(path: string, id: string, occupied: Iterable<string>) {
  const used = new Set([...occupied].map(vaultPathKey));
  const separator = path.lastIndexOf("/");
  const folder = separator < 0 ? "" : path.slice(0, separator + 1);
  const name = separator < 0 ? path : path.slice(separator + 1);
  const extension = name.lastIndexOf(".");
  const stem = extension > 0 ? name.slice(0, extension) : name;
  const suffix = extension > 0 ? name.slice(extension) : "";
  const base = `${folder}${stem} (conflict ${id.slice(0, 8)})`;
  let candidate = `${base}${suffix}`;
  for (let number = 2; used.has(vaultPathKey(candidate)); number += 1) {
    candidate = `${base} ${number}${suffix}`;
  }
  return candidate;
}

function normalizePath(parts: string[]) {
  const path: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") path.pop();
    else path.push(part);
  }
  return path.join("/").toLocaleLowerCase();
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function finish(nodes: Map<string, MutableNode>): TreeNode[] {
  return [...nodes.values()]
    .sort((left, right) => {
      const leftFolder = left.children.size > 0 || left.entry?.kind === "folder";
      const rightFolder = right.children.size > 0 || right.entry?.kind === "folder";
      return Number(rightFolder) - Number(leftFolder) || left.name.localeCompare(right.name);
    })
    .map((node) => ({ ...node, children: finish(node.children) }));
}
import { vaultPathKey } from "@/lib/vault-path";
