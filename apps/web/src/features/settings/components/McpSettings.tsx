import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/error";
import { Separator } from "@/components/ui/separator";
import { useMcpApps, useMcpConfig, useRevokeMcpApp } from "../queries/use-mcp-config";

export function McpSettings({ enabled }: { enabled: boolean }) {
  const config = useMcpConfig(enabled);
  const apps = useMcpApps(enabled);
  const revoke = useRevokeMcpApp();
  const [copied, setCopied] = useState(false);

  if (config.isPending) return <p className="text-sm text-muted-foreground">Loading MCP…</p>;
  if (config.error) return <p className="text-sm text-destructive">{errorMessage(config.error)}</p>;
  if (!config.data) return null;

  async function copy() {
    await navigator.clipboard.writeText(config.data!.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="mx-auto max-w-xl">
      <h2 className="text-xl font-semibold">MCP</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect an OAuth-capable MCP client to your Vaults.
      </p>

      <div className="mt-6 grid gap-2">
        <label htmlFor="mcp-url" className="text-sm font-medium">
          Server URL
        </label>
        <div className="flex gap-2">
          <Input id="mcp-url" readOnly value={config.data.url} />
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-lg border p-4 text-sm">
        <p className="font-medium">How to connect</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
          <li>Add the server URL to your MCP client.</li>
          <li>Sign in to Obsync when the browser opens.</li>
          <li>Review the requested permissions and allow access.</li>
        </ol>
      </div>

      <Separator className="my-6" />
      <h3 className="font-medium">Connected apps</h3>
      <div className="mt-3 grid gap-2">
        {apps.data?.map((app) => (
          <div key={app.clientId} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{app.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {app.scopes.map(scopeLabel).join(" · ")}
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={revoke.isPending}>
                  Revoke
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke {app.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This app will immediately lose access to your Vaults.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => revoke.mutate(app.clientId)}>
                    Revoke
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
        {!apps.isPending && !apps.data?.length && (
          <p className="text-sm text-muted-foreground">No connected MCP apps.</p>
        )}
      </div>
    </section>
  );
}

function scopeLabel(scope: string) {
  if (scope === "vault:read") return "Read Vaults";
  if (scope === "vault:write") return "Edit Vaults";
  return scope;
}
