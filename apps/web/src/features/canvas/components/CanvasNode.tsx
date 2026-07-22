import { FileText } from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Editor, type EditorSession } from "@/features/documents/components/Editor";
import { imagePath, type FileEntry } from "@/features/documents/lib/files";
import type { CanvasNode, CanvasSession, CanvasSide } from "../lib/sync";

const sideHandles: { side: CanvasSide; label: string; className: string }[] = [
  {
    side: "top",
    label: "Top connection point",
    className: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
  },
  {
    side: "right",
    label: "Right connection point",
    className: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
  },
  {
    side: "bottom",
    label: "Bottom connection point",
    className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
  },
  {
    side: "left",
    label: "Left connection point",
    className: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
  },
];

type Connection = { nodeId: string; side: CanvasSide };

export function CanvasNodeCard({
  node,
  index,
  session,
  openDocument,
  onNavigate,
  resolveAsset,
  resolveFileAsset,
  files,
  readOnly,
  active,
  editing,
  remoteFocus,
  connectingFrom,
  connectionTarget,
  onStartMove,
  onStartResize,
  onStartConnection,
  onFinishConnection,
  onFinishConnectionAt,
  onEdit,
}: {
  node: CanvasNode;
  index: number;
  session: CanvasSession;
  openDocument: (file: string) => EditorSession | undefined;
  onNavigate: (file: string, href: string) => void;
  resolveAsset: (file: string, href: string) => Promise<string | undefined>;
  resolveFileAsset: (file: string) => Promise<string | undefined>;
  files: FileEntry[];
  readOnly: boolean;
  active: boolean;
  editing: boolean;
  remoteFocus?: { color: string };
  connectingFrom?: Connection;
  connectionTarget?: Connection;
  onStartMove: (event: ReactPointerEvent, node: CanvasNode) => void;
  onStartResize: (event: ReactPointerEvent, node: CanvasNode) => void;
  onStartConnection: (
    event: ReactPointerEvent,
    connection: { nodeId: string; side: CanvasSide },
  ) => void;
  onFinishConnection: (event: ReactPointerEvent, node: CanvasNode) => void;
  onFinishConnectionAt: (event: ReactPointerEvent) => void;
  onEdit: (id: string) => void;
}) {
  const color = canvasColor(node.color);
  const themedBorder = color ? `color-mix(in srgb, ${color} 70%, transparent)` : undefined;
  const targeted = connectionTarget?.nodeId === node.id;
  return (
    <section
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
        className="relative size-full overflow-hidden rounded-lg border bg-card shadow-[0_0.5px_1px_0.5px_rgba(0,0,0,0.1)] [&_.cm-editor]:!bg-transparent"
        style={{
          borderColor: targeted
            ? "rgb(124 58 237)"
            : color
              ? active
                ? color
                : themedBorder
              : active
                ? "rgb(124 58 237)"
                : remoteFocus?.color,
          backgroundColor: color ? `color-mix(in srgb, ${color} 7%, var(--card))` : undefined,
          boxShadow: targeted
            ? "0 0 0 3px rgb(124 58 237 / 35%)"
            : color
              ? active
                ? `inset 0 0 0 1px ${color}, 0 0 0 2px ${color}`
                : `inset 0 0 0 1px ${themedBorder}${remoteFocus ? `, 0 0 0 2px ${remoteFocus.color}` : ""}`
              : active
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
          editing={editing}
        />
        {!editing && (
          <button
            type="button"
            aria-label={`${node.type} Canvas node`}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            onPointerDown={(event) => onStartMove(event, node)}
            onPointerUp={(event) => onFinishConnection(event, node)}
            onDoubleClick={() => !readOnly && onEdit(node.id)}
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
              className={`absolute z-10 size-4 cursor-crosshair rounded-full border-2 border-background bg-violet-600 opacity-70 shadow-sm transition-[opacity,transform,box-shadow] hover:scale-125 hover:opacity-100 focus-visible:scale-125 focus-visible:opacity-100 ${handle.className} ${connectingFrom?.nodeId === node.id && connectingFrom.side === handle.side ? "scale-125 opacity-100 ring-4 ring-violet-500/30" : ""} ${connectionTarget?.nodeId === node.id && connectionTarget.side === handle.side ? "scale-150 opacity-100 ring-4 ring-violet-500/40" : ""}`}
              onPointerDown={(event) =>
                onStartConnection(event, { nodeId: node.id, side: handle.side })
              }
              onPointerUp={onFinishConnectionAt}
            />
          ))}
          {active && (
            <button
              type="button"
              aria-label="Resize Canvas node"
              className="absolute -right-2 -bottom-2 size-5 cursor-nwse-resize"
              onPointerDown={(event) => onStartResize(event, node)}
            />
          )}
        </>
      )}
    </section>
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
  session: CanvasSession;
  openDocument: (file: string) => EditorSession | undefined;
  onNavigate: (file: string, href: string) => void;
  resolveAsset: (file: string, href: string) => Promise<string | undefined>;
  resolveFileAsset: (file: string) => Promise<string | undefined>;
  files: FileEntry[];
  readOnly: boolean;
  editing: boolean;
}) {
  if (node.type === "text") {
    return <CanvasTextEditor node={node} session={session} readOnly={readOnly || !editing} />;
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
        {file ?? "File not found."}
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
        {node.url ?? "Link"}
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
  session: CanvasSession;
  readOnly: boolean;
}) {
  const editorSession = useMemo<EditorSession>(
    () => ({
      text: session.text(node.id),
      provider: session.provider,
      acquire: () => undefined,
      release: () => undefined,
    }),
    [node.id, session],
  );
  return (
    <Editor
      session={editorSession}
      compact
      readOnly={readOnly}
      files={[]}
      onNavigate={() => undefined}
      resolveAsset={() => Promise.resolve(undefined)}
    />
  );
}

function CanvasAttachment({
  file,
  resolve,
}: {
  file: string;
  resolve: (file: string) => Promise<string | undefined>;
}) {
  const [url, setUrl] = useState<string>();
  const [loadedUrl, setLoadedUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    void resolve(file).then((value) => active && setUrl(value));
    return () => {
      active = false;
    };
  }, [file, resolve]);

  if (imagePath(file)) {
    return (
      <div className="relative size-full overflow-hidden">
        {(!url || loadedUrl !== url) && (
          <Skeleton
            data-testid="canvas-image-skeleton"
            className="absolute inset-0 size-full rounded-none"
          />
        )}
        {url && (
          <img
            className={`size-full object-cover transition-opacity ${loadedUrl === url ? "opacity-100" : "opacity-0"}`}
            src={url}
            alt={file}
            onLoad={() => setLoadedUrl(url)}
          />
        )}
      </div>
    );
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

export function canvasColor(color?: string) {
  const preset = {
    "1": "rgb(251 70 76)",
    "2": "rgb(233 151 63)",
    "3": "rgb(224 222 113)",
    "4": "rgb(68 207 110)",
    "5": "rgb(83 223 221)",
    "6": "rgb(168 130 255)",
  }[color ?? ""];
  return preset ?? color;
}

function canvasFileName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.md$/i, "");
}
