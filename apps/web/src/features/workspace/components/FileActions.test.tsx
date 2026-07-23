// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FileTree } from "@/features/documents/components/FileTree";
import { RenameFileDialog } from "./FileDialogs";

afterEach(cleanup);

describe("file actions", () => {
  it("runs rename from the file tree context menu", async () => {
    const rename = vi.fn();
    render(
      <TooltipProvider>
        <SidebarProvider>
          <FileTree
            entries={[{ id: "1", kind: "markdown", path: "note.md", deleted: false }]}
            active="1"
            open={() => undefined}
            rename={rename}
            remove={() => undefined}
            move={() => undefined}
          />
        </SidebarProvider>
      </TooltipProvider>,
    );

    fireEvent.contextMenu(screen.getByText("note"));
    fireEvent.click(await screen.findByText("Rename"));

    await waitFor(() => expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: "1" })));
  });

  it("moves a file when dropped on a folder", () => {
    const move = vi.fn();
    render(
      <TooltipProvider>
        <SidebarProvider>
          <FileTree
            entries={[
              { id: "folder", kind: "folder", path: "notes", deleted: false },
              { id: "note", kind: "markdown", path: "note.md", deleted: false },
            ]}
            active="note"
            open={() => undefined}
            rename={() => undefined}
            remove={() => undefined}
            move={move}
          />
        </SidebarProvider>
      </TooltipProvider>,
    );

    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
    fireEvent.dragStart(screen.getByText("note").closest("button")!, { dataTransfer });
    fireEvent.dragOver(screen.getByText("notes").closest("button")!, { dataTransfer });
    fireEvent.drop(screen.getByText("notes").closest("button")!, { dataTransfer });

    expect(move).toHaveBeenCalledWith(expect.objectContaining({ id: "note" }), "notes");
  });

  it("submits the new name from the rename dialog", () => {
    const rename = vi.fn(() => undefined);
    render(
      <RenameFileDialog
        entry={{ id: "1", kind: "markdown", path: "note.md", deleted: false }}
        close={() => undefined}
        rename={rename}
      />,
    );

    fireEvent.change(screen.getByLabelText("New file name"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(rename).toHaveBeenCalledWith("renamed");
  });
});
