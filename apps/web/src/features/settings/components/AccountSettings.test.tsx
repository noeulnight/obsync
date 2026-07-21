// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { AccountSettings } from "./AccountSettings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("account settings", () => {
  it("updates the display name and revokes another session", async () => {
    const account = {
      id: "user-1",
      email: "user@example.com",
      displayName: "Old name",
      createdAt: "2026-07-20T00:00:00.000Z",
      canManageCredentials: true,
    };
    const accountSessions = [
      {
        id: "session-1",
        userAgent: "Chrome",
        current: true,
        createdAt: account.createdAt,
        expiresAt: account.createdAt,
      },
      {
        id: "session-2",
        userAgent: "Obsidian",
        current: false,
        createdAt: account.createdAt,
        expiresAt: account.createdAt,
      },
    ];
    const update = vi.spyOn(api, "updateAccount").mockResolvedValue({
      ...account,
      displayName: "New name",
    });
    const revoke = vi.spyOn(api, "revokeSession").mockResolvedValue();
    vi.spyOn(api, "accountSessions").mockResolvedValue(accountSessions);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(queryKeys.account, account);
    client.setQueryData(queryKeys.accountSessions, accountSessions);

    render(
      <QueryClientProvider client={client}>
        <AccountSettings enabled onLogout={() => undefined} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "New name" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ displayName: "New name" }));

    fireEvent.click(screen.getByText("Sign out", { selector: "button" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("session-2"));
  });
});
