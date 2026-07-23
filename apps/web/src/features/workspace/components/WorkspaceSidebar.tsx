import {
  CircleUserRound,
  FilePlus2,
  FolderPlus,
  LayoutDashboard,
  Network,
  LogOut,
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { FileTree } from "@/features/documents/components/FileTree";
import type { FileEntry } from "@/features/documents/lib/files";
import type { Vault } from "@/features/vaults/types/vault";
import type { CreateEntryKind } from "./FileDialogs";

export function WorkspaceSidebar({
  vault,
  vaults,
  entries,
  active,
  canWrite,
  uploadInput,
  onSelectVault,
  onCreateVault,
  onSearch,
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
}: {
  vault: Vault;
  vaults: Vault[];
  entries: FileEntry[];
  active: string;
  canWrite: boolean;
  uploadInput: RefObject<HTMLInputElement | null>;
  onSelectVault: (id: string) => void;
  onCreateVault: () => void;
  onSearch: () => void;
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
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-2 py-2">
        <div className="flex gap-1">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <Select value={vault.id} onValueChange={onSelectVault}>
              <SelectTrigger
                className="w-full border-0 bg-transparent px-2 font-medium shadow-none hover:bg-sidebar-accent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-sidebar-accent"
                aria-label="Select Vault"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vaults.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.role === "VIEWER" ? " (Read only)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="icon" aria-label="New Vault" onClick={onCreateVault}>
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Vault settings"
            className="group-data-[collapsible=icon]:hidden"
            onClick={onVaultSettings}
          >
            <Settings2 />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Search" onClick={onSearch}>
                  <Search />
                  <span>Search</span>
                  <kbd className="ml-auto text-[10px] text-muted-foreground">⌘⇧F</kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Trash" isActive={trash}>
                  <Link to={`/vaults/${vault.id}/trash`}>
                    <Trash2 />
                    <span>Trash</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Graph" isActive={graph}>
                  <Link to={`/vaults/${vault.id}/graph`}>
                    <Network />
                    <span>Graph</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="justify-between pr-1">
            <span>Files</span>
            {canWrite && (
              <span className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="New document"
                  onClick={() => onCreateEntry("markdown")}
                >
                  <FilePlus2 />
                </Button>
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
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton aria-label="Account menu">
                  <CircleUserRound />
                  <span>Account</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width)"
              >
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
