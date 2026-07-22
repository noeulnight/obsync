import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import * as Y from "yjs";
import { CanvasSurface } from "@/features/canvas/components/CanvasSurface";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasPresence,
  CanvasSession,
} from "@/features/canvas/lib/sync";
import { Editor, type EditorSession } from "@/features/documents/components/Editor";
import { resolveFileLink, type FileEntry } from "@/features/documents/lib/files";
import { api, type PublicShare } from "@/lib/api/client";
import { usePublicShare } from "../queries/use-public-share";

export function PublicSharePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const share = usePublicShare(slug);

  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow";
    document.head.append(robots);
    return () => robots.remove();
  }, []);

  if (share.isPending) return <Message>Loading shared page…</Message>;
  if (share.isError || !share.data) return <Message>This shared page is not available.</Message>;
  return <PublicContent share={share.data} />;
}

function PublicContent({ share }: { share: PublicShare }) {
  const files: FileEntry[] = share.attachments.map((attachment) => ({
    id: attachment.id,
    kind: "attachment",
    path: attachment.path,
    deleted: false,
    attachmentId: attachment.id,
    mimeType: attachment.mimeType,
  }));
  const resolve = async (currentPath: string, href: string) => {
    const entry = resolveFileLink(files, currentPath, href);
    return entry?.attachmentId
      ? api.publicAttachmentUrl(share.slug, entry.attachmentId)
      : undefined;
  };

  useEffect(() => {
    document.title = `${displayName(share.file.path)} · ${share.vaultName}`;
  }, [share.file.path, share.vaultName]);

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between px-4 text-sm">
        <span className="text-muted-foreground">{share.vaultName}</span>
        <span className="text-xs text-muted-foreground">Published with Obsync</span>
      </header>
      {share.file.kind === "markdown" ? (
        <PublicMarkdown
          path={share.file.path}
          content={share.content ?? ""}
          files={files}
          resolve={(href) => resolve(share.file.path, href)}
        />
      ) : share.canvas ? (
        <PublicCanvas share={share} files={files} resolve={resolve} />
      ) : (
        <Message>This shared Canvas is empty.</Message>
      )}
    </main>
  );
}

function PublicMarkdown({
  path,
  content,
  files,
  resolve,
}: {
  path: string;
  content: string;
  files: FileEntry[];
  resolve: (href: string) => Promise<string | undefined>;
}) {
  const session = useMemo(() => staticDocument(content), [content]);
  return (
    <article className="mx-auto w-[min(700px,calc(100%_-_48px))] flex-1 py-12">
      <h1 className="mb-8 text-[2rem] leading-tight font-semibold tracking-[-0.015em]">
        {displayName(path)}
      </h1>
      <Editor
        session={session}
        files={files}
        readOnly
        onNavigate={publicNavigation}
        resolveAsset={resolve}
      />
    </article>
  );
}

function PublicCanvas({
  share,
  files,
  resolve,
}: {
  share: PublicShare;
  files: FileEntry[];
  resolve: (currentPath: string, href: string) => Promise<string | undefined>;
}) {
  const canvas = share.canvas!;
  const session = useMemo(
    () => new StaticCanvasSession(canvas.nodes as CanvasNode[], canvas.edges as CanvasEdge[]),
    [canvas.edges, canvas.nodes],
  );
  return (
    <div className="min-h-0 flex-1 border-t">
      <CanvasSurface
        session={session}
        files={files}
        readOnly
        openDocument={() => undefined}
        onNavigate={(_, href) => publicNavigation(href)}
        resolveAsset={(file, href) => resolve(file, href)}
        resolveFileAsset={(file) => resolve(share.file.path, file)}
        onAddFile={() => undefined}
      />
    </div>
  );
}

class StaticCanvasSession implements CanvasSession {
  private readonly document = new Y.Doc();

  constructor(
    private readonly nodeList: CanvasNode[],
    private readonly edgeList: CanvasEdge[],
  ) {
    for (const node of nodeList) {
      if (node.text) this.document.getText(`canvas-node:${node.id}:text`).insert(0, node.text);
    }
  }

  nodes = () => this.nodeList;
  edges = () => this.edgeList;
  presence = (): CanvasPresence[] => [];
  text = (id: string) => this.document.getText(`canvas-node:${id}:text`);
  updateNode = () => undefined;
  setPresence = () => undefined;
  bringToFront = () => undefined;
  connect = () => undefined;
  deleteEdge = () => undefined;
  deleteNode = () => undefined;
  setColor = () => undefined;
  addText = () => "";
  undo = () => undefined;
  redo = () => undefined;
}

function staticDocument(content: string): EditorSession {
  const document = new Y.Doc();
  const text = document.getText("content");
  if (content) text.insert(0, content);
  return { text, acquire: () => undefined, release: () => undefined };
}

function publicNavigation(href: string) {
  if (/^https?:/i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
  else toast.info("This linked page is not public.");
}

function displayName(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.(?:md|canvas)$/i, "");
}

function Message({ children }: { children: string }) {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6 text-sm text-muted-foreground">
      {children}
    </main>
  );
}
