import type { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

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

type PropertyRow = Properties["rows"][number];
type PropertyType = "checkbox" | "date" | "datetime" | "list" | "number" | "text";
const collapsedViews = new WeakSet<EditorView>();

export function frontmatter(state: EditorState): Properties | undefined {
  const document = state.doc;
  if (document.lines < 2 || document.line(1).text.trim() !== "---") return undefined;
  const rows: Properties["rows"] = [];
  let current: Properties["rows"][number] | undefined;
  for (let number = 2; number <= document.lines; number += 1) {
    const line = document.line(number);
    if (line.text.trim() === "---") {
      return { from: 0, to: line.to, insertAt: line.from, rows };
    }
    if (!line.text.trim()) continue;
    if (/^\s/.test(line.text)) {
      if (!current) return undefined;
      current.value += `\n${line.text}`;
      current.valueTo = line.to;
      continue;
    }
    const separator = line.text.indexOf(":");
    if (separator < 1) return undefined;
    const valueStart = separator + 1 + (line.text[separator + 1] === " " ? 1 : 0);
    current = {
      key: line.text.slice(0, separator),
      value: line.text.slice(valueStart),
      keyFrom: line.from,
      keyTo: line.from + separator,
      valueFrom: line.from + valueStart,
      valueTo: line.to,
    };
    rows.push(current);
  }
  return undefined;
}

export function propertyDecorations(state: EditorState) {
  const properties = frontmatter(state);
  if (!properties) return Decoration.none;
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
    panel.className = "cm-markdown-properties";
    panel.classList.toggle("is-collapsed", collapsedViews.has(view));
    panel.setAttribute("aria-label", "Properties");
    const title = document.createElement("button");
    title.type = "button";
    title.className = "cm-markdown-properties-title";
    title.setAttribute("aria-label", "Toggle properties");
    title.setAttribute("aria-expanded", String(!collapsedViews.has(view)));
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("viewBox", "0 0 16 16");
    chevron.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 6l4 4 4-4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.75");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    chevron.append(path);
    title.append(chevron, document.createTextNode("Properties"));
    title.addEventListener("click", () => {
      const collapsed = !panel.classList.contains("is-collapsed");
      panel.classList.toggle("is-collapsed", collapsed);
      title.setAttribute("aria-expanded", String(!collapsed));
      if (collapsed) collapsedViews.add(view);
      else collapsedViews.delete(view);
    });
    panel.append(title);
    const editable = view.state.facet(EditorView.editable);
    for (const row of this.properties.rows) {
      const wrapper = document.createElement("div");
      wrapper.className = "cm-markdown-property";
      wrapper.append(
        this.input(view, row.key, "Property name", row.keyFrom, row.keyTo, editable),
        this.value(view, row, editable),
      );
      if (editable) this.propertyMenu(view, wrapper, row);
      panel.append(wrapper);
    }
    if (editable) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "cm-markdown-property-add";
      add.textContent = "+ Add property";
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
    input.value = propertyValue(value);
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

  private value(view: EditorView, row: PropertyRow, editable: boolean) {
    const type = propertyType(row);
    if (type === "list") return this.list(view, row, editable);
    if (type === "date" || type === "datetime") {
      return this.date(view, row, type, editable);
    }
    if (type === "checkbox") {
      const wrapper = document.createElement("label");
      wrapper.className = "cm-markdown-property-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = propertyValue(row.value) === "true";
      input.disabled = !editable;
      input.setAttribute("aria-label", "Property value");
      input.addEventListener("change", () => this.replace(view, row, String(input.checked)));
      wrapper.append(input, document.createTextNode(input.checked ? "Checked" : "Unchecked"));
      return wrapper;
    }
    const input = this.input(
      view,
      row.value,
      "Property value",
      row.valueFrom,
      row.valueTo,
      editable,
    );
    input.type = type;
    return input;
  }

  private date(view: EditorView, row: PropertyRow, type: "date" | "datetime", editable: boolean) {
    const source = propertyValue(row.value).slice(0, type === "date" ? 10 : 16);
    const input = document.createElement("input");
    input.type = "text";
    input.value = localDate(source, type);
    input.readOnly = !editable;
    input.setAttribute("aria-label", "Property value");
    input.addEventListener("focus", () => {
      input.type = type === "date" ? "date" : "datetime-local";
      input.value = source;
    });
    input.addEventListener("blur", () => {
      const value = input.value;
      input.type = "text";
      input.value = localDate(value, type);
      if (value && value !== source) this.replace(view, row, value);
    });
    return input;
  }

  private list(view: EditorView, row: PropertyRow, editable: boolean) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-markdown-property-list";
    const values = propertyList(row.value, row.key.toLowerCase() === "tags");
    for (const value of values) {
      const chip = document.createElement("span");
      chip.className = "cm-markdown-property-chip";
      chip.append(document.createTextNode(value));
      if (editable) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${value}`);
        remove.textContent = "×";
        remove.addEventListener("click", () =>
          this.replace(view, row, serializeList(values.filter((item) => item !== value))),
        );
        chip.append(remove);
      }
      wrapper.append(chip);
    }
    if (editable) {
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Property value");
      input.placeholder = values.length ? "" : "Add value";
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || !input.value.trim()) return;
        event.preventDefault();
        this.replace(view, row, serializeList([...values, input.value.trim()]));
      });
      wrapper.append(input);
    }
    return wrapper;
  }

  private propertyMenu(view: EditorView, wrapper: HTMLElement, row: PropertyRow) {
    wrapper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      document.querySelector(".cm-markdown-property-menu")?.remove();
      const menu = document.createElement("div");
      menu.className = "cm-markdown-property-menu";
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;
      const title = document.createElement("div");
      title.className = "cm-markdown-property-menu-title";
      title.textContent = "Property type";
      menu.append(title);
      for (const type of propertyTypes) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${type === propertyType(row) ? "✓ " : ""}${propertyTypeLabel(type)}`;
        button.addEventListener("click", () => {
          this.replace(view, row, convertedValue(row.value, type));
          menu.remove();
        });
        menu.append(button);
      }
      wrapper.append(menu);
      const close = (pointer: PointerEvent) => {
        if (!menu.contains(pointer.target as Node)) menu.remove();
      };
      setTimeout(() => document.addEventListener("pointerdown", close, { once: true }));
    });
  }

  private replace(view: EditorView, row: PropertyRow, value: string) {
    view.dispatch({
      changes: { from: row.valueFrom, to: row.valueTo, insert: value },
      userEvent: "input",
    });
  }
}

const propertyTypes: PropertyType[] = ["checkbox", "date", "datetime", "list", "number", "text"];

function propertyType(row: PropertyRow): PropertyType {
  const value = propertyValue(row.value);
  if (row.key.toLowerCase() === "tags" || propertyList(row.value).length > 1) return "list";
  if (/^(true|false)$/.test(value)) return "checkbox";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return "datetime";
  if (value && Number.isFinite(Number(value))) return "number";
  return "text";
}

function propertyTypeLabel(type: PropertyType) {
  return type === "datetime" ? "Date & time" : `${type[0]?.toUpperCase()}${type.slice(1)}`;
}

function convertedValue(value: string, type: PropertyType) {
  const text = propertyValue(value);
  if (type === "checkbox") return /^(true|false)$/.test(text) ? text : "false";
  if (type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : today();
  if (type === "datetime") {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) ? text.slice(0, 16) : `${today()}T00:00`;
  }
  if (type === "list")
    return serializeList(propertyList(value).length ? propertyList(value) : [text]);
  if (type === "number") return Number.isFinite(Number(text)) ? text : "0";
  return propertyList(value).join(", ") || text;
}

function today() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, "0"))
    .join("-");
}

function localDate(value: string, type: "date" | "datetime") {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  );
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(type === "datetime" ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function propertyList(value: string, commaSeparated = false) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length && lines.every((line) => line.startsWith("- "))) {
    return lines.map((line) => line.slice(2));
  }
  const inline = lines.join(" ");
  if (inline.startsWith("[") && inline.endsWith("]")) {
    return inline
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  if (commaSeparated && inline.includes(",")) {
    return inline
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return inline ? [inline] : [];
}

function serializeList(values: string[]) {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function propertyValue(value: string) {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1 && lines.every((line) => line.startsWith("- "))) {
    return lines.map((line) => line.slice(2)).join(", ");
  }
  return lines.join(" ");
}
