import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CredentialsPage } from "@/features/auth/components/CredentialsPage";
import { useAccount } from "@/features/auth/queries/use-account";
import { useOidcConfig, useSession } from "@/features/auth/queries/use-session";
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
  const oidc = useOidcConfig();
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
    return <main className="grid min-h-svh place-items-center">Checking connection…</main>;
  }
  if (!session.data) {
    return (
      <CredentialsPage
        title="Obsync"
        description="Sign in to edit your Vaults."
        error={errorMessage(authenticate.error)}
        onSubmit={(credentials) => authenticate.mutateAsync(credentials)}
        oidcEnabled={oidc.data?.enabled}
        registrationEnabled={oidc.data?.registrationEnabled ?? false}
        onOidc={() => window.location.assign(api.oidcUrl(location.pathname + location.search))}
      />
    );
  }
  if (vaults.isPending || account.isPending) {
    return <main className="grid min-h-svh place-items-center">Loading Vaults…</main>;
  }

  const vault = vaults.data?.find((item) => item.id === selected);
  if (!vault) {
    return (
      <>
        <main className="grid min-h-svh place-items-center p-4">
          <Card className="w-full max-w-sm text-center">
            <CardHeader>
              <CardTitle>No Vaults</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button onClick={() => setSettings("vaults")}>Create your first Vault</Button>
              <Button variant="outline" onClick={() => setSettings("members")}>
                Review invitations
              </Button>
              <Button variant="ghost" onClick={() => void signOut()}>
                Sign out
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
        fallback={<main className="grid min-h-svh place-items-center">Loading editor…</main>}
      >
        <Workspace
          api={api}
          vault={vault}
          vaults={vaults.data ?? []}
          userName={account.data?.displayName || account.data?.email || "Web"}
          onSelect={select}
          onCreate={() => setSettings("vaults")}
          onSettings={() => setSettings("account")}
          onVaultSettings={() => setSettings("vault")}
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
