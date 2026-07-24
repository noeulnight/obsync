import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MarkdownView, TFile } from "obsidian";

export function replaceEditorBinding(
  view: EditorView,
  compartment: Compartment,
  extension: Extension,
  text: string,
  editable: boolean,
) {
  removeEditorBinding(view, compartment);
  const current = view.state.doc.toString();
  if (text !== current) {
    view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }
  view.dispatch({
    effects: compartment.reconfigure([extension, EditorView.editable.of(editable)]),
  });
}

export function removeEditorBinding(view: EditorView, compartment: Compartment) {
  view.dispatch({ effects: compartment.reconfigure([]) });
}

export function isSourceMarkdownEditor(
  markdownView: Pick<MarkdownView, "editor" | "file" | "getMode">,
  file: TFile,
  view: EditorView,
) {
  return (
    markdownView.file === file &&
    markdownView.getMode() === "source" &&
    (markdownView.editor as { cm?: EditorView }).cm === view
  );
}
