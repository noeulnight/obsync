import { requestUrl, type RequestUrlParam } from "obsidian";
import type { FileOperationRequest, RemoteFile } from "@obsync/sync-core";

export type { FileOperationRequest, RemoteFile } from "@obsync/sync-core";

export type VaultSummary = {
  id: string;
  name: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
};

export type AccountSummary = {
  id: string;
  email: string;
  displayName: string | null;
};

export type UploadApproval = {
  attachment: { id: string; status: "PENDING" | "READY" | "DELETED" };
  uploadUrl: string | null;
  uploadHeaders: Record<string, string>;
  alreadyReady: boolean;
};

export type FileOperationResult = {
  files: Array<{ id: string; version: number }>;
};

export class ApiRequestError extends Error {
  constructor(readonly status: number) {
    super(`서버 요청 실패 (${status})`);
  }
}

export type DeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
};

type Tokens = { accessToken: string; refreshToken: string };
type DeviceCodeResponse = Omit<DeviceAuthorization, "verificationUrl"> & {
  verificationUri: string;
};
type DeviceTokenResponse = { status: "pending" } | ({ status: "authorized" } & Tokens);

export class ApiClient {
  private accessToken?: string;
  private refreshing?: Promise<void>;

  constructor(
    private baseUrl: string,
    private refreshToken: string,
    private readonly saveRefreshToken: (token: string) => Promise<void>,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.accessToken = undefined;
  }

  hasSession() {
    return this.refreshToken.length > 0;
  }

  async register(email: string, password: string) {
    await this.raw("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await this.login(email, password);
  }

  async login(email: string, password: string) {
    const tokens = this.tokens(
      await this.raw("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    );
    await this.setTokens(tokens);
  }

  async startDeviceAuthorization(): Promise<DeviceAuthorization> {
    const response = await this.raw("/api/auth/device/code", { method: "POST" });
    const value = this.body<DeviceCodeResponse>(response.text);
    const verificationUrl = new URL(value.verificationUri, `${this.baseUrl}/`);
    verificationUrl.searchParams.set("user_code", value.userCode);
    return {
      deviceCode: value.deviceCode,
      userCode: value.userCode,
      verificationUrl: verificationUrl.toString(),
      expiresIn: value.expiresIn,
      interval: value.interval,
    };
  }

  async pollDeviceAuthorization(deviceCode: string): Promise<boolean> {
    const response = await this.raw("/api/auth/device/token", {
      method: "POST",
      body: JSON.stringify({ deviceCode }),
    });
    const value = this.body<DeviceTokenResponse>(response.text);
    if (value.status === "pending") return false;
    await this.setTokens(value);
    return true;
  }

  async logout() {
    if (this.refreshToken) {
      await this.raw("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
    }
    this.accessToken = undefined;
    this.refreshToken = "";
    await this.saveRefreshToken("");
  }

  async token() {
    if (!this.accessToken || this.expiresSoon(this.accessToken)) {
      await this.refresh();
    }
    if (!this.accessToken) throw new Error("로그인이 필요합니다.");
    return this.accessToken;
  }

  async listVaults(): Promise<VaultSummary[]> {
    return this.request<VaultSummary[]>("/api/vaults");
  }

  async account(): Promise<AccountSummary> {
    return this.request<AccountSummary>("/api/auth/me");
  }

  async createVault(name: string): Promise<VaultSummary> {
    return this.request<VaultSummary>("/api/vaults", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  presignUpload(
    vaultId: string,
    input: {
      idempotencyKey: string;
      path: string;
      size: number;
      mimeType: string;
      sha256: string;
    },
  ): Promise<UploadApproval> {
    return this.request(`/api/vaults/${vaultId}/attachments/presign-upload`, {
      method: "POST",
      body: JSON.stringify(input),
    }) as Promise<UploadApproval>;
  }

  completeUpload(vaultId: string, attachmentId: string) {
    return this.request(`/api/vaults/${vaultId}/attachments/${attachmentId}/complete`, {
      method: "POST",
    });
  }

  async downloadUrl(vaultId: string, attachmentId: string) {
    const value = await this.request<{ downloadUrl: string }>(
      `/api/vaults/${vaultId}/attachments/${attachmentId}/download`,
    );
    return value.downloadUrl;
  }

  async applyFileOperation(
    vaultId: string,
    operation: FileOperationRequest,
  ): Promise<FileOperationResult> {
    return this.request<FileOperationResult>(`/api/vaults/${vaultId}/files/operations`, {
      method: "POST",
      body: JSON.stringify(operation),
    });
  }

  async listFiles(vaultId: string): Promise<RemoteFile[]> {
    return this.request<RemoteFile[]>(`/api/vaults/${vaultId}/files`);
  }

  private async request<T>(path: string, options: Partial<RequestUrlParam> = {}): Promise<T> {
    let response = await this.raw(path, options, await this.token());
    if (response.status === 401) {
      this.accessToken = undefined;
      await this.refresh();
      response = await this.raw(path, options, await this.token());
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ApiRequestError(response.status);
    }
    return this.body<T>(response.text);
  }

  private async raw(path: string, options: Partial<RequestUrlParam>, accessToken?: string) {
    const response = await requestUrl({
      url: `${this.baseUrl}${path}`,
      method: options.method ?? "GET",
      body: options.body,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      throw: false,
    });
    if (!accessToken && (response.status < 200 || response.status >= 300)) {
      throw new ApiRequestError(response.status);
    }
    return response;
  }

  private async refresh() {
    if (!this.refreshToken) throw new Error("로그인이 필요합니다.");
    this.refreshing ??= (async () => {
      try {
        const tokens = this.tokens(
          await this.raw("/api/auth/refresh", {
            method: "POST",
            body: JSON.stringify({ refreshToken: this.refreshToken }),
          }),
        );
        await this.setTokens(tokens);
      } catch (error) {
        this.accessToken = undefined;
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
          this.refreshToken = "";
          await this.saveRefreshToken("");
        }
        throw error;
      } finally {
        this.refreshing = undefined;
      }
    })();
    await this.refreshing;
  }

  private async setTokens(tokens: Tokens) {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    await this.saveRefreshToken(tokens.refreshToken);
  }

  private tokens(response: { text: string }) {
    return this.body<Tokens>(response.text);
  }

  private body<T>(text: string): T {
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private expiresSoon(token: string) {
    try {
      const encoded = token.split(".")[1];
      if (!encoded) return true;
      const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const payload = this.body<{ exp?: number }>(atob(padded));
      return !payload.exp || payload.exp * 1000 < Date.now() + 30_000;
    } catch {
      return true;
    }
  }
}
