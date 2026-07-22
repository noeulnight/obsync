import { HocuspocusProvider, type HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { canvasNodeTextName, presenceColor, replaceText } from "@obsync/sync-core";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { ApiClient } from "@/lib/api/client";
import { randomUuid } from "@/lib/file-id";

export type CanvasNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  [key: string]: unknown;
};

export type CanvasEdge = {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  toNode: string;
  toSide?: CanvasSide;
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  [key: string]: unknown;
};

export type CanvasSide = "top" | "right" | "bottom" | "left";

export type CanvasPresence = {
  clientId: number;
  name: string;
  color: string;
  x?: number;
  y?: number;
  focusId?: string;
};

export type CanvasSession = {
  provider?: HocuspocusProvider;
  nodes: () => CanvasNode[];
  edges: () => CanvasEdge[];
  presence: () => CanvasPresence[];
  text: (id: string) => Y.Text;
  updateNode: WebCanvas["updateNode"];
  setPresence: WebCanvas["setPresence"];
  bringToFront: WebCanvas["bringToFront"];
  connect: WebCanvas["connect"];
  deleteEdge: WebCanvas["deleteEdge"];
  deleteNode: WebCanvas["deleteNode"];
  setColor: WebCanvas["setColor"];
  addText: WebCanvas["addText"];
  undo: WebCanvas["undo"];
  redo: WebCanvas["redo"];
};

type AwarenessState = {
  canvas?: { path?: string; x?: number; y?: number; focusId?: string };
  user?: { name?: string; color?: string };
};

export class WebCanvas {
  private readonly document = new Y.Doc();
  private readonly nodesMap = this.document.getMap<Y.Map<unknown>>("nodes");
  private readonly zOrder = this.document.getMap<number>("node-z-order");
  private readonly edgesMap = this.document.getMap<Y.Map<unknown>>("edges");
  private readonly undoManager = new Y.UndoManager([this.nodesMap, this.zOrder, this.edgesMap]);
  private readonly persistence: IndexeddbPersistence;
  readonly provider: HocuspocusProvider;
  private readonly listeners = new Set<() => void>();
  private readonly presenceListeners = new Set<() => void>();
  private path: string;
  private destroyed = false;

  constructor(
    vaultId: string,
    documentId: string,
    path: string,
    api: ApiClient,
    userName: string,
    socket: HocuspocusProviderWebsocket,
    private readonly remove: () => void,
    readOnly = false,
  ) {
    this.path = path;
    this.persistence = new IndexeddbPersistence(
      `obsync:${vaultId}:canvas:${documentId}${readOnly ? ":readonly" : ""}`,
      this.document,
    );
    this.provider = new HocuspocusProvider({
      name: `vault:${vaultId}:canvas:${documentId}`,
      document: this.document,
      websocketProvider: socket,
      token: () => api.token(),
    });
    this.provider.attach();
    this.provider.awareness?.setLocalStateField("user", {
      name: userName,
      color: presenceColor(this.document.clientID),
    });
    this.document.on("update", this.notify);
    this.provider.awareness?.on("change", this.notifyPresence);
  }

  rename(path: string) {
    this.path = path;
  }

  nodes() {
    return [...this.nodesMap.values()]
      .map((item) => readNode(item, this.document))
      .sort(
        (left, right) =>
          (this.zOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (this.zOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      );
  }

  edges() {
    return [...this.edgesMap.values()].map(readEdge);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    listener();
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribePresence(listener: () => void) {
    this.presenceListeners.add(listener);
    listener();
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  presence() {
    const values: CanvasPresence[] = [];
    for (const [clientId, state] of this.provider.awareness?.getStates() ?? []) {
      if (clientId === this.provider.awareness?.clientID) continue;
      const { canvas, user = {} } = state as AwarenessState;
      if (canvas?.path !== this.path) continue;
      values.push({
        clientId,
        name: user.name ?? "User",
        color: user.color ?? "#30bced",
        x: canvas.x,
        y: canvas.y,
        focusId: canvas.focusId,
      });
    }
    return values;
  }

  setPresence(x?: number, y?: number, focusId?: string) {
    this.provider.awareness?.setLocalStateField("canvas", {
      path: this.path,
      x,
      y,
      focusId,
    });
  }

  get hasUnsyncedChanges() {
    return this.provider.hasUnsyncedChanges;
  }

  snapshot() {
    return Y.encodeStateAsUpdate(this.document);
  }

  applySnapshot(snapshot: Uint8Array) {
    Y.applyUpdate(this.document, snapshot);
  }

  addText(x?: number, y?: number) {
    const offset = (this.nodesMap.size % 6) * 32;
    const id = randomUuid();
    const node = new Y.Map<unknown>();
    this.document.transact(() => {
      for (const [key, value] of Object.entries({
        id,
        type: "text",
        x: x ?? 120 + offset,
        y: y ?? 120 + offset,
        width: 280,
        height: 160,
      })) {
        node.set(key, value);
      }
      this.nodesMap.set(id, node);
      this.zOrder.set(id, this.zOrder.size);
      this.document.getText(canvasNodeTextName(id)).insert(0, "New note");
    });
    return id;
  }

  addFile(file: string, x?: number, y?: number) {
    const offset = (this.nodesMap.size % 6) * 32;
    const id = randomUuid();
    const node = new Y.Map<unknown>();
    this.document.transact(() => {
      for (const [key, value] of Object.entries({
        id,
        type: "file",
        file,
        x: x ?? 120 + offset,
        y: y ?? 120 + offset,
        width: 320,
        height: 220,
      })) {
        node.set(key, value);
      }
      this.nodesMap.set(id, node);
      this.zOrder.set(id, this.zOrder.size);
    });
    return id;
  }

  updateNode(id: string, patch: Partial<Pick<CanvasNode, "x" | "y" | "width" | "height">>) {
    const node = this.nodesMap.get(id);
    if (!node) return;
    this.document.transact(() => {
      for (const [key, value] of Object.entries(patch)) node.set(key, value);
    });
  }

  setColor(id: string, color?: string) {
    const node = this.nodesMap.get(id);
    if (!node) return;
    if (color) node.set("color", color);
    else node.delete("color");
  }

  undo() {
    this.undoManager.undo();
  }

  redo() {
    this.undoManager.redo();
  }

  text(id: string) {
    return this.document.getText(canvasNodeTextName(id));
  }

  bringToFront(id: string) {
    if (!this.nodesMap.has(id)) return;
    const highest = Math.max(-1, ...this.zOrder.values());
    if (this.zOrder.get(id) !== highest) this.zOrder.set(id, highest + 1);
  }

  connect(
    fromNode: string,
    toNode: string,
    fromSide: CanvasSide = "right",
    toSide: CanvasSide = "left",
  ) {
    if (fromNode === toNode || !this.nodesMap.has(fromNode) || !this.nodesMap.has(toNode)) return;
    if (this.edges().some((edge) => edge.fromNode === fromNode && edge.toNode === toNode)) {
      return;
    }
    const id = randomUuid();
    const edge = new Y.Map<unknown>();
    for (const [key, value] of Object.entries({
      id,
      fromNode,
      fromSide,
      toNode,
      toSide,
    })) {
      edge.set(key, value);
    }
    this.edgesMap.set(id, edge);
  }

  deleteNode(id: string) {
    this.document.transact(() => {
      this.nodesMap.delete(id);
      this.zOrder.delete(id);
      replaceText(this.document.getText(canvasNodeTextName(id)), "");
      for (const edge of this.edges()) {
        if (edge.fromNode === id || edge.toNode === id) this.edgesMap.delete(edge.id);
      }
    });
  }

  deleteEdge(id: string) {
    this.edgesMap.delete(id);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.setPresence();
    this.document.off("update", this.notify);
    this.provider.awareness?.off("change", this.notifyPresence);
    this.provider.destroy();
    void this.persistence.destroy();
    this.undoManager.destroy();
    this.document.destroy();
    this.remove();
  }

  private readonly notify = () => {
    for (const listener of this.listeners) listener();
  };

  private readonly notifyPresence = () => {
    for (const listener of this.presenceListeners) listener();
  };
}

function readNode(item: Y.Map<unknown>, document: Y.Doc): CanvasNode {
  const value = item.toJSON() as CanvasNode;
  return {
    ...value,
    id: value.id,
    type: value.type,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    ...(value.type === "text"
      ? { text: document.getText(canvasNodeTextName(value.id)).toJSON() }
      : {}),
  };
}

function readEdge(item: Y.Map<unknown>): CanvasEdge {
  const value = item.toJSON() as CanvasEdge;
  return { ...value, id: value.id, fromNode: value.fromNode, toNode: value.toNode };
}
