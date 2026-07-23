import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { FileEntry } from "@/features/documents/lib/files";
import type { EditorSession } from "@/features/documents/components/Editor";
import { edgeGeometry, edgePoint, nearestSide, previewEdgePath } from "../lib/canvas-geometry";
import type { CanvasNode, CanvasSession, CanvasSide } from "../lib/sync";
import { CanvasNodeCard, canvasColor } from "./CanvasNode";
import { CanvasAddToolbar, CanvasNodeToolbar, CanvasViewToolbar } from "./CanvasToolbar";

type Connection = { nodeId: string; side: CanvasSide };
type Gesture =
  | { type: "move"; id: string; x: number; y: number; left: number; top: number }
  | { type: "resize"; id: string; x: number; y: number; width: number; height: number }
  | { type: "pan"; x: number; y: number; left: number; top: number };

export function CanvasSurface({
  session,
  openDocument,
  onNavigate,
  resolveAsset,
  resolveFileAsset,
  files,
  onAddFile,
  readOnly,
}: {
  session: CanvasSession;
  openDocument: (file: string) => EditorSession | undefined;
  onNavigate: (file: string, href: string) => void;
  resolveAsset: (file: string, href: string) => Promise<string | undefined>;
  resolveFileAsset: (file: string) => Promise<string | undefined>;
  files: FileEntry[];
  onAddFile: () => void;
  readOnly: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [connectingFrom, setConnectingFrom] = useState<Connection>();
  const connectingFromRef = useRef<Connection | undefined>(undefined);
  const [connectionTarget, setConnectionTarget] = useState<Connection>();
  const [connectionPoint, setConnectionPoint] = useState<{ x: number; y: number }>();
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);
  const gesture = useRef<Gesture | undefined>(undefined);
  const nodes = session.nodes();
  const edges = session.edges();
  const presence = session.presence();
  const indexed = new Map(nodes.map((node) => [node.id, node]));
  const selected = selectedId ? indexed.get(selectedId) : undefined;
  const connecting = connectingFrom ? indexed.get(connectingFrom.nodeId) : undefined;

  function position(clientX: number, clientY: number) {
    const element = surface.current;
    if (!element) return { x: 0, y: 0 };
    const bounds = element.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - viewport.x) / zoom,
      y: (clientY - bounds.top - viewport.y) / zoom,
    };
  }

  function nodeAt(clientX: number, clientY: number) {
    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-node-id]");
    return target?.dataset.nodeId ? indexed.get(target.dataset.nodeId) : undefined;
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
    surface.current?.focus({ preventScroll: true });
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

  function startConnection(event: ReactPointerEvent, connection: Connection) {
    connectingFromRef.current = connection;
    setConnectingFrom(connection);
    setConnectionPoint(position(event.clientX, event.clientY));
    surface.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
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

  function addTextAt(event: ReactMouseEvent) {
    if (
      readOnly ||
      (event.target as HTMLElement).closest("[data-canvas-node],button,a,textarea,.cm-editor")
    ) {
      return;
    }
    const point = position(event.clientX, event.clientY);
    const id = session.addText(point.x - 140, point.y - 80);
    editNode(id);
  }

  function deleteSelected(event: ReactKeyboardEvent) {
    if (readOnly || !selectedId || editingId) return;
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    if (
      (event.target as HTMLElement).closest("input,textarea,.cm-editor,[contenteditable='true']")
    ) {
      return;
    }
    event.preventDefault();
    session.deleteNode(selectedId);
    setSelectedId(undefined);
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
    cancelConnection();
    event.stopPropagation();
  }

  function finishConnectionAt(event: ReactPointerEvent) {
    gesture.current = undefined;
    const node = nodeAt(event.clientX, event.clientY);
    if (node) finishConnection(event, node);
    else cancelConnection();
  }

  function cancelConnection() {
    gesture.current = undefined;
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
    <div className="relative min-h-0 flex-1">
      <div
        ref={surface}
        data-testid="canvas-surface"
        tabIndex={0}
        aria-label="Canvas"
        className="absolute inset-0 touch-none overflow-hidden bg-background outline-none cursor-grab active:cursor-grabbing"
        style={
          showGrid
            ? {
                backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                backgroundSize: `${Math.max(16, 24 * zoom)}px ${Math.max(16, 24 * zoom)}px`,
                backgroundPosition: `${viewport.x}px ${viewport.y}px`,
              }
            : undefined
        }
        onPointerDown={startPan}
        onDoubleClick={addTextAt}
        onKeyDown={deleteSelected}
        onPointerMove={pointerMove}
        onPointerUp={finishConnectionAt}
        onPointerCancel={cancelConnection}
        onWheel={(event: ReactWheelEvent) => {
          event.preventDefault();
          setViewport((current) => ({
            x: current.x - event.deltaX,
            y: current.y - event.deltaY,
          }));
        }}
        onPointerLeave={() => {
          cancelConnection();
          session.setPresence();
        }}
      >
        <div
          data-testid="canvas-viewport"
          className="absolute top-0 left-0 size-px origin-top-left"
          style={{
            zoom,
            transform: `translate(${viewport.x / zoom}px, ${viewport.y / zoom}px)`,
          }}
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
                strokeWidth="3"
                pointerEvents="none"
                markerEnd="url(#canvas-arrow)"
              />
            )}
          </svg>
          {nodes.map((node, index) => (
            <CanvasNodeCard
              key={node.id}
              node={node}
              index={index}
              session={session}
              openDocument={openDocument}
              onNavigate={onNavigate}
              resolveAsset={resolveAsset}
              resolveFileAsset={resolveFileAsset}
              files={files}
              readOnly={readOnly}
              active={node.id === selectedId}
              editing={editingId === node.id}
              remoteFocus={presence.find((user) => user.focusId === node.id)}
              connectingFrom={connectingFrom}
              connectionTarget={connectionTarget}
              onStartMove={startMove}
              onStartResize={startResize}
              onStartConnection={startConnection}
              onFinishConnection={finishConnection}
              onFinishConnectionAt={finishConnectionAt}
              onEdit={editNode}
            />
          ))}
          {selected && !readOnly && (
            <CanvasNodeToolbar
              node={selected}
              session={session}
              zoom={zoom}
              onCenter={() => centerNode(selected)}
              onEdit={() => editNode(selected.id)}
            />
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
                  className="max-w-40 shrink-0 truncate whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] text-white"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name}
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      {!readOnly && <CanvasAddToolbar session={session} onAddFile={onAddFile} />}
      <CanvasViewToolbar
        session={session}
        readOnly={readOnly}
        onToggleGrid={() => setShowGrid((value) => !value)}
        onZoomIn={() => setZoom((value) => Math.min(2, value + 0.1))}
        onResetZoom={() => setZoom(1)}
        onFit={fitCanvas}
        onZoomOut={() => setZoom((value) => Math.max(0.25, value - 0.1))}
        onToggleHelp={() => setShowHelp((value) => !value)}
      />
      {showHelp && (
        <div className="absolute right-12 bottom-4 z-50 max-w-64 rounded-lg border bg-popover p-3 text-xs leading-5 text-popover-foreground shadow-md">
          Drag cards to move them and double-click to edit. Drag empty space to pan.
        </div>
      )}
    </div>
  );
}
