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
  initializedVaultIds: string[];
};

export const DEFAULT_SETTINGS: PluginSettings = {
  apiUrl: "http://localhost:3000",
  refreshToken: "",
  vaultId: "",
  vaultName: "",
  vaultRole: "",
  userName: "",
  initializedVaultIds: [],
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
    this.contentEl.createEl("h2", { text: "최초 Vault 동기화" });
    this.contentEl.createEl("p", {
      text: "이 Obsidian Vault와 서버 Vault의 기존 파일을 어떻게 처리할지 선택하세요.",
    });

    if (!this.readOnly) {
      new Setting(this.contentEl)
        .setName("로컬을 서버에 업로드")
        .setDesc("현재 로컬 Vault를 기준으로 서버 내용을 교체합니다.")
        .addButton((button) =>
          button.setButtonText("로컬 사용").onClick(() => this.finish("local")),
        );
    }

    new Setting(this.contentEl)
      .setName("양쪽 병합")
      .setDesc("같은 문서의 변경 내용을 합치고, 서로 다른 파일은 모두 유지합니다.")
      .addButton((button) => button.setButtonText("병합").onClick(() => this.finish("merge")));

    new Setting(this.contentEl)
      .setName("서버에서 다시 받기")
      .setDesc("로컬 파일을 삭제하고 서버 Vault 내용으로 교체합니다.")
      .addButton((button) =>
        button
          .setButtonText("서버 사용")
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
    this.contentEl.createEl("h2", { text: "로컬 Vault를 초기화할까요?" });
    this.contentEl.createEl("p", {
      text: "`.obsidian` 설정을 제외한 로컬 파일과 폴더가 영구 삭제됩니다. 백업은 만들지 않습니다.",
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("취소").onClick(() => this.finish(false)))
      .addButton((button) =>
        button
          .setButtonText("삭제 후 다운로드")
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

  constructor(private readonly plugin: ObsyncPlugin) {
    super(plugin.app, plugin);
  }

  display() {
    void this.render();
  }

  private async render() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsync" });

    new Setting(containerEl)
      .setName("서버 주소")
      .setDesc("동기화 서버 주소")
      .addText((text) =>
        text.setValue(this.plugin.settings.apiUrl).onChange((value) => {
          this.plugin.settings.apiUrl = value.trim();
        }),
      );

    if (!this.plugin.api.hasSession()) {
      new Setting(containerEl)
        .setName("계정 연결")
        .setDesc("브라우저에서 로그인하거나 새 계정을 만든 뒤 이 기기를 승인합니다.")
        .addButton((button) =>
          button
            .setButtonText("브라우저에서 로그인")
            .setCta()
            .onClick(async () => {
              button.setDisabled(true);
              try {
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
      .setName(this.plugin.account?.displayName || "내 계정")
      .setDesc(this.plugin.account?.email ?? "계정 정보를 불러오지 못했습니다.");

    new Setting(containerEl).setName("Vault").addDropdown((dropdown) => {
      dropdown.addOption("", "선택하세요");
      for (const vault of this.plugin.vaults) {
        dropdown.addOption(
          vault.id,
          `${vault.name}${vault.role === "VIEWER" ? " (읽기 전용)" : ""}`,
        );
      }
      dropdown.setValue(this.plugin.settings.vaultId).onChange(async (id) => {
        try {
          await this.plugin.selectVault(id);
        } catch (error) {
          this.notice(error);
        }
      });
    });
    new Setting(containerEl)
      .setName("새 Vault")
      .addText((text) =>
        text.setPlaceholder("Vault 이름").onChange((value) => {
          this.newVaultName = value.trim();
        }),
      )
      .addButton((button) =>
        button.setButtonText("생성").onClick(async () => {
          if (!this.newVaultName) return new Notice("Vault 이름을 입력하세요.");
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
          .setButtonText("저장 및 재연결")
          .setCta()
          .onClick(async () => {
            try {
              await this.plugin.saveSettings();
              new Notice("Obsync 설정을 저장했습니다.");
            } catch (error) {
              this.notice(error);
            }
          }),
      )
      .addButton((button) =>
        button
          .setButtonText("로그아웃")
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
