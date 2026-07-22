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
    return <p className="text-sm text-muted-foreground">Loading account…</p>;
  }

  const error = account.error ?? sessions.error;

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">My account</h2>
      <p className="mt-1 text-sm text-muted-foreground">Manage your profile and security.</p>

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
        title="Display name"
        description="Shown next to your live cursor on other devices."
        onSubmit={saveProfile}
      >
        <Input
          aria-label="Display name"
          value={displayName}
          maxLength={100}
          placeholder="Display name"
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <Button variant="secondary" disabled={updateAccount.isPending}>
          Save
        </Button>
      </SettingForm>

      {account.data.canManageCredentials ? (
        <>
          <Separator className="my-6" />
          <SettingForm
            title="Email"
            description="Your current password is required to change your email."
            onSubmit={saveEmail}
          >
            <div className="grid flex-1 gap-2">
              <Input
                type="email"
                aria-label="Account email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                type="password"
                aria-label="Current password for email change"
                placeholder="Current password"
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
              Change
            </Button>
          </SettingForm>

          <Separator className="my-6" />
          <SettingForm
            title="Password"
            description="Changing it signs you out on every device."
            onSubmit={savePassword}
          >
            <div className="grid flex-1 gap-2">
              <Input
                type="password"
                aria-label="Current password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <Input
                type="password"
                aria-label="New password"
                placeholder="New password (8+ characters)"
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
              Change
            </Button>
          </SettingForm>
        </>
      ) : (
        <>
          <Separator className="my-6" />
          <div>
            <h3 className="font-medium">Single sign-on</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your email and sign-in method are managed by your identity provider.
            </p>
          </div>
        </>
      )}

      <Separator className="my-6" />
      <div>
        <h3 className="font-medium">Signed-in devices</h3>
        <p className="mt-1 text-sm text-muted-foreground">Active refresh sessions.</p>
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
                  {formatDate(session.createdAt)} · {session.current ? "Current session" : "Active"}
                </div>
              </div>
              {!session.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revokeSession.isPending}
                  onClick={() => revokeSession.mutate(session.id)}
                >
                  Sign out
                </Button>
              )}
            </div>
          ))}
          {sessions.data?.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">No active sessions.</p>
          )}
        </div>
      </div>

      {account.data.canManageCredentials && <Separator className="my-6" />}
      {account.data.canManageCredentials && (
        <div className="pb-4">
          <h3 className="font-medium text-destructive">Delete account</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanently delete every Vault, document history, and attachment.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="mt-3" variant="destructive">
                <Trash2 /> Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Enter your current password to continue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                type="password"
                aria-label="Password for account deletion"
                placeholder="Current password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deletePassword.length < 8 || deleteAccount.isPending}
                  onClick={() => void removeAccount()}
                >
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

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
  if (!userAgent) return "Unknown device";
  if (/obsidian/i.test(userAgent)) return "Obsidian";
  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  if (/firefox/i.test(userAgent)) return "Firefox";
  return userAgent;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}
