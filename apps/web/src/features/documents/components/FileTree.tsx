import { hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { ChevronRight, File, FileImage, FileText, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { fileTree, isWithin, type FileEntry, type TreeNode } from "../lib/files";

const ROOT_ID = "\0root";

export function FileTree({
  entries,
  active,
  open,
  rename,
  remove,
  move,
  canManage = true,
}: {
  entries: FileEntry[];
  active: string;
  open: (entry: FileEntry) => void;
  rename: (entry: FileEntry) => void;
  remove: (entry: FileEntry) => void;
  move: (entry: FileEntry, parentPath: string) => void;
  canManage?: boolean;
}) {
  const [dragging, setDragging] = useState<FileEntry>();
  const [dropPath, setDropPath] = useState("");
  const indexed = useMemo(() => {
    const root: TreeNode = { name: "Vault", path: ROOT_ID, children: fileTree(entries) };
    const items = new Map<string, TreeNode>([[ROOT_ID, root]]);
    const pending = [...root.children];
    while (pending.length) {
      const node = pending.pop()!;
      items.set(node.path, node);
      pending.push(...node.children);
    }
    return items;
  }, [entries]);

  const activePath = [...indexed.values()].find((node) => node.entry?.id === active)?.path;
  const tree = useTree<TreeNode>({
    rootItemId: ROOT_ID,
    getItemName: (item) => displayName(item.getItemData()),
    isItemFolder: (item) => {
      const node = item.getItemData();
      return node.children.length > 0 || node.entry?.kind === "folder";
    },
    dataLoader: {
      getItem: (id) => indexed.get(id)!,
      getChildren: (id) => indexed.get(id)!.children.map((node) => node.path),
    },
    state: { selectedItems: activePath ? [activePath] : [] },
    onPrimaryAction: (item) => {
      const entry = item.getItemData().entry;
      if (entry && !item.isFolder()) open(entry);
    },
    indent: 16,
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  const previousIndex = useRef<typeof indexed>(undefined);
  if (previousIndex.current !== indexed) {
    tree.scheduleRebuildTree();
    previousIndex.current = indexed;
  }

  const canDrop = (entry: FileEntry, path: string) =>
    entry.path.split("/").slice(0, -1).join("/") !== path &&
    !(entry.kind === "folder" && (path === entry.path || isWithin(path, entry.path)));
  const clearDrag = () => {
    setDragging(undefined);
    setDropPath("");
  };
  const startDrag = (event: DragEvent, entry: FileEntry) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
    setDragging(entry);
  };

  return (
    <SidebarMenu {...tree.getContainerProps("Vault files")}>
      {dragging && canDrop(dragging, "") && (
        <SidebarMenuItem>
          <SidebarMenuButton
            aria-label="Move to Vault root"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropPath(ROOT_ID);
            }}
            onDragLeave={() => dropPath === ROOT_ID && setDropPath("")}
            onDrop={(event) => {
              event.preventDefault();
              move(dragging, "");
              clearDrag();
            }}
            className={cn(
              "mb-1 h-7 border border-dashed text-xs text-muted-foreground",
              dropPath === ROOT_ID && "bg-sidebar-accent ring-1 ring-sidebar-ring",
            )}
          >
            Move to Vault root
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
      {tree.getItems().map((item) => {
        const node = item.getItemData();
        const folder = item.isFolder();
        const entry = node.entry;
        const button = (
          <SidebarMenuButton
            {...item.getProps()}
            draggable={Boolean(entry && canManage)}
            onDragStart={entry ? (event) => startDrag(event, entry) : undefined}
            onDragEnd={clearDrag}
            onDragOver={
              folder && dragging && canDrop(dragging, node.path)
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    setDropPath(node.path);
                  }
                : undefined
            }
            onDragLeave={() => dropPath === node.path && setDropPath("")}
            onDrop={
              folder && dragging && canDrop(dragging, node.path)
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    move(dragging, node.path);
                    clearDrag();
                  }
                : undefined
            }
            className={cn(
              "h-7 rounded-sm pr-2 text-[13px]",
              dropPath === node.path && "bg-sidebar-accent ring-1 ring-sidebar-ring",
            )}
            style={{ paddingLeft: `${8 + item.getItemMeta().level * 16}px` }}
            isActive={node.entry?.id === active}
            tooltip={displayName(node)}
          >
            {folder ? (
              <ChevronRight
                className={cn("transition-transform", item.isExpanded() && "rotate-90")}
              />
            ) : (
              <FileIcon entry={node.entry} />
            )}
            <span className="min-w-0 flex-1 truncate">{displayName(node)}</span>
            {fileType(node) && (
              <span className="ml-auto text-[10px] tracking-wider text-muted-foreground/70">
                {fileType(node)}
              </span>
            )}
          </SidebarMenuButton>
        );
        return (
          <SidebarMenuItem key={item.getId()}>
            {entry && canManage ? (
              <ContextMenu>
                <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => window.setTimeout(() => rename(entry))}>
                    <Pencil />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => window.setTimeout(() => remove(entry))}
                  >
                    <Trash2 />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : (
              button
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function FileIcon({ entry }: { entry?: FileEntry }) {
  if (entry?.kind === "markdown") return <FileText />;
  if (entry?.kind === "attachment") return <FileImage />;
  return <File />;
}

function displayName(node: TreeNode) {
  return node.entry && node.entry.kind !== "folder"
    ? node.name.replace(/\.[^./]+$/i, "")
    : node.name;
}

function fileType(node: TreeNode) {
  if (!node.entry || node.entry.kind === "folder" || node.entry.kind === "markdown") return;
  return node.entry.kind === "canvas" ? "CANVAS" : node.name.split(".").at(-1)?.toLocaleUpperCase();
}
