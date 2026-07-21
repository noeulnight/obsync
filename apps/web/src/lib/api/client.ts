import axios, { type AxiosRequestConfig } from "axios";
import type { FileOperationRequest, RemoteFile } from "@obsync/sync-core";
import type { Vault } from "@/features/vaults/types/vault";
import { fileId } from "@/lib/file-id";

export type { FileOperationRequest, RemoteFile } from "@obsync/sync-core";

export type Account = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

export type AccountSession = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

export type VaultRole = "EDITOR" | "VIEWER";

export type VaultMember = {
  id: string;
  email: string;
  displayName: string | null;
  role: "OWNER" | VaultRole;
  createdAt?: string;
};

export type VaultInvitation = {
  id: string;
  email: string;
  role: VaultRole;
  expiresAt: string;
  createdAt: string;
};

export type PendingVaultInvitation = {
  id: string;
  role: VaultRole;
  expiresAt: string;
  vault: { id: string; name: string };
  invitedBy: { displayName: string | null; email: string };
};

export type UploadedAttachment = {
  id: string;
  path: string;
  mimeType: string;
  sha256: string;
  size: number;
};

export type FileOperationResult = {
  files: Array<{ id: string; version: number }>;
};

export type DocumentSearchResult = {
  id: string;
  path: string;
  excerpt: string;
};

type UploadApproval = {
  attachment: { id: string };
  uploadUrl: string | null;
  uploadHeaders: Record<string, string>;
};

export class ApiClient {
  private readonly baseUrl =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
  private accessToken?: string;
  private refreshing?: Promise<void>;
  private readonly http = axios.create({
    baseURL: this.baseUrl,
    withCredentials: true,
  });

  hasSession() {
    return Boolean(this.accessToken);
  }

  async restoreSession() {
    localStorage.removeItem("obsync.refreshToken");
    try {
      await this.refresh();
      return true;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        !error.response &&
        localStorage.getItem(accountCacheKey) &&
        localStorage.getItem(vaultsCacheKey)
      ) {
        return true;
      }
      return false;
    }
  }

  async login(email: string, password: string) {
    const value = await this.publicRequest<{ accessToken: string }>({
      url: "/api/auth/web/login",
      method: "POST",
      data: { email, password },
    });
    this.setAccessToken(value);
  }

  async register(email: string, password: string) {
    const value = await this.publicRequest<{ accessToken: string }>({
      url: "/api/auth/web/register",
      method: "POST",
      data: { email, password },
    });
    this.setAccessToken(value);
  }

  async approveDevice(userCode: string) {
    await this.request({
      url: "/api/auth/device/approve",
      method: "POST",
      data: { userCode },
    });
  }

  async listVaults(): Promise<Vault[]> {
    const vaults = await this.request<Vault[]>({ url: "/api/vaults" });
    localStorage.setItem(vaultsCacheKey, JSON.stringify(vaults));
    return vaults;
  }

  createVault(name: string): Promise<Vault> {
    return this.request<Vault>({
      url: "/api/vaults",
      method: "POST",
      data: { name },
    });
  }

  async account(): Promise<Account> {
    const account = await this.request<Account>({ url: "/api/auth/me" });
    localStorage.setItem(accountCacheKey, JSON.stringify(account));
    return account;
  }

  cachedAccount() {
    return cached<Account>(accountCacheKey);
  }

  cachedVaults() {
    return cached<Vault[]>(vaultsCacheKey);
  }

  updateAccount(input: {
    displayName?: string;
    email?: string;
    currentPassword?: string;
  }): Promise<Account> {
    return this.request<Account>({ url: "/api/auth/me", method: "PATCH", data: input });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    await this.request({
      url: "/api/auth/password",
      method: "PATCH",
      data: { currentPassword, newPassword },
    });
    this.accessToken = undefined;
  }

  accountSessions(): Promise<AccountSession[]> {
    return this.request<AccountSession[]>({ url: "/api/auth/sessions" });
  }

  async revokeSession(sessionId: string) {
    await this.request({ url: `/api/auth/sessions/${sessionId}`, method: "DELETE" });
  }

  async deleteAccount(password: string) {
    await this.request({ url: "/api/auth/me", method: "DELETE", data: { password } });
    this.accessToken = undefined;
  }

  updateVault(vaultId: string, name: string): Promise<Vault> {
    return this.request<Vault>({
      url: `/api/vaults/${vaultId}`,
      method: "PATCH",
      data: { name },
    });
  }

  async deleteVault(vaultId: string) {
    await this.request({ url: `/api/vaults/${vaultId}`, method: "DELETE" });
  }

  vaultMembers(vaultId: string): Promise<VaultMember[]> {
    return this.request<VaultMember[]>({ url: `/api/vaults/${vaultId}/members` });
  }

  vaultInvitations(vaultId: string): Promise<VaultInvitation[]> {
    return this.request<VaultInvitation[]>({ url: `/api/vaults/${vaultId}/invitations` });
  }

  inviteToVault(vaultId: string, email: string, role: VaultRole): Promise<VaultInvitation> {
    return this.request<VaultInvitation>({
      url: `/api/vaults/${vaultId}/invitations`,
      method: "POST",
      data: { email, role },
    });
  }

  async updateVaultMember(vaultId: string, userId: string, role: VaultRole) {
    await this.request({
      url: `/api/vaults/${vaultId}/members/${userId}`,
      method: "PATCH",
      data: { role },
    });
  }

  async removeVaultMember(vaultId: string, userId: string) {
    await this.request({ url: `/api/vaults/${vaultId}/members/${userId}`, method: "DELETE" });
  }

  async cancelVaultInvitation(vaultId: string, invitationId: string) {
    await this.request({
      url: `/api/vaults/${vaultId}/invitations/${invitationId}`,
      method: "DELETE",
    });
  }

  pendingInvitations(): Promise<PendingVaultInvitation[]> {
    return this.request<PendingVaultInvitation[]>({ url: "/api/invitations" });
  }

  acceptInvitation(invitationId: string): Promise<Vault> {
    return this.request<Vault>({ url: `/api/invitations/${invitationId}/accept`, method: "POST" });
  }

  async rejectInvitation(invitationId: string) {
    await this.request({ url: `/api/invitations/${invitationId}`, method: "DELETE" });
  }

  async downloadUrl(vaultId: string, attachmentId: string) {
    const value = await this.request<{ downloadUrl: string }>({
      url: `/api/vaults/${vaultId}/attachments/${attachmentId}/download`,
    });
    return value.downloadUrl;
  }

  applyFileOperation(vaultId: string, operation: FileOperationRequest) {
    return this.request<FileOperationResult>({
      url: `/api/vaults/${vaultId}/files/operations`,
      method: "POST",
      data: operation,
    });
  }

  listFiles(vaultId: string) {
    return this.request<RemoteFile[]>({ url: `/api/vaults/${vaultId}/files` });
  }

  searchVault(vaultId: string, query: string) {
    return this.request<DocumentSearchResult[]>({
      url: `/api/vaults/${vaultId}/files/search`,
      params: { query },
    });
  }

  backlinks(vaultId: string, fileId: string) {
    return this.request<DocumentSearchResult[]>({
      url: `/api/vaults/${vaultId}/files/${fileId}/backlinks`,
    });
  }

  async uploadAttachment(vaultId: string, file: File, path: string): Promise<UploadedAttachment> {
    const data = await file.arrayBuffer();
    const sha256 = await hash(data);
    const mimeType = file.type || "application/octet-stream";
    const approval = await this.request<UploadApproval>({
      url: `/api/vaults/${vaultId}/attachments/presign-upload`,
      method: "POST",
      data: {
        idempotencyKey: fileId(vaultId, `attachment\0${path}\0${sha256}`),
        path,
        size: data.byteLength,
        mimeType,
        sha256,
      },
    });
    if (approval.uploadUrl) {
      await axios.put(approval.uploadUrl, data, { headers: approval.uploadHeaders });
      await this.request({
        url: `/api/vaults/${vaultId}/attachments/${approval.attachment.id}/complete`,
        method: "POST",
      });
    }
    return {
      id: approval.attachment.id,
      path,
      mimeType,
      sha256,
      size: data.byteLength,
    };
  }

  async token() {
    if (!this.accessToken || expiresSoon(this.accessToken)) await this.refresh();
    if (!this.accessToken) throw new Error("Sign in is required.");
    return this.accessToken;
  }

  async logout() {
    await this.publicRequest({ url: "/api/auth/web/logout", method: "POST" });
    this.accessToken = undefined;
    localStorage.removeItem(accountCacheKey);
    localStorage.removeItem(vaultsCacheKey);
  }

  websocketUrl() {
    const url = new URL(this.baseUrl || location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/collaboration";
    url.search = "";
    return url.toString();
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    let token = await this.token();
    try {
      return await this.authorized<T>(config, token);
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
      this.accessToken = undefined;
      await this.refresh();
      token = await this.token();
      return this.authorized<T>(config, token);
    }
  }

  private async authorized<T>(config: AxiosRequestConfig, token: string) {
    const response = await this.http.request<T>({
      ...config,
      headers: { authorization: `Bearer ${token}` },
    });
    return response.data;
  }

  private async publicRequest<T = unknown>(config: AxiosRequestConfig) {
    return (await this.http.request<T>(config)).data;
  }

  private async refresh() {
    this.refreshing ??= (async () => {
      try {
        const value = await this.publicRequest<{ accessToken: string }>({
          url: "/api/auth/web/refresh",
          method: "POST",
        });
        this.setAccessToken(value);
      } catch (error) {
        this.accessToken = undefined;
        throw error;
      } finally {
        this.refreshing = undefined;
      }
    })();
    await this.refreshing;
  }

  private setAccessToken(value: { accessToken: string }) {
    this.accessToken = value.accessToken;
  }
}

export const api = new ApiClient();

const accountCacheKey = "obsync.account";
const vaultsCacheKey = "obsync.vaults";

function cached<T>(key: string): T | undefined {
  const value = localStorage.getItem(key);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
}

function expiresSoon(token: string) {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return true;
    const payload = JSON.parse(atob(encoded.replaceAll("-", "+").replaceAll("_", "/"))) as {
      exp?: number;
    };
    return !payload.exp || payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

async function hash(data: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
