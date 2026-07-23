import * as Y from "yjs";
import { canvasNodeTextName, replaceText } from "@obsync/sync-core";
import type { CanvasItem } from "./canvas-data";

export function changesCanvasStructure(transaction: Y.Transaction, roots: readonly Y.Map<any>[]) {
  return roots.some((root) => transaction.changedParentTypes.has(root as never));
}

export function syncNodes(
  document: Y.Doc,
  target: Y.Map<Y.Map<unknown>>,
  items: CanvasItem[],
  syncExistingText = true,
  removeMissing = true,
) {
  const wanted = new Map(items.map((item) => [item.id, item]));
  if (removeMissing) {
    for (const id of target.keys()) if (!wanted.has(id)) target.delete(id);
  }
  for (const [id, item] of wanted) {
    let shared = target.get(id);
    const created = !shared;
    if (!shared) {
      shared = new Y.Map<unknown>();
      target.set(id, shared);
    }
    const { text, ...data } = item;
    syncMap(shared, data);
    if (item.type === "text" && text !== undefined && (syncExistingText || created)) {
      replaceText(document.getText(canvasNodeTextName(id)), text);
    }
  }
}

export function syncMap(target: Y.Map<unknown>, value: Record<string, unknown>) {
  for (const key of target.keys()) if (!(key in value)) target.delete(key);
  for (const [key, next] of Object.entries(value)) {
    if (JSON.stringify(target.get(key)) !== JSON.stringify(next)) target.set(key, next);
  }
}
