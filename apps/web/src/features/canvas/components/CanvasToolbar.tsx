import {
  Check,
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
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CanvasNode, CanvasSession } from "../lib/sync";
import { canvasColor } from "./CanvasNode";

const nodeColors = [
  { value: undefined, label: "Default" },
  { value: "1", label: "Red" },
  { value: "2", label: "Orange" },
  { value: "3", label: "Yellow" },
  { value: "4", label: "Green" },
  { value: "5", label: "Cyan" },
  { value: "6", label: "Purple" },
];

export function CanvasNodeToolbar({
  node,
  session,
  zoom,
  onCenter,
  onEdit,
}: {
  node: CanvasNode;
  session: CanvasSession;
  zoom: number;
  onCenter: () => void;
  onEdit: () => void;
}) {
  const [colorsOpen, setColorsOpen] = useState(false);
  return (
    <div
      className="absolute z-50 flex -translate-x-1/2 -translate-y-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      onPointerDown={(event) => event.stopPropagation()}
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
        aria-label="Delete node"
        onClick={() => session.deleteNode(node.id)}
      >
        <Trash2 />
      </Button>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Node color"
          aria-expanded={colorsOpen}
          onClick={() => setColorsOpen((open) => !open)}
        >
          <Palette />
        </Button>
        {colorsOpen && (
          <div
            role="menu"
            aria-label="Node color"
            className="absolute bottom-full left-1/2 mb-2 min-w-32 -translate-x-1/2 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {nodeColors.map((option) => (
              <button
                type="button"
                role="menuitem"
                key={option.label}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  session.setColor(node.id, option.value);
                  setColorsOpen(false);
                }}
              >
                <span
                  className="size-3 rounded-full border border-foreground/20"
                  style={{ backgroundColor: canvasColor(option.value) ?? "var(--card)" }}
                />
                <span className="flex-1">{option.label}</span>
                {(node.color ?? undefined) === option.value && <Check aria-hidden="true" />}
              </button>
            ))}
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
              <input
                type="color"
                aria-label="Custom node color"
                className="size-4 cursor-pointer border-0 bg-transparent p-0"
                value={node.color?.startsWith("#") ? node.color : "#7c3aed"}
                onChange={(event) => session.setColor(node.id, event.currentTarget.value)}
              />
              Custom
            </label>
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Center selected node" onClick={onCenter}>
        <Focus />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Edit node" onClick={onEdit}>
        <Pencil />
      </Button>
    </div>
  );
}

export function CanvasAddToolbar({
  session,
  onAddFile,
}: {
  session: CanvasSession;
  onAddFile: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 overflow-hidden rounded-md bg-popover p-1 shadow-md">
      <Button variant="ghost" size="icon" aria-label="Add card" onClick={() => session.addText()}>
        <SquarePen />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Add document" onClick={onAddFile}>
        <FileText />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Add media" onClick={onAddFile}>
        <Image />
      </Button>
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
  session: CanvasSession;
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
        <ToolbarButton label="Canvas settings" border onClick={onToggleGrid}>
          <Grid2X2 />
        </ToolbarButton>
        <ToolbarButton label="Zoom in" border onClick={onZoomIn}>
          <Plus />
        </ToolbarButton>
        <ToolbarButton label="Reset zoom" border onClick={onResetZoom}>
          <RotateCcw />
        </ToolbarButton>
        <ToolbarButton label="Fit to screen" border onClick={onFit}>
          <Focus />
        </ToolbarButton>
        <ToolbarButton label="Zoom out" onClick={onZoomOut}>
          <Minus />
        </ToolbarButton>
      </div>
      {!readOnly && (
        <div className="flex flex-col overflow-hidden rounded-md border bg-background shadow-sm">
          <ToolbarButton label="Undo" border onClick={() => session.undo()}>
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={() => session.redo()}>
            <Redo2 />
          </ToolbarButton>
        </div>
      )}
      <div className="overflow-hidden rounded-md border bg-background shadow-sm">
        <ToolbarButton label="Canvas help" onClick={onToggleHelp}>
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
