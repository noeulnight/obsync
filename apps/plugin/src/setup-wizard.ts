import { Modal, Notice, Setting, type App } from "obsidian";
import type ObsyncPlugin from "./main";

export class SetupWizardModal extends Modal {
  private step = 0;
  private apiUrl: string;
  private vaultId = "";
  private vaultName = "";

  constructor(
    app: App,
    private readonly plugin: ObsyncPlugin,
    private readonly finished: () => void,
  ) {
    super(app);
    this.apiUrl = plugin.settings.apiUrl;
  }

  onOpen() {
    this.render();
  }

  onClose() {
    this.contentEl.empty();
    this.finished();
  }

  private render() {
    this.contentEl.empty();
    if (this.step === 0) this.renderServer();
    else if (this.step === 1) this.renderAccount();
    else this.renderVault();
  }

  private renderServer() {
    this.contentEl.createEl("h2", { text: "Set up Obsync" });
    this.contentEl.createEl("p", { text: "Step 1 of 3 · Connect to your synchronization server." });
    new Setting(this.contentEl)
      .setName("Server URL")
      .setDesc("Enter the address provided by your server administrator.")
      .addText((text) =>
        text.setValue(this.apiUrl).onChange((value) => {
          this.apiUrl = value.trim();
        }),
      );
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText("Test and continue")
        .setCta()
        .onClick(async () => {
          button.setDisabled(true).setButtonText("Testing…");
          try {
            await this.plugin.api.testConnection(this.apiUrl);
            if (!(await this.plugin.saveSettings(this.apiUrl))) return;
            this.step = this.plugin.api.hasSession() ? 2 : 1;
            this.render();
          } catch (error) {
            this.notice(error);
            button.setDisabled(false).setButtonText("Test and continue");
          }
        }),
    );
  }

  private renderAccount() {
    this.contentEl.createEl("h2", { text: "Connect your account" });
    this.contentEl.createEl("p", {
      text: "Step 2 of 3 · Approve this device in your browser. Your password is never stored in Obsidian.",
    });
    new Setting(this.contentEl)
      .setName("Browser sign-in")
      .setDesc("A browser window will open with a one-time device code.")
      .addButton((button) =>
        button
          .setButtonText("Open browser")
          .setCta()
          .onClick(async () => {
            button.setDisabled(true).setButtonText("Waiting for approval…");
            try {
              await this.plugin.authenticateDevice(false);
              this.step = 2;
              this.render();
            } catch (error) {
              this.notice(error);
              button.setDisabled(false).setButtonText("Open browser");
            }
          }),
      );
  }

  private renderVault() {
    this.contentEl.createEl("h2", { text: "Choose a Vault" });
    this.contentEl.createEl("p", {
      text: "Step 3 of 3 · Select an existing Vault or create a new one. You will choose how to handle local files next.",
    });
    this.vaultId ||= this.plugin.settings.vaultId || this.plugin.vaults[0]?.id || "";
    new Setting(this.contentEl)
      .setName("Existing Vault")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select a Vault");
        for (const vault of this.plugin.vaults) {
          dropdown.addOption(vault.id, vault.name);
        }
        dropdown.setValue(this.vaultId).onChange((value) => {
          this.vaultId = value;
        });
      })
      .addButton((button) =>
        button
          .setButtonText("Connect")
          .setCta()
          .onClick(async () => {
            if (!this.vaultId) return new Notice("Select a Vault.");
            button.setDisabled(true).setButtonText("Connecting…");
            try {
              await this.plugin.selectVault(this.vaultId);
              if (this.plugin.settings.vaultId === this.vaultId) this.close();
              else button.setDisabled(false).setButtonText("Connect");
            } catch (error) {
              this.notice(error);
              button.setDisabled(false).setButtonText("Connect");
            }
          }),
      )
      .addButton((button) =>
        button.setButtonText("Refresh").onClick(async () => {
          button.setDisabled(true).setButtonText("Refreshing…");
          try {
            await this.plugin.refreshAccount();
            this.vaultId = this.plugin.settings.vaultId || this.plugin.vaults[0]?.id || "";
            this.render();
          } catch (error) {
            this.notice(error);
            button.setDisabled(false).setButtonText("Refresh");
          }
        }),
      );
    new Setting(this.contentEl)
      .setName("New Vault")
      .addText((text) =>
        text.setPlaceholder("Vault name").onChange((value) => {
          this.vaultName = value.trim();
        }),
      )
      .addButton((button) =>
        button.setButtonText("Create and connect").onClick(async () => {
          if (!this.vaultName) return new Notice("Enter a Vault name.");
          button.setDisabled(true).setButtonText("Creating…");
          try {
            const vault = await this.plugin.createVault(this.vaultName);
            if (this.plugin.settings.vaultId === vault.id) this.close();
            else button.setDisabled(false).setButtonText("Create and connect");
          } catch (error) {
            this.notice(error);
            button.setDisabled(false).setButtonText("Create and connect");
          }
        }),
      );
  }

  private notice(error: unknown) {
    new Notice(error instanceof Error ? error.message : String(error));
  }
}
