import { type App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type { VaultSummary } from "./api";
import type ObsyncPlugin from "./main";
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
    this.contentEl.createEl("h2", { text: "Initial Vault synchronization" });
    this.contentEl.createEl("p", {
      text: "Choose how to handle existing files in this Obsidian Vault and the server Vault.",
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
          .setButtonText("Use server")
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

export class ServerReplaceConfirmModal extends Modal {
  private resolve?: (confirmed: boolean) => void;

  confirm() {
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: "Reset the local Vault?" });
    this.contentEl.createEl("p", {
      text: "All local files and folders except `.obsidian` settings will be permanently deleted. No backup will be created.",
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(false)))
      .addButton((button) =>
        button
          .setButtonText("Delete and download")
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
      .setDesc("Synchronization server URL")
      .addText((text) =>
        text.setValue(this.plugin.settings.apiUrl).onChange((value) => {
          this.apiUrl = value.trim();
        }),
      );

    if (!this.plugin.api.hasSession()) {
      new Setting(containerEl)
        .setName("Connect account")
        .setDesc("Sign in or create an account in your browser, then approve this device.")
        .addButton((button) =>
          button
            .setButtonText("Sign in with browser")
            .setCta()
            .onClick(async () => {
              button.setDisabled(true);
              try {
                await this.plugin.saveSettings(this.apiUrl);
                await this.plugin.authenticateDevice();
                await this.render();
              } catch (error) {
                this.notice(error);
              } finally {
                button.setDisabled(false);
              }
            }),
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
          try {
            await this.plugin.selectVault(id);
            await this.render();
          } catch (error) {
            this.notice(error);
          }
        });
      })
      .addButton((button) =>
        button.setButtonText("Refresh").onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.refreshAccount();
            new Notice("Vault list refreshed.");
            await this.render();
          } catch (error) {
            this.notice(error);
          } finally {
            button.setDisabled(false);
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
          try {
            await this.plugin.createVault(this.newVaultName);
            await this.render();
          } catch (error) {
            this.notice(error);
          }
        }),
      );
    new Setting(containerEl)
      .addButton((button) =>
        button
          .setButtonText("Save and reconnect")
          .setCta()
          .onClick(async () => {
            try {
              await this.plugin.saveSettings(this.apiUrl);
              new Notice("Obsync settings saved.");
              await this.render();
            } catch (error) {
              this.notice(error);
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
    new Notice(error instanceof Error ? error.message : String(error));
  }
}
