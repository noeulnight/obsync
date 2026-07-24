import { UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Collaborator = { clientId: number; name: string; color: string };

export function CollaboratorsMenu({
  userName,
  session,
}: {
  userName: string;
  session: {
    presence: () => Collaborator[];
    subscribePresence: (listener: () => void) => () => void;
    lastUpdatedAt?: () => number | undefined;
  };
}) {
  const [, render] = useState(0);
  useEffect(() => session.subscribePresence(() => render((value) => value + 1)), [session]);
  const others = session.presence();
  const updated = session.lastUpdatedAt?.();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Collaborators" className="gap-1.5 px-2">
          <UsersRound />
          <span className="text-xs">{others.length + 1}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Currently viewing</p>
        <Person name={`${userName} (You)`} color="var(--primary)" />
        {others.map((user) => (
          <Person key={user.clientId} name={user.name} color={user.color} />
        ))}
        <p className="mt-1 border-t px-2 pt-2 pb-1 text-xs text-muted-foreground">
          {updated ? `Last changed ${relativeTime(updated)}` : "No changes this session"}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Person({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
    </div>
  );
}

function relativeTime(value: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
