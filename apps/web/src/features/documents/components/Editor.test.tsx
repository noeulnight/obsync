// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { acceptCompletion, startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import type { WebDocument } from "../lib/sync";
import { Editor } from "./Editor";

function session(document = new Y.Doc()) {
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
  return { connected, awareness, acquire, release, destroy };
}

describe("Editor", () => {
  it("renders editable properties and Obsidian-style code blocks", async () => {
    const { connected } = session();
    connected.text.insert(
      0,
      "---\nstatus: draft\ntags:\n  - sync\n  - yjs\ncreated: 2026-07-23\n---\n# Note\n```ts\nconst value = 1\n```\n\nEnd",
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
    editor.dispatch({ selection: { anchor: 10 } });

    await waitFor(() => expect(screen.getByLabelText("Properties")).toBeTruthy());
    expect(rendered.container.querySelectorAll(".cm-markdown-property-chip")).toHaveLength(2);
    const date = screen
      .getAllByLabelText("Property value")
      .find((input) => (input as HTMLInputElement).value.includes("2026")) as HTMLInputElement;
    expect(date.value).toBe(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(2026, 6, 23)),
    );
    fireEvent.focus(date);
    expect(date.type).toBe("date");
    expect(date.value).toBe("2026-07-23");
    fireEvent.blur(date);
    fireEvent.click(screen.getByLabelText("Toggle properties"));
    expect(screen.getByLabelText("Properties").classList.contains("is-collapsed")).toBe(true);
    expect(rendered.container.querySelector(".cm-markdown-code-language")?.textContent).toBe("ts");
    expect(rendered.container.querySelector(".cm-markdown-code-line")?.textContent).toContain(
      "const value = 1",
    );

    const value = screen.getAllByLabelText("Property value")[0];
    fireEvent.change(value, { target: { value: "published" } });
    fireEvent.blur(value);
    expect(connected.text.toJSON()).toContain("status: published");
  });

  it("renders unordered list markers as bullets", () => {
    const { connected } = session();
    connected.text.insert(0, "- first\n- second");
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

    expect(rendered.container.querySelectorAll(".cm-markdown-bullet")).toHaveLength(2);
    expect(rendered.container.querySelector(".cm-markdown-bullet")?.textContent).toBe("•");
  });

  it("shows raw Markdown without rendering decorations in source mode", () => {
    const { connected } = session();
    connected.text.insert(0, "- first\n- second\n\n**bold**");
    const rendered = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
        sourceMode
      />,
    );

    expect(rendered.container.querySelector(".cm-markdown-bullet")).toBeNull();
    expect(rendered.container.querySelector(".cm-markdown-strong")).toBeNull();
    expect(rendered.container.querySelector(".cm-content")?.textContent).toContain("- first");
    expect(rendered.container.querySelector(".cm-content")?.textContent).toContain("**bold**");
  });

  it("renders Obsidian-compatible inline HTML through DOMPurify", async () => {
    const { connected } = session();
    connected.text.insert(
      0,
      'x <span style="color: rgb(255, 0, 0)">red</span><br><script>bad()</script>',
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
    editor.dispatch({ selection: { anchor: 0 } });

    await waitFor(() => expect(rendered.container.querySelector(".cm-markdown-html")).toBeTruthy());
    const widgets = [...rendered.container.querySelectorAll<HTMLElement>(".cm-markdown-html")];
    expect(widgets.some((element) => element.textContent === "red")).toBe(true);
    expect(widgets.some((element) => element.textContent === "")).toBe(true);
    expect(rendered.container.querySelector("script")).toBeNull();
  });

  it("renders Obsidian-compatible HTML blocks", async () => {
    const { connected } = session();
    connected.text.insert(0, "Before\n<div>\n<strong>Block HTML</strong>\n</div>\nAfter");
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
    editor.dispatch({ selection: { anchor: 0 } });

    await waitFor(() =>
      expect(rendered.container.querySelector("div.cm-markdown-html")).toBeTruthy(),
    );
    expect(rendered.container.querySelector("div.cm-markdown-html")?.textContent).toContain(
      "Block HTML",
    );
    expect(rendered.container.querySelector(".cm-content")?.textContent).not.toContain("<div>");
  });

  it("renders Markdown tables and horizontal rules", () => {
    const { connected } = session();
    connected.text.insert(0, "| Name | Value |\n| :--- | ---: |\n| One \\| Uno | Two |\n\n---\n");
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

    expect(rendered.container.querySelectorAll(".cm-markdown-table-row")).toHaveLength(2);
    expect(rendered.container.querySelectorAll(".cm-markdown-table-cell")).toHaveLength(4);
    expect(rendered.container.querySelector(".cm-markdown-table-separator")).toBeTruthy();
    expect(rendered.container.querySelector(".cm-markdown-horizontal-rule")).toBeTruthy();

    const row = rendered.container.querySelector<HTMLElement>(".cm-markdown-table-row");
    if (!row) throw new Error("Table row was not rendered");
    const helpers = [...row.children].filter(
      (child) =>
        child.classList.contains("cm-widgetBuffer") ||
        child.matches('span[contenteditable="false"]:empty'),
    );
    expect(helpers.length).toBeGreaterThan(0);
    for (const helper of helpers) {
      expect(getComputedStyle(helper).position).toBe("absolute");
    }
    expect(
      rendered.container.querySelectorAll<HTMLElement>(".cm-markdown-table-cell")[1]?.style
        .textAlign,
    ).toBe("right");
    expect(
      rendered.container.querySelectorAll<HTMLElement>(".cm-markdown-table-cell")[2]?.textContent,
    ).toBe("One | Uno");
  });

  it("navigates table cells with Tab and adds a row after the last cell", () => {
    const { connected } = session();
    connected.text.insert(0, "| Name | Value |\n| --- | --- |\n| One | Two |");
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

    const value = editor.state.doc.toString().indexOf("Value");
    editor.dispatch({ selection: { anchor: value - 5 } });
    fireEvent.keyDown(editor.contentDOM, { key: "Tab" });
    expect(
      editor.state.sliceDoc(editor.state.selection.main.from, editor.state.selection.main.to),
    ).toBe("Value");

    const two = editor.state.doc.toString().indexOf("Two");
    editor.dispatch({ selection: { anchor: two } });
    fireEvent.keyDown(editor.contentDOM, { key: "Tab" });
    expect(editor.state.doc.lines).toBe(4);
    expect(connected.text.toJSON()).toBe(editor.state.doc.toString());
  });

  it("uses Markdown syntax for inline formatting", () => {
    const { connected } = session();
    connected.text.insert(0, "*asterisk* _underscore_ **bold** __strong__ \\*literal* `*code*`");
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

    expect(rendered.container.querySelectorAll(".cm-markdown-em")).toHaveLength(2);
    expect(rendered.container.querySelectorAll(".cm-markdown-strong")).toHaveLength(2);
    expect(rendered.container.querySelectorAll(".cm-markdown-em")[0]?.textContent).toBe("asterisk");
    expect(rendered.container.querySelectorAll(".cm-markdown-em")[1]?.textContent).toBe(
      "underscore",
    );
    expect(rendered.container.querySelectorAll(".cm-markdown-em")[2]).toBeUndefined();
  });

  it("renders Obsidian callouts, highlights, tags, footnotes, comments, and inline code", () => {
    const { connected } = session();
    connected.text.insert(
      0,
      "> [!note] Read this\n> quoted\n\n`code` ==marked== #sync [^1] %%hidden%% ^block-id",
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
    editor.dispatch({ selection: { anchor: editor.state.doc.toString().indexOf("quoted") + 2 } });

    expect(rendered.container.querySelectorAll(".cm-markdown-callout")).toHaveLength(2);
    expect(rendered.container.querySelector(".cm-markdown-callout-label")?.textContent).toContain(
      "note",
    );
    expect(rendered.container.querySelector(".cm-markdown-inline-code")?.textContent).toBe("code");
    expect(rendered.container.querySelector(".cm-markdown-highlight")?.textContent).toBe("marked");
    expect(rendered.container.querySelector(".cm-markdown-tag")?.textContent).toBe("#sync");
    expect(rendered.container.querySelector(".cm-markdown-footnote")?.textContent).toBe("[^1]");
    expect(rendered.container.querySelector(".cm-content")?.textContent).not.toContain("hidden");
    expect(rendered.container.querySelector(".cm-content")?.textContent).not.toContain("^block-id");
  });

  it("keeps pointer placement on the clicked DOM line when measured coordinates drift", () => {
    const { connected } = session();
    connected.text.insert(0, "Hellw\nworld");
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
    vi.spyOn(editor, "posAtCoords").mockReturnValue(6);

    fireEvent.click(rendered.container.querySelectorAll(".cm-line")[0], {
      button: 0,
      detail: 1,
      clientX: 10,
      clientY: 10,
    });

    expect(editor.state.selection.main.head).toBe(5);
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

  it("clears the shared cursor when the editor loses focus", async () => {
    const { connected, awareness } = session();
    connected.text.insert(0, "cursor");
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    editor.focus();
    editor.dispatch({ selection: { anchor: 3 } });
    await waitFor(() => expect(awareness.getLocalState().cursor).toBeTruthy());

    editor.contentDOM.blur();
    await waitFor(() => expect(awareness.getLocalState().cursor).toBeNull());
    hasFocus.mockRestore();
  });

  it("defers remote changes until IME composition ends", async () => {
    const { connected } = session();
    connected.text.insert(0, "local");
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");
    editor.dispatch({ selection: { anchor: 2 } });

    Object.defineProperty(editor, "composing", { configurable: true, value: true });
    connected.document.transact(() => connected.text.insert(5, " remote"), "remote");
    expect(editor.state.doc.toString()).toBe("local");

    Object.defineProperty(editor, "composing", { configurable: true, value: false });
    editor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));
    await waitFor(() => expect(editor.state.doc.toString()).toBe("local remote"));
    expect(editor.state.selection.main.anchor).toBe(2);
  });

  it("waits for CodeMirror composition to end before flushing remote changes", async () => {
    const { connected } = session();
    connected.text.insert(0, "local");
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    editor.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    Object.defineProperty(editor, "composing", { configurable: true, value: true });
    connected.document.transact(() => connected.text.insert(5, " remote"), "remote");

    editor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(editor.state.doc.toString()).toBe("local");

    Object.defineProperty(editor, "composing", { configurable: true, value: false });
    await waitFor(() => expect(editor.state.doc.toString()).toBe("local remote"));
  });

  it("flushes remote changes received after compositionend once CodeMirror finishes", async () => {
    const { connected } = session();
    connected.text.insert(0, "local");
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    editor.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    Object.defineProperty(editor, "composing", { configurable: true, value: true });
    editor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));
    connected.document.transact(() => connected.text.insert(5, " remote"), "remote");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(editor.state.doc.toString()).toBe("local");

    Object.defineProperty(editor, "composing", { configurable: true, value: false });
    await waitFor(() => expect(editor.state.doc.toString()).toBe("local remote"));
  });

  it("publishes a completed IME composition as one Yjs change", async () => {
    const { connected } = session();
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    editor.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    Object.defineProperty(editor, "composing", { configurable: true, value: true });
    editor.dispatch({ changes: { from: 0, insert: "ㅎ" } });
    editor.dispatch({ changes: { from: 0, to: 1, insert: "한" } });
    expect(connected.text.toJSON()).toBe("");

    Object.defineProperty(editor, "composing", { configurable: true, value: false });
    editor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));
    await waitFor(() => expect(connected.text.toJSON()).toBe("한"));
  });

  it("keeps simultaneous IME compositions intact", async () => {
    const firstDocument = new Y.Doc();
    const secondDocument = new Y.Doc();
    firstDocument.on("update", (update, origin) => {
      if (origin !== "peer") Y.applyUpdate(secondDocument, update, "peer");
    });
    secondDocument.on("update", (update, origin) => {
      if (origin !== "peer") Y.applyUpdate(firstDocument, update, "peer");
    });
    const first = session(firstDocument).connected;
    const second = session(secondDocument).connected;
    const firstView = render(
      <Editor
        session={first}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const secondView = render(
      <Editor
        session={second}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const firstEditor = EditorView.findFromDOM(
      firstView.container.querySelector(".cm-editor") as HTMLElement,
    );
    const secondEditor = EditorView.findFromDOM(
      secondView.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!firstEditor || !secondEditor) throw new Error("Editors were not mounted");

    for (const editor of [firstEditor, secondEditor]) {
      editor.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      Object.defineProperty(editor, "composing", { configurable: true, value: true });
    }
    firstEditor.dispatch({ changes: { from: 0, insert: "한" } });
    secondEditor.dispatch({ changes: { from: 0, insert: "글" } });

    Object.defineProperty(firstEditor, "composing", { configurable: true, value: false });
    firstEditor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));
    await waitFor(() => expect(first.text.toJSON()).toBe("한"));
    Object.defineProperty(secondEditor, "composing", { configurable: true, value: false });
    secondEditor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));

    await waitFor(() => expect(first.text.toJSON()).toBe(second.text.toJSON()));
    expect(["한글", "글한"]).toContain(first.text.toJSON());
  });

  it("commits IME text before queued remote enters", async () => {
    const { connected } = session();
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    editor.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    Object.defineProperty(editor, "composing", { configurable: true, value: true });
    editor.dispatch({ changes: { from: 0, insert: "한" } });
    connected.document.transact(() => connected.text.insert(0, "\n"), "remote");

    Object.defineProperty(editor, "composing", { configurable: true, value: false });
    editor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));
    connected.document.transact(() => connected.text.insert(1, "\n"), "remote");

    await waitFor(() => expect(editor.state.doc.toString()).toBe(connected.text.toJSON()));
    expect(connected.text.toJSON().replaceAll("\n", "")).toBe("한");
    expect(connected.text.toJSON().match(/\n/g)).toHaveLength(2);
  });

  it("keeps Korean composition intact while a peer repeatedly inserts line breaks", async () => {
    const firstDocument = new Y.Doc();
    const secondDocument = new Y.Doc();
    firstDocument.on("update", (update, origin) => {
      if (origin !== "peer") Y.applyUpdate(secondDocument, update, "peer");
    });
    secondDocument.on("update", (update, origin) => {
      if (origin !== "peer") Y.applyUpdate(firstDocument, update, "peer");
    });
    const first = session(firstDocument).connected;
    const second = session(secondDocument).connected;
    first.text.insert(0, "top\nbelow");
    const firstView = render(
      <Editor
        session={first}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const secondView = render(
      <Editor
        session={second}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const firstEditor = EditorView.findFromDOM(
      firstView.container.querySelector(".cm-editor") as HTMLElement,
    );
    const secondEditor = EditorView.findFromDOM(
      secondView.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!firstEditor || !secondEditor) throw new Error("Editors were not mounted");

    secondEditor.dispatch({ selection: { anchor: secondEditor.state.doc.length } });
    secondEditor.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    Object.defineProperty(secondEditor, "composing", { configurable: true, value: true });
    secondEditor.dispatch({ changes: { from: 9, insert: "ㅎ" } });
    secondEditor.dispatch({ changes: { from: 9, to: 10, insert: "한" } });

    let cursor = 3;
    for (let index = 0; index < 20; index += 1) {
      firstEditor.dispatch({
        changes: { from: cursor, insert: "\n" },
        selection: { anchor: cursor + 1 },
      });
      cursor += 1;
    }

    Object.defineProperty(secondEditor, "composing", { configurable: true, value: false });
    secondEditor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));

    await waitFor(() => expect(secondEditor.state.doc.toString()).toBe(first.text.toJSON()));
    expect(first.text.toJSON().replaceAll("\n", "")).toBe("topbelow한");
  });

  it("recomposes an existing Korean syllable without duplicating it", async () => {
    const { connected } = session();
    connected.text.insert(0, "가");
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    editor.dispatch({ selection: { anchor: 1 } });
    editor.contentDOM.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    Object.defineProperty(editor, "composing", { configurable: true, value: true });
    editor.dispatch({ changes: { from: 0, to: 1, insert: "각" } });
    connected.document.transact(() => connected.text.insert(1, "\n"), "remote");

    Object.defineProperty(editor, "composing", { configurable: true, value: false });
    editor.contentDOM.dispatchEvent(new Event("compositionend", { bubbles: true }));

    await waitFor(() => expect(editor.state.doc.toString()).toBe(connected.text.toJSON()));
    expect(connected.text.toJSON().replaceAll("\n", "")).toBe("각");
  });

  it("does not duplicate English while remote enters are arriving", async () => {
    const { connected } = session();
    const view = render(
      <Editor
        session={connected}
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    for (const character of "synchronized") {
      const at = editor.state.selection.main.head;
      editor.dispatch({ changes: { from: at, insert: character }, selection: { anchor: at + 1 } });
      connected.document.transact(() => connected.text.insert(0, "\n"), "remote");
    }

    await waitFor(() => expect(editor.state.doc.toString()).toBe(connected.text.toJSON()));
    expect(connected.text.toJSON().replaceAll("\n", "")).toBe("synchronized");
  });

  it("renders remote changes while read only and unfocused", async () => {
    const { connected } = session();
    connected.text.insert(0, "before");
    const view = render(
      <Editor
        session={connected}
        readOnly
        compact
        onNavigate={() => undefined}
        resolveAsset={() => Promise.resolve(undefined)}
      />,
    );
    const editor = EditorView.findFromDOM(
      view.container.querySelector(".cm-editor") as HTMLElement,
    );
    if (!editor) throw new Error("Editor was not mounted");

    connected.document.transact(() => connected.text.insert(6, " remote"), "remote");

    await waitFor(() => expect(editor.state.doc.toString()).toBe("before remote"));
    expect(editor.state.facet(EditorView.editable)).toBe(false);
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
      expect(view.container.querySelector(".cm-markdown-image")?.textContent).toContain(
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
      expect(view.container.querySelector<HTMLImageElement>(".cm-markdown-image img")?.src).toBe(
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

  it("uploads dropped images at the drop selection", async () => {
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

    fireEvent.drop(view.container.querySelector(".cm-content") as HTMLElement, {
      clientX: 0,
      clientY: 0,
      dataTransfer: {
        files: [new File(["image"], "photo.png", { type: "image/png" })],
      },
    });

    await waitFor(() => expect(connected.text.toJSON()).toContain("![[Notes/photo.png]]"));
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

    const link = await waitFor(() => rendered.container.querySelector(".cm-markdown-link"));
    if (!link) throw new Error("Wiki link was not rendered");
    fireEvent.mouseDown(link, { button: 0 });

    expect(onNavigate).toHaveBeenCalledWith("Notes/Beta");
  });

  it("renders a wiki-link alias while retaining its target", async () => {
    const { connected } = session();
    connected.text.insert(0, "[[Notes/Beta|Readable title]]\nEnd");
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

    const link = await waitFor(() =>
      rendered.container.querySelector<HTMLElement>(".cm-markdown-link"),
    );
    if (!link) throw new Error("Wiki alias was not rendered");
    expect(link.textContent).toBe("Readable title");
    expect(link.dataset.href).toBe("Notes/Beta");
    fireEvent.mouseDown(link, { button: 0 });
    expect(onNavigate).toHaveBeenCalledWith("Notes/Beta");
  });

  it("distinguishes internal and external rendered links", async () => {
    const { connected } = session();
    connected.text.insert(0, "[[Notes/Beta]] and [Website](https://example.com)\nEnd");
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

    await waitFor(() => {
      expect(rendered.container.querySelector(".cm-markdown-internal-link")).toBeTruthy();
      expect(rendered.container.querySelector(".cm-markdown-external-link")).toBeTruthy();
    });
  });
});
