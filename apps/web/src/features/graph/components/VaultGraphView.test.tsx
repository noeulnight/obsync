// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { FileEntry } from "@/features/documents/lib/files";
import type { ApiClient } from "@/lib/api/client";
import { forceLayout, VaultGraphView } from "./VaultGraphView";

afterEach(cleanup);

describe("VaultGraphView", () => {
  it("lays out every graph node at a finite, distinct position", () => {
    const positions = forceLayout({
      nodes: ["one", "two", "three"].map((id) => ({ id, path: `${id}.md`, exists: true })),
      edges: [{ source: "one", target: "two" }],
    });

    expect(positions.size).toBe(3);
    expect(
      new Set(
        [...positions.values()].map(({ x, y }) => {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThan(0);
          expect(x).toBeLessThan(1000);
          expect(y).toBeGreaterThan(0);
          expect(y).toBeLessThan(700);
          return `${Math.round(x)}:${Math.round(y)}`;
        }),
      ).size,
    ).toBe(3);
  });

  it("renders force links and opens a document node", async () => {
    const entries = [
      { id: "one", kind: "markdown", path: "One.md", deleted: false, version: 1 },
      { id: "two", kind: "markdown", path: "Two.md", deleted: false, version: 1 },
      { id: "three", kind: "markdown", path: "Three.md", deleted: false, version: 1 },
    ] as FileEntry[];
    const open = vi.fn();
    const create = vi.fn();
    const api = {
      vaultGraph: vi.fn().mockResolvedValue({
        nodes: entries.map(({ id, path }) => ({ id, path, exists: true })),
        edges: [{ source: "one", target: "two" }],
      }),
    } as unknown as ApiClient;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <VaultGraphView
          api={api}
          vaultId="vault"
          vaultName="Test"
          entries={entries}
          open={open}
          create={create}
        />
      </QueryClientProvider>,
    );

    const link = await screen.findByRole("link", { name: "Open Two" });
    fireEvent.pointerDown(link.querySelector("g") as SVGGElement, {
      pointerId: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerUp(screen.getByLabelText("Vault graph"), {
      pointerId: 1,
      clientX: 201,
      clientY: 201,
    });
    expect(open).toHaveBeenCalledWith(entries[1]);
    expect(document.querySelectorAll("[data-graph-link]")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /^Open / })).toHaveLength(3);
  });

  it("creates an unresolved linked document", async () => {
    const create = vi.fn();
    const api = {
      vaultGraph: vi.fn().mockResolvedValue({
        nodes: [
          { id: "one", path: "One.md", exists: true },
          { id: "missing:notes/two.md", path: "Notes/Two.md", exists: false },
        ],
        edges: [{ source: "one", target: "missing:notes/two.md" }],
      }),
    } as unknown as ApiClient;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <VaultGraphView
          api={api}
          vaultId="vault"
          vaultName="Test"
          entries={[{ id: "one", kind: "markdown", path: "One.md", deleted: false }]}
          open={() => undefined}
          create={create}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("link", { name: "Open Two" }));
    expect(create).toHaveBeenCalledWith("Notes/Two.md");
  });
});
