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
import type { RefObject } from "react";
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
  status,
  canWrite,
  uploadInput,
  onSelectVault,
  onCreateVault,
  onOpen,
  onRename,
  onDelete,
  onCreateEntry,
  onUpload,
  onSettings,
  onLogout,
}: {
  vault: Vault;
  vaults: Vault[];
  entries: FileEntry[];
  active: string;
  status: string;
  canWrite: boolean;
  uploadInput: RefObject<HTMLInputElement | null>;
  onSelectVault: (id: string) => void;
  onCreateVault: () => void;
  onOpen: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onCreateEntry: (kind: CreateEntryKind) => void;
  onUpload: (files: FileList | null) => void;
  onSettings: () => void;
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
          <Button variant="ghost" size="icon" aria-label="새 Vault" onClick={onCreateVault}>
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
                  onClick={() => onCreateEntry("markdown")}
                >
                  <FilePlus2 />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="새 폴더"
                  onClick={() => onCreateEntry("folder")}
                >
                  <FolderPlus />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="새 Canvas"
                  onClick={() => onCreateEntry("canvas")}
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
            onChange={(event) => onUpload(event.target.files)}
          />
          <SidebarGroupContent>
            <FileTree
              entries={entries}
              active={active}
              open={onOpen}
              rename={onRename}
              remove={onDelete}
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
  );
}
