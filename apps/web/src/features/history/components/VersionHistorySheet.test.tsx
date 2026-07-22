// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ApiClient } from "@/lib/api/client";
import { VersionHistorySheet } from "./VersionHistorySheet";

afterEach(cleanup);

describe("VersionHistorySheet", () => {
  it("previews and restores a saved document version", async () => {
    const restoreFileVersion = vi.fn().mockResolvedValue(undefined);
    const api = {
      fileVersions: vi.fn().mockResolvedValue([
        {
          id: "version-one",
          version: 2,
          path: "Note.md",
          deletedAt: null,
          attachmentId: null,
          createdAt: "2026-07-21T10:00:00.000Z",
          hasContent: true,
          createdBy: { id: "user", displayName: "Alex", email: "alex@example.com" },
        },
      ]),
      fileVersion: vi.fn().mockResolvedValue({
        id: "version-one",
        version: 2,
        path: "Note.md",
        deletedAt: null,
        createdAt: "2026-07-21T10:00:00.000Z",
        createdBy: { id: "user", displayName: "Alex", email: "alex@example.com" },
        content: "Earlier content",
      }),
      restoreFileVersion,
    } as unknown as ApiClient;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <VersionHistorySheet api={api} vaultId="vault" fileId="file" readOnly={false} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Version history" }));
    expect(await screen.findByText("Earlier content")).toBeTruthy();
    const drawer = document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
    const initialWidth = Number.parseInt(drawer?.style.width ?? "0", 10);
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize version history" }), {
      key: "ArrowRight",
    });
    expect(Number.parseInt(drawer?.style.width ?? "0", 10)).toBe(initialWidth - 32);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore version" }));

    await waitFor(() =>
      expect(restoreFileVersion).toHaveBeenCalledWith("vault", "file", "version-one"),
    );
  });
});
