import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { VaultDiagnostics } from "@/features/documents/lib/sync";

export function SyncDiagnosticsSheet({
  open,
  close,
  status,
  diagnostics,
  rebuild,
}: {
  open: boolean;
  close: () => void;
  status: string;
  diagnostics?: VaultDiagnostics;
  rebuild: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(value) => !value && close()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sync diagnostics</SheetTitle>
          <SheetDescription>Connection and local synchronization status.</SheetDescription>
        </SheetHeader>
        <dl className="grid gap-4 px-5">
          <Status label="Connection" value={status} />
          <Status label="Manifest" value={diagnostics?.manifestReady ? "Ready" : "Loading"} />
          <Status label="Queued changes" value={String(diagnostics?.pendingOperations ?? 0)} />
          <Status
            label="Last synchronized"
            value={
              diagnostics?.lastSyncedAt
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "medium",
                  }).format(diagnostics.lastSyncedAt)
                : "Not synchronized yet"
            }
          />
        </dl>
        <div className="mt-auto border-t p-5">
          <Button
            variant="outline"
            disabled={status !== "Synced"}
            onClick={() => setConfirming(true)}
          >
            Rebuild local data from server
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Clears this browser’s local Vault cache and reloads the latest server data.
          </p>
        </div>
      </SheetContent>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rebuild local Vault data?</AlertDialogTitle>
            <AlertDialogDescription>
              Local cached data and queued changes will be removed, then the page will reload from
              the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rebuild}>Rebuild</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
