import {
  CircleUserRound,
  FilePlus2,
  FolderPlus,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings2,
  Upload,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { FileTree } from "@/features/documents/components/FileTree";
import { useUploadAttachment } from "@/features/attachments/queries/use-attachments";
import {
  renamedFilePath,
  renamedMarkdownPath,
  resolveFileLink,
  resolveMarkdownLink,
  validVaultPath,
  type FileEntry,
} from "@/features/documents/lib/files";
import { WebVault } from "@/features/documents/lib/sync";
import type { Vault } from "@/features/vaults/types/vault";
import type { ApiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { AttachmentPreview } from "./AttachmentPreview";
import {
  CreateEntryDialog,
  type CreateEntryKind,
  DeleteFileDialog,
  RenameFileDialog,
} from "./FileDialogs";

const DocumentEditor = lazy(() =>
  import("./DocumentEditor").then((module) => ({ default: module.DocumentEditor })),
);
const CanvasEditor = lazy(() =>
  import("@/features/canvas/components/CanvasEditor").then((module) => ({
    default: module.CanvasEditor,
  })),
);

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
  const [notice, setNotice] = useState("");
  const [renameTarget, setRenameTarget] = useState<FileEntry>();
  const [deleteTarget, setDeleteTarget] = useState<FileEntry>();
  const [createKind, setCreateKind] = useState<CreateEntryKind>();
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadAttachment = useUploadAttachment(api, vault.id);
  const canWrite = vault.role !== "VIEWER";
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
    const next = new WebVault(vault.id, api, userName, setStatus, vault.role === "VIEWER");
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
    const path =
      entry.kind === "markdown"
        ? renamedMarkdownPath(entry.path, name)
        : renamedFilePath(entry.path, name);
    if (!path) return "파일 이름에 / 또는 \\ 문자를 사용할 수 없습니다.";
    try {
      sync?.rename(entry, path);
    } catch (reason) {
      return message(reason);
    }
  }

  function create(path: string) {
    if (!sync || !createKind) return "동기화 연결을 기다려주세요.";
    let requested = path.trim();
    if (createKind === "markdown" && !/\.md$/i.test(requested)) requested += ".md";
    if (createKind === "canvas" && !/\.canvas$/i.test(requested)) requested += ".canvas";
    try {
      const entry = sync.create(createKind, requested);
      if (entry.kind !== "folder") open(entry);
    } catch (reason) {
      return message(reason);
    }
  }

  async function upload(files: FileList | null) {
    if (!sync || !files?.length) return;
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
      setNotice(`첨부파일 업로드 실패: ${message(reason)}`);
    } finally {
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  function remove(entry: FileEntry) {
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
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-2 py-2">
            <div className="flex gap-1">
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <Select value={vault.id} onValueChange={onSelect}>
                  <SelectTrigger
                    className="w-full border-0 bg-transparent px-2 font-medium shadow-none hover:bg-sidebar-accent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-sidebar-accent"
                    aria-label="Vault 선택"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vaults.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.role === "VIEWER" ? " (읽기 전용)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="icon" aria-label="새 Vault" onClick={onCreate}>
                <Plus />
              </Button>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="justify-between pr-1">
                <span>파일</span>
                {canWrite && (
                  <span className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="새 문서"
                      onClick={() => setCreateKind("markdown")}
                    >
                      <FilePlus2 />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="새 폴더"
                      onClick={() => setCreateKind("folder")}
                    >
                      <FolderPlus />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="새 Canvas"
                      onClick={() => setCreateKind("canvas")}
                    >
                      <LayoutDashboard />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="첨부파일 업로드"
                      onClick={() => uploadInput.current?.click()}
                    >
                      <Upload />
                    </Button>
                  </span>
                )}
              </SidebarGroupLabel>
              <input
                ref={uploadInput}
                className="hidden"
                type="file"
                multiple
                onChange={(event) => void upload(event.target.files)}
              />
              <SidebarGroupContent>
                <FileTree
                  entries={entries}
                  active={active}
                  open={open}
                  rename={setRenameTarget}
                  remove={setDeleteTarget}
                  canManage={canWrite}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t">
            <div className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              <span className={status === "동기화됨" ? "text-emerald-500" : undefined}>
                ● {vault.role === "VIEWER" ? "읽기 전용" : status}
              </span>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton aria-label="계정 메뉴">
                      <CircleUserRound />
                      <span>계정</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="start"
                    className="w-(--radix-dropdown-menu-trigger-width)"
                  >
                    <DropdownMenuItem onSelect={onSettings}>
                      <Settings2 />
                      설정
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={onLogout}>
                      <LogOut />
                      로그아웃
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            {notice ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                {notice}
              </div>
            ) : documentSession && activeEntry ? (
              <Suspense fallback={<EditorLoading />}>
                <DocumentEditor
                  key={active}
                  entry={activeEntry}
                  vaultName={vault.name}
                  session={documentSession}
                  onRename={(path) => sync?.rename(activeEntry, path)}
                  onRequestRename={() => setRenameTarget(activeEntry)}
                  onDelete={() => setDeleteTarget(activeEntry)}
                  onNavigate={navigate}
                  resolveAsset={resolveAsset}
                  readOnly={!canWrite}
                />
              </Suspense>
            ) : canvasSession && activeEntry ? (
              <Suspense fallback={<EditorLoading />}>
                <CanvasEditor
                  key={active}
                  session={canvasSession}
                  vaultName={vault.name}
                  path={activeEntry.path}
                  onRename={() => setRenameTarget(activeEntry)}
                  onDelete={() => setDeleteTarget(activeEntry)}
                  openDocument={openCanvasDocument}
                  onNavigate={navigateFromCanvas}
                  resolveAsset={resolveCanvasAsset}
                  resolveFileAsset={resolveCanvasFileAsset}
                  files={entries}
                  readOnly={!canWrite}
                />
              </Suspense>
            ) : activeEntry?.kind === "attachment" ? (
              <AttachmentPreview
                api={api}
                vaultId={vault.id}
                vaultName={vault.name}
                entry={activeEntry}
                onRename={canWrite ? () => setRenameTarget(activeEntry) : undefined}
                onDelete={canWrite ? () => setDeleteTarget(activeEntry) : undefined}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                왼쪽에서 문서를 선택하세요.
              </div>
            )}
          </div>
        </SidebarInset>
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

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function EditorLoading() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      편집기 불러오는 중…
    </div>
  );
}
