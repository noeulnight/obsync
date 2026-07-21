import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/error";
import { useAccount } from "../queries/use-account";
import { useMcpAuthorization, useMcpAuthorizationDecision } from "../queries/use-mcp-authorization";
import { useOidcConfig, useSession } from "../queries/use-session";
import { CredentialsPage } from "./CredentialsPage";

export function McpAuthorizationPage() {
  const [search] = useSearchParams();
  const requestId = search.get("request_id") ?? "";
  const { session, authenticate } = useSession();
  const oidc = useOidcConfig();
  const account = useAccount(session.data === true);
  const authorization = useMcpAuthorization(requestId);
  const decision = useMcpAuthorizationDecision(requestId);

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
  ) {
    return <Message>Invalid authorization request.</Message>;
  }
  if (session.isPending || authorization.isPending) {
    return <Message>Loading authorization…</Message>;
  }
  if (authorization.error) {
    return <Message>{errorMessage(authorization.error)}</Message>;
  }
  if (!session.data) {
    return (
      <CredentialsPage
        title="Connect MCP client"
        description={authorization.data?.clientName ?? "MCP client"}
        error={errorMessage(authenticate.error)}
        onSubmit={(credentials) => authenticate.mutateAsync(credentials)}
        oidcEnabled={oidc.data?.enabled}
        registrationEnabled={oidc.data?.registrationEnabled ?? false}
        onOidc={() => window.location.assign(api.oidcUrl(location.pathname + location.search))}
      />
    );
  }
  if (account.isPending) {
    return <Message>Loading account…</Message>;
  }

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Connect {authorization.data?.clientName}</CardTitle>
          <CardDescription>
            This client will access Obsync as {account.data?.displayName || account.data?.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-2 text-sm text-muted-foreground">
            {authorization.data?.scopes.includes("vault:read") && <li>Read and search Vaults</li>}
            {authorization.data?.scopes.includes("vault:write") && <li>Create and edit notes</li>}
          </ul>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={decision.isPending}
              onClick={() => decision.mutate("deny")}
            >
              Cancel
            </Button>
            <Button disabled={decision.isPending} onClick={() => decision.mutate("approve")}>
              Allow
            </Button>
          </div>
          {decision.error && (
            <p className="text-sm text-destructive">{errorMessage(decision.error)}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-svh place-items-center p-4 text-sm">{children}</main>;
}
