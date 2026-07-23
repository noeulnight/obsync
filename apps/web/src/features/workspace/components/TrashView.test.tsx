// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import type { FileEntry } from "@/features/documents/lib/files";
import type { ApiClient } from "@/lib/api/client";
import { TrashView } from "./TrashView";

const entry: FileEntry = {
  id: "deleted-file",
  kind: "attachment",
  path: "old.pdf",
  deleted: true,
  version: 2,
};

describe("TrashView", () => {
  it("restores and permanently deletes trashed files", async () => {
    const restore = vi.fn().mockResolvedValue(undefined);
    const permanentlyDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <TrashView
        api={{} as ApiClient}
        vaultId="vault"
        entries={[entry]}
        canRestore
        canPermanentlyDelete
        restore={restore}
        permanentlyDelete={permanentlyDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(entry));

    fireEvent.click(screen.getByRole("button", { name: "Permanently delete old.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(permanentlyDelete).toHaveBeenCalledWith(entry));
  });
});
