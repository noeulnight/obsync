import { Laptop, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { errorMessage } from "@/lib/error";
import {
  useAccount,
  useAccountSessions,
  useChangePassword,
  useDeleteAccount,
  useRevokeSession,
  useUpdateAccount,
} from "@/features/auth/queries/use-account";

export function AccountSettings({ enabled, onLogout }: { enabled: boolean; onLogout: () => void }) {
  const account = useAccount(enabled);
  const sessions = useAccountSessions(enabled);
  const updateAccount = useUpdateAccount();
  const changePassword = useChangePassword();
  const revokeSession = useRevokeSession();
  const deleteAccount = useDeleteAccount();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    if (!account.data) return;
    setDisplayName(account.data.displayName ?? "");
    setEmail(account.data.email);
  }, [account.data]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await updateAccount.mutateAsync({ displayName });
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    await updateAccount.mutateAsync({ email, currentPassword: emailPassword });
    setEmailPassword("");
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    await changePassword.mutateAsync({ currentPassword, newPassword });
    onLogout();
  }

  async function removeAccount() {
    await deleteAccount.mutateAsync(deletePassword);
    onLogout();
  }

  if (!account.data) {
    return <p className="text-sm text-muted-foreground">계정 정보를 불러오는 중…</p>;
  }

  const error =
    account.error ??
    sessions.error ??
    updateAccount.error ??
    changePassword.error ??
    revokeSession.error ??
    deleteAccount.error;

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">내 계정</h2>
      <p className="mt-1 text-sm text-muted-foreground">프로필과 보안 설정을 관리합니다.</p>

      <div className="mt-6 flex items-center gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground text-lg font-semibold text-background">
          {(account.data.displayName || account.data.email).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">
            {account.data.displayName || account.data.email}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{account.data.email}</div>
        </div>
      </div>

      <Separator className="my-6" />
      <SettingForm
        title="표시 이름"
        description="다른 기기의 실시간 커서에 표시할 이름입니다."
        onSubmit={saveProfile}
      >
        <Input
          aria-label="표시 이름"
          value={displayName}
          maxLength={100}
          placeholder="표시 이름"
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <Button variant="secondary" disabled={updateAccount.isPending}>
          저장
        </Button>
      </SettingForm>

      <Separator className="my-6" />
      <SettingForm
        title="이메일"
        description="이메일 변경에는 현재 비밀번호가 필요합니다."
        onSubmit={saveEmail}
      >
        <div className="grid flex-1 gap-2">
          <Input
            type="email"
            aria-label="계정 이메일"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            type="password"
            aria-label="이메일 변경 현재 비밀번호"
            placeholder="현재 비밀번호"
            value={emailPassword}
            onChange={(event) => setEmailPassword(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          disabled={
            updateAccount.isPending || email === account.data.email || emailPassword.length < 8
          }
        >
          변경
        </Button>
      </SettingForm>

      <Separator className="my-6" />
      <SettingForm
        title="비밀번호"
        description="변경하면 모든 기기에서 다시 로그인해야 합니다."
        onSubmit={savePassword}
      >
        <div className="grid flex-1 gap-2">
          <Input
            type="password"
            aria-label="현재 비밀번호"
            placeholder="현재 비밀번호"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            type="password"
            aria-label="새 비밀번호"
            placeholder="새 비밀번호 (8자 이상)"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          disabled={
            changePassword.isPending || currentPassword.length < 8 || newPassword.length < 8
          }
        >
          변경
        </Button>
      </SettingForm>

      <Separator className="my-6" />
      <div>
        <h3 className="font-medium">로그인된 기기</h3>
        <p className="mt-1 text-sm text-muted-foreground">활성 refresh session 목록입니다.</p>
        <div className="mt-3 grid gap-1">
          {sessions.data?.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
            >
              <Laptop className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{sessionName(session.userAgent)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(session.createdAt)} · {session.current ? "현재 세션" : "활성"}
                </div>
              </div>
              {!session.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revokeSession.isPending}
                  onClick={() => revokeSession.mutate(session.id)}
                >
                  로그아웃
                </Button>
              )}
            </div>
          ))}
          {sessions.data?.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">활성 session이 없습니다.</p>
          )}
        </div>
      </div>

      <Separator className="my-6" />
      <div className="pb-4">
        <h3 className="font-medium text-destructive">계정 삭제</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          모든 Vault, 문서 기록과 첨부파일이 영구 삭제됩니다.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="mt-3" variant="destructive">
              <Trash2 /> 계정 삭제
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>계정을 영구 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                이 작업은 되돌릴 수 없습니다. 계속하려면 현재 비밀번호를 입력하세요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              type="password"
              aria-label="계정 삭제 비밀번호"
              placeholder="현재 비밀번호"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deletePassword.length < 8 || deleteAccount.isPending}
                onClick={() => void removeAccount()}
              >
                영구 삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {error && <p className="pb-4 text-sm text-destructive">{errorMessage(error)}</p>}
    </section>
  );
}

function SettingForm({
  title,
  description,
  children,
  onSubmit,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={(event) => onSubmit(event)}>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 flex items-start gap-2">{children}</div>
    </form>
  );
}

function sessionName(userAgent: string | null) {
  if (!userAgent) return "알 수 없는 기기";
  if (/obsidian/i.test(userAgent)) return "Obsidian";
  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  if (/firefox/i.test(userAgent)) return "Firefox";
  return userAgent;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}
