// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import type { WebDocument } from "@/features/documents/lib/sync";
import type { WebCanvas } from "../lib/sync";
import { CanvasEditor } from "./CanvasEditor";
import { canvasColor } from "./CanvasNode";

afterEach(cleanup);

describe("CanvasEditor", () => {
  it("uses Obsidian's dark Canvas palette", () => {
    expect(canvasColor("1")).toBe("rgb(251 70 76)");
    expect(canvasColor("6")).toBe("rgb(168 130 255)");
    expect(canvasColor("#123456")).toBe("#123456");
  });

  it("pans beyond the old Canvas boundaries", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const onAddFile = vi.fn();
    const session = {
      nodes: () => [],
      edges: () => [],
      presence: () => [],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
    } as unknown as WebCanvas;

    render(
      <CanvasEditor
        session={session}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => undefined}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve(undefined)}
        files={[]}
        onAddFile={onAddFile}
      />,
    );

    const surface = screen.getByTestId("canvas-surface");
    expect(surface.style.backgroundSize).toBe("24px 24px");
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 20, clientY: 10 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 20, clientY: 10 });

    expect(screen.getByTestId("canvas-viewport").style.transform).toContain(
      "translate(-80px, -90px)",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add document" }));
    fireEvent.click(screen.getByRole("button", { name: "Add media" }));
    expect(onAddFile).toHaveBeenCalledTimes(2);
  });

  it("creates a card by double-clicking empty space", () => {
    const addText = vi.fn(() => "new-card");
    const session = {
      nodes: () => [],
      edges: () => [],
      presence: () => [],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
      addText,
    } as unknown as WebCanvas;

    render(
      <CanvasEditor
        session={session}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => undefined}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve(undefined)}
        files={[]}
        onAddFile={() => undefined}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId("canvas-surface"), {
      clientX: 400,
      clientY: 300,
    });
    expect(addText).toHaveBeenCalledWith(260, 220);
  });

  it("keeps embedded documents connected while their nodes are not being edited", async () => {
    const canvas = {
      nodes: () => [
        { id: "file", type: "file", x: 100, y: 100, width: 280, height: 160, file: "Note.md" },
      ],
      edges: () => [],
      presence: () => [],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
    } as unknown as WebCanvas;
    const ydoc = new Y.Doc();
    const local: Record<string, unknown> = {};
    const acquire = vi.fn();
    const release = vi.fn();
    const document = {
      text: ydoc.getText("content"),
      provider: {
        awareness: {
          clientID: ydoc.clientID,
          doc: ydoc,
          getLocalState: () => local,
          getStates: () => new Map([[ydoc.clientID, local]]),
          on: () => undefined,
          off: () => undefined,
          setLocalStateField: (field: string, value: unknown) => {
            local[field] = value;
          },
        },
      },
      acquire,
      release,
    } as unknown as WebDocument;
    const view = render(
      <CanvasEditor
        session={canvas}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => document}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve(undefined)}
        files={[]}
        onAddFile={() => undefined}
      />,
    );

    expect(acquire).toHaveBeenCalledOnce();
    document.text.insert(0, "원격 변경");
    await waitFor(() => {
      const editor = EditorView.findFromDOM(
        view.container.querySelector(".cm-editor") as HTMLElement,
      );
      expect(editor?.state.doc.toString()).toBe("원격 변경");
    });
    view.unmount();
    expect(release).toHaveBeenCalledOnce();
  });

  it("renders Markdown styling in text nodes", async () => {
    const document = new Y.Doc();
    const text = document.getText("canvas-node:note:text");
    text.insert(0, "# 제목\n**굵게**");
    const session = {
      nodes: () => [
        { id: "note", type: "text", x: 100, y: 100, width: 280, height: 160, text: text.toJSON() },
      ],
      edges: () => [],
      presence: () => [],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
      text: () => text,
    } as unknown as WebCanvas;

    const view = render(
      <CanvasEditor
        session={session}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => undefined}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve(undefined)}
        files={[]}
        onAddFile={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(view.container.querySelector(".cm-live-heading-1")).not.toBeNull();
      expect(view.container.querySelector(".cm-live-strong")).not.toBeNull();
    });
  });

  it("connects nodes by dragging from the connection handle", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const connect = vi.fn();
    const document = new Y.Doc();
    const nodes = [
      { id: "one", type: "text", x: 100, y: 100, width: 280, height: 160, text: "One" },
      { id: "two", type: "text", x: 500, y: 100, width: 280, height: 160, text: "Two" },
    ];
    const session = {
      nodes: () => nodes,
      edges: () => [],
      presence: () => [],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
      text: (id: string) => document.getText(`canvas-node:${id}:text`),
      bringToFront: () => undefined,
      connect,
    } as unknown as WebCanvas;

    render(
      <CanvasEditor
        session={session}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => undefined}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve(undefined)}
        files={[]}
        onAddFile={() => undefined}
      />,
    );

    const [source, target] = screen.getAllByRole("button", { name: "text Canvas node" });
    fireEvent.pointerDown(source, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(source, { pointerId: 1 });
    const sourceHandle = screen.getByRole("button", { name: "Right connection point" });
    fireEvent.pointerDown(sourceHandle, {
      pointerId: 2,
      clientX: 380,
      clientY: 180,
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => target,
    });
    fireEvent.pointerMove(sourceHandle, { pointerId: 2, clientX: 500, clientY: 180 });
    const targetHandle = screen
      .getAllByRole("button", { name: "Left connection point" })
      .find((handle) => handle.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId === "two");
    expect(targetHandle?.className.includes("opacity-100")).toBe(true);
    fireEvent.pointerUp(target, {
      pointerId: 2,
      clientX: 500,
      clientY: 180,
    });

    expect(connect).toHaveBeenCalledWith("one", "two", "right", "left");
  });

  it("covers image attachment nodes", async () => {
    const canvas = {
      nodes: () => [
        {
          id: "image",
          type: "file",
          x: 100,
          y: 100,
          width: 280,
          height: 160,
          file: "photo.png",
        },
      ],
      edges: () => [],
      presence: () => [],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
    } as unknown as WebCanvas;

    render(
      <CanvasEditor
        session={canvas}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => undefined}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve("https://example.com/photo.png")}
        files={[
          {
            id: "attachment",
            kind: "attachment",
            path: "photo.png",
            deleted: false,
          },
        ]}
        onAddFile={() => undefined}
      />,
    );

    expect(screen.getByTestId("canvas-image-skeleton")).toBeTruthy();
    const image = await screen.findByRole("img", { name: "photo.png" });
    expect(image.className).toContain("object-cover");
    expect(image.className).not.toContain("object-contain");
    fireEvent.load(image);
    expect(screen.queryByTestId("canvas-image-skeleton")).toBeNull();
  });

  it("changes color, zooms to, and edits a selected node", async () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 1_000 },
      clientHeight: { configurable: true, get: () => 800 },
    });
    const setColor = vi.fn();
    const deleteNode = vi.fn();
    const ydoc = new Y.Doc();
    const text = ydoc.getText("canvas-node:one:text");
    text.insert(0, "One");
    const session = {
      nodes: () => [
        {
          id: "one",
          type: "text",
          x: 100,
          y: 100,
          width: 280,
          height: 160,
          color: "3",
          text: "One",
        },
      ],
      edges: () => [],
      presence: () => [{ clientId: 2, name: "Remote", color: "#30bced", focusId: "one" }],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
      bringToFront: () => undefined,
      setColor,
      deleteNode,
      text: () => text,
      provider: { awareness: undefined },
    } as unknown as WebCanvas;

    render(
      <CanvasEditor
        session={session}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => undefined}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve(undefined)}
        files={[]}
        onAddFile={() => undefined}
      />,
    );

    const nodeButton = screen.getByRole("button", { name: "text Canvas node" });
    fireEvent.pointerDown(nodeButton);
    expect(nodeButton.parentElement?.style.borderColor).toBe("rgb(224 222 113)");
    expect(nodeButton.parentElement?.className).toContain("[&_.cm-editor]:!bg-transparent");
    fireEvent.click(screen.getByRole("button", { name: "Node color" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Red" }));
    expect(setColor).toHaveBeenCalledWith("one", "1");

    fireEvent.click(screen.getByRole("button", { name: "Node color" }));
    const customColor = await screen.findByLabelText("Custom node color");
    fireEvent.click(customColor);
    expect(screen.getByRole("menu", { name: "Node color" })).toBeTruthy();
    fireEvent.change(customColor, {
      target: { value: "#123456" },
    });
    expect(setColor).toHaveBeenCalledWith("one", "#123456");
    fireEvent.keyDown(customColor, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Center selected node" }));
    await waitFor(() =>
      expect(screen.getByTestId("canvas-viewport").style.transform).toContain(
        "translate(20px, 40px) scale(2)",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const toolbar = screen.getByRole("button", { name: "Delete node" }).parentElement;
    expect(Number(toolbar?.style.scale)).toBeCloseTo(1 / 1.1);
    expect(
      screen
        .getByTestId("canvas-surface")
        .contains(screen.getByRole("button", { name: "Zoom in" })),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Edit node" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox")));
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement);
    if (!editor) throw new Error("Canvas editor was not mounted");
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "한글 입력" } });
    expect(text.toJSON()).toBe("한글 입력");
  });

  it("deletes the selected node with Backspace", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const deleteNode = vi.fn();
    const session = {
      nodes: () => [
        { id: "one", type: "text", x: 100, y: 100, width: 280, height: 160, text: "One" },
      ],
      edges: () => [],
      presence: () => [],
      subscribe: () => () => undefined,
      subscribePresence: () => () => undefined,
      destroy: () => undefined,
      setPresence: () => undefined,
      bringToFront: () => undefined,
      deleteNode,
      text: () => new Y.Doc().getText("text"),
      provider: { awareness: undefined },
    } as unknown as WebCanvas;

    render(
      <CanvasEditor
        session={session}
        vaultName="Vault"
        path="Test.canvas"
        onRename={() => undefined}
        onDelete={() => undefined}
        openDocument={() => undefined}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        resolveFileAsset={() => Promise.resolve(undefined)}
        files={[]}
        onAddFile={() => undefined}
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "text Canvas node" }));
    fireEvent.keyDown(screen.getByTestId("canvas-surface"), { key: "Backspace" });
    expect(deleteNode).toHaveBeenCalledWith("one");
  });
});
