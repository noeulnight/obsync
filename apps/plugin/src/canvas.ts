import { HocuspocusProvider, type HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { Extension } from "@codemirror/state";
import { IndexeddbPersistence } from "y-indexeddb";
import { yCollab } from "y-codemirror.next";
import { TFile, type App } from "obsidian";
import * as Y from "yjs";
import { canvasNodeTextName, presenceColor, replaceText } from "@obsync/sync-core";
import { type CanvasController, observeCanvas, renderCanvas } from "./canvas-controller";
import { parseCanvas, type CanvasData, type CanvasItem } from "./canvas-data";
import { bindCanvasPresence } from "./canvas-presence";
import { changesCanvasStructure, syncMap, syncNodes } from "./canvas-yjs";

type SeedMode = "local" | "server" | "merge";

const localOrigin = Symbol("canvas-local");

export class CanvasSync {
  private readonly document = new Y.Doc();
  private readonly nodes = this.document.getMap<Y.Map<unknown>>("nodes");
  private readonly zOrder = this.document.getMap<number>("node-z-order");
  private readonly edges = this.document.getMap<Y.Map<unknown>>("edges");
  private readonly meta = this.document.getMap<unknown>("meta");
  private readonly persistence: IndexeddbPersistence;
  private readonly provider: HocuspocusProvider;
  private destroyed = false;
  private initialized = false;
  private persistenceSynced = false;
  private providerSynced = false;
  private persistedCanvas?: CanvasData;
  private writeTimer?: number;
  private renderPending = false;
  private applyingView = false;
  private readonly bindings = new Map<CanvasController, () => void>();
  private readonly pendingText = new Map<string, string>();

  constructor(
    private readonly app: App,
    id: string,
    private path: string,
    private readonly seedMode: SeedMode,
    private readonly connection: {
      vaultId: string;
      token: () => Promise<string>;
      userName: string;
      readOnly: boolean;
    },
    socket: HocuspocusProviderWebsocket,
    private readonly applying: Set<string>,
    setStatus: (status: string) => void,
    private readonly onReady: () => void,
  ) {
    this.persistence = new IndexeddbPersistence(
      `obsync:${connection.vaultId}:canvas:${id}${connection.readOnly ? ":readonly" : ""}`,
      this.document,
    );
    this.provider = new HocuspocusProvider({
      name: `canvas:${id}`,
      document: this.document,
      websocketProvider: socket,
      token: connection.token,
      onSynced: ({ state }) => {
        if (!state) return;
        this.providerSynced = true;
        void this.initialize();
      },
      onAuthenticationFailed: () => setStatus("Authentication failed"),
    });
    this.provider.awareness?.setLocalStateField("user", {
      name: connection.userName,
      color: presenceColor(this.document.clientID),
    });
    this.persistence.once("synced", () => {
      if (this.destroyed) return;
      this.persistedCanvas = snapshot(
        this.document,
        this.meta,
        this.nodes,
        this.zOrder,
        this.edges,
      );
      this.persistenceSynced = true;
      this.provider.attach();
      void this.initialize();
    });
    this.document.on("update", (_update, origin, _document, transaction) => {
      if (origin !== localOrigin) {
        this.scheduleWrite();
        if (
          !transaction.local &&
          changesCanvasStructure(transaction, [this.nodes, this.zOrder, this.edges, this.meta])
        ) {
          this.scheduleRender();
        }
      }
    });
  }

  rename(path: string) {
    for (const unbind of this.bindings.values()) unbind();
    this.bindings.clear();
    this.path = path;
    this.bindOpenViews();
  }

  get hasUnsyncedChanges() {
    return this.provider.hasUnsyncedChanges;
  }

  async localChanged(data?: CanvasData, syncExistingText = this.bindings.size === 0) {
    if (this.connection.readOnly) return;
    if (this.destroyed || !this.initialized || this.applying.has(this.path)) return;
    await this.applyLocal(data, syncExistingText);
  }

  private async applyLocal(data?: CanvasData, syncExistingText = this.bindings.size === 0) {
    if (!data) {
      const file = this.app.vault.getAbstractFileByPath(this.path);
      if (!(file instanceof TFile)) return;
      data = parseCanvas(await this.app.vault.read(file));
    }
    this.document.transact(() => {
      syncMap(this.meta, data.meta);
      syncNodes(this.document, this.nodes, data.nodes, syncExistingText);
      syncZOrder(this.zOrder, data.nodes);
      syncItems(this.edges, data.edges);
      this.applyPendingText();
    }, localOrigin);
  }

  async fileChanged() {
    await this.localChanged(undefined, this.bindings.size === 0 && !this.isOpen());
  }

  textExtension(
    nodeId: string,
    editorText: string,
    changed = false,
  ): { extension: Extension; text: string; ready: boolean } {
    if (changed) this.textChanged(nodeId, editorText);
    if (!this.initialized) return { extension: [], text: editorText, ready: false };
    const text = this.nodeText(nodeId);
    if (!text) return { extension: [], text: editorText, ready: false };
    return {
      ready: true,
      text: text.toJSON(),
      extension: yCollab(text, this.provider.awareness),
    };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.writeTimer !== undefined) window.clearTimeout(this.writeTimer);
    for (const unbind of this.bindings.values()) unbind();
    this.bindings.clear();
    this.provider.awareness?.setLocalStateField("cursor", null);
    this.provider.destroy();
    void this.persistence.destroy();
    this.document.destroy();
  }

  private async initialize() {
    if (this.destroyed || this.initialized || !this.persistenceSynced) return;
    if (this.seedMode !== "local" && !this.providerSynced) return;
    if (this.seedMode === "local") await this.applyLocal();
    else if (this.seedMode === "merge") await this.mergeLocalChanges();
    this.document.transact(() => {
      if (this.zOrder.size === 0) syncZOrder(this.zOrder, currentNodes(this.nodes));
      this.applyPendingText();
    }, localOrigin);
    this.initialized = true;
    this.onReady();
    this.renderViews();
    await this.writeFile();
  }

  private async mergeLocalChanges() {
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    const local = parseCanvas(await this.app.vault.read(file));
    if (!this.persistedCanvas || !sameCanvas(local, this.persistedCanvas)) {
      await this.applyLocal(local);
    }
  }

  bindOpenViews() {
    if (this.destroyed || !this.initialized) return;
    const open = new Set<CanvasController>();
    for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
      const view = leaf.view as unknown as { file?: TFile; canvas?: CanvasController };
      if (view.file?.path !== this.path || !view.canvas) continue;
      const controller = view.canvas;
      open.add(controller);
      if (!this.bindings.has(controller)) {
        const stopChanges = observeCanvas(controller, (data) => {
          if (!this.connection.readOnly && !this.applyingView) {
            void this.localChanged(parseCanvas(JSON.stringify(data)), false);
          }
        });
        const stopPresence = this.provider.awareness
          ? bindCanvasPresence(controller, this.provider.awareness, this.path)
          : () => undefined;
        this.bindings.set(controller, () => {
          stopChanges();
          stopPresence();
        });
      }
    }
    for (const [controller, unbind] of this.bindings) {
      if (open.has(controller)) continue;
      unbind();
      this.bindings.delete(controller);
    }
  }

  private scheduleWrite() {
    if (this.writeTimer !== undefined) window.clearTimeout(this.writeTimer);
    this.writeTimer = window.setTimeout(() => {
      this.writeTimer = undefined;
      void this.writeFile();
    }, 1_000);
  }

  private scheduleRender() {
    if (this.renderPending) return;
    this.renderPending = true;
    queueMicrotask(() => {
      this.renderPending = false;
      this.renderViews();
    });
  }

  private renderViews() {
    if (this.destroyed || !this.initialized) return;
    this.bindOpenViews();
    const data = toJson(snapshot(this.document, this.meta, this.nodes, this.zOrder, this.edges));
    this.applyingView = true;
    try {
      for (const controller of this.bindings.keys()) renderCanvas(controller, data);
    } finally {
      this.applyingView = false;
    }
  }

  private async writeFile() {
    if (this.destroyed || !this.initialized) return;
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) return;
    const data = snapshot(this.document, this.meta, this.nodes, this.zOrder, this.edges);
    const current = await this.app.vault.read(file);
    if (sameCanvas(parseCanvas(current), data)) return;
    this.applying.add(this.path);
    try {
      await this.app.vault.modify(file, `${JSON.stringify(toJson(data), null, "\t")}\n`);
    } finally {
      this.applying.delete(this.path);
    }
  }

  private textChanged(nodeId: string, content: string) {
    if (this.destroyed || this.connection.readOnly) return;
    const text = this.initialized ? this.nodeText(nodeId) : undefined;
    if (text) replaceText(text, content);
    else this.pendingText.set(nodeId, content);
  }

  private nodeText(nodeId: string) {
    if (this.nodes.get(nodeId)?.get("type") !== "text") return;
    return this.document.getText(canvasNodeTextName(nodeId));
  }

  private isOpen() {
    return this.app.workspace.getLeavesOfType("canvas").some((leaf) => {
      const view = leaf.view as unknown as { file?: TFile };
      return view.file?.path === this.path;
    });
  }

  private applyPendingText() {
    for (const [nodeId, content] of this.pendingText) {
      const text = this.nodeText(nodeId);
      if (!text) continue;
      replaceText(text, content);
      this.pendingText.delete(nodeId);
    }
  }
}

function syncItems(target: Y.Map<Y.Map<unknown>>, items: CanvasItem[]) {
  const wanted = new Map(items.map((item) => [item.id, item]));
  for (const id of target.keys()) if (!wanted.has(id)) target.delete(id);
  for (const [id, item] of wanted) {
    let shared = target.get(id);
    if (!shared) {
      shared = new Y.Map<unknown>();
      target.set(id, shared);
    }
    syncMap(shared, item);
  }
}

function syncZOrder(order: Y.Map<number>, nodes: CanvasItem[]) {
  const ids = new Set(nodes.map((node) => node.id));
  for (const id of order.keys()) if (!ids.has(id)) order.delete(id);
  nodes.forEach((node, index) => {
    if (order.get(node.id) !== index) order.set(node.id, index);
  });
}

function snapshot(
  document: Y.Doc,
  meta: Y.Map<unknown>,
  nodes: Y.Map<Y.Map<unknown>>,
  zOrder: Y.Map<number>,
  edges: Y.Map<Y.Map<unknown>>,
): CanvasData {
  const nodeData = currentNodes(nodes).sort((left, right) => {
    const rank =
      (zOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (zOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    return rank || left.id.localeCompare(right.id);
  });
  return {
    meta: meta.toJSON() as Record<string, unknown>,
    nodes: nodeData.map((data) => {
      if (data.type === "text") {
        data.text = document.getText(canvasNodeTextName(data.id)).toJSON();
      }
      return data;
    }),
    edges: [...edges.values()].map((item) => item.toJSON() as CanvasItem),
  };
}

function currentNodes(nodes: Y.Map<Y.Map<unknown>>) {
  return [...nodes.values()].map((item) => item.toJSON() as CanvasItem);
}

function toJson(data: CanvasData) {
  return { ...data.meta, nodes: data.nodes, edges: data.edges };
}

function sameCanvas(left: CanvasData, right: CanvasData) {
  return JSON.stringify(toJson(left)) === JSON.stringify(toJson(right));
}
