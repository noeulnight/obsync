import { Network } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetResizeHandle,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ApiClient } from "@/lib/api/client";
import { errorMessage } from "@/lib/error";
import { useVaultGraph } from "../queries/use-vault-graph";
import { ForceGraph, localGraph } from "./VaultGraphView";

export function LocalGraphSheet({
  api,
  vaultId,
  fileId,
  openDocument,
}: {
  api: ApiClient;
  vaultId: string;
  fileId: string;
  openDocument: (fileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(() => Math.min(960, window.innerWidth - 24));
  const graph = useVaultGraph(api, vaultId, open);
  const data = graph.data ? localGraph(graph.data, fileId) : undefined;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Local graph">
          <Network />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-full max-w-[calc(100vw-24px)] gap-0 overflow-hidden p-0 sm:max-w-none"
        style={{ width, maxWidth: "min(960px, calc(100vw - 24px))" }}
      >
        <SheetResizeHandle
          label="Resize local graph"
          width={width}
          onWidthChange={setWidth}
          minWidth={480}
          maxWidth={960}
        />
        <SheetHeader>
          <SheetTitle>Local graph</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          {graph.isPending ? (
            <Message>Loading graph…</Message>
          ) : graph.error ? (
            <Message>{errorMessage(graph.error)}</Message>
          ) : data?.edges.length ? (
            <ForceGraph
              data={data}
              vaultId={vaultId}
              initialFit
              open={(node) => {
                if (node.exists) openDocument(node.id);
                setOpen(false);
              }}
            />
          ) : (
            <Message>No linked documents yet.</Message>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Message({ children }: { children: string }) {
  return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
