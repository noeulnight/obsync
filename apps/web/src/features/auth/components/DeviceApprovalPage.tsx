import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount } from "@/features/auth/queries/use-account";
import { errorMessage } from "@/lib/error";
import { api } from "@/lib/api/client";
import { CredentialsPage } from "./CredentialsPage";
import { useApproveDevice, useOidcConfig, useSession } from "../queries/use-session";

export function DeviceApprovalPage() {
  const [search] = useSearchParams();
  const userCode = search.get("user_code") ?? "";
  const { session, authenticate } = useSession();
  const oidc = useOidcConfig();
  const account = useAccount(session.data === true);
  const approval = useApproveDevice(userCode);

  if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(userCode)) {
    return (
      <main className="grid min-h-svh place-items-center p-4 text-sm text-destructive">
        No valid device code was provided.
      </main>
    );
  }
  if (approval.isSuccess) {
    return (
      <main className="grid min-h-svh place-items-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Device approved</CardTitle>
            <CardDescription>Close this window and return to Obsidian.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }
  if (session.isPending) {
    return <main className="grid min-h-svh place-items-center">Checking your session…</main>;
  }
  if (!session.data) {
    return (
      <CredentialsPage
        title="Approve device"
        description={`Obsidian device code ${userCode}`}
        error={errorMessage(authenticate.error)}
        onSubmit={(credentials) => authenticate.mutateAsync(credentials)}
        oidcEnabled={oidc.data?.enabled}
        registrationEnabled={oidc.data?.registrationEnabled ?? false}
        onOidc={() => window.location.assign(api.oidcUrl(location.pathname + location.search))}
      />
    );
  }
  if (account.isPending) {
    return <main className="grid min-h-svh place-items-center">Loading account…</main>;
  }
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>Approve device</CardTitle>
          <CardDescription>Obsidian device code {userCode}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Connect using {account.data?.displayName || account.data?.email}.
          </p>
          <Button disabled={approval.isPending} onClick={() => approval.mutate()}>
            Approve this device
          </Button>
          {approval.error && (
            <p className="text-sm text-destructive">{errorMessage(approval.error)}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
