export type CanvasItem = Record<string, unknown> & {
  id: string;
  type?: string;
  text?: string;
  file?: string;
};

export type CanvasData = {
  meta: Record<string, unknown>;
  nodes: CanvasItem[];
  edges: CanvasItem[];
};
