import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { LocateFixed, ZoomIn, ZoomOut } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { Button } from "@/components/ui/button";
import type { FileEntry } from "@/features/documents/lib/files";
import type { ApiClient, VaultGraph } from "@/lib/api/client";
import { errorMessage } from "@/lib/error";
import { useVaultGraph } from "../queries/use-vault-graph";

const width = 1000;
const height = 700;

export function VaultGraphView({
  api,
  vaultId,
  vaultName,
  entries,
  open,
  create,
  headerLeading,
}: {
  api: ApiClient;
  vaultId: string;
  vaultName: string;
  entries: FileEntry[];
  open: (entry: FileEntry) => void;
  create: (path: string) => void;
  headerLeading?: ReactNode;
}) {
  const graph = useVaultGraph(api, vaultId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center px-4 text-[13px]">
        {headerLeading}
        <span className="text-muted-foreground">{vaultName}</span>
        <span className="px-2 text-muted-foreground/50">/</span>
        <span>Graph</span>
      </header>
      <div className="min-h-0 flex-1 bg-background">
        {graph.isPending ? (
          <Message>Loading graph…</Message>
        ) : graph.error ? (
          <Message>{errorMessage(graph.error)}</Message>
        ) : graph.data?.nodes.length ? (
          <ForceGraph
            data={graph.data}
            vaultId={vaultId}
            open={(node) => {
              const entry = entries.find((item) => item.id === node.id);
              if (entry) open(entry);
              else if (!node.exists) create(node.path);
            }}
          />
        ) : (
          <Message>Add Markdown documents to build the graph.</Message>
        )}
      </div>
    </div>
  );
}

export function ForceGraph({
  data,
  vaultId,
  open,
  initialFit = false,
}: {
  data: VaultGraph;
  vaultId: string;
  open: (node: VaultGraph["nodes"][number]) => void;
  initialFit?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const simulation = useRef<Simulation<ForceNode, ForceLink> | undefined>(undefined);
  const nodes = useRef(new Map<string, SVGGElement>());
  const links = useRef<Array<SVGLineElement | null>>([]);
  const dragging = useRef<ForceNode | undefined>(undefined);
  const dragStart = useRef<{ id: string; x: number; y: number } | undefined>(undefined);
  const panning = useRef<Point | undefined>(undefined);
  const [viewport, setViewport] = useState(defaultViewport);
  const [surfaceScale, setSurfaceScale] = useState(1);
  const [hovered, setHovered] = useState<string>();
  const related = useMemo(() => neighbors(data), [data]);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      setSurfaceScale(Math.min(bounds.width / width, bounds.height / height));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const screenUnit = 1 / (viewport.k * surfaceScale);

  useEffect(() => {
    const graph = createSimulation(data);
    simulation.current = graph.simulation;

    const render = () => {
      for (const node of graph.nodes) {
        const group = nodes.current.get(node.id);
        if (!group) continue;
        group.setAttribute("transform", `translate(${node.x} ${node.y})`);
      }
      for (const [index, link] of graph.links.entries()) {
        const line = links.current[index];
        if (!line) continue;
        const source = link.source as ForceNode;
        const target = link.target as ForceNode;
        line.setAttribute("x1", String(source.x));
        line.setAttribute("y1", String(source.y));
        line.setAttribute("x2", String(target.x));
        line.setAttribute("y2", String(target.y));
      }
    };
    graph.simulation.on("tick", render);
    if (initialFit) {
      graph.simulation.stop().tick(120);
      render();
      setViewport(graphViewport(graph.nodes));
    }

    return () => {
      graph.simulation.stop();
    };
  }, [data]);

  function move(event: PointerEvent<SVGSVGElement>) {
    const node = dragging.current;
    const element = svg.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (node) {
      const x = ((event.clientX - rect.left) * width) / rect.width;
      const y = ((event.clientY - rect.top) * height) / rect.height;
      node.fx = (x - viewport.x) / viewport.k;
      node.fy = (y - viewport.y) / viewport.k;
      return;
    }
    const pan = panning.current;
    if (!pan) return;
    const dx = ((event.clientX - pan.x) * width) / rect.width;
    const dy = ((event.clientY - pan.y) * height) / rect.height;
    panning.current = { x: event.clientX, y: event.clientY };
    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function release(event?: PointerEvent<SVGSVGElement>) {
    panning.current = undefined;
    const node = dragging.current;
    if (!node) return;
    simulation.current?.alphaTarget(0);
    node.fx = null;
    node.fy = null;
    dragging.current = undefined;
    const start = dragStart.current;
    dragStart.current = undefined;
    if (event && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) {
      const selected = data.nodes.find((item) => item.id === start.id);
      if (selected) open(selected);
    }
  }

  function zoom(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * width) / rect.width;
    const y = ((event.clientY - rect.top) * height) / rect.height;
    setViewport((current) => zoomAt(current, x, y, event.deltaY < 0 ? 1.15 : 1 / 1.15));
  }

  return (
    <div className="relative size-full overflow-hidden">
      <div className="absolute right-3 bottom-3 z-10 flex gap-1 rounded-lg border bg-background p-1 shadow-sm">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom out"
          onClick={() => setViewport((current) => zoomAt(current, 500, 350, 1 / 1.2))}
        >
          <ZoomOut />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Reset graph view"
          onClick={() => setViewport(defaultViewport)}
        >
          <LocateFixed />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom in"
          onClick={() => setViewport((current) => zoomAt(current, 500, 350, 1.2))}
        >
          <ZoomIn />
        </Button>
      </div>
      <svg
        ref={svg}
        className="size-full cursor-grab touch-none active:cursor-grabbing"
        viewBox={`0 0 ${width} ${height}`}
        aria-label="Vault graph"
        onWheel={zoom}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          panning.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={() => release()}
      >
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
          <g fill="none" strokeWidth={screenUnit}>
            {data.edges.map((edge, index) => {
              const active =
                hovered !== undefined && (edge.source === hovered || edge.target === hovered);
              return (
                <line
                  key={`${edge.source}:${edge.target}:${index}`}
                  data-graph-link=""
                  ref={(element) => {
                    links.current[index] = element;
                  }}
                  className={active ? "stroke-violet-500" : "stroke-muted-foreground/20"}
                />
              );
            })}
          </g>
          <g strokeWidth={1.5 * screenUnit}>
            {data.nodes.map((node) => {
              const selected = hovered === node.id;
              const connected = hovered !== undefined && related.get(hovered)?.has(node.id);
              const dimmed = hovered !== undefined && !selected && !connected;
              return (
                <a
                  key={node.id}
                  href={
                    node.exists ? `/vaults/${vaultId}/files/${node.id}` : `/vaults/${vaultId}/graph`
                  }
                  aria-label={`Open ${name(node.path)}`}
                  onClick={(event) => {
                    event.preventDefault();
                    if (event.detail === 0) open(node);
                  }}
                >
                  <g
                    ref={(element) => {
                      if (element) nodes.current.set(node.id, element);
                      else nodes.current.delete(node.id);
                    }}
                    className="cursor-grab active:cursor-grabbing"
                    opacity={dimmed ? 0.24 : 1}
                    onPointerEnter={() => setHovered(node.id)}
                    onPointerLeave={() => setHovered(undefined)}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      svg.current?.setPointerCapture(event.pointerId);
                      const forceNode = simulation.current
                        ?.nodes()
                        .find((item) => item.id === node.id);
                      if (!forceNode) return;
                      dragStart.current = { id: node.id, x: event.clientX, y: event.clientY };
                      dragging.current = forceNode;
                      forceNode.fx = forceNode.x;
                      forceNode.fy = forceNode.y;
                      simulation.current?.alphaTarget(0.3).restart();
                    }}
                  >
                    <circle
                      r={(selected ? 8 : 6) * screenUnit}
                      className={
                        selected
                          ? "fill-violet-500 stroke-violet-300"
                          : connected
                            ? "fill-foreground stroke-background"
                            : node.exists
                              ? "fill-muted-foreground/70 stroke-background"
                              : "fill-muted-foreground/25 stroke-muted-foreground/50"
                      }
                    />
                    <text
                      y={20 * screenUnit}
                      textAnchor="middle"
                      className={
                        selected
                          ? "fill-foreground font-semibold"
                          : node.exists
                            ? "fill-muted-foreground"
                            : "fill-muted-foreground/60"
                      }
                      fontSize={11 * screenUnit}
                      stroke="none"
                    >
                      {name(node.path)}
                    </text>
                  </g>
                </a>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

export function forceLayout(data: VaultGraph) {
  const graph = createSimulation(data);
  graph.simulation.stop().tick(200);
  return new Map(graph.nodes.map(({ id, x = width / 2, y = height / 2 }) => [id, { x, y }]));
}

export function localGraph(data: VaultGraph, fileId: string): VaultGraph {
  const related = new Set([fileId]);
  for (const edge of data.edges) {
    if (edge.source === fileId) related.add(edge.target);
    if (edge.target === fileId) related.add(edge.source);
  }
  return {
    nodes: data.nodes.filter((node) => related.has(node.id)),
    edges: data.edges.filter((edge) => related.has(edge.source) && related.has(edge.target)),
  };
}

export function graphViewport(nodes: Array<{ x?: number; y?: number }>): Viewport {
  if (!nodes.length) return defaultViewport;
  const xs = nodes.map((node) => node.x ?? width / 2);
  const ys = nodes.map((node) => node.y ?? height / 2);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const graphWidth = Math.max(240, maxX - minX);
  const graphHeight = Math.max(160, maxY - minY);
  const k = Math.min(2.5, Math.max(0.4, Math.min(840 / graphWidth, 540 / graphHeight)));
  return {
    k,
    x: width / 2 - ((minX + maxX) / 2) * k,
    y: height / 2 - ((minY + maxY) / 2) * k,
  };
}

function createSimulation(data: VaultGraph) {
  const nodes: ForceNode[] = data.nodes.map(({ id }) => ({ id }));
  const links: ForceLink[] = data.edges.map(({ source, target }) => ({ source, target }));
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink<ForceNode, ForceLink>(links)
        .id((node) => node.id)
        .distance(66)
        .strength(0.85),
    )
    .force("charge", forceManyBody().strength(-95))
    .force("x", forceX(width / 2).strength(0.12))
    .force("y", forceY(height / 2).strength(0.12))
    .force("collision", forceCollide(14).strength(0.95));
  return { nodes, links, simulation };
}

type ForceNode = SimulationNodeDatum & { id: string };
type ForceLink = SimulationLinkDatum<ForceNode>;
type Point = { x: number; y: number };
type Viewport = Point & { k: number };

const defaultViewport: Viewport = { x: 0, y: 0, k: 1 };

function zoomAt(viewport: Viewport, x: number, y: number, factor: number) {
  const k = Math.min(4, Math.max(0.25, viewport.k * factor));
  return {
    k,
    x: x - ((x - viewport.x) / viewport.k) * k,
    y: y - ((y - viewport.y) / viewport.k) * k,
  };
}

function neighbors(data: VaultGraph) {
  const related = new Map<string, Set<string>>();
  for (const edge of data.edges) {
    if (!related.has(edge.source)) related.set(edge.source, new Set());
    if (!related.has(edge.target)) related.set(edge.target, new Set());
    related.get(edge.source)!.add(edge.target);
    related.get(edge.target)!.add(edge.source);
  }
  return related;
}

function name(path: string) {
  return (path.split("/").at(-1) ?? path).replace(/\.(?:md|canvas)$/i, "");
}

function Message({ children }: { children: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">{children}</div>
  );
}
