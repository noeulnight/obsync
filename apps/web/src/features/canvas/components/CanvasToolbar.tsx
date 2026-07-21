import {
  CircleHelp,
  FileText,
  Focus,
  Grid2X2,
  Image,
  Minus,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  SquarePen,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileEntry } from "@/features/documents/lib/files";
import type { CanvasNode, WebCanvas } from "../lib/sync";
import { canvasColor } from "./CanvasNode";

const nodeColors = [
  { value: undefined, label: "기본" },
  { value: "1", label: "빨강" },
  { value: "2", label: "주황" },
  { value: "3", label: "노랑" },
  { value: "4", label: "초록" },
  { value: "5", label: "청록" },
  { value: "6", label: "보라" },
];

export function CanvasNodeToolbar({
  node,
  session,
  zoom,
  onCenter,
  onEdit,
}: {
  node: CanvasNode;
  session: WebCanvas;
  zoom: number;
  onCenter: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="absolute z-50 flex -translate-x-1/2 -translate-y-full overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: node.x + node.width / 2,
        top: node.y - 10,
        scale: 1 / zoom,
        transformOrigin: "center bottom",
      }}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="노드 삭제"
        onClick={() => session.deleteNode(node.id)}
      >
        <Trash2 />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="노드 색상">
            <Palette />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="min-w-28">
          {nodeColors.map((option) => (
            <DropdownMenuItem
              key={option.label}
              onSelect={() => session.setColor(node.id, option.value)}
            >
              <span
                className="size-3 rounded-full border border-foreground/20"
                style={{ backgroundColor: canvasColor(option.value) ?? "var(--card)" }}
              />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="icon-sm" aria-label="선택한 노드로 이동" onClick={onCenter}>
        <Focus />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="노드 편집" onClick={onEdit}>
        <Pencil />
      </Button>
    </div>
  );
}

export function CanvasAddToolbar({ session, files }: { session: WebCanvas; files: FileEntry[] }) {
  return (
    <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 overflow-hidden rounded-md bg-popover p-1 shadow-md">
      <Button variant="ghost" size="icon" aria-label="카드 추가" onClick={() => session.addText()}>
        <SquarePen />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="문서 추가">
            <FileText />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="max-h-72 overflow-y-auto">
          {files
            .filter((entry) => entry.kind === "markdown")
            .map((entry) => (
              <DropdownMenuItem key={entry.id} onSelect={() => session.addFile(entry.path)}>
                <FileText />
                {entry.path}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="미디어 추가">
            <Image />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="max-h-72 overflow-y-auto">
          {files
            .filter((entry) => entry.kind === "attachment")
            .map((entry) => (
              <DropdownMenuItem key={entry.id} onSelect={() => session.addFile(entry.path)}>
                <Image />
                {entry.path}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CanvasViewToolbar({
  session,
  readOnly,
  onToggleGrid,
  onZoomIn,
  onResetZoom,
  onFit,
  onZoomOut,
  onToggleHelp,
}: {
  session: WebCanvas;
  readOnly: boolean;
  onToggleGrid: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  onFit: () => void;
  onZoomOut: () => void;
  onToggleHelp: () => void;
}) {
  return (
    <div className="absolute top-2 right-2 z-50 flex flex-col gap-2">
      <div className="flex flex-col overflow-hidden rounded-md border bg-background shadow-sm">
        <ToolbarButton label="Canvas 설정" border onClick={onToggleGrid}>
          <Grid2X2 />
        </ToolbarButton>
        <ToolbarButton label="확대" border onClick={onZoomIn}>
          <Plus />
        </ToolbarButton>
        <ToolbarButton label="확대 초기화" border onClick={onResetZoom}>
          <RotateCcw />
        </ToolbarButton>
        <ToolbarButton label="화면에 맞춤" border onClick={onFit}>
          <Focus />
        </ToolbarButton>
        <ToolbarButton label="축소" onClick={onZoomOut}>
          <Minus />
        </ToolbarButton>
      </div>
      {!readOnly && (
        <div className="flex flex-col overflow-hidden rounded-md border bg-background shadow-sm">
          <ToolbarButton label="실행 취소" border onClick={() => session.undo()}>
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton label="다시 실행" onClick={() => session.redo()}>
            <Redo2 />
          </ToolbarButton>
        </div>
      )}
      <div className="overflow-hidden rounded-md border bg-background shadow-sm">
        <ToolbarButton label="Canvas 도움말" onClick={onToggleHelp}>
          <CircleHelp />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  border,
  onClick,
  children,
}: {
  label: string;
  border?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={`rounded-none ${border ? "border-b" : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
