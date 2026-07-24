import { Compartment, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { MarkdownView, TFile } from "obsidian";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  isSourceMarkdownEditor,
  removeEditorBinding,
  replaceEditorBinding,
} from "./editor-binding";

describe("replaceEditorBinding", () => {
  it("detaches the previous document before replacing editor text", () => {
    const calls: TransactionSpec[] = [];
    let current = "File A";
    const view = {
      state: { doc: { toString: () => current } },
      dispatch: vi.fn((spec: TransactionSpec) => {
        calls.push(spec);
        if (spec.changes) current = "File B";
      }),
    } as unknown as EditorView;

    replaceEditorBinding(view, new Compartment(), [], "File B", true);

    expect(calls).toHaveLength(3);
    expect(calls[0]?.changes).toBeUndefined();
    expect(calls[1]?.changes).toEqual({ from: 0, to: 6, insert: "File B" });
    expect(calls[2]?.changes).toBeUndefined();
  });

  it("removes a document binding without changing editor text", () => {
    const dispatch = vi.fn();
    const view = { dispatch } as unknown as EditorView;

    removeEditorBinding(view, new Compartment());

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ effects: expect.anything() });
  });

  it("rejects the hidden editor retained by Markdown reading mode", () => {
    const file = {} as TFile;
    const editor = {} as EditorView;
    const view = {
      file,
      editor: { cm: editor },
      getMode: () => "preview",
    } as unknown as Pick<MarkdownView, "editor" | "file" | "getMode">;

    expect(isSourceMarkdownEditor(view, file, editor)).toBe(false);
    view.getMode = () => "source";
    expect(isSourceMarkdownEditor(view, file, editor)).toBe(true);
  });
});
