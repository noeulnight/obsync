import type { CanvasController, CanvasItemController } from "./canvas-controller";

type Awareness = {
  clientID: number;
  getStates: () => Map<number, Record<string, unknown>>;
  setLocalStateField: (field: string, value: unknown) => void;
  on: (name: string, callback: () => void) => void;
  off: (name: string, callback: () => void) => void;
};

type Presence = {
  x?: number;
  y?: number;
  focusId?: string;
  name: string;
  color: string;
};

type PresenceState = {
  canvas?: { path?: string; x?: number; y?: number; focusId?: string };
  user?: { name?: string; color?: string };
};

export function bindCanvasPresence(
  controller: CanvasController,
  awareness: Awareness,
  path: string,
) {
  const surface = controller.wrapperEl ?? controller.canvasEl;
  const layer = controller.canvasEl;
  if (!surface || !layer || !controller.posFromClient) return () => undefined;

  const window = surface.ownerDocument.defaultView;
  const rendered = new Map<number, { cursor?: HTMLElement; focus?: HTMLElement }>();
  let frame = 0;
  let lastEvent: PointerEvent | undefined;

  const publish = (event?: PointerEvent) => {
    const position = event
      ? controller.posFromClient?.({ x: event.clientX, y: event.clientY })
      : undefined;
    awareness.setLocalStateField("canvas", {
      path,
      x: position?.x,
      y: position?.y,
      focusId: focusedNode(controller, event?.target),
    });
  };
  const pointerMove = (event: PointerEvent) => {
    lastEvent = event;
    if (frame) return;
    frame =
      window?.requestAnimationFrame(() => {
        frame = 0;
        publish(lastEvent);
      }) ?? 0;
  };
  const pointerUp = (event: PointerEvent) => queueMicrotask(() => publish(event));
  const pointerLeave = () => publish();
  const render = () => {
    const active = new Set<number>();
    for (const [clientId, state] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue;
      const presence = readCanvasPresence(state, path);
      if (!presence) continue;
      active.add(clientId);
      let elements = rendered.get(clientId);
      if (!elements) {
        elements = {};
        rendered.set(clientId, elements);
      }
      renderCursor(layer, elements, presence);
      renderFocus(layer, controller, elements, presence);
    }
    for (const [clientId, elements] of rendered) {
      if (active.has(clientId)) continue;
      elements.cursor?.remove();
      elements.focus?.remove();
      rendered.delete(clientId);
    }
  };

  surface.addEventListener("pointermove", pointerMove);
  surface.addEventListener("pointerup", pointerUp);
  surface.addEventListener("pointerleave", pointerLeave);
  awareness.on("change", render);
  render();

  return () => {
    if (frame && window) window.cancelAnimationFrame(frame);
    surface.removeEventListener("pointermove", pointerMove);
    surface.removeEventListener("pointerup", pointerUp);
    surface.removeEventListener("pointerleave", pointerLeave);
    awareness.off("change", render);
    for (const elements of rendered.values()) {
      elements.cursor?.remove();
      elements.focus?.remove();
    }
    awareness.setLocalStateField("canvas", null);
  };
}

export function readCanvasPresence(
  state: Record<string, unknown>,
  path: string,
): Presence | undefined {
  const { canvas, user = {} } = state as PresenceState;
  if (canvas?.path !== path) return;
  return {
    x: canvas.x,
    y: canvas.y,
    focusId: canvas.focusId,
    name: user.name ?? "Obsidian",
    color: user.color ?? "#30bced",
  };
}

function focusedNode(controller: CanvasController, target?: EventTarget | null) {
  for (const item of controller.selection ?? []) if (item.id) return item.id;
  if (target) {
    for (const node of controller.nodes?.values() ?? []) {
      if (node.id && node.nodeEl?.contains(target as Node)) return node.id;
    }
  }
}

function renderCursor(layer: HTMLElement, elements: { cursor?: HTMLElement }, presence: Presence) {
  if (presence.x === undefined || presence.y === undefined) {
    elements.cursor?.remove();
    elements.cursor = undefined;
    return;
  }
  const cursor = elements.cursor ?? layer.createDiv({ cls: "obsync-canvas-cursor" });
  elements.cursor = cursor;
  cursor.style.setProperty("--obsync-user-color", presence.color);
  cursor.style.transform = `translate(${presence.x}px, ${presence.y}px)`;
  let label = cursor.querySelector<HTMLElement>(".obsync-canvas-cursor-label");
  label ??= cursor.createSpan({ cls: "obsync-canvas-cursor-label" });
  label.textContent = presence.name;
}

function renderFocus(
  layer: HTMLElement,
  controller: CanvasController,
  elements: { focus?: HTMLElement },
  presence: Presence,
) {
  const node = presence.focusId ? controller.nodes?.get(presence.focusId) : undefined;
  if (!node || !hasBounds(node)) {
    elements.focus?.remove();
    elements.focus = undefined;
    return;
  }
  const focus = elements.focus ?? layer.createDiv({ cls: "obsync-canvas-focus" });
  elements.focus = focus;
  focus.style.setProperty("--obsync-user-color", presence.color);
  focus.style.transform = `translate(${node.x}px, ${node.y}px)`;
  focus.style.width = `${node.width}px`;
  focus.style.height = `${node.height}px`;
  focus.ariaLabel = `${presence.name} is editing`;
}

function hasBounds(node: CanvasItemController): node is CanvasItemController & {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return (
    node.x !== undefined &&
    node.y !== undefined &&
    node.width !== undefined &&
    node.height !== undefined
  );
}
