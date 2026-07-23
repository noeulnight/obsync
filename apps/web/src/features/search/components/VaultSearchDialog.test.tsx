// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { FileEntry } from "@/features/documents/lib/files";
import type { ApiClient } from "@/lib/api/client";
import { VaultSearchDialog, type SearchMode } from "./VaultSearchDialog";

const entries = [
  { id: "one", kind: "markdown", path: "Alpha.md", deleted: false, version: 1 },
  { id: "two", kind: "markdown", path: "Notes/Beta.md", deleted: false, version: 1 },
] as const;

afterEach(cleanup);

describe("VaultSearchDialog", () => {
  it("filters files and opens the selected result from the keyboard", () => {
    const open = vi.fn<(entry: FileEntry) => void>();
    renderDialog(open);
    const input = screen.getByRole("textbox", { name: "Quick open" });

    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(open).toHaveBeenCalledWith(entries[1]);
  });

  it("offers only documents and Canvases when adding to a Canvas", () => {
    const open = vi.fn<(entry: FileEntry) => void>();
    renderDialog(open, "canvas", [
      ...entries,
      { id: "image", kind: "attachment", path: "photo.png", deleted: false, version: 1 },
      { id: "canvas", kind: "canvas", path: "Board.canvas", deleted: false, version: 1 },
    ]);

    expect(screen.getByRole("button", { name: "Alpha Alpha.md" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Board Board.canvas" })).toBeTruthy();
    expect(screen.queryByText("photo")).toBeNull();
  });

  it("re-filters an open picker when its mode changes", () => {
    const open = vi.fn<(entry: FileEntry) => void>();
    const files: FileEntry[] = [
      ...entries,
      { id: "canvas", kind: "canvas", path: "Board.canvas", deleted: false, version: 1 },
    ];
    const view = renderDialog(open, "open", files);
    expect(screen.getByText("Board")).toBeTruthy();

    view.rerender(dialog(open, "canvas", files));

    expect(screen.getByText("Board")).toBeTruthy();
  });

  it("runs quick actions from an empty quick opener", () => {
    const action = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <VaultSearchDialog
          api={{ searchVault: vi.fn() } as unknown as ApiClient}
          vaultId="vault"
          mode="open"
          entries={[...entries]}
          actions={[{ label: "Open graph", run: action }]}
          close={() => undefined}
          open={() => undefined}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open graph" }));
    expect(action).toHaveBeenCalledOnce();
  });
});

function renderDialog(
  open: (entry: FileEntry) => void,
  mode: SearchMode = "open",
  files: FileEntry[] = [...entries],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(dialog(open, mode, files, client));
}

function dialog(
  open: (entry: FileEntry) => void,
  mode: SearchMode,
  files: FileEntry[],
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return (
    <QueryClientProvider client={client}>
      <VaultSearchDialog
        api={{ searchVault: vi.fn() } as unknown as ApiClient}
        vaultId="vault"
        mode={mode}
        entries={files}
        close={() => undefined}
        open={open}
      />
    </QueryClientProvider>
  );
}
