import { Compartment, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vite-plus/test";
import { replaceEditorBinding } from "./editor-binding";

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
});
