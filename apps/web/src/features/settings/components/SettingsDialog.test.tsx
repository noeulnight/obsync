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
  it("renames and deletes a Vault", async () => {
    const vault = { id: "vault-1", name: "Personal", role: "OWNER" as const };
    const rename = vi.spyOn(api, "updateVault").mockResolvedValue({ ...vault, name: "Work" });
    const remove = vi.spyOn(api, "deleteVault").mockResolvedValue();
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
          section="vaults"
          vaults={[vault]}
          selected={vault.id}
          onOpenChange={() => undefined}
          onSectionChange={() => undefined}
          onSelect={select}
          onLogout={() => undefined}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Personal 이름"), { target: { value: "Work" } });
    fireEvent.click(screen.getByText("저장"));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(vault.id, "Work"));

    fireEvent.click(screen.getByLabelText("Personal 삭제"));
    fireEvent.click(await screen.findByText("삭제", { selector: "button" }));
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

    fireEvent.change(screen.getByLabelText("초대 이메일"), {
      target: { value: "editor@example.com" },
    });
    fireEvent.click(screen.getByText("초대", { selector: "button" }));
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(vault.id, "editor@example.com", "EDITOR"),
    );
  });
});
