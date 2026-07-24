import { HocuspocusProvider, type HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { presenceColor } from "@obsync/sync-core";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { ApiClient } from "@/lib/api/client";

export type DocumentPresence = { clientId: number; name: string; color: string };

export class WebDocument {
  readonly document = new Y.Doc();
  readonly text = this.document.getText("content");
  private readonly persistence: IndexeddbPersistence;
  readonly provider: HocuspocusProvider;
  private destroyed = false;
  private users = 0;
  private destroyTimer?: ReturnType<typeof setTimeout>;
  private readonly presenceListeners = new Set<() => void>();
  private lastChange?: number;
  private resolveSynced!: () => void;
  private readonly synced = new Promise<void>((resolve) => {
    this.resolveSynced = resolve;
  });

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
      onSynced: () => this.resolveSynced(),
    });
    this.persistence.once("synced", () => {
      if (!this.destroyed) this.provider.attach();
    });
    this.provider.awareness?.setLocalStateField("user", {
      name: userName,
      color: presenceColor(this.document.clientID),
    });
    this.provider.awareness?.on("change", this.notifyPresence);
    this.document.on("update", this.noteChange);
  }

  clearCursor() {
    this.provider.awareness?.setLocalStateField("cursor", null);
  }

  subscribePresence(listener: () => void) {
    this.presenceListeners.add(listener);
    listener();
    return () => this.presenceListeners.delete(listener);
  }

  presence() {
    const users: DocumentPresence[] = [];
    for (const [clientId, state] of this.provider.awareness?.getStates() ?? []) {
      if (clientId === this.provider.awareness?.clientID) continue;
      const user = (state as { user?: Partial<DocumentPresence> }).user;
      users.push({
        clientId,
        name: user?.name ?? "User",
        color: user?.color ?? "#30bced",
      });
    }
    return users;
  }

  lastUpdatedAt() {
    return this.lastChange;
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

  whenLoaded() {
    return this.persistence.whenSynced;
  }

  whenSynced() {
    return this.synced;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.destroyTimer) clearTimeout(this.destroyTimer);
    this.destroyTimer = undefined;
    this.clearCursor();
    this.provider.awareness?.off("change", this.notifyPresence);
    this.document.off("update", this.noteChange);
    this.provider.destroy();
    void this.persistence.destroy();
    this.document.destroy();
    this.remove();
  }

  private readonly notifyPresence = () => {
    for (const listener of this.presenceListeners) listener();
  };

  private readonly noteChange = () => {
    this.lastChange = Date.now();
    this.notifyPresence();
  };
}
