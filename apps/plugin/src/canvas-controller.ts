export type CanvasController = {
  data?: unknown;
  nodes?: Map<string, CanvasItemController>;
  edges?: Map<string, CanvasItemController>;
  canvasEl?: HTMLElement;
  wrapperEl?: HTMLElement;
  selection?: Set<CanvasItemController>;
  posFromClient?: (position: { x: number; y: number }) => { x: number; y: number };
  getData: () => unknown;
  importData: (data: unknown, clear: boolean) => void;
  requestSave: (...args: unknown[]) => void;
  markDirty?: (...args: unknown[]) => void;
  markMoved?: (...args: unknown[]) => void;
  requestFrame?: () => void;
  zIndexCounter?: number;
};

export type CanvasItemController = {
  id?: string;
  nodeEl?: HTMLElement;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  renderZIndex?: () => void;
  setData: (data: unknown) => void;
};

export function observeCanvas(controller: CanvasController, changed: (data: unknown) => void) {
  const restorers = [wrap("requestSave"), wrap("markDirty"), wrap("markMoved")];
  return () => {
    for (const restore of restorers) restore?.();
  };

  function wrap(key: "requestSave" | "markDirty" | "markMoved") {
    const original = controller[key];
    if (!original) return;
    const wrapped = (...args: unknown[]) => {
      original.apply(controller, args);
      changed(controller.getData());
    };
    controller[key] = wrapped;
    return () => {
      if (controller[key] === wrapped) controller[key] = original;
    };
  }
}

export function renderCanvas(controller: CanvasController, data: CanvasData) {
  if (canPatch(controller.nodes, data.nodes) && canPatch(controller.edges, data.edges)) {
    for (const item of data.nodes) {
      const node = controller.nodes?.get(item.id);
      if (node?.nodeEl?.contains(node.nodeEl.ownerDocument.activeElement)) continue;
      node?.setData(item);
    }
    for (const item of data.edges) controller.edges?.get(item.id)?.setData(item);
    controller.requestFrame?.();
  } else {
    controller.importData(data, true);
  }
  applyZOrder(controller, data.nodes);
  controller.data = data;
}

function applyZOrder(controller: CanvasController, nodes: CanvasItem[]) {
  nodes.forEach((item, zIndex) => {
    const node = controller.nodes?.get(item.id);
    if (!node) return;
    node.zIndex = zIndex;
    node.renderZIndex?.();
  });
  controller.zIndexCounter = Math.max(controller.zIndexCounter ?? 0, nodes.length);
}

function canPatch(items: Map<string, CanvasItemController> | undefined, data: CanvasItem[]) {
  return Boolean(items && items.size === data.length && data.every((item) => items.has(item.id)));
}

type CanvasItem = Record<string, unknown> & { id: string };
type CanvasData = Record<string, unknown> & { nodes: CanvasItem[]; edges: CanvasItem[] };
