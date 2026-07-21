import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { editing } from "./live-preview-decoration";

type Properties = {
  from: number;
  to: number;
  insertAt: number;
  rows: Array<{
    key: string;
    value: string;
    keyFrom: number;
    keyTo: number;
    valueFrom: number;
    valueTo: number;
  }>;
};

export function frontmatter(state: EditorState): Properties | undefined {
  const document = state.doc;
  if (document.lines < 2 || document.line(1).text.trim() !== "---") return undefined;
  const rows: Properties["rows"] = [];
  for (let number = 2; number <= document.lines; number += 1) {
    const line = document.line(number);
    if (line.text.trim() === "---") {
      return { from: 0, to: line.to, insertAt: line.from, rows };
    }
    if (!line.text.trim()) continue;
    const separator = line.text.indexOf(":");
    if (separator < 1 || /^\s/.test(line.text)) return undefined;
    const valueStart = separator + 1 + (line.text[separator + 1] === " " ? 1 : 0);
    rows.push({
      key: line.text.slice(0, separator),
      value: line.text.slice(valueStart),
      keyFrom: line.from,
      keyTo: line.from + separator,
      valueFrom: line.from + valueStart,
      valueTo: line.to,
    });
  }
  return undefined;
}

export function propertyDecorations(state: EditorState) {
  const properties = frontmatter(state);
  if (!properties || editing(state.selection.main.head, properties.from, properties.to)) {
    return Decoration.none;
  }
  return Decoration.set([
    Decoration.replace({
      block: true,
      widget: new PropertiesWidget(properties),
    }).range(properties.from, properties.to),
  ]);
}

class PropertiesWidget extends WidgetType {
  constructor(private readonly properties: Properties) {
    super();
  }

  eq(other: PropertiesWidget) {
    return (
      other.properties.from === this.properties.from &&
      other.properties.to === this.properties.to &&
      other.properties.rows.length === this.properties.rows.length &&
      other.properties.rows.every(
        (row, index) =>
          row.key === this.properties.rows[index]?.key &&
          row.value === this.properties.rows[index]?.value,
      )
    );
  }

  toDOM(view: EditorView) {
    const panel = document.createElement("section");
    panel.className = "cm-live-properties";
    panel.setAttribute("aria-label", "프로퍼티");
    const title = document.createElement("div");
    title.className = "cm-live-properties-title";
    title.textContent = "프로퍼티";
    panel.append(title);
    const editable = view.state.facet(EditorView.editable);
    for (const row of this.properties.rows) {
      const wrapper = document.createElement("div");
      wrapper.className = "cm-live-property";
      wrapper.append(
        this.input(view, row.key, "속성 이름", row.keyFrom, row.keyTo, editable),
        this.input(view, row.value, "속성 값", row.valueFrom, row.valueTo, editable),
      );
      panel.append(wrapper);
    }
    if (editable) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "cm-live-property-add";
      add.textContent = "+ 프로퍼티 추가";
      add.addEventListener("click", () => {
        view.dispatch({
          changes: { from: this.properties.insertAt, insert: "property: \n" },
          selection: { anchor: this.properties.insertAt + 10 },
          userEvent: "input",
        });
        view.focus();
      });
      panel.append(add);
    }
    return panel;
  }

  ignoreEvent() {
    return true;
  }

  private input(
    view: EditorView,
    value: string,
    label: string,
    from: number,
    to: number,
    editable: boolean,
  ) {
    const input = document.createElement("input");
    input.value = value;
    input.setAttribute("aria-label", label);
    input.readOnly = !editable;
    const commit = () => {
      if (input.value === value) return;
      view.dispatch({ changes: { from, to, insert: input.value }, userEvent: "input" });
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });
    return input;
  }
}
