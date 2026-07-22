import { Check, Mail, Trash2, UserPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  useAnswerInvitation,
  useCancelVaultInvitation,
  useInviteToVault,
  usePendingInvitations,
  useRemoveVaultMember,
  useUpdateVaultMember,
  useVaultInvitations,
  useVaultMembers,
} from "../queries/use-vault-members";
import type { Vault } from "../types/vault";
import type { VaultRole } from "@/lib/api/client";
import { errorMessage } from "@/lib/error";

export function VaultMembers({ vault, enabled }: { vault?: Vault; enabled: boolean }) {
  const vaultId = vault?.id ?? "";
  const owner = vault?.role === "OWNER";
  const members = useVaultMembers(vaultId, enabled && Boolean(vault));
  const invitations = useVaultInvitations(vaultId, enabled && owner);
  const pending = usePendingInvitations(enabled);
  const invite = useInviteToVault(vaultId);
  const update = useUpdateVaultMember(vaultId);
  const remove = useRemoveVaultMember(vaultId);
  const cancel = useCancelVaultInvitation(vaultId);
  const answer = useAnswerInvitation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<VaultRole>("EDITOR");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    await invite.mutateAsync({ email: email.trim(), role });
    setEmail("");
  }

  const error = members.error ?? invitations.error ?? pending.error;

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">Members and invitations</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage Vault access and review your invitations.
      </p>

      {pending.data?.length ? (
        <div className="mt-6 grid gap-2">
          <h3 className="text-sm font-medium">Invitations</h3>
          {pending.data.map((invitation) => (
            <div key={invitation.id} className="flex items-center gap-3 rounded-lg border p-3">
              <Mail className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invitation.vault.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {invitation.invitedBy.displayName || invitation.invitedBy.email} ·{" "}
                  {roleLabel(invitation.role)}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Decline invitation to ${invitation.vault.name}`}
                onClick={() => answer.mutate({ id: invitation.id, accept: false })}
              >
                <X />
              </Button>
              <Button size="sm" onClick={() => answer.mutate({ id: invitation.id, accept: true })}>
                <Check /> Accept
              </Button>
            </div>
          ))}
          <Separator className="my-4" />
        </div>
      ) : null}

      {!vault ? (
        <p className="mt-8 text-sm text-muted-foreground">Select a Vault to manage.</p>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-sm font-medium">{vault.name}</h3>
            <RolePill role={vault.role} />
          </div>
          {owner && (
            <form className="mt-3 flex gap-2" onSubmit={(event) => void submit(event)}>
              <Input
                type="email"
                aria-label="Invitation email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <RoleSelect value={role} onChange={setRole} />
              <Button disabled={!email.trim() || invite.isPending}>
                <UserPlus /> Invite
              </Button>
            </form>
          )}
          <Separator className="my-5" />
          <div className="grid gap-1">
            {members.data?.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.displayName || member.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                {owner && member.role !== "OWNER" ? (
                  <>
                    <RoleSelect
                      value={member.role}
                      onChange={(next) => update.mutate({ userId: member.id, role: next })}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${member.email}`}
                      onClick={() => remove.mutate(member.id)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : (
                  <RolePill role={member.role} />
                )}
              </div>
            ))}
          </div>
          {owner && invitations.data?.length ? (
            <>
              <Separator className="my-5" />
              <h3 className="mb-2 text-sm font-medium">Pending invitations</h3>
              <div className="grid gap-1">
                {invitations.data.map((invitation) => (
                  <div key={invitation.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{invitation.email}</span>
                    <RolePill role={invitation.role} />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Cancel invitation for ${invitation.email}`}
                      onClick={() => cancel.mutate(invitation.id)}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
      {error && <p className="mt-5 text-sm text-destructive">{errorMessage(error)}</p>}
    </section>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: VaultRole;
  onChange: (role: VaultRole) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as VaultRole)}>
      <SelectTrigger className="w-24" aria-label="Vault role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="EDITOR">Editor</SelectItem>
        <SelectItem value="VIEWER">Viewer</SelectItem>
      </SelectContent>
    </Select>
  );
}

function RolePill({ role }: { role: "OWNER" | VaultRole }) {
  return (
    <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      {roleLabel(role)}
    </span>
  );
}

function roleLabel(role: "OWNER" | VaultRole) {
  if (role === "OWNER") return "Owner";
  return role === "EDITOR" ? "Editor" : "Viewer";
}
