// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { SettingsDialog } from "./SettingsDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("settings", () => {
  it("shows the MCP server URL in account settings", async () => {
    vi.spyOn(api, "mcpConfig").mockResolvedValue({
      url: "https://sync.example.com/mcp",
      scopes: ["vault:read", "vault:write"],
    });
    vi.spyOn(api, "mcpApps").mockResolvedValue([
      {
        clientId: "client-1",
        name: "Claude",
        scopes: ["vault:read", "vault:write"],
        connectedAt: "2026-07-22T00:00:00.000Z",
      },
    ]);
    const revoke = vi.spyOn(api, "revokeMcpApp").mockResolvedValue();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <SettingsDialog
          open
          section="mcp"
          vaults={[]}
          selected=""
          onOpenChange={() => undefined}
          onSectionChange={() => undefined}
          onSelect={() => undefined}
          onLogout={() => undefined}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByDisplayValue("https://sync.example.com/mcp")).toBeTruthy();
    expect(screen.getByText("How to connect")).toBeTruthy();
    expect(await screen.findByText("Claude")).toBeTruthy();
    fireEvent.click(screen.getByText("Revoke", { selector: "button" }));
    fireEvent.click(screen.getAllByText("Revoke", { selector: "button" }).at(-1)!);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("client-1"));
  });

  it("renames and deletes a Vault", async () => {
    const vault = { id: "vault-1", name: "Personal", role: "OWNER" as const };
    const rename = vi.spyOn(api, "updateVault").mockResolvedValue({ ...vault, name: "Work" });
    const remove = vi.spyOn(api, "deleteVault").mockResolvedValue();
    const rebuild = vi.spyOn(api, "rebuildVaultGraph").mockResolvedValue({
      nodes: [],
      edges: [],
    });
    const reset = vi.spyOn(api, "resetVault").mockResolvedValue({ deleted: 2 });
    const select = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.account, {
      id: "user-1",
      email: "user@example.com",
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    client.setQueryData(queryKeys.vaults, [vault]);

    render(
      <QueryClientProvider client={client}>
        <SettingsDialog
          open
          section="vault"
          vaults={[vault]}
          selected={vault.id}
          onOpenChange={() => undefined}
          onSectionChange={() => undefined}
          onSelect={select}
          onLogout={() => undefined}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Personal name"), { target: { value: "Work" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(vault.id, "Work"));

    fireEvent.click(screen.getByText("Rebuild", { selector: "button" }));
    await waitFor(() => expect(rebuild).toHaveBeenCalledWith(vault.id));

    fireEvent.click(screen.getByText("Reset", { selector: "button" }));
    fireEvent.click(await screen.findByText("Reset Vault", { selector: "button" }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith(vault.id));

    fireEvent.click(screen.getByText("Delete", { selector: "button" }));
    fireEvent.click(await screen.findByText("Delete Vault", { selector: "button" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(vault.id));
    expect(select).toHaveBeenCalledWith("");
  });

  it("invites a Vault editor", async () => {
    const vault = { id: "vault-1", name: "Personal", role: "OWNER" as const };
    vi.spyOn(api, "vaultMembers").mockResolvedValue([
      {
        id: "owner-1",
        email: "owner@example.com",
        displayName: "Owner",
        role: "OWNER",
      },
    ]);
    vi.spyOn(api, "vaultInvitations").mockResolvedValue([]);
    vi.spyOn(api, "pendingInvitations").mockResolvedValue([]);
    const invite = vi.spyOn(api, "inviteToVault").mockResolvedValue({
      id: "invitation-1",
      email: "editor@example.com",
      role: "EDITOR",
      createdAt: "2026-07-20T00:00:00.000Z",
      expiresAt: "2026-07-27T00:00:00.000Z",
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <SettingsDialog
          open
          section="members"
          vaults={[vault]}
          selected={vault.id}
          onOpenChange={() => undefined}
          onSectionChange={() => undefined}
          onSelect={() => undefined}
          onLogout={() => undefined}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Invitation email"), {
      target: { value: "editor@example.com" },
    });
    fireEvent.click(screen.getByText("Invite", { selector: "button" }));
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(vault.id, "editor@example.com", "EDITOR"),
    );
  });
});
