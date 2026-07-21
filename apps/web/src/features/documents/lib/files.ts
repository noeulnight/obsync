import { normalizeVaultPath, type FileEntry } from "@obsync/sync-core";

export { conflictPath, isWithin, moveWithin } from "@obsync/sync-core";
export type { FileEntry } from "@obsync/sync-core";

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
  return normalizeVaultPath(path);
}

export function newEntryPath(kind: "markdown" | "folder" | "canvas", input: string) {
  const extension = kind === "markdown" ? ".md" : kind === "canvas" ? ".canvas" : "";
  let path = input.trim();
  if (!path) return undefined;
  if (extension && !path.toLocaleLowerCase().endsWith(extension)) path += extension;
  const valid = validVaultPath(path);
  const name = valid?.split("/").at(-1);
  return valid && (!extension || name?.slice(0, -extension.length).trim()) ? valid : undefined;
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
