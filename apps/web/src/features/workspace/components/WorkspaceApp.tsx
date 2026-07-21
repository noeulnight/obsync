import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialsPage } from "@/features/auth/components/CredentialsPage";
import { useAccount } from "@/features/auth/queries/use-account";
import { useSession } from "@/features/auth/queries/use-session";
import {
  SettingsDialog,
  type SettingsSection,
} from "@/features/settings/components/SettingsDialog";
import { useVaults } from "@/features/vaults/queries/use-vaults";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/error";

const Workspace = lazy(() =>
  import("./Workspace").then((module) => ({ default: module.Workspace })),
);

export function WorkspaceApp() {
  const { session, authenticate, logout } = useSession();
  const account = useAccount(session.data === true);
  const vaults = useVaults(session.data === true);
  const navigate = useNavigate();
  const { vaultId: routeVaultId } = useParams<{ vaultId: string }>();
  const [selected, setSelected] = useState(
    () => routeVaultId ?? globalThis.localStorage?.getItem("obsync.vaultId") ?? "",
  );
  const [settings, setSettings] = useState<SettingsSection>();

  useEffect(() => {
    if (!vaults.data?.length) return;
    const vaultId = vaults.data.some((vault) => vault.id === selected)
      ? selected
      : vaults.data[0].id;
    setSelected(vaultId);
    localStorage.setItem("obsync.vaultId", vaultId);
  }, [selected, vaults.data]);

  useEffect(() => {
    if (routeVaultId) setSelected(routeVaultId);
  }, [routeVaultId]);

  function select(id: string) {
    if (id) localStorage.setItem("obsync.vaultId", id);
    else localStorage.removeItem("obsync.vaultId");
    setSelected(id);
    if (id) void navigate(`/vaults/${id}`);
  }

  async function signOut() {
    await logout.mutateAsync();
    localStorage.removeItem("obsync.vaultId");
    setSelected("");
    void navigate("/", { replace: true });
  }

  if (session.isPending) {
    return <main className="grid min-h-svh place-items-center">연결 확인 중…</main>;
  }
  if (!session.data) {
    return (
      <CredentialsPage
        title="Obsync"
        description="계정으로 로그인해 Vault를 편집하세요."
        error={errorMessage(authenticate.error)}
        onSubmit={(credentials) => authenticate.mutateAsync(credentials)}
      />
    );
  }
  if (vaults.isPending || account.isPending) {
    return <main className="grid min-h-svh place-items-center">Vault 불러오는 중…</main>;
  }

  const vault = vaults.data?.find((item) => item.id === selected);
  if (!vault) {
    return (
      <>
        <main className="grid min-h-svh place-items-center p-4">
          <Card className="w-full max-w-sm text-center">
            <CardHeader>
              <CardTitle>Vault가 없습니다</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => setSettings("vaults")}>첫 Vault 만들기</Button>
              <Button variant="ghost" onClick={() => void signOut()}>
                로그아웃
              </Button>
              {vaults.error && (
                <p className="text-sm text-destructive">{errorMessage(vaults.error)}</p>
              )}
            </CardContent>
          </Card>
        </main>
        <SettingsDialog
          open={Boolean(settings)}
          section={settings ?? "vaults"}
          vaults={vaults.data ?? []}
          selected={selected}
          onOpenChange={(open) => !open && setSettings(undefined)}
          onSectionChange={setSettings}
          onSelect={select}
          onLogout={() => void signOut()}
        />
      </>
    );
  }

  return (
    <>
      <Suspense
        fallback={<main className="grid min-h-svh place-items-center">편집기 불러오는 중…</main>}
      >
        <Workspace
          api={api}
          vault={vault}
          vaults={vaults.data ?? []}
          userName={account.data?.displayName || account.data?.email || "Web"}
          onSelect={select}
          onCreate={() => setSettings("vaults")}
          onSettings={() => setSettings("account")}
          onLogout={() => void signOut()}
        />
      </Suspense>
      <SettingsDialog
        open={Boolean(settings)}
        section={settings ?? "account"}
        vaults={vaults.data ?? []}
        selected={selected}
        onOpenChange={(open) => !open && setSettings(undefined)}
        onSectionChange={setSettings}
        onSelect={select}
        onLogout={() => void signOut()}
      />
    </>
  );
}
