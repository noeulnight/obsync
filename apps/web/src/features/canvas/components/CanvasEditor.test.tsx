// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import type { WebDocument } from "@/features/documents/lib/sync";
import type { WebCanvas } from "../lib/sync";
import { CanvasEditor } from "./CanvasEditor";

afterEach(cleanup);

describe("CanvasEditor", () => {
  it("pans beyond the old Canvas boundaries", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
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
      />,
    );

    const surface = screen.getByTestId("canvas-surface");
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 20, clientY: 10 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 20, clientY: 10 });

    expect(screen.getByTestId("canvas-viewport").style.transform).toContain(
      "translate(-80px, -90px)",
    );
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

  it("connects nodes by dragging from the connection handle", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const connect = vi.fn();
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
      />,
    );

    const [source, target] = screen.getAllByRole("button", { name: "text Canvas 노드" });
    fireEvent.pointerDown(source, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(source, { pointerId: 1 });
    const sourceHandle = screen.getByRole("button", { name: "오른쪽 연결점" });
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
      .getAllByRole("button", { name: "왼쪽 연결점" })
      .find((handle) => handle.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId === "two");
    expect(targetHandle?.className.includes("opacity-100")).toBe(true);
    fireEvent.pointerUp(sourceHandle, {
      pointerId: 2,
      clientX: 500,
      clientY: 180,
    });

    expect(connect).toHaveBeenCalledWith("one", "two", "right", "left");
  });

  it("changes color, zooms to, and edits a selected node", async () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    Object.defineProperties(HTMLElement.prototype, {
      clientWidth: { configurable: true, get: () => 1_000 },
      clientHeight: { configurable: true, get: () => 800 },
    });
    const setColor = vi.fn();
    const ydoc = new Y.Doc();
    const text = ydoc.getText("canvas-node:one:text");
    text.insert(0, "One");
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
      setColor,
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
      />,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "text Canvas 노드" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "노드 색상" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "빨강" }));
    expect(setColor).toHaveBeenCalledWith("one", "1");

    fireEvent.click(screen.getByRole("button", { name: "선택한 노드로 이동" }));
    await waitFor(() =>
      expect(screen.getByTestId("canvas-viewport").style.transform).toContain(
        "translate(20px, 40px) scale(2)",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "확대 초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    const toolbar = screen.getByRole("button", { name: "노드 삭제" }).parentElement;
    expect(Number(toolbar?.style.scale)).toBeCloseTo(1 / 1.1);
    expect(
      screen.getByTestId("canvas-surface").contains(screen.getByRole("button", { name: "확대" })),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "노드 편집" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox")));
    const editor = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement);
    if (!editor) throw new Error("Canvas editor was not mounted");
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "한글 입력" } });
    expect(text.toJSON()).toBe("한글 입력");
  });
});
