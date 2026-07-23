import { type App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type { VaultSummary } from "./api";
import type ObsyncPlugin from "./main";
import { SetupWizardModal } from "./setup-wizard";
import type { InitialSyncMode } from "./sync-types";

export type PluginSettings = {
  apiUrl: string;
  refreshToken: string;
  vaultId: string;
  vaultName: string;
  vaultRole: VaultSummary["role"] | "";
  userName: string;
  initializedVaultId: string;
};

export const DEFAULT_SETTINGS: PluginSettings = {
  apiUrl: "http://localhost:3000",
  refreshToken: "",
  vaultId: "",
  vaultName: "",
  vaultRole: "",
  userName: "",
  initializedVaultId: "",
};

export class InitialSyncModal extends Modal {
  private resolve?: (mode: InitialSyncMode | undefined) => void;

  constructor(
    app: App,
    private readonly readOnly: boolean,
    private readonly sourceVault?: string,
    private readonly targetVault?: string,
  ) {
    super(app);
  }

  choose() {
    return new Promise<InitialSyncMode | undefined>((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen() {
    this.contentEl.createEl("h2", {
      text: this.sourceVault ? "Switch Vault" : "Set up Vault synchronization",
    });
    this.contentEl.createEl("p", {
      text: this.sourceVault
        ? `${this.sourceVault} → ${this.targetVault ?? "selected Vault"}. Choose how to handle the files currently stored in this local Obsidian Vault.`
        : `Choose how to handle existing local files and ${this.targetVault ?? "the server Vault"}.`,
    });

    if (!this.readOnly) {
      new Setting(this.contentEl)
        .setName("Upload local files")
        .setDesc("Replace the server contents with this local Vault.")
        .addButton((button) =>
          button.setButtonText("Use local").onClick(() => this.finish("local")),
        );
    }

    new Setting(this.contentEl)
      .setName("Merge both")
      .setDesc("Merge changes to matching documents and keep files from both Vaults.")
      .addButton((button) => button.setButtonText("Merge").onClick(() => this.finish("merge")));

    new Setting(this.contentEl)
      .setName("Download from server")
      .setDesc("Delete local files and replace them with the server Vault.")
      .addButton((button) =>
        button
          .setButtonText("Use server (recommended)")
          .setWarning()
          .onClick(() => this.finish("server")),
      );
  }

  onClose() {
    this.contentEl.empty();
    this.resolve?.(undefined);
    this.resolve = undefined;
  }

  private finish(mode: InitialSyncMode) {
    this.resolve?.(mode);
    this.resolve = undefined;
    this.close();
  }
}

export class ConfirmationModal extends Modal {
  private resolve?: (confirmed: boolean) => void;

  constructor(
    app: App,
    private readonly title: string,
    private readonly message: string,
    private readonly confirmText: string,
  ) {
    super(app);
  }

  confirm() {
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(false)))
      .addButton((button) =>
        button
          .setButtonText(this.confirmText)
          .setWarning()
          .onClick(() => this.finish(true)),
      );
  }

  onClose() {
    this.contentEl.empty();
    this.resolve?.(false);
    this.resolve = undefined;
  }

  private finish(confirmed: boolean) {
    this.resolve?.(confirmed);
    this.resolve = undefined;
    this.close();
  }
}

export class ObsyncSettingTab extends PluginSettingTab {
  private newVaultName = "";
  private apiUrl = "";
  private connectionResult = "";

  constructor(private readonly plugin: ObsyncPlugin) {
    super(plugin.app, plugin);
  }

  display() {
    this.apiUrl = this.plugin.settings.apiUrl;
    void this.render();
  }

  private async render() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsync" });

    new Setting(containerEl)
      .setName("Server URL")
      .setDesc(this.connectionResult || "Synchronization server URL")
      .addText((text) =>
        text.setValue(this.apiUrl).onChange((value) => {
          this.apiUrl = value.trim();
          this.connectionResult = "";
        }),
      )
      .addButton((button) =>
        button.setButtonText("Test connection").onClick(async () => {
          button.setDisabled(true).setButtonText("Testing…");
          try {
            await this.plugin.api.testConnection(this.apiUrl);
            this.connectionResult = "Connected successfully.";
          } catch (error) {
            this.connectionResult = `Connection failed: ${this.message(error)}`;
          }
          await this.render();
        }),
      );

    if (!this.plugin.api.hasSession()) {
      new Setting(containerEl)
        .setName("Set up Obsync")
        .setDesc("Connect a server, approve this device, and choose a Vault.")
        .addButton((button) =>
          button
            .setButtonText("Open setup wizard")
            .setCta()
            .onClick(() =>
              new SetupWizardModal(this.app, this.plugin, () => void this.render()).open(),
            ),
        );
      return;
    }

    if (!this.plugin.account || this.plugin.vaults.length === 0) {
      try {
        await this.plugin.loadAccount();
      } catch (error) {
        this.notice(error);
      }
    }

    new Setting(containerEl)
      .setName(this.plugin.account?.displayName || "My account")
      .setDesc(this.plugin.account?.email ?? "Could not load account information.");

    new Setting(containerEl).setName("Status").setDesc(this.plugin.currentStatus());

    const selected = this.plugin.vaults.find((vault) => vault.id === this.plugin.settings.vaultId);
    new Setting(containerEl)
      .setName("Vault")
      .setDesc(selected?.role === "VIEWER" ? "Read only" : selected ? "Can edit" : "Not selected")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select a Vault");
        for (const vault of this.plugin.vaults) {
          dropdown.addOption(
            vault.id,
            `${vault.name}${vault.role === "VIEWER" ? " (Read only)" : ""}`,
          );
        }
        dropdown.setValue(this.plugin.settings.vaultId).onChange(async (id) => {
          dropdown.setDisabled(true);
          try {
            await this.plugin.selectVault(id);
            await this.render();
          } catch (error) {
            this.notice(error);
          } finally {
            dropdown.setDisabled(false);
          }
        });
      })
      .addButton((button) =>
        button.setButtonText("Refresh").onClick(async () => {
          button.setDisabled(true).setButtonText("Refreshing…");
          try {
            await this.plugin.refreshAccount();
            new Notice("Vault list refreshed.");
            await this.render();
          } catch (error) {
            this.notice(error);
          } finally {
            button.setDisabled(false).setButtonText("Refresh");
          }
        }),
      );
    new Setting(containerEl)
      .setName("New Vault")
      .addText((text) =>
        text.setPlaceholder("Vault name").onChange((value) => {
          this.newVaultName = value.trim();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Create").onClick(async () => {
          if (!this.newVaultName) return new Notice("Enter a Vault name.");
          button.setDisabled(true).setButtonText("Creating…");
          try {
            await this.plugin.createVault(this.newVaultName);
            await this.render();
          } catch (error) {
            this.notice(error);
          } finally {
            button.setDisabled(false).setButtonText("Create");
          }
        }),
      );
    new Setting(containerEl)
      .setName("Setup wizard")
      .setDesc("Change the server, account, or connected Vault step by step.")
      .addButton((button) =>
        button
          .setButtonText("Run wizard")
          .onClick(() =>
            new SetupWizardModal(this.app, this.plugin, () => void this.render()).open(),
          ),
      );
    new Setting(containerEl)
      .setName("Rebuild local Vault")
      .setDesc(
        this.plugin.canRebuildLocalFromServer()
          ? "Delete local content and download a clean copy from the server. `.obsidian` settings are preserved."
          : "Connect to the server before rebuilding local data.",
      )
      .addButton((button) =>
        button
          .setButtonText("Rebuild from server")
          .setWarning()
          .setDisabled(!this.plugin.canRebuildLocalFromServer())
          .onClick(async () => {
            button.setDisabled(true).setButtonText("Rebuilding…");
            try {
              if (await this.plugin.rebuildLocalFromServer()) {
                new Notice("Local Vault rebuild started.");
              }
              await this.render();
            } catch (error) {
              this.notice(error);
              button.setDisabled(false).setButtonText("Rebuild from server");
            }
          }),
      );
    new Setting(containerEl)
      .addButton((button) =>
        button
          .setButtonText("Save and reconnect")
          .setCta()
          .onClick(async () => {
            button.setDisabled(true).setButtonText("Saving…");
            try {
              if (!(await this.plugin.saveSettings(this.apiUrl))) return;
              new Notice("Obsync settings saved.");
              await this.render();
            } catch (error) {
              this.notice(error);
            } finally {
              button.setDisabled(false).setButtonText("Save and reconnect");
            }
          }),
      )
      .addButton((button) =>
        button
          .setButtonText("Sign out")
          .setWarning()
          .onClick(async () => {
            try {
              await this.plugin.logout();
              await this.render();
            } catch (error) {
              this.notice(error);
            }
          }),
      );
  }

  private notice(error: unknown) {
    new Notice(this.message(error));
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
