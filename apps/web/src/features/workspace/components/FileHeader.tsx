import { ChevronRight, Ellipsis, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function FileHeader({
  vaultName,
  path,
  title,
  actions,
  onRename,
  onDelete,
}: {
  vaultName: string;
  path: string;
  title?: string;
  actions?: ReactNode;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const name = title ?? displayName(path);
  const parts = [vaultName, ...path.split("/").slice(0, -1), name];
  return (
    <header className="grid h-10 shrink-0 grid-cols-[1fr_auto] items-center px-3">
      <nav className="min-w-0 justify-self-start" aria-label="Document path">
        <ol className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
          {parts.map((part, index) => (
            <li key={`${index}-${part}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-50" />}
              <span
                className={index === parts.length - 1 ? "hidden truncate sm:inline" : "truncate"}
                aria-current={index === parts.length - 1 ? "page" : undefined}
              >
                {part}
              </span>
            </li>
          ))}
        </ol>
      </nav>
      {(actions || (onRename && onDelete)) && (
        <div className="flex items-center justify-self-end gap-1">
          {actions}
          {onRename && onDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="File menu">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => window.setTimeout(onRename)}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onSelect={() => window.setTimeout(onDelete)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </header>
  );
}

function displayName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.(?:md|canvas)$/i, "");
}
