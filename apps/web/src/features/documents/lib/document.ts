import { HocuspocusProvider, type HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { presenceColor } from "@obsync/sync-core";
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
      name: `doc:${documentId}`,
      document: this.document,
      websocketProvider: socket,
      token: () => api.token(),
    });
    this.persistence.once("synced", () => {
      if (!this.destroyed) this.provider.attach();
    });
    this.provider.awareness?.setLocalStateField("user", {
      name: userName,
      color: presenceColor(this.document.clientID),
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
