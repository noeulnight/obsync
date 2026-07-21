import { Database, LogOut, Plus, Trash2, UserRound, Users } from "lucide-react";
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
import { errorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";
import { AccountSettings } from "./AccountSettings";
import { VaultMembers } from "@/features/vaults/components/VaultMembers";

export type SettingsSection = "account" | "vaults" | "members";

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
  const [newName, setNewName] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const vault = await createVault.mutateAsync(name);
    setNewName("");
    onSelect(vault.id);
  }

  async function remove(vault: Vault) {
    await deleteVault.mutateAsync(vault.id);
    if (selected === vault.id) onSelect(vaults.find((item) => item.id !== vault.id)?.id ?? "");
  }

  const error = createVault.error ?? updateVault.error ?? deleteVault.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(680px,calc(100svh-2rem))] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="grid min-h-0 grid-cols-[180px_minmax(0,1fr)] sm:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col bg-muted/40 px-2 py-4">
            <div className="px-2 pb-3 text-sm font-semibold">Settings</div>
            {section === "account" ? (
              <SettingsButton active icon={<UserRound />} onClick={() => undefined}>
                My account
              </SettingsButton>
            ) : (
              <>
                <SettingsButton
                  active={section === "vaults"}
                  icon={<Database />}
                  onClick={() => onSectionChange("vaults")}
                >
                  Vault
                </SettingsButton>
                <SettingsButton
                  active={section === "members"}
                  icon={<Users />}
                  onClick={() => onSectionChange("members")}
                >
                  Members
                </SettingsButton>
              </>
            )}
            {section === "account" && (
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
            ) : section === "vaults" ? (
              <section className="mx-auto max-w-xl">
                <h2 className="text-xl font-semibold">Manage Vaults</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create, rename, or delete your Vaults.
                </p>
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
                    <VaultRow
                      key={vault.id}
                      vault={vault}
                      selected={selected === vault.id}
                      pending={updateVault.isPending || deleteVault.isPending}
                      onSelect={() => onSelect(vault.id)}
                      onRename={(name) => updateVault.mutateAsync({ id: vault.id, name })}
                      onDelete={() => remove(vault)}
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
            {error && (
              <p className="mx-auto mt-6 max-w-xl text-sm text-destructive">
                {errorMessage(error)}
              </p>
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

function VaultRow({
  vault,
  selected,
  pending,
  onSelect,
  onRename,
  onDelete,
}: {
  vault: Vault;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
  onRename: (name: string) => Promise<Vault>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(vault.name);
  useEffect(() => setName(vault.name), [vault.name]);
  const changed = name.trim() !== vault.name && Boolean(name.trim());

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
      <button
        type="button"
        aria-label={`Open ${vault.name}`}
        className={cn(
          "size-2 shrink-0 rounded-full bg-muted-foreground/30",
          selected && "bg-emerald-500",
        )}
        onClick={onSelect}
      />
      {vault.role === "OWNER" ? (
        <Input
          aria-label={`${vault.name} name`}
          className="h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && changed) void onRename(name.trim());
            if (event.key === "Escape") setName(vault.name);
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate px-2 text-sm">{vault.name}</span>
      )}
      {vault.role === "OWNER" && changed && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => void onRename(name.trim())}
        >
          Save
        </Button>
      )}
      {!selected && (
        <Button size="sm" variant="ghost" onClick={onSelect}>
          Open
        </Button>
      )}
      {vault.role === "OWNER" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${vault.name}`}>
              <Trash2 />
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
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
