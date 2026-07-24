import { Check, Copy, Globe2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  usePublicShareStatus,
  usePublishFile,
  useUnpublishFile,
} from "../queries/use-public-share";

export function ShareButton({
  vaultId,
  fileId,
  trigger,
}: {
  vaultId: string;
  fileId: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const share = usePublicShareStatus(vaultId, fileId, open);
  const publish = usePublishFile(vaultId, fileId);
  const unpublish = useUnpublishFile(vaultId, fileId);
  const url = share.data ? `${location.origin}/s/${share.data.slug}` : "";

  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("Public link copied.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm">
            <Globe2 /> Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish to web</DialogTitle>
          <DialogDescription>
            Anyone with the link can view the latest version without signing in.
          </DialogDescription>
        </DialogHeader>
        {share.isPending ? (
          <p className="text-sm text-muted-foreground">Checking public access…</p>
        ) : share.data ? (
          <div className="grid gap-4">
            <div className="flex gap-2">
              <Input aria-label="Public link" value={url} readOnly />
              <Button variant="outline" onClick={() => void copy()}>
                <Copy /> Copy
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="size-4 text-emerald-500" /> Published
              </p>
              <Button
                variant="outline"
                disabled={unpublish.isPending}
                onClick={() => unpublish.mutate()}
              >
                Unpublish
              </Button>
            </div>
          </div>
        ) : (
          <Button disabled={publish.isPending || share.isError} onClick={() => publish.mutate()}>
            <Globe2 /> Publish
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
