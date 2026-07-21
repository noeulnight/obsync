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
          />
        </SidebarProvider>
      </TooltipProvider>,
    );

    fireEvent.contextMenu(screen.getByText("note"));
    fireEvent.click(await screen.findByText("이름 변경"));

    await waitFor(() => expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: "1" })));
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

    fireEvent.change(screen.getByLabelText("새 파일 이름"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByText("변경"));

    expect(rename).toHaveBeenCalledWith("renamed");
  });
});
