import {
  Bot,
  Database,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  useCreateVault,
  useDeleteVault,
  useUpdateVault,
} from "@/features/vaults/queries/use-vaults";
import type { Vault } from "@/features/vaults/types/vault";
import { cn } from "@/lib/utils";
import { AccountSettings } from "./AccountSettings";
import { McpSettings } from "./McpSettings";
import { VaultMembers } from "@/features/vaults/components/VaultMembers";
import {
  useRebuildVaultGraph,
  useResetVault,
} from "@/features/vaults/queries/use-vault-maintenance";

export type SettingsSection = "account" | "mcp" | "vault" | "vaults" | "members";

export function SettingsDialog({
  open,
  section,
  vaults,
  selected,
  onOpenChange,
  onSectionChange,
  onSelect,
  onLogout,
}: {
  open: boolean;
  section: SettingsSection;
  vaults: Vault[];
  selected: string;
  onOpenChange: (open: boolean) => void;
  onSectionChange: (section: SettingsSection) => void;
  onSelect: (id: string) => void;
  onLogout: () => void;
}) {
  const createVault = useCreateVault();
  const updateVault = useUpdateVault();
  const deleteVault = useDeleteVault();
  const rebuildGraph = useRebuildVaultGraph();
  const resetVault = useResetVault();
  const [newName, setNewName] = useState("");
  const accountSection = section === "account" || section === "mcp";
  const vault = vaults.find((item) => item.id === selected);
  const pending =
    updateVault.isPending ||
    deleteVault.isPending ||
    rebuildGraph.isPending ||
    resetVault.isPending;

  async function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const vault = await createVault.mutateAsync(name);
    setNewName("");
    onSelect(vault.id);
    onSectionChange("vault");
  }

  async function remove(vault: Vault) {
    await deleteVault.mutateAsync(vault.id);
    if (selected === vault.id) onSelect(vaults.find((item) => item.id !== vault.id)?.id ?? "");
    onSectionChange("vaults");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(680px,calc(100svh-2rem))] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="grid min-h-0 grid-cols-[180px_minmax(0,1fr)] sm:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col bg-muted/40 px-2 py-4">
            <div className="px-2 pb-3 text-sm font-semibold">Settings</div>
            {accountSection ? (
              <>
                <SettingsButton
                  active={section === "account"}
                  icon={<UserRound />}
                  onClick={() => onSectionChange("account")}
                >
                  My account
                </SettingsButton>
                <SettingsButton
                  active={section === "mcp"}
                  icon={<Bot />}
                  onClick={() => onSectionChange("mcp")}
                >
                  MCP
                </SettingsButton>
              </>
            ) : (
              <>
                {vault && (
                  <>
                    <div className="truncate px-2 pb-2 text-xs font-medium text-muted-foreground">
                      {vault.name}
                    </div>
                    <SettingsButton
                      active={section === "vault"}
                      icon={<Settings2 />}
                      onClick={() => onSectionChange("vault")}
                    >
                      General
                    </SettingsButton>
                    <SettingsButton
                      active={section === "members"}
                      icon={<Users />}
                      onClick={() => onSectionChange("members")}
                    >
                      Members
                    </SettingsButton>
                    <Separator className="my-2" />
                  </>
                )}
                <SettingsButton
                  active={section === "vaults"}
                  icon={<Database />}
                  onClick={() => onSectionChange("vaults")}
                >
                  All Vaults
                </SettingsButton>
              </>
            )}
            {accountSection && (
              <div className="mt-auto">
                <Separator className="mb-2" />
                <SettingsButton icon={<LogOut />} onClick={onLogout}>
                  Sign out
                </SettingsButton>
              </div>
            )}
          </aside>

          <main className="min-h-0 overflow-y-auto px-6 py-8 sm:px-10">
            {section === "account" ? (
              <AccountSettings enabled={open} onLogout={onLogout} />
            ) : section === "mcp" ? (
              <McpSettings enabled={open} />
            ) : section === "vault" && vault ? (
              <VaultSettings
                vault={vault}
                pending={pending}
                onRename={(name) => updateVault.mutateAsync({ id: vault.id, name })}
                onRebuild={() => rebuildGraph.mutateAsync(vault.id).then(() => undefined)}
                onReset={() => resetVault.mutateAsync(vault.id).then(() => undefined)}
                onDelete={() => remove(vault)}
              />
            ) : section === "vaults" ? (
              <section className="mx-auto max-w-xl">
                <h2 className="text-xl font-semibold">All Vaults</h2>
                <p className="mt-1 text-sm text-muted-foreground">Create or open a Vault.</p>
                <form className="mt-6 flex gap-2" onSubmit={(event) => void create(event)}>
                  <Input
                    aria-label="New Vault name"
                    placeholder="New Vault name"
                    value={newName}
                    maxLength={100}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <Button disabled={!newName.trim() || createVault.isPending}>
                    <Plus /> Create
                  </Button>
                </form>
                <Separator className="my-6" />
                <div className="grid gap-1">
                  {vaults.map((vault) => (
                    <VaultListRow
                      key={vault.id}
                      vault={vault}
                      selected={selected === vault.id}
                      onSelect={() => {
                        onSelect(vault.id);
                        onSectionChange("vault");
                      }}
                    />
                  ))}
                  {vaults.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">No Vaults yet.</p>
                  )}
                </div>
              </section>
            ) : (
              <VaultMembers
                enabled={open && section === "members"}
                vault={vaults.find((vault) => vault.id === selected)}
              />
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsButton({
  active = false,
  icon,
  children,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4",
        active && "bg-muted font-medium text-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

function VaultListRow({
  vault,
  selected,
  onSelect,
}: {
  vault: Vault;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
      onClick={onSelect}
    >
      <Database className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{vault.name}</span>
      <span className="text-xs text-muted-foreground">
        {selected ? "Current" : vault.role === "OWNER" ? "Owner" : vault.role}
      </span>
    </button>
  );
}

function VaultSettings({
  vault,
  pending,
  onRename,
  onDelete,
  onRebuild,
  onReset,
}: {
  vault: Vault;
  pending: boolean;
  onRename: (name: string) => Promise<Vault>;
  onDelete: () => Promise<void>;
  onRebuild: () => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [name, setName] = useState(vault.name);
  useEffect(() => setName(vault.name), [vault.name]);
  const changed = Boolean(name.trim()) && name.trim() !== vault.name;

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">{vault.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Vault settings and maintenance.</p>

      <div className="mt-8 grid gap-2">
        <label htmlFor="vault-name" className="text-sm font-medium">
          Name
        </label>
        <div className="flex gap-2">
          <Input
            id="vault-name"
            aria-label={`${vault.name} name`}
            value={name}
            maxLength={100}
            disabled={vault.role !== "OWNER"}
            onChange={(event) => setName(event.target.value)}
          />
          {vault.role === "OWNER" && (
            <Button disabled={!changed || pending} onClick={() => void onRename(name.trim())}>
              Save
            </Button>
          )}
        </div>
      </div>

      {vault.role === "OWNER" && (
        <>
          <Separator className="my-8" />
          <h3 className="font-medium">Maintenance</h3>
          <div className="mt-3 flex items-center justify-between gap-6 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Graph index</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Rebuild links from current documents and Canvases.
              </p>
            </div>
            <Button variant="outline" disabled={pending} onClick={() => void onRebuild()}>
              <RefreshCw /> Rebuild
            </Button>
          </div>
          <Separator className="my-8" />
          <h3 className="font-medium text-destructive">Danger zone</h3>
          <div className="mt-3 divide-y rounded-lg border border-destructive/40">
            <div className="flex items-center justify-between gap-6 p-4">
              <div>
                <p className="text-sm font-medium">Reset Vault</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Remove every current file while keeping the Vault and members.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={pending}>
                    <RotateCcw /> Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset the “{vault.name}” Vault?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every current file will be removed from all connected devices. The Vault and
                      its members will remain. This cannot be undone from the file tree.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void onReset()}>
                      Reset Vault
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="flex items-center justify-between gap-6 p-4">
              <div>
                <p className="text-sm font-medium">Delete Vault</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permanently delete the Vault, history, members, and attachments.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={pending}>
                    <Trash2 /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete the “{vault.name}” Vault?</AlertDialogTitle>
                    <AlertDialogDescription>
                      All document history and attachments will be deleted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
                      Delete Vault
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
