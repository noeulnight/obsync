export type CanvasItem = Record<string, unknown> & {
  id: string;
  type?: string;
  text?: string;
};

export type CanvasData = {
  meta: Record<string, unknown>;
  nodes: CanvasItem[];
  edges: CanvasItem[];
};

export function parseCanvas(text: string): CanvasData {
  const value = JSON.parse(text || "{}") as Record<string, unknown>;
  const { nodes = [], edges = [], ...meta } = value;
  return {
    meta,
    nodes: canvasItems(nodes, "node"),
    edges: canvasItems(edges, "edge"),
  };
}

function canvasItems(value: unknown, kind: string) {
  if (!Array.isArray(value) || value.some((item) => !(item as { id?: unknown })?.id)) {
    throw new Error(`Invalid Canvas ${kind} format.`);
  }
  return value as CanvasItem[];
}
