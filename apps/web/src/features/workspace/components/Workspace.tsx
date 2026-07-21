import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  onLogout,
}: {
  api: ApiClient;
  vault: Vault;
  vaults: Vault[];
  userName: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const navigateRoute = useNavigate();
  const { vaultId: routeVaultId, fileId: routeFileId } = useParams<{
    vaultId: string;
    fileId: string;
  }>();
  const [sync, setSync] = useState<WebVault>();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [active, setActive] = useState(() =>
    routeVaultId === vault.id ? (routeFileId ?? "") : "",
  );
  const [status, setStatus] = useState("연결 중");
  const [online, setOnline] = useState(false);
  const [notice, setNotice] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileEntry>();
  const [deleteTarget, setDeleteTarget] = useState<FileEntry>();
  const [createKind, setCreateKind] = useState<CreateEntryKind>();
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadAttachment = useUploadAttachment(api, vault.id);
  const canWrite = vault.role !== "VIEWER" && online;
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
      setStatus,
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
    if (active && entries.some((entry) => entry.id === active)) return;
    const first = entries.find((entry) => entry.kind === "markdown");
    if (first) open(first, true);
  }, [entries, active, open]);

  useEffect(() => {
    if (routeVaultId === vault.id) setActive(routeFileId ?? "");
  }, [routeFileId, routeVaultId, vault.id]);

  const activeEntry = entries.find((entry) => entry.id === active);
  const documentSession =
    sync && activeEntry?.kind === "markdown"
      ? sync.openDocument(activeEntry, api, userName)
      : undefined;
  const canvasSession =
    sync && activeEntry?.kind === "canvas"
      ? sync.openCanvas(activeEntry, api, userName)
      : undefined;

  function rename(entry: FileEntry, name: string) {
    if (!canWrite) return "오프라인에서는 편집할 수 없습니다.";
    const path =
      entry.kind === "markdown"
        ? renamedMarkdownPath(entry.path, name)
        : renamedFilePath(entry.path, name);
    if (!path) return "파일 이름에 / 또는 \\ 문자를 사용할 수 없습니다.";
    try {
      sync?.rename(entry, path);
    } catch (reason) {
      return errorMessage(reason);
    }
  }

  function create(path: string) {
    if (!canWrite) return "오프라인에서는 편집할 수 없습니다.";
    if (!sync || !createKind) return "동기화 연결을 기다려주세요.";
    const requested = newEntryPath(createKind, path);
    if (!requested) return "이름을 입력하세요.";
    try {
      const entry = sync.create(createKind, requested);
      if (entry.kind !== "folder") open(entry);
    } catch (reason) {
      return errorMessage(reason);
    }
  }

  async function upload(files: FileList | null) {
    if (!sync || !files?.length) return;
    if (!canWrite) {
      setNotice("오프라인에서는 첨부파일을 업로드할 수 없습니다.");
      return;
    }
    if (!sync.readyForNewEntries()) {
      setNotice("최초 동기화가 끝난 뒤 다시 시도하세요.");
      return;
    }
    setNotice("첨부파일 업로드 중…");
    try {
      for (const file of files) {
        const path = validVaultPath(file.name);
        if (!path) throw new Error(`올바르지 않은 파일 이름입니다: ${file.name}`);
        if (entries.some((entry) => entry.path.toLocaleLowerCase() === path.toLocaleLowerCase())) {
          throw new Error(`같은 이름의 파일이 이미 있습니다: ${path}`);
        }
        const uploaded = await uploadAttachment.mutateAsync({ file, path });
        open(sync.addAttachment(uploaded));
      }
      setNotice("");
    } catch (reason) {
      setNotice(`첨부파일 업로드 실패: ${errorMessage(reason)}`);
    } finally {
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  function remove(entry: FileEntry) {
    if (!canWrite) {
      setNotice("오프라인에서는 편집할 수 없습니다.");
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
        setNotice(`문서를 찾을 수 없습니다: ${href}`);
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
        setNotice(`문서를 찾을 수 없습니다: ${href}`);
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
          status={status}
          canWrite={canWrite}
          uploadInput={uploadInput}
          onSelectVault={onSelect}
          onCreateVault={onCreate}
          onOpen={open}
          onRename={setRenameTarget}
          onDelete={setDeleteTarget}
          onCreateEntry={setCreateKind}
          onUpload={(files) => void upload(files)}
          onSettings={onSettings}
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
          onRenamePath={(path) => canWrite && activeEntry && sync?.rename(activeEntry, path)}
          onRename={() => activeEntry && setRenameTarget(activeEntry)}
          onDelete={() => activeEntry && setDeleteTarget(activeEntry)}
          onNavigate={navigate}
          resolveAsset={resolveAsset}
          openCanvasDocument={openCanvasDocument}
          navigateFromCanvas={navigateFromCanvas}
          resolveCanvasAsset={resolveCanvasAsset}
          resolveCanvasFileAsset={resolveCanvasFileAsset}
        />
      </SidebarProvider>
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
