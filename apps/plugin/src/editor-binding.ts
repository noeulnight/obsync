import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function replaceEditorBinding(
  view: EditorView,
  compartment: Compartment,
  extension: Extension,
  text: string,
  editable: boolean,
) {
  view.dispatch({ effects: compartment.reconfigure([]) });
  const current = view.state.doc.toString();
  if (text !== current) {
    view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }
  view.dispatch({
    effects: compartment.reconfigure([extension, EditorView.editable.of(editable)]),
  });
}
