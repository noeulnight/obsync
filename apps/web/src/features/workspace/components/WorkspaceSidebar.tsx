import {
  CalendarDays,
  ChevronsUpDown,
  CircleUserRound,
  FilePlus2,
  Folder,
  FolderPlus,
  LayoutDashboard,
  Network,
  LogOut,
  PanelLeft,
  Plus,
  Settings2,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { FileTree } from "@/features/documents/components/FileTree";
import type { FileEntry } from "@/features/documents/lib/files";
import type { Vault } from "@/features/vaults/types/vault";
import type { ApiClient } from "@/lib/api/client";
import type { CreateEntryKind } from "./FileDialogs";
import { WorkspaceSearchPanel } from "./WorkspaceSearchPanel";

export type WorkspaceSidebarView = "files" | "search";

export function WorkspaceSidebar({
  api,
  vault,
  vaults,
  entries,
  active,
  canWrite,
  uploadInput,
  onSelectVault,
  onCreateVault,
  onDailyNote,
  onNewFromTemplate,
  graph,
  trash,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onCreateEntry,
  onUpload,
  onSettings,
  onVaultSettings,
  onLogout,
  view,
  onViewChange,
}: {
  api: ApiClient;
  vault: Vault;
  vaults: Vault[];
  entries: FileEntry[];
  active: string;
  canWrite: boolean;
  uploadInput: RefObject<HTMLInputElement | null>;
  onSelectVault: (id: string) => void;
  onCreateVault: () => void;
  onDailyNote: () => void;
  onNewFromTemplate: () => void;
  graph: boolean;
  trash: boolean;
  onOpen: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onMove: (entry: FileEntry, parentPath: string) => void;
  onCreateEntry: (kind: CreateEntryKind) => void;
  onUpload: (files: FileList | null) => void;
  onSettings: () => void;
  onVaultSettings: () => void;
  onLogout: () => void;
  view: WorkspaceSidebarView;
  onViewChange: (view: WorkspaceSidebarView) => void;
}) {
  const { setOpen, toggleSidebar } = useSidebar();
  const show = (next: WorkspaceSidebarView) => {
    setOpen(true);
    onViewChange(next);
  };

  return (
    <Sidebar collapsible="icon">
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-12 shrink-0 flex-col border-r p-1 group-data-[collapsible=icon]:border-r-0">
          <SidebarMenu className="items-center">
            <SidebarMenuItem>
              <SidebarMenuButton
                className="w-8 justify-center"
                tooltip="Toggle sidebar"
                onClick={toggleSidebar}
              >
                <PanelLeft />
                <span className="sr-only">Toggle sidebar</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="w-8 justify-center"
                tooltip="Files"
                isActive={view === "files" && !graph && !trash}
                onClick={() => show("files")}
              >
                <Folder />
                <span className="sr-only">Files</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="w-8 justify-center"
                tooltip="Search Vault"
                isActive={view === "search"}
                onClick={() => show("search")}
              >
                <Search />
                <span className="sr-only">Search Vault</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="w-8 justify-center"
                asChild
                tooltip="Graph"
                isActive={graph}
              >
                <Link to={`/vaults/${vault.id}/graph`} onClick={() => setOpen(true)}>
                  <Network />
                  <span className="sr-only">Graph</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="w-8 justify-center"
                asChild
                tooltip="Trash"
                isActive={trash}
              >
                <Link to={`/vaults/${vault.id}/trash`} onClick={() => setOpen(true)}>
                  <Trash2 />
                  <span className="sr-only">Trash</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarMenu className="mt-auto items-center">
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    className="w-8 justify-center"
                    tooltip="Account menu"
                    aria-label="Account menu"
                  >
                    <CircleUserRound />
                    <span className="sr-only">Account menu</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end">
                  <DropdownMenuItem onSelect={onSettings}>
                    <Settings2 />
                    Account settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onLogout}>
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
          <SidebarContent>
            {view === "search" ? (
              <WorkspaceSearchPanel
                api={api}
                vaultId={vault.id}
                entries={entries}
                open={onOpen}
                close={() => onViewChange("files")}
              />
            ) : (
              <SidebarGroup className="min-h-0 flex-1">
                <SidebarGroupLabel className="justify-start px-1">
                  {canWrite && (
                    <span className="flex items-center gap-0.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label="Create file">
                            <FilePlus2 />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onSelect={() => onCreateEntry("markdown")}>
                            <FilePlus2 />
                            New document
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={onDailyNote}>
                            <CalendarDays />
                            Daily note
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={onNewFromTemplate}>
                            <FilePlus2 />
                            New from template
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="New folder"
                        onClick={() => onCreateEntry("folder")}
                      >
                        <FolderPlus />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="New Canvas"
                        onClick={() => onCreateEntry("canvas")}
                      >
                        <LayoutDashboard />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Upload attachments"
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
                  onChange={(event) => onUpload(event.target.files)}
                />
                <SidebarGroupContent>
                  <FileTree
                    entries={entries}
                    active={active}
                    open={onOpen}
                    rename={onRename}
                    remove={onDelete}
                    move={onMove}
                    canManage={canWrite}
                  />
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
          {view === "files" && (
            <div className="flex items-center gap-1 border-t p-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="min-w-0 flex-1 justify-between gap-2 px-2">
                    <span className="truncate">{vault.name}</span>
                    <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-52">
                  {vaults.map((item) => (
                    <DropdownMenuItem key={item.id} onSelect={() => onSelectVault(item.id)}>
                      {item.name}
                      {item.id === vault.id ? " (Current)" : ""}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={onCreateVault}>
                    <Plus />
                    New Vault
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Vault settings"
                onClick={onVaultSettings}
              >
                <Settings2 />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Sidebar>
  );
}
