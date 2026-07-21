import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { yCollab } from "y-codemirror.next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Editor } from "@/features/documents/components/Editor";
import { imagePath, type FileEntry } from "@/features/documents/lib/files";
import type { WebDocument } from "@/features/documents/lib/sync";
import { FileHeader } from "@/features/workspace/components/FileHeader";
import type { CanvasNode, CanvasSide, WebCanvas } from "../lib/sync";

const nodeColors = [
  { value: undefined, label: "기본" },
  { value: "1", label: "빨강" },
  { value: "2", label: "주황" },
  { value: "3", label: "노랑" },
  { value: "4", label: "초록" },
  { value: "5", label: "청록" },
  { value: "6", label: "보라" },
];
const sideHandles: { side: CanvasSide; label: string; className: string }[] = [
  {
    side: "top",
    label: "위쪽 연결점",
    className: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
  },
  {
    side: "right",
    label: "오른쪽 연결점",
    className: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
  },
  {
    side: "bottom",
    label: "아래쪽 연결점",
    className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
  },
  {
    side: "left",
    label: "왼쪽 연결점",
    className: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
  },
];

export function CanvasEditor({
  session,
  vaultName,
  path,
  onRename,
  onDelete,
  openDocument,
  onNavigate,
  resolveAsset,
  resolveFileAsset,
  files,
  readOnly = false,
}: {
  session: WebCanvas;
  vaultName: string;
  path: string;
  onRename: () => void;
  onDelete: () => void;
  openDocument: (file: string) => WebDocument | undefined;
  onNavigate: (file: string, href: string) => void;
  resolveAsset: (file: string, href: string) => Promise<string | undefined>;
  resolveFileAsset: (file: string) => Promise<string | undefined>;
  files: FileEntry[];
  readOnly?: boolean;
}) {
  const [, render] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [connectingFrom, setConnectingFrom] = useState<{
    nodeId: string;
    side: CanvasSide;
  }>();
  const connectingFromRef = useRef<{ nodeId: string; side: CanvasSide } | undefined>(undefined);
  const [connectionTarget, setConnectionTarget] = useState<{
    nodeId: string;
    side: CanvasSide;
  }>();
  const [connectionPoint, setConnectionPoint] = useState<{ x: number; y: number }>();
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const gesture = useRef<
    | { type: "move"; id: string; x: number; y: number; left: number; top: number }
    | { type: "resize"; id: string; x: number; y: number; width: number; height: number }
    | { type: "pan"; x: number; y: number; left: number; top: number }
    | undefined
  >(undefined);
  const nodes = session.nodes();
  const edges = session.edges();
  const presence = session.presence();
  const indexed = new Map(nodes.map((node) => [node.id, node]));
  const selected = selectedId ? indexed.get(selectedId) : undefined;
  const connecting = connectingFrom ? indexed.get(connectingFrom.nodeId) : undefined;

  useEffect(() => session.subscribe(() => render((value) => value + 1)), [session]);
  useEffect(() => session.subscribePresence(() => render((value) => value + 1)), [session]);
  useEffect(() => () => session.destroy(), [session]);

  function position(clientX: number, clientY: number) {
    const element = surface.current;
    if (!element) return { x: 0, y: 0 };
    const bounds = element.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - viewport.x) / zoom,
      y: (clientY - bounds.top - viewport.y) / zoom,
    };
  }

  function pointerMove(event: ReactPointerEvent) {
    const active = gesture.current;
    if (active?.type === "pan") {
      setViewport({
        x: active.left + event.clientX - active.x,
        y: active.top + event.clientY - active.y,
      });
      return;
    }
    const point = position(event.clientX, event.clientY);
    const source = connectingFromRef.current ?? connectingFrom;
    if (source) {
      const target = nodeAt(event.clientX, event.clientY);
      const nextTarget =
        target && target.id !== source.nodeId
          ? { nodeId: target.id, side: nearestSide(target, point) }
          : undefined;
      setConnectionTarget(nextTarget);
      setConnectionPoint(nextTarget && target ? edgePoint(target, nextTarget.side) : point);
    }
    if (active?.type === "move") {
      session.updateNode(active.id, {
        x: active.left + point.x - active.x,
        y: active.top + point.y - active.y,
      });
    } else if (active?.type === "resize") {
      session.updateNode(active.id, {
        width: Math.max(180, active.width + point.x - active.x),
        height: Math.max(80, active.height + point.y - active.y),
      });
    }
    session.setPresence(point.x, point.y, active?.id ?? selectedId);
  }

  function startMove(event: ReactPointerEvent, node: CanvasNode) {
    if (readOnly) return;
    if (connectingFrom) {
      finishConnection(event, node);
      return;
    }
    const point = position(event.clientX, event.clientY);
    gesture.current = {
      type: "move",
      id: node.id,
      x: point.x,
      y: point.y,
      left: node.x,
      top: node.y,
    };
    setSelectedId(node.id);
    setEditingId(undefined);
    session.bringToFront(node.id);
    session.setPresence(point.x, point.y, node.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }

  function startResize(event: ReactPointerEvent, node: CanvasNode) {
    const point = position(event.clientX, event.clientY);
    gesture.current = {
      type: "resize",
      id: node.id,
      x: point.x,
      y: point.y,
      width: node.width,
      height: node.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }

  function startPan(event: ReactPointerEvent) {
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest("[data-canvas-node],button,a,textarea,.cm-editor")) {
      return;
    }
    const element = surface.current;
    if (!element) return;
    gesture.current = {
      type: "pan",
      x: event.clientX,
      y: event.clientY,
      left: viewport.x,
      top: viewport.y,
    };
    setSelectedId(undefined);
    setEditingId(undefined);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveViewport(event: ReactWheelEvent) {
    event.preventDefault();
    setViewport((current) => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  }

  function finishGesture() {
    gesture.current = undefined;
  }

  function finishConnection(event: ReactPointerEvent, node: CanvasNode) {
    const source = connectingFromRef.current ?? connectingFrom;
    if (!source) return;
    if (source.nodeId !== node.id) {
      session.connect(
        source.nodeId,
        node.id,
        source.side,
        nearestSide(node, position(event.clientX, event.clientY)),
      );
    }
    connectingFromRef.current = undefined;
    setConnectingFrom(undefined);
    setConnectionPoint(undefined);
    setConnectionTarget(undefined);
    event.stopPropagation();
  }

  function finishConnectionAt(event: ReactPointerEvent) {
    finishGesture();
    const node = nodeAt(event.clientX, event.clientY);
    if (node) finishConnection(event, node);
    else cancelConnection();
  }

  function nodeAt(clientX: number, clientY: number) {
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-node-id]");
    return target?.dataset.nodeId ? indexed.get(target.dataset.nodeId) : undefined;
  }

  function cancelConnection() {
    finishGesture();
    connectingFromRef.current = undefined;
    setConnectingFrom(undefined);
    setConnectionPoint(undefined);
    setConnectionTarget(undefined);
  }

  function editNode(id: string) {
    setSelectedId(id);
    setEditingId(id);
    requestAnimationFrame(() => {
      const node = surface.current?.querySelector(`[data-node-id="${id}"]`);
      (node?.querySelector("textarea, .cm-content") as HTMLElement | null)?.focus();
    });
  }

  function centerNode(node: CanvasNode) {
    const element = surface.current;
    if (!element) return;
    const next = Math.min(
      2,
      Math.max(
        0.25,
        Math.min(
          (element.clientWidth - 96) / node.width,
          (element.clientHeight - 96) / node.height,
        ),
      ),
    );
    setZoom(next);
    setViewport({
      x: element.clientWidth / 2 - (node.x + node.width / 2) * next,
      y: element.clientHeight / 2 - (node.y + node.height / 2) * next,
    });
  }

  const fitCanvas = useCallback(() => {
    const element = surface.current;
    if (!element || nodes.length === 0) return false;
    if (element.clientWidth <= 96 || element.clientHeight <= 96) return false;
    const left = Math.min(...nodes.map((node) => node.x));
    const top = Math.min(...nodes.map((node) => node.y));
    const right = Math.max(...nodes.map((node) => node.x + node.width));
    const bottom = Math.max(...nodes.map((node) => node.y + node.height));
    const next = Math.min(
      1,
      Math.max(
        0.25,
        Math.min(
          (element.clientWidth - 96) / (right - left),
          (element.clientHeight - 96) / (bottom - top),
        ),
      ),
    );
    setZoom(next);
    setViewport({
      x: (element.clientWidth - (right - left) * next) / 2 - left * next,
      y: (element.clientHeight - (bottom - top) * next) / 2 - top * next,
    });
    return true;
  }, [nodes]);

  useEffect(() => {
    if (fitted.current || !nodes.length) return;
    fitted.current = fitCanvas();
  }, [fitCanvas, nodes.length]);

  return (
    <div className="flex h-full flex-col">
      <FileHeader
        vaultName={vaultName}
        path={path}
        onRename={readOnly ? undefined : onRename}
        onDelete={readOnly ? undefined : onDelete}
      />
      <div className="relative min-h-0 flex-1">
        <div
          ref={surface}
          data-testid="canvas-surface"
          className="absolute inset-0 touch-none overflow-hidden border bg-background cursor-grab active:cursor-grabbing"
          style={
            showGrid
              ? {
                  backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                  backgroundSize: `${16 * zoom}px ${16 * zoom}px`,
                  backgroundPosition: `${viewport.x}px ${viewport.y}px`,
                }
              : undefined
          }
          onPointerDown={startPan}
          onPointerMove={pointerMove}
          onPointerUp={finishConnectionAt}
          onPointerCancel={cancelConnection}
          onWheel={moveViewport}
          onPointerLeave={() => {
            cancelConnection();
            session.setPresence();
          }}
        >
          <div
            data-testid="canvas-viewport"
            className="absolute top-0 left-0 size-px origin-top-left"
            style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${zoom})` }}
          >
            <svg className="absolute top-0 left-0 size-px overflow-visible">
              <defs>
                <marker
                  id="canvas-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const from = indexed.get(edge.fromNode);
                const to = indexed.get(edge.toNode);
                if (!from || !to) return null;
                const geometry = edgeGeometry(
                  from,
                  to,
                  edge.fromSide ?? "right",
                  edge.toSide ?? "left",
                );
                const stroke = canvasColor(edge.color) ?? "var(--muted-foreground)";
                return (
                  <g key={edge.id}>
                    <path
                      d={geometry.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="14"
                      pointerEvents="stroke"
                      className="cursor-pointer"
                      onPointerDown={() => !readOnly && session.deleteEdge(edge.id)}
                    />
                    <path
                      d={geometry.path}
                      fill="none"
                      stroke={stroke}
                      strokeWidth="2"
                      pointerEvents="none"
                      markerStart={edge.fromEnd === "arrow" ? "url(#canvas-arrow)" : undefined}
                      markerEnd={edge.toEnd === "none" ? undefined : "url(#canvas-arrow)"}
                    />
                    {edge.label && (
                      <text
                        x={geometry.middle.x}
                        y={geometry.middle.y - 8}
                        textAnchor="middle"
                        className="fill-muted-foreground text-xs"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}
              {connecting && connectionPoint && (
                <path
                  d={previewEdgePath(connecting, connectingFrom?.side ?? "right", connectionPoint)}
                  fill="none"
                  stroke="rgb(124 58 237)"
                  strokeWidth="2"
                  pointerEvents="none"
                />
              )}
            </svg>
            {nodes.map((node, index) => {
              const remoteFocus = presence.find((user) => user.focusId === node.id);
              const active = node.id === selectedId;
              const color = canvasColor(node.color);
              return (
                <section
                  key={node.id}
                  data-canvas-node
                  data-node-id={node.id}
                  className="absolute overflow-visible"
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    zIndex: index + 1,
                  }}
                >
                  {node.type === "file" && node.file && (
                    <div className="pointer-events-none absolute -top-6 left-0 max-w-full truncate text-[13px] text-muted-foreground">
                      {canvasFileName(node.file)}
                    </div>
                  )}
                  <div
                    className="relative size-full overflow-hidden rounded-lg border bg-card shadow-[0_0.5px_1px_0.5px_rgba(0,0,0,0.1)]"
                    style={{
                      borderColor: active ? "rgb(124 58 237)" : (remoteFocus?.color ?? color),
                      backgroundColor: color
                        ? `color-mix(in srgb, ${color} 12%, var(--card))`
                        : undefined,
                      boxShadow: active
                        ? "0 0.5px 1px 0.5px rgba(0,0,0,.1), 0 0 0 2px rgb(124 58 237)"
                        : remoteFocus
                          ? `0 0 0 2px ${remoteFocus.color}`
                          : undefined,
                    }}
                  >
                    <CanvasNodeContent
                      node={node}
                      session={session}
                      openDocument={openDocument}
                      onNavigate={onNavigate}
                      resolveAsset={resolveAsset}
                      resolveFileAsset={resolveFileAsset}
                      files={files}
                      readOnly={readOnly}
                      editing={editingId === node.id}
                    />
                    {editingId !== node.id && (
                      <button
                        type="button"
                        aria-label={`${node.type} Canvas 노드`}
                        className="absolute inset-0 cursor-grab active:cursor-grabbing"
                        onPointerDown={(event) => startMove(event, node)}
                        onPointerUp={(event) => finishConnection(event, node)}
                        onDoubleClick={() => editNode(node.id)}
                      />
                    )}
                  </div>
                  {(active || connectingFrom) && !readOnly && (
                    <>
                      {sideHandles.map((handle) => (
                        <button
                          key={handle.side}
                          type="button"
                          aria-label={handle.label}
                          className={`absolute size-3 cursor-crosshair rounded-full border-2 border-background bg-violet-600 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 ${handle.className} ${connectingFrom?.nodeId === node.id && connectingFrom.side === handle.side ? "opacity-100 ring-4 ring-violet-500/30" : ""} ${connectionTarget?.nodeId === node.id && connectionTarget.side === handle.side ? "opacity-100 ring-4 ring-violet-500/30" : ""}`}
                          onPointerDown={(event) => {
                            const source = { nodeId: node.id, side: handle.side };
                            connectingFromRef.current = source;
                            setConnectingFrom(source);
                            setConnectionPoint(position(event.clientX, event.clientY));
                            event.stopPropagation();
                          }}
                          onPointerUp={finishConnectionAt}
                        />
                      ))}
                      {active && (
                        <button
                          type="button"
                          aria-label="Canvas 노드 크기 조절"
                          className="absolute -right-2 -bottom-2 size-5 cursor-nwse-resize"
                          onPointerDown={(event) => startResize(event, node)}
                        />
                      )}
                    </>
                  )}
                </section>
              );
            })}
            {selected && !readOnly && (
              <div
                className="absolute z-50 flex -translate-x-1/2 -translate-y-full overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                style={{
                  left: selected.x + selected.width / 2,
                  top: selected.y - 10,
                  scale: 1 / zoom,
                  transformOrigin: "center bottom",
                }}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="노드 삭제"
                  onClick={() => session.deleteNode(selected.id)}
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
                    {nodeColors.map((option) => {
                      const optionColor = canvasColor(option.value);
                      return (
                        <DropdownMenuItem
                          key={option.label}
                          onSelect={() => session.setColor(selected.id, option.value)}
                        >
                          <span
                            className="size-3 rounded-full border border-foreground/20"
                            style={{ backgroundColor: optionColor ?? "var(--card)" }}
                          />
                          {option.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="선택한 노드로 이동"
                  onClick={() => centerNode(selected)}
                >
                  <Focus />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="노드 편집"
                  onClick={() => editNode(selected.id)}
                >
                  <Pencil />
                </Button>
              </div>
            )}
            {presence.map((user) =>
              user.x === undefined || user.y === undefined ? null : (
                <div
                  key={user.clientId}
                  className="pointer-events-none absolute z-100 flex items-start gap-1"
                  style={{ left: user.x, top: user.y, color: user.color }}
                >
                  <span className="block size-2 rotate-45 bg-current" />
                  <span
                    className="rounded px-1.5 py-0.5 text-[11px] text-white"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.name}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 overflow-hidden rounded-md bg-popover p-1 shadow-md">
            <Button
              variant="ghost"
              size="icon"
              aria-label="카드 추가"
              onClick={() => session.addText()}
            >
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
        )}

        <div className="absolute top-2 right-2 z-50 flex flex-col gap-2">
          <div className="flex flex-col overflow-hidden rounded-md border bg-background shadow-sm">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none border-b"
              aria-label="Canvas 설정"
              onClick={() => setShowGrid((value) => !value)}
            >
              <Grid2X2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none border-b"
              aria-label="확대"
              onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none border-b"
              aria-label="확대 초기화"
              onClick={() => setZoom(1)}
            >
              <RotateCcw />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none border-b"
              aria-label="화면에 맞춤"
              onClick={fitCanvas}
            >
              <Focus />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none"
              aria-label="축소"
              onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))}
            >
              <Minus />
            </Button>
          </div>
          {!readOnly && (
            <div className="flex flex-col overflow-hidden rounded-md border bg-background shadow-sm">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-none border-b"
                aria-label="실행 취소"
                onClick={() => session.undo()}
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-none"
                aria-label="다시 실행"
                onClick={() => session.redo()}
              >
                <Redo2 />
              </Button>
            </div>
          )}
          <div className="overflow-hidden rounded-md border bg-background shadow-sm">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none"
              aria-label="Canvas 도움말"
              onClick={() => setShowHelp((value) => !value)}
            >
              <CircleHelp />
            </Button>
          </div>
        </div>
        {showHelp && (
          <div className="absolute right-12 bottom-4 z-50 max-w-64 rounded-lg border bg-popover p-3 text-xs leading-5 text-popover-foreground shadow-md">
            카드를 끌어 이동하고, 두 번 눌러 편집합니다. 빈 공간을 끌면 화면이 이동합니다.
          </div>
        )}
      </div>
    </div>
  );
}

function CanvasNodeContent({
  node,
  session,
  openDocument,
  onNavigate,
  resolveAsset,
  resolveFileAsset,
  files,
  readOnly,
  editing,
}: {
  node: CanvasNode;
  session: WebCanvas;
  openDocument: (file: string) => WebDocument | undefined;
  onNavigate: (file: string, href: string) => void;
  resolveAsset: (file: string, href: string) => Promise<string | undefined>;
  resolveFileAsset: (file: string) => Promise<string | undefined>;
  files: FileEntry[];
  readOnly: boolean;
  editing: boolean;
}) {
  if (node.type === "text") {
    if (editing) return <CanvasTextEditor node={node} session={session} readOnly={readOnly} />;
    return <div className="whitespace-pre-wrap p-4 text-base leading-6">{node.text}</div>;
  }
  if (node.type === "file") {
    const file = node.file;
    const document = file ? openDocument(file) : undefined;
    if (document && file) {
      return (
        <div className="flex size-full flex-col">
          <div className="shrink-0 px-3 pt-3 text-base font-semibold">{canvasFileName(file)}</div>
          <div className="min-h-0 flex-1">
            <Editor
              session={document}
              compact
              readOnly={readOnly}
              onNavigate={(href) => onNavigate(file, href)}
              resolveAsset={(href) => resolveAsset(file, href)}
            />
          </div>
        </div>
      );
    }
    const entry = file ? files.find((item) => item.path === file) : undefined;
    if (file && entry?.kind === "attachment") {
      return <CanvasAttachment file={file} resolve={resolveFileAsset} />;
    }
    return (
      <div className="grid size-full place-items-center p-4 text-center text-sm text-muted-foreground">
        {file ?? "파일을 찾을 수 없습니다."}
      </div>
    );
  }
  if (node.type === "link") {
    return (
      <a
        className="block break-all p-4 text-sm text-primary underline"
        href={node.url}
        target="_blank"
        rel="noreferrer"
      >
        {node.url ?? "링크"}
      </a>
    );
  }
  return <pre className="overflow-auto p-4 text-xs">{JSON.stringify(node, null, 2)}</pre>;
}

function CanvasTextEditor({
  node,
  session,
  readOnly,
}: {
  node: CanvasNode;
  session: WebCanvas;
  readOnly: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parent.current) return;
    const text = session.text(node.id);
    const view = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: text.toJSON(),
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          EditorView.editable.of(!readOnly),
          canvasTextTheme,
          yCollab(text, session.provider.awareness),
        ],
      }),
    });
    view.focus();
    return () => view.destroy();
  }, [node.id, readOnly, session]);

  return <div ref={parent} className="size-full" />;
}

const canvasTextTheme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "transparent" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
    ".cm-content": { minHeight: "100%", padding: "16px", fontSize: "16px", lineHeight: "1.5" },
    ".cm-line": { padding: "0" },
  },
  { dark: true },
);

function canvasFileName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
}

function CanvasAttachment({
  file,
  resolve,
}: {
  file: string;
  resolve: (file: string) => Promise<string | undefined>;
}) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    void resolve(file).then((value) => active && setUrl(value));
    return () => {
      active = false;
    };
  }, [file, resolve]);

  if (url && imagePath(file)) {
    return <img className="size-full object-contain" src={url} alt={file} />;
  }
  return (
    <div className="grid size-full place-items-center gap-2 p-4 text-center text-sm text-muted-foreground">
      <div>
        <FileText className="mx-auto mb-2 size-8 opacity-60" />
        {file}
      </div>
    </div>
  );
}

function canvasColor(color?: string) {
  return {
    "1": "rgb(224 108 117)",
    "2": "rgb(209 154 102)",
    "3": "rgb(229 192 123)",
    "4": "rgb(152 195 121)",
    "5": "rgb(86 182 194)",
    "6": "rgb(198 120 221)",
  }[color ?? ""];
}

type CanvasPoint = { x: number; y: number };

function edgeGeometry(from: CanvasNode, to: CanvasNode, fromSide: CanvasSide, toSide: CanvasSide) {
  const start = edgePoint(from, fromSide);
  const end = edgePoint(to, toSide);
  const distance = Math.min(180, Math.max(48, Math.hypot(end.x - start.x, end.y - start.y) / 2));
  const first = offsetPoint(start, fromSide, distance);
  const second = offsetPoint(end, toSide, distance);
  return {
    path: `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`,
    middle: {
      x: (start.x + 3 * first.x + 3 * second.x + end.x) / 8,
      y: (start.y + 3 * first.y + 3 * second.y + end.y) / 8,
    },
  };
}

function previewEdgePath(node: CanvasNode, side: CanvasSide, end: CanvasPoint) {
  const start = edgePoint(node, side);
  const distance = Math.min(180, Math.max(48, Math.hypot(end.x - start.x, end.y - start.y) / 2));
  const first = offsetPoint(start, side, distance);
  return `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${end.x} ${end.y}, ${end.x} ${end.y}`;
}

function edgePoint(node: CanvasNode, side: CanvasSide): CanvasPoint {
  if (side === "top") return { x: node.x + node.width / 2, y: node.y };
  if (side === "right") return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === "bottom") return { x: node.x + node.width / 2, y: node.y + node.height };
  return { x: node.x, y: node.y + node.height / 2 };
}

function offsetPoint(point: CanvasPoint, side: CanvasSide, distance: number): CanvasPoint {
  if (side === "top") return { x: point.x, y: point.y - distance };
  if (side === "right") return { x: point.x + distance, y: point.y };
  if (side === "bottom") return { x: point.x, y: point.y + distance };
  return { x: point.x - distance, y: point.y };
}

function nearestSide(node: CanvasNode, point: CanvasPoint): CanvasSide {
  const distances: [CanvasSide, number][] = [
    ["top", Math.abs(point.y - node.y)],
    ["right", Math.abs(point.x - node.x - node.width)],
    ["bottom", Math.abs(point.y - node.y - node.height)],
    ["left", Math.abs(point.x - node.x)],
  ];
  return distances.reduce((closest, current) => (current[1] < closest[1] ? current : closest))[0];
}
