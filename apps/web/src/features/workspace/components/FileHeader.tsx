import { ChevronRight, Ellipsis, Pencil, Trash2 } from "lucide-react";
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
  onRename,
  onDelete,
}: {
  vaultName: string;
  path: string;
  title?: string;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const name = title ?? displayName(path);
  const parts = [vaultName, ...path.split("/").slice(0, -1), name];
  return (
    <header className="grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
      <nav className="min-w-0 justify-self-start" aria-label="문서 경로">
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
      <div className="max-w-[40vw] truncate text-[13px] text-foreground">{name}</div>
      {onRename && onDelete && (
        <div className="justify-self-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="파일 메뉴">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => window.setTimeout(onRename)}>
                <Pencil />
                이름 변경
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={() => window.setTimeout(onDelete)}
              >
                <Trash2 />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </header>
  );
}

function displayName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.(?:md|canvas)$/i, "");
}
