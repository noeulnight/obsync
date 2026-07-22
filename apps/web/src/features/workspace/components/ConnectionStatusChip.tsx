import { AlertTriangle, CloudOff, LoaderCircle } from "lucide-react";

export function ConnectionStatusChip({ status }: { status: string }) {
  if (status === "Offline") return <Chip icon={<CloudOff />}>Offline</Chip>;
  if (status === "Authentication failed" || status === "Error") {
    return <Chip icon={<AlertTriangle />}>Connection error</Chip>;
  }
  if (status === "Connecting" || status === "Synchronizing") {
    return <Chip icon={<LoaderCircle className="animate-spin" />}>{status}</Chip>;
  }
  return null;
}

function Chip({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 left-1/2 z-30 flex h-6 -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 px-2.5 text-xs text-muted-foreground shadow-sm backdrop-blur"
    >
      <span className="[&_svg]:size-3.5">{icon}</span>
      {children}
    </div>
  );
}
