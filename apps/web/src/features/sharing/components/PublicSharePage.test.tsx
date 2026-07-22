// @vitest-environment happy-dom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { PublicSharePage } from "./PublicSharePage";

vi.mock("../queries/use-public-share", () => ({
  usePublicShare: (slug: string) => ({
    isPending: false,
    isError: false,
    data: slug === "public-markdown" ? markdownShare : canvasShare,
  }),
}));

const canvasShare = {
  slug: "public-canvas",
  vaultName: "Shared Vault",
  file: { id: "canvas", kind: "canvas", path: "Board.canvas" },
  canvas: {
    meta: {},
    nodes: [
      {
        id: "note",
        type: "file",
        file: "Note.md",
        x: 0,
        y: 0,
        width: 320,
        height: 220,
      },
    ],
    edges: [],
  },
  documents: [{ id: "document", path: "Note.md", content: "# Embedded note" }],
  attachments: [],
};

const markdownShare = {
  slug: "public-markdown",
  vaultName: "Shared Vault",
  file: { id: "markdown", kind: "markdown", path: "Public note.md" },
  content: "Body",
  documents: [],
  attachments: [],
};

afterEach(cleanup);

describe("PublicSharePage", () => {
  it("renders a shared Canvas and its embedded Markdown document", async () => {
    const view = render(
      <MemoryRouter initialEntries={["/s/public-canvas"]}>
        <Routes>
          <Route path="/s/:slug" element={<PublicSharePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(view.getByText("Board")).not.toBeNull();
    expect(view.getByTestId("canvas-surface").parentElement?.className).toContain("flex");
    await waitFor(() => expect(view.container.textContent).toContain("Embedded note"));
  });

  it("shows the document title in the fixed header after the page title scrolls away", () => {
    const view = render(
      <MemoryRouter initialEntries={["/s/public-markdown"]}>
        <Routes>
          <Route path="/s/:slug" element={<PublicSharePage />} />
        </Routes>
      </MemoryRouter>,
    );
    const headerTitle = view.container.querySelector("header .font-medium");
    const scroller = view.container.querySelector(".overflow-y-auto");
    expect(headerTitle?.className).toContain("opacity-0");
    if (!scroller) throw new Error("Missing public document scroller");
    scroller.scrollTop = 1;
    fireEvent.scroll(scroller);
    expect(headerTitle?.className).toContain("opacity-100");
  });
});
