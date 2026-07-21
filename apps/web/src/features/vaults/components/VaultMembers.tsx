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

  const error =
    members.error ??
    invitations.error ??
    pending.error ??
    invite.error ??
    update.error ??
    remove.error ??
    cancel.error ??
    answer.error;

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">멤버 및 초대</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Vault별 편집 권한을 관리하고 받은 초대를 확인합니다.
      </p>

      {pending.data?.length ? (
        <div className="mt-6 grid gap-2">
          <h3 className="text-sm font-medium">받은 초대</h3>
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
                aria-label={`${invitation.vault.name} 초대 거절`}
                onClick={() => answer.mutate({ id: invitation.id, accept: false })}
              >
                <X />
              </Button>
              <Button size="sm" onClick={() => answer.mutate({ id: invitation.id, accept: true })}>
                <Check /> 수락
              </Button>
            </div>
          ))}
          <Separator className="my-4" />
        </div>
      ) : null}

      {!vault ? (
        <p className="mt-8 text-sm text-muted-foreground">관리할 Vault를 먼저 선택하세요.</p>
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
                aria-label="초대 이메일"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <RoleSelect value={role} onChange={setRole} />
              <Button disabled={!email.trim() || invite.isPending}>
                <UserPlus /> 초대
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
                      aria-label={`${member.email} 내보내기`}
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
              <h3 className="mb-2 text-sm font-medium">대기 중인 초대</h3>
              <div className="grid gap-1">
                {invitations.data.map((invitation) => (
                  <div key={invitation.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{invitation.email}</span>
                    <RolePill role={invitation.role} />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`${invitation.email} 초대 취소`}
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
      {error && <p className="mt-5 text-sm text-destructive">{message(error)}</p>}
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
      <SelectTrigger className="w-24" aria-label="Vault 역할">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="EDITOR">편집자</SelectItem>
        <SelectItem value="VIEWER">뷰어</SelectItem>
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
  if (role === "OWNER") return "소유자";
  return role === "EDITOR" ? "편집자" : "뷰어";
}

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
