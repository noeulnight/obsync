// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { FileEntry } from "@/features/documents/lib/files";
import type { ApiClient } from "@/lib/api/client";
import { WorkspaceSearchPanel } from "./WorkspaceSearchPanel";

const entries: FileEntry[] = [
  { id: "one", kind: "markdown", path: "Alpha.md", deleted: false, version: 1 },
  { id: "two", kind: "markdown", path: "Notes/Beta.md", deleted: false, version: 1 },
];

afterEach(cleanup);

describe("WorkspaceSearchPanel", () => {
  it("searches note contents and opens the matching file", async () => {
    const open = vi.fn();
    const searchVault = vi
      .fn()
      .mockResolvedValue([{ id: "two", path: "Notes/Beta.md", excerpt: "Matches note contents." }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkspaceSearchPanel
          api={{ searchVault } as unknown as ApiClient}
          vaultId="vault"
          entries={entries}
          open={open}
          close={() => undefined}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search Vault" }), {
      target: { value: "contents" },
    });

    await waitFor(() => expect(searchVault).toHaveBeenCalledWith("vault", "contents"));
    fireEvent.click(screen.getByRole("button", { name: /Beta/ }));

    expect(open).toHaveBeenCalledWith(entries[1]);
  });
});
