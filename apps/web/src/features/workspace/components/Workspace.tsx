import { useCallback, useEffect, useRef, useState } from "react";
import { useMatch, useNavigate, useParams } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useUploadAttachment } from "@/features/attachments/queries/use-attachments";
import {
  renamedFilePath,
  renamedMarkdownPath,
  newEntryPath,
  resolveFileLink,
  resolveMarkdownLink,
  validVaultPath,
  type FileEntry,
} from "@/features/documents/lib/files";
import { WebVault } from "@/features/documents/lib/sync";
import type { Vault } from "@/features/vaults/types/vault";
import { VaultSearchDialog, type SearchMode } from "@/features/search/components/VaultSearchDialog";
import type { ApiClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/error";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import {
  CreateEntryDialog,
  type CreateEntryKind,
  DeleteFileDialog,
  RenameFileDialog,
} from "./FileDialogs";
import { WorkspaceContent } from "./WorkspaceContent";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function Workspace({
  api,
  vault,
  vaults,
  userName,
  onSelect,
  onCreate,
  onSettings,
  onVaultSettings,
  onLogout,
}: {
  api: ApiClient;
  vault: Vault;
  vaults: Vault[];
  userName: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
  onVaultSettings: () => void;
  onLogout: () => void;
}) {
  const navigateRoute = useNavigate();
  const { vaultId: routeVaultId, fileId: routeFileId } = useParams<{
    vaultId: string;
    fileId: string;
  }>();
  const graphRoute = useMatch("/vaults/:vaultId/graph");
  const graph = graphRoute?.params.vaultId === vault.id;
  const [sync, setSync] = useState<WebVault>();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [active, setActive] = useState(() =>
    routeVaultId === vault.id ? (routeFileId ?? "") : "",
  );
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileEntry>();
  const [deleteTarget, setDeleteTarget] = useState<FileEntry>();
  const [createKind, setCreateKind] = useState<CreateEntryKind>();
  const [searchMode, setSearchMode] = useState<SearchMode>();
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadAttachment = useUploadAttachment(api, vault.id);
  const canWrite = vault.role !== "VIEWER" && online;
  const activeEntry = entries.find((entry) => entry.id === active);
  const open = useCallback(
    (entry: FileEntry, replace = false) => {
      setNotice("");
      if (entry.kind === "markdown" || entry.kind === "attachment" || entry.kind === "canvas") {
        setActive(entry.id);
        void navigateRoute(`/vaults/${vault.id}/files/${entry.id}`, { replace });
      }
    },
    [navigateRoute, vault.id],
  );

  useEffect(() => {
    setEntries([]);
    setOnline(false);
    const next = new WebVault(
      vault.id,
      api,
      userName,
      () => undefined,
      setOnline,
      vault.role === "VIEWER",
    );
    const unsubscribe = next.subscribe(() => setEntries(next.entries()));
    setSync(next);
    setActive("");
    return () => {
      unsubscribe();
      next.destroy();
      setSync(undefined);
    };
  }, [api, userName, vault.id, vault.role]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setSearchMode(activeEntry?.kind === "canvas" && canWrite ? "canvas" : "open");
      } else if (event.shiftKey && key === "f") {
        event.preventDefault();
        setSearchMode("search");
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [activeEntry?.kind, canWrite]);

  useEffect(() => {
    if (graph) return;
    if (active && entries.some((entry) => entry.id === active)) return;
    const first = entries.find((entry) => entry.kind === "markdown");
    if (first) open(first, true);
  }, [entries, active, graph, open]);

  useEffect(() => {
    if (routeVaultId === vault.id) setActive(routeFileId ?? "");
  }, [routeFileId, routeVaultId, vault.id]);

  const documentSession =
    sync && activeEntry?.kind === "markdown"
      ? sync.openDocument(activeEntry, api, userName)
      : undefined;
  const canvasSession =
    sync && activeEntry?.kind === "canvas"
      ? sync.openCanvas(activeEntry, api, userName)
      : undefined;

  function rename(entry: FileEntry, name: string) {
    if (!canWrite) return "Editing is unavailable while offline.";
    const path =
      entry.kind === "markdown"
        ? renamedMarkdownPath(entry.path, name)
        : renamedFilePath(entry.path, name);
    if (!path) return "File names cannot contain / or \\ characters.";
    try {
      sync?.rename(entry, path);
    } catch (reason) {
      return errorMessage(reason);
    }
  }

  function create(path: string) {
    if (!canWrite) return "Editing is unavailable while offline.";
    if (!sync || !createKind) return "Wait for synchronization to connect.";
    const requested = newEntryPath(createKind, path);
    if (!requested) return "Enter a name.";
    try {
      const entry = sync.create(createKind, requested);
      if (entry.kind !== "folder") open(entry);
    } catch (reason) {
      return errorMessage(reason);
    }
  }

  function createGraphDocument(path: string) {
    if (!sync || !canWrite) {
      setNotice("Editing is unavailable while offline.");
      return;
    }
    try {
      open(sync.create("markdown", path));
    } catch (reason) {
      setNotice(`Document creation failed: ${errorMessage(reason)}`);
    }
  }

  async function upload(files: FileList | null) {
    if (!sync || !files?.length) return;
    if (!canWrite) {
      setNotice("Attachments cannot be uploaded while offline.");
      return;
    }
    if (!sync.readyForNewEntries()) {
      setNotice("Try again after the initial synchronization finishes.");
      return;
    }
    setNotice("Uploading attachments…");
    try {
      for (const file of files) {
        open(await addAttachment(file, validVaultPath(file.name)));
      }
      setNotice("");
    } catch (reason) {
      setNotice(`Attachment upload failed: ${errorMessage(reason)}`);
    } finally {
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  async function pasteImages(files: File[]) {
    if (!sync || !canWrite || !sync.readyForNewEntries()) return [];
    const folder = activeEntry?.path.split("/").slice(0, -1).join("/");
    const occupied = new Set(sync.entries().map((entry) => entry.path.toLocaleLowerCase()));
    try {
      const paths: string[] = [];
      for (const file of files) {
        const path = availableAttachmentPath(file, folder, occupied);
        await addAttachment(file, path);
        paths.push(path);
      }
      return paths;
    } catch (reason) {
      setNotice(`Image paste failed: ${errorMessage(reason)}`);
      return [];
    }
  }

  async function addAttachment(file: File, path: string | undefined) {
    if (!sync) throw new Error("Wait for synchronization to connect.");
    if (!path) throw new Error(`Invalid file name: ${file.name}`);
    if (
      sync.entries().some((entry) => entry.path.toLocaleLowerCase() === path.toLocaleLowerCase())
    ) {
      throw new Error(`A file with this name already exists: ${path}`);
    }
    const uploaded = await uploadAttachment.mutateAsync({ file, path });
    return sync.addAttachment(uploaded);
  }

  function remove(entry: FileEntry) {
    if (!canWrite) {
      setNotice("Editing is unavailable while offline.");
      return;
    }
    sync?.delete(entry);
    if (active === entry.id) {
      setActive("");
      void navigateRoute(`/vaults/${vault.id}`, { replace: true });
    }
  }

  const navigate = useCallback(
    (href: string) => {
      if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      if (!activeEntry) return;
      const entry = resolveMarkdownLink(entries, activeEntry.path, href);
      if (!entry) {
        setNotice(`Document not found: ${href}`);
        return;
      }
      setNotice("");
      open(entry);
    },
    [activeEntry, entries, open],
  );

  const resolveAssetFrom = useCallback(
    async (currentPath: string, href: string) => {
      if (/^(?:https?:|data:|blob:)/i.test(href)) return href;
      const entry = resolveFileLink(entries, currentPath, href);
      if (entry?.kind !== "attachment" || !entry.attachmentId) return undefined;
      const attachmentId = entry.attachmentId;
      return queryClient.fetchQuery({
        queryKey: queryKeys.attachment(vault.id, attachmentId),
        queryFn: () => api.downloadUrl(vault.id, attachmentId),
        staleTime: 4 * 60 * 1000,
      });
    },
    [api, entries, vault.id],
  );

  const resolveAsset = useCallback(
    async (href: string) => {
      if (!activeEntry) return undefined;
      return resolveAssetFrom(activeEntry.path, href);
    },
    [activeEntry, resolveAssetFrom],
  );

  const openCanvasDocument = useCallback(
    (file: string) => {
      if (!sync || activeEntry?.kind !== "canvas") return undefined;
      const entry = resolveMarkdownLink(entries, activeEntry.path, file);
      return entry ? sync.openDocument(entry, api, userName) : undefined;
    },
    [activeEntry, api, entries, sync, userName],
  );

  const navigateFromCanvas = useCallback(
    (file: string, href: string) => {
      if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      const source =
        activeEntry?.kind === "canvas"
          ? resolveMarkdownLink(entries, activeEntry.path, file)
          : undefined;
      const entry = source ? resolveMarkdownLink(entries, source.path, href) : undefined;
      if (!entry) {
        setNotice(`Document not found: ${href}`);
        return;
      }
      setNotice("");
      open(entry);
    },
    [activeEntry, entries, open],
  );

  const resolveCanvasAsset = useCallback(
    async (file: string, href: string) => {
      if (activeEntry?.kind !== "canvas") return undefined;
      const source = resolveMarkdownLink(entries, activeEntry.path, file);
      return source ? resolveAssetFrom(source.path, href) : undefined;
    },
    [activeEntry, entries, resolveAssetFrom],
  );

  const resolveCanvasFileAsset = useCallback(
    async (file: string) => {
      if (activeEntry?.kind !== "canvas") return undefined;
      return resolveAssetFrom(activeEntry.path, file);
    },
    [activeEntry, resolveAssetFrom],
  );

  return (
    <>
      <SidebarProvider>
        <WorkspaceSidebar
          vault={vault}
          vaults={vaults}
          entries={entries}
          active={active}
          canWrite={canWrite}
          uploadInput={uploadInput}
          onSelectVault={onSelect}
          onCreateVault={onCreate}
          onSearch={() => setSearchMode("search")}
          graph={graph}
          onOpen={open}
          onRename={setRenameTarget}
          onDelete={setDeleteTarget}
          onCreateEntry={setCreateKind}
          onUpload={(files) => void upload(files)}
          onSettings={onSettings}
          onVaultSettings={onVaultSettings}
          onLogout={onLogout}
        />
        <WorkspaceContent
          api={api}
          vaultId={vault.id}
          vaultName={vault.name}
          entries={entries}
          active={active}
          activeEntry={activeEntry}
          notice={notice}
          documentSession={documentSession}
          canvasSession={canvasSession}
          canWrite={canWrite}
          graph={graph}
          onRenamePath={(path) => canWrite && activeEntry && sync?.rename(activeEntry, path)}
          onRename={() => activeEntry && setRenameTarget(activeEntry)}
          onDelete={() => activeEntry && setDeleteTarget(activeEntry)}
          onNavigate={navigate}
          resolveAsset={resolveAsset}
          onPasteImages={pasteImages}
          openCanvasDocument={openCanvasDocument}
          navigateFromCanvas={navigateFromCanvas}
          resolveCanvasAsset={resolveCanvasAsset}
          resolveCanvasFileAsset={resolveCanvasFileAsset}
          onAddCanvasFile={() => setSearchMode("canvas")}
          onOpenEntry={open}
          onCreateGraphDocument={createGraphDocument}
        />
      </SidebarProvider>
      <VaultSearchDialog
        api={api}
        vaultId={vault.id}
        mode={searchMode}
        entries={entries}
        close={() => setSearchMode(undefined)}
        open={(entry) => {
          if (searchMode === "canvas") canvasSession?.addFile(entry.path);
          else open(entry);
        }}
      />
      <RenameFileDialog
        entry={renameTarget}
        close={() => setRenameTarget(undefined)}
        rename={(name) => (renameTarget ? rename(renameTarget, name) : undefined)}
      />
      <CreateEntryDialog kind={createKind} close={() => setCreateKind(undefined)} create={create} />
      <DeleteFileDialog
        entry={deleteTarget}
        close={() => setDeleteTarget(undefined)}
        remove={() => deleteTarget && remove(deleteTarget)}
      />
    </>
  );
}

function availableAttachmentPath(file: File, folder: string | undefined, occupied: Set<string>) {
  const name = file.name.trim() || `Pasted image.${imageExtension(file.type)}`;
  const requested = validVaultPath(folder ? `${folder}/${name}` : name);
  if (!requested) throw new Error(`Invalid file name: ${name}`);
  const dot = requested.lastIndexOf(".");
  const stem = dot > requested.lastIndexOf("/") ? requested.slice(0, dot) : requested;
  const extension = dot > requested.lastIndexOf("/") ? requested.slice(dot) : "";
  let path = requested;
  let suffix = 1;
  while (occupied.has(path.toLocaleLowerCase())) path = `${stem} ${suffix++}${extension}`;
  occupied.add(path.toLocaleLowerCase());
  return path;
}

function imageExtension(type: string) {
  return type.split("/")[1]?.replace("jpeg", "jpg") || "png";
}
