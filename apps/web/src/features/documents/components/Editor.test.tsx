// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { acceptCompletion, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import type { WebDocument } from "../lib/sync";
import { Editor } from "./Editor";

function session() {
  const document = new Y.Doc();
  const listeners = new Set<() => void>();
  const local: Record<string, unknown> = { user: { name: "Web", color: "#7c6cff" } };
  const awareness = {
    clientID: document.clientID,
    doc: document,
    getLocalState: () => local,
    getStates: () => new Map([[document.clientID, local]]),
    on: (_event: string, listener: () => void) => listeners.add(listener),
    off: (_event: string, listener: () => void) => listeners.delete(listener),
    setLocalStateField: (field: string, value: unknown) => {
      local[field] = value;
    },
  };
  const acquire = vi.fn();
  const release = vi.fn();
  const destroy = vi.fn();
  const connected = {
    document,
    text: document.getText("content"),
    provider: { awareness },
    acquire,
    release,
    clearCursor: vi.fn(),
    destroy,
  } as unknown as WebDocument;
  return { connected, acquire, release, destroy };
}

describe("Editor", () => {
  it("renders editable properties and Obsidian-style code blocks", async () => {
    const { connected } = session();
    connected.text.insert(
      0,
      "---\nstatus: draft\ntags: [sync]\n---\n# Note\n```ts\nconst value = 1\n```\n\nEnd",
    );
    const rendered = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      rendered.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });

    await waitFor(() => expect(screen.getByLabelText("Properties")).toBeTruthy());
    expect(rendered.container.querySelector(".cm-live-code-language")?.textContent).toBe("ts");
    expect(rendered.container.querySelector(".cm-live-code-line")?.textContent).toContain(
      "const value = 1",
    );

    const value = screen.getAllByLabelText("Property value")[0];
    fireEvent.change(value, { target: { value: "published" } });
    fireEvent.blur(value);
    expect(connected.text.toJSON()).toContain("status: published");
  });

  it("keeps the presence binding when callback props change", () => {
    const { connected, destroy } = session();
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = view.container.querySelector(".cm-editor");

    view.rerender(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve("updated")}
      />,
    );

    expect(view.container.querySelector(".cm-editor")).toBe(editor);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("refreshes an image when its Vault entry arrives", async () => {
    const { connected } = session();
    connected.text.insert(0, "![[photo.png]]\nEnd");
    let available = false;
    const resolveAsset = () =>
      Promise.resolve(available ? "https://example.com/photo.png" : undefined);
    const view = render(
      <Editor
        session={connected}
        files={[]}
        onNavigate={() => undefined}
        resolveAsset={resolveAsset}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });

    await waitFor(() =>
      expect(view.container.querySelector(".cm-live-image")?.textContent).toContain(
        "Image not found",
      ),
    );
    available = true;
    view.rerender(
      <Editor
        session={connected}
        files={[{ id: "photo", kind: "attachment", path: "photo.png", deleted: false }]}
        onNavigate={() => undefined}
        resolveAsset={resolveAsset}
      />,
    );

    await waitFor(() =>
      expect(view.container.querySelector<HTMLImageElement>(".cm-live-image img")?.src).toBe(
        "https://example.com/photo.png",
      ),
    );
  });

  it("uploads pasted images and inserts Vault embeds", async () => {
    const { connected } = session();
    connected.text.insert(0, "Before ");
    const onPasteImages = vi.fn().mockResolvedValue(["Notes/photo.png"]);
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        onPasteImages={onPasteImages}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });

    fireEvent.paste(view.container.querySelector(".cm-content") as HTMLElement, {
      clipboardData: {
        files: [new File(["image"], "photo.png", { type: "image/png" })],
      },
    });

    await waitFor(() => expect(connected.text.toJSON()).toBe("Before ![[Notes/photo.png]]"));
    expect(onPasteImages).toHaveBeenCalledOnce();
  });

  it("releases the session without destroying it during an editor remount", () => {
    const { connected, acquire, release, destroy } = session();
    const first = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );

    first.unmount();

    expect(acquire).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("disables editing while the workspace is offline", () => {
    const { connected } = session();
    const rendered = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        readOnly
      />,
    );

    expect(rendered.container.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe(
      "false",
    );
  });

  it("completes wiki links with Vault documents", async () => {
    const { connected } = session();
    connected.text.insert(0, "[[Be");
    const rendered = render(
      <Editor
        session={connected}
        files={[
          {
            id: "beta",
            kind: "markdown",
            path: "Notes/Beta.md",
            deleted: false,
            version: 1,
          },
        ]}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      rendered.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });

    expect(startCompletion(editor)).toBe(true);
    await waitFor(() =>
      expect(document.querySelector(".cm-completionLabel")?.textContent).toBe("Beta"),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(acceptCompletion(editor)).toBe(true);
    await waitFor(() => expect(connected.text.toJSON()).toBe("[[Notes/Beta]]"));
  });

  it("opens a rendered wiki link before CodeMirror turns it back into source", async () => {
    const { connected } = session();
    connected.text.insert(0, "[[Notes/Beta]]\nEnd");
    const onNavigate = vi.fn();
    const rendered = render(
      <Editor
        session={connected}
        onNavigate={onNavigate}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      rendered.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });

    const link = await waitFor(() => rendered.container.querySelector(".cm-live-link"));
    if (!link) throw new Error("Wiki link was not rendered");
    fireEvent.mouseDown(link, { button: 0 });

    expect(onNavigate).toHaveBeenCalledWith("Notes/Beta");
  });
});
