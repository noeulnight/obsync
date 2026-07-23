import { Compartment, StateEffect, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import {
  editorInfoField,
  MarkdownView,
  type MarkdownFileInfo,
  Notice,
  Plugin,
  setIcon,
  TFile,
} from "obsidian";
import { ApiClient, type AccountSummary, type VaultSummary } from "./api";
import {
  DEFAULT_SETTINGS,
  ConfirmationModal,
  InitialSyncModal,
  ObsyncSettingTab,
  type PluginSettings,
} from "./settings";
import { VaultSync } from "./sync";
import type { InitialSyncMode } from "./sync-types";

type CodeMirrorEditor = { cm?: EditorView };
type EditorBinding = { key?: string; extension: Extension; text: string; ready: boolean };
type EditorBindingToken = { key?: string };
type CanvasTextInfo = {
  node?: { id?: string; canvas?: { view?: { file?: TFile | null } } };
};

export default class ObsyncPlugin extends Plugin {
  settings = DEFAULT_SETTINGS;
  api!: ApiClient;
  account?: AccountSummary;
  vaults: VaultSummary[] = [];
  private sync?: VaultSync;
  private readonly bindings = new WeakMap<EditorView, Compartment>();
  private boundEditors = new WeakMap<EditorView, EditorBindingToken>();
  private readonly editorViews = new Set<EditorView>();
  private status?: HTMLElement;
  private statusText = "Starting";

  async onload() {
    const saved = (await this.loadData()) as
      | (Partial<PluginSettings> & { initializedVaultIds?: string[] })
      | null;
    this.settings = {
      apiUrl: saved?.apiUrl ?? DEFAULT_SETTINGS.apiUrl,
      refreshToken: saved?.refreshToken ?? "",
      vaultId: saved?.vaultId ?? "",
      vaultName: saved?.vaultName ?? "",
      vaultRole: saved?.vaultRole ?? "",
      userName: saved?.userName ?? "",
      initializedVaultId:
        saved?.initializedVaultId ||
        (saved?.initializedVaultIds?.includes(saved?.vaultId ?? "") ? saved?.vaultId : "") ||
        "",
    };
    this.api = new ApiClient(
      this.settings.apiUrl,
      this.settings.refreshToken,
      async (refreshToken) => {
        this.settings.refreshToken = refreshToken;
        await this.saveData(this.settings);
      },
    );
    this.status = this.addStatusBarItem();
    this.status.classList.add("obsync-status");
    this.setStatus(this.statusText);
    this.registerEditorExtension([
      ViewPlugin.define((view) => {
        const compartment = new Compartment();
        let retry: number | undefined;
        const refresh = () => {
          if (retry !== undefined) window.clearTimeout(retry);
          retry = undefined;
          this.bindEditorView(view);
          if (this.sync && !this.boundEditors.has(view)) {
            retry = window.setTimeout(() => void this.run(refresh), 1_000);
          }
        };
        this.bindings.set(view, compartment);
        this.editorViews.add(view);
        queueMicrotask(() => {
          if (!this.editorViews.has(view)) return;
          void this.run(() => {
            view.dispatch({ effects: StateEffect.appendConfig.of(compartment.of([])) });
            refresh();
          });
        });
        return {
          destroy: () => {
            if (retry !== undefined) window.clearTimeout(retry);
            this.editorViews.delete(view);
          },
        };
      }),
    ]);
    this.addSettingTab(new ObsyncSettingTab(this));

    this.registerEvent(this.app.workspace.on("file-open", () => this.refreshViews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshViews()));
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        void this.run(() => this.sync?.created(file));
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) void this.run(() => this.sync?.modified(file));
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.run(() => this.sync?.renamed(file, oldPath));
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        void this.run(() => this.sync?.deleted(file));
      }),
    );

    this.addCommand({
      id: "reconnect",
      name: "Reconnect synchronization",
      callback: () => void this.connect(),
    });
    this.addCommand({
      id: "refresh-account",
      name: "Refresh account and Vaults",
      callback: () => void this.run(() => this.refreshAccount()),
    });
    this.addCommand({
      id: "list-files",
      name: "List synchronized files",
      callback: () => {
        const files = this.sync?.listFiles() ?? [];
        new Notice(files.length ? files.join("\n") : "No synchronized files.");
      },
    });

    if (this.api.hasSession()) {
      void this.run(() => this.connect());
    } else {
      this.setStatus("Sign in required");
    }
  }

  onunload() {
    this.sync?.destroy();
  }

  async authenticateDevice(autoSelectVault = true) {
    this.api.setBaseUrl(this.settings.apiUrl);
    const authorization = await this.api.startDeviceAuthorization();
    new Notice(`Approve device code ${authorization.userCode} in your browser.`, 10_000);
    window.open(authorization.verificationUrl, "_blank");
    const deadline = Date.now() + authorization.expiresIn * 1000;
    while (Date.now() < deadline) {
      await delay(authorization.interval * 1000);
      if (await this.api.pollDeviceAuthorization(authorization.deviceCode)) break;
    }
    if (!this.api.hasSession()) throw new Error("Device authorization expired.");
    await this.loadAccount();
    if (autoSelectVault && !this.settings.vaultId && this.vaults[0]) {
      await this.selectVault(this.vaults[0].id);
    } else if (this.settings.vaultId) {
      await this.connect();
    }
  }

  async logout() {
    this.disconnect();
    try {
      await this.api.logout();
    } finally {
      this.settings.refreshToken = "";
      this.settings.vaultId = "";
      this.settings.vaultName = "";
      this.settings.vaultRole = "";
      this.settings.userName = "";
      this.settings.initializedVaultId = "";
      this.account = undefined;
      this.vaults = [];
      await this.saveData(this.settings);
      this.setStatus("Sign in required");
    }
  }

  async createVault(name: string) {
    const vault = await this.api.createVault(name);
    this.vaults = await this.api.listVaults();
    await this.selectVault(vault.id);
    return vault;
  }

  async selectVault(id: string) {
    const vault = this.vaults.find((item) => item.id === id);
    if (!vault) {
      this.settings.vaultId = "";
      this.settings.vaultName = "";
      this.settings.vaultRole = "";
      await this.saveData(this.settings);
      this.disconnect();
      this.setStatus("Select a Vault");
      return;
    }
    const previous = this.vaults.find((item) => item.id === this.settings.vaultId);
    this.settings.vaultId = vault?.id ?? "";
    this.settings.vaultName = vault?.name ?? "";
    this.settings.vaultRole = vault?.role ?? "";
    await this.saveData(this.settings);
    if (await this.connect()) return;
    this.settings.vaultId = previous?.id ?? "";
    this.settings.vaultName = previous?.name ?? "";
    this.settings.vaultRole = previous?.role ?? "";
    await this.saveData(this.settings);
    if (previous) await this.connect();
  }

  async saveSettings(apiUrl: string) {
    const nextApiUrl = apiUrl.replace(/\/+$/, "");
    if (nextApiUrl !== this.settings.apiUrl) {
      if (
        this.api.hasSession() &&
        !(await new ConfirmationModal(
          this.app,
          "Change synchronization server?",
          `Changing from ${this.settings.apiUrl} to ${nextApiUrl} will sign out this device and disconnect the current Vault.`,
          "Change server",
        ).confirm())
      ) {
        return false;
      }
      this.disconnect();
      try {
        await this.api.logout();
      } catch {
        // The old server may be unavailable; the local session is still cleared.
      }
      this.settings.apiUrl = nextApiUrl;
      this.settings.vaultId = "";
      this.settings.vaultName = "";
      this.settings.vaultRole = "";
      this.settings.userName = "";
      this.settings.initializedVaultId = "";
      this.account = undefined;
      this.vaults = [];
      this.api.setBaseUrl(nextApiUrl);
      await this.saveData(this.settings);
      this.setStatus("Sign in required");
      return true;
    }
    this.api.setBaseUrl(nextApiUrl);
    await this.saveData(this.settings);
    await this.connect();
    return true;
  }

  async connect() {
    this.disconnect();
    if (!this.api.hasSession()) {
      this.setStatus("Sign in required");
      return false;
    }
    if (!this.settings.vaultId) {
      this.setStatus("Select a Vault");
      return false;
    }
    const vaultId = this.settings.vaultId;
    try {
      await this.loadAccount();
    } catch (error) {
      if (!this.settings.userName || !this.settings.vaultRole) throw error;
    }
    const selected = this.vaults.find((vault) => vault.id === vaultId);
    const role = selected?.role || this.settings.vaultRole;
    const readOnly = role === "VIEWER";
    let initialMode: InitialSyncMode | undefined;
    if (!this.settings.initializedVaultId) {
      initialMode = await this.chooseInitialSync(
        readOnly,
        selected?.name || this.settings.vaultName,
      );
      if (!initialMode) {
        this.setStatus("Vault switch cancelled");
        return false;
      }
    }
    this.sync = new VaultSync(
      this.app,
      {
        api: this.api,
        serverUrl: websocketUrl(this.settings.apiUrl),
        token: () => this.api.token(),
        userName: this.account?.displayName || this.account?.email || this.settings.userName,
        vaultId,
        readOnly,
        initialMode,
      },
      (status) => this.setStatus(status),
      () => this.refreshViews(),
      async () => {
        if (!this.settings.initializedVaultId) {
          this.settings.initializedVaultId = vaultId;
          await this.saveData(this.settings);
        }
      },
    );
    this.setStatus("Connecting");
    this.refreshViews();
    return true;
  }

  private async chooseInitialSync(readOnly: boolean, target?: string) {
    const mode = await new InitialSyncModal(this.app, readOnly, target).choose();
    if (mode === "local") {
      return (await new ConfirmationModal(
        this.app,
        "Replace the server Vault?",
        `All files currently stored in ${target ?? "the server Vault"} will be replaced with this local Obsidian Vault.`,
        "Replace server Vault",
      ).confirm())
        ? mode
        : undefined;
    }
    if (mode === "server") {
      return (await new ConfirmationModal(
        this.app,
        "Reset the local Vault?",
        "All local files and folders except `.obsidian` settings will be permanently deleted. No backup will be created.",
        "Delete and download",
      ).confirm())
        ? mode
        : undefined;
    }
    return mode;
  }

  async loadAccount() {
    const [account, vaults] = await Promise.all([this.api.account(), this.api.listVaults()]);
    this.account = account;
    this.vaults = vaults;
    this.settings.userName = account.displayName || account.email;
    const selected = vaults.find((vault) => vault.id === this.settings.vaultId);
    if (selected) {
      this.settings.vaultName = selected.name;
      this.settings.vaultRole = selected.role;
    }
    await this.saveData(this.settings);
  }

  async refreshAccount() {
    const previousRole = this.settings.vaultRole;
    await this.loadAccount();
    const selected = this.vaults.find((vault) => vault.id === this.settings.vaultId);
    if (this.settings.vaultId && !selected) {
      this.settings.vaultId = "";
      this.settings.vaultName = "";
      this.settings.vaultRole = "";
      await this.saveData(this.settings);
      this.disconnect();
      this.setStatus("Select a Vault");
    } else if (selected && selected.role !== previousRole) {
      await this.connect();
    }
  }

  currentStatus() {
    return this.statusText;
  }

  private disconnect() {
    this.sync?.destroy();
    this.sync = undefined;
    this.refreshViews();
    this.boundEditors = new WeakMap();
  }

  private refreshViews() {
    this.refreshEditors();
    this.sync?.refreshCanvases();
  }

  private refreshEditors() {
    const seen = new Set<EditorView>();
    for (const view of this.editorViews) {
      seen.add(view);
      this.bindEditorView(view);
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      const editor = leaf.view.editor as CodeMirrorEditor;
      if (editor.cm) seen.add(editor.cm);
      this.bindEditor(leaf.view.file, editor);
    }

    const active = this.app.workspace.activeEditor;
    const editor = active?.editor as CodeMirrorEditor | undefined;
    if (active && editor?.cm && !seen.has(editor.cm)) {
      if (active.file) this.bindEditor(active.file, editor);
      else this.bindCanvasTextEditor(active as CanvasTextInfo, editor);
    }
  }

  private bindEditorView(view: EditorView) {
    const info = view.state.field(editorInfoField as never, false) as MarkdownFileInfo | undefined;
    if (!info) return;
    if (info.file) this.bindEditor(info.file, { cm: view });
    else this.bindCanvasTextEditor(info as CanvasTextInfo, { cm: view });
  }

  private bindEditor(file: TFile | null, editor: CodeMirrorEditor) {
    const view = editor.cm;
    if (!this.sync || !file || !view) return;
    const current = view.state.doc.toString();
    const token: EditorBindingToken = {};
    const binding: EditorBinding = this.sync.extension(file, current, false, () =>
      this.editorDetached(view, token),
    );
    token.key = binding.key;
    this.applyEditorBinding(view, current, binding, token);
  }

  private bindCanvasTextEditor(info: CanvasTextInfo, editor: CodeMirrorEditor) {
    const view = editor.cm;
    const nodeId = info.node?.id;
    const canvasFile = info.node?.canvas?.view?.file;
    if (!this.sync || !view || !nodeId || !canvasFile) return;
    const current = view.state.doc.toString();
    const token: EditorBindingToken = {};
    const binding: EditorBinding = this.sync.canvasTextExtension(
      canvasFile,
      nodeId,
      current,
      false,
      () => this.editorDetached(view, token),
    );
    token.key = binding.key;
    this.applyEditorBinding(view, current, binding, token);
  }

  private editorDetached(view: EditorView, token: EditorBindingToken) {
    if (this.boundEditors.get(view) !== token) return;
    this.boundEditors.delete(view);
    window.setTimeout(() => {
      if (this.editorViews.has(view)) this.bindEditorView(view);
    }, 300);
  }

  private applyEditorBinding(
    view: EditorView,
    current: string,
    binding: EditorBinding,
    token: EditorBindingToken,
  ) {
    const compartment = this.bindings.get(view);
    if (
      !compartment ||
      !binding.key ||
      this.boundEditors.get(view)?.key === binding.key ||
      !binding.ready
    )
      return;
    this.boundEditors.set(view, token);
    try {
      view.dispatch({
        effects: compartment.reconfigure([
          binding.extension,
          EditorView.editable.of(
            this.vaults.find((vault) => vault.id === this.settings.vaultId)?.role !== "VIEWER",
          ),
        ]),
        changes:
          binding.text !== current
            ? { from: 0, to: current.length, insert: binding.text }
            : undefined,
      });
    } catch (error) {
      this.boundEditors.delete(view);
      throw error;
    }
  }

  private setStatus(status: string) {
    this.statusText = status;
    if (!this.status) return;
    const state = statusState(status);
    this.status.dataset.state = state;
    this.status.setAttribute("aria-label", `Obsync: ${status}`);
    this.status.setAttribute("title", `Obsync: ${status}`);
    setIcon(this.status, statusIcon(state));
  }

  private async run(work: () => unknown) {
    try {
      await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus("Error");
      new Notice(`Obsync: ${message}`);
      console.error("Obsync", error);
    }
  }
}

function statusState(status: string) {
  if (["Synced", "Server changes applied"].includes(status)) return "synced";
  if (status === "Read only") return "readonly";
  if (["Offline", "Waiting to reconnect"].includes(status)) return "offline";
  if (["Error", "Authentication failed"].includes(status)) return "error";
  if (status === "Sign in required") return "signin";
  if (["Select a Vault", "Vault switch cancelled"].includes(status)) return "setup";
  if (status.toLowerCase().includes("conflict copy")) return "conflict";
  return "syncing";
}

function statusIcon(state: ReturnType<typeof statusState>) {
  return {
    synced: "check-circle",
    readonly: "lock",
    offline: "cloud-off",
    error: "alert-triangle",
    signin: "log-in",
    setup: "folder-open",
    conflict: "copy",
    syncing: "refresh-cw",
  }[state];
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function websocketUrl(apiUrl: string) {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/collaboration`;
  return url.toString().replace(/\/$/, "");
}
