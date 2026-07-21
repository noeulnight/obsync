import { HocuspocusProvider, type HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { ApiClient } from "@/lib/api/client";

export class WebDocument {
  readonly document = new Y.Doc();
  readonly text = this.document.getText("content");
  private readonly persistence: IndexeddbPersistence;
  readonly provider: HocuspocusProvider;
  private destroyed = false;
  private users = 0;
  private destroyTimer?: ReturnType<typeof setTimeout>;

  constructor(
    vaultId: string,
    documentId: string,
    api: ApiClient,
    userName: string,
    socket: HocuspocusProviderWebsocket,
    private readonly remove: () => void,
    readOnly = false,
  ) {
    this.persistence = new IndexeddbPersistence(
      `obsync:${vaultId}:doc:${documentId}${readOnly ? ":readonly" : ""}`,
      this.document,
    );
    this.provider = new HocuspocusProvider({
      name: `vault:${vaultId}:doc:${documentId}`,
      document: this.document,
      websocketProvider: socket,
      token: () => api.token(),
    });
    this.provider.attach();
    this.provider.awareness?.setLocalStateField("user", {
      name: userName,
      color: color(this.document.clientID),
    });
  }

  clearCursor() {
    this.provider.awareness?.setLocalStateField("cursor", null);
  }

  acquire() {
    if (this.destroyTimer) clearTimeout(this.destroyTimer);
    this.destroyTimer = undefined;
    this.users += 1;
  }

  release() {
    this.users = Math.max(0, this.users - 1);
    if (this.users || this.destroyTimer || this.destroyed) return;
    this.clearCursor();
    this.destroyTimer = setTimeout(() => {
      this.destroyTimer = undefined;
      if (!this.users) this.destroy();
    });
  }

  get hasUnsyncedChanges() {
    return this.provider.hasUnsyncedChanges;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.destroyTimer) clearTimeout(this.destroyTimer);
    this.destroyTimer = undefined;
    this.clearCursor();
    this.provider.destroy();
    void this.persistence.destroy();
    this.document.destroy();
    this.remove();
  }
}

function color(clientId: number) {
  const colors = ["#7c6cff", "#e06c75", "#56b6c2", "#98c379", "#d19a66", "#c678dd"];
  return colors[clientId % colors.length];
}
