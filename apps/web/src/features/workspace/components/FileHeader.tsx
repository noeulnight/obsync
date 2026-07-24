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
  leading,
  actions,
  menuActions,
  mobileActions,
  onRename,
  onDelete,
}: {
  vaultName: string;
  path: string;
  title?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  menuActions?: ReactNode;
  mobileActions?: ReactNode;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const name = title ?? displayName(path);
  const parts = [vaultName, ...path.split("/").slice(0, -1), name];
  return (
    <header className="grid h-10 shrink-0 grid-cols-[1fr_auto] items-center px-3">
      <nav className="flex min-w-0 items-center justify-self-start" aria-label="Document path">
        {leading}
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
      {(actions || menuActions || mobileActions || (onRename && onDelete)) && (
        <div className="flex items-center justify-self-end gap-1">
          {actions}
          {(menuActions || mobileActions || (onRename && onDelete)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="File menu">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menuActions}
                {menuActions && (mobileActions || (onRename && onDelete)) && (
                  <div className="mx-1 my-1 h-px bg-border" />
                )}
                {mobileActions && <div className="sm:hidden">{mobileActions}</div>}
                {mobileActions && onRename && onDelete && (
                  <div className="mx-1 my-1 h-px bg-border sm:hidden" />
                )}
                {onRename && onDelete && (
                  <>
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
                  </>
                )}
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
