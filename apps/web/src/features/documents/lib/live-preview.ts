import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import { imagePath } from "./files";

const hidden = Decoration.replace({});
type AssetResolver = (href: string) => Promise<string | undefined>;

export function livePreview(onNavigate: (href: string) => void, resolveAsset: AssetResolver) {
  return [
    EditorView.decorations.compute(["doc", "selection"], propertyDecorations),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = decorations(view, resolveAsset);
        }

        update(update: {
          view: EditorView;
          docChanged: boolean;
          selectionSet: boolean;
          viewportChanged: boolean;
        }) {
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            this.decorations = decorations(update.view, resolveAsset);
          }
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.domEventHandlers({
      click(event) {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-href]");
        const href = target?.dataset.href;
        if (!href) return false;
        event.preventDefault();
        onNavigate(href);
        return true;
      },
    }),
  ];
}

function decorations(view: EditorView, resolveAsset: AssetResolver) {
  const ranges: Range<Decoration>[] = [];
  const cursor = view.state.selection.main.head;
  const properties = frontmatter(view.state);
  const blocks = codeBlocks(view);
  for (const visible of view.visibleRanges) {
    let line = view.state.doc.lineAt(visible.from);
    while (line.from <= visible.to) {
      if (!properties || line.to < properties.from || line.from > properties.to) {
        const block = blocks.find((item) => line.number >= item.start && line.number <= item.end);
        if (block) decorateCodeLine(line.from, line.to, line.number, cursor, block, ranges);
        else decorateLine(view, line.from, line.text, cursor, ranges, resolveAsset);
      } else if (editing(cursor, properties.from, properties.to)) {
        ranges.push(Decoration.line({ class: "cm-live-property-source" }).range(line.from));
      }
      if (line.to >= view.state.doc.length) break;
      line = view.state.doc.line(line.number + 1);
    }
  }
  return Decoration.set(ranges, true);
}

function propertyDecorations(state: EditorState) {
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

type CodeBlock = {
  start: number;
  end: number;
  from: number;
  to: number;
  language: string;
};

function frontmatter(state: EditorState): Properties | undefined {
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

function codeBlocks(view: EditorView) {
  const document = view.state.doc;
  const blocks: CodeBlock[] = [];
  for (let number = 1; number <= document.lines; number += 1) {
    const opening = /^(\s*)(`{3,}|~{3,})\s*([^\s]*)/.exec(document.line(number).text);
    if (!opening) continue;
    const marker = opening[2];
    for (let closing = number + 1; closing <= document.lines; closing += 1) {
      const line = document.line(closing);
      const close = line.text.trim();
      if (close[0] === marker[0] && close.length >= marker.length && /^(`+|~+)$/.test(close)) {
        blocks.push({
          start: number,
          end: closing,
          from: document.line(number).from,
          to: line.to,
          language: opening[3],
        });
        number = closing;
        break;
      }
    }
  }
  return blocks;
}

function decorateCodeLine(
  from: number,
  to: number,
  number: number,
  cursor: number,
  block: CodeBlock,
  ranges: Range<Decoration>[],
) {
  const boundary = number === block.start || number === block.end;
  ranges.push(
    Decoration.line({
      class: boundary ? "cm-live-code-fence" : "cm-live-code-line",
    }).range(from),
  );
  if (editing(cursor, block.from, block.to) || !boundary) return;
  if (number === block.start && block.language) {
    ranges.push(
      Decoration.widget({ widget: new CodeLanguageWidget(block.language), side: -1 }).range(from),
    );
  }
  if (from < to) ranges.push(hidden.range(from, to));
}

function decorateLine(
  view: EditorView,
  lineFrom: number,
  text: string,
  cursor: number,
  ranges: Range<Decoration>[],
  resolveAsset: AssetResolver,
) {
  const heading = /^(#{1,6})\s/.exec(text);
  if (heading) {
    ranges.push(Decoration.line({ class: `cm-live-heading-${heading[1].length}` }).range(lineFrom));
    hide(lineFrom, lineFrom + heading[0].length, cursor, ranges);
  }

  inline(text, /\*\*(.+?)\*\*/g, 2, "cm-live-strong");
  inline(text, /~~(.+?)~~/g, 2, "cm-live-strike");
  inline(text, /(?<!\*)\*([^*\n]+?)\*(?!\*)/g, 1, "cm-live-em");

  for (const match of text.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
    const start = lineFrom + (match.index ?? 0);
    const contentStart = start + match[1].length + 2;
    const end = start + match[0].length;
    if (editing(cursor, start, end)) continue;
    const image = match[1] ? imagePath(match[2]) : undefined;
    if (image) {
      ranges.push(
        Decoration.replace({
          widget: new ImageWidget(image, "", resolveAsset),
        }).range(start, end),
      );
      continue;
    }
    ranges.push(hidden.range(start, contentStart));
    ranges.push(
      Decoration.mark({
        class: match[1] ? "cm-live-embed" : "cm-live-link",
        attributes: { "data-href": match[2] },
      }).range(contentStart, end - 2),
    );
    ranges.push(hidden.range(end - 2, end));
  }

  for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    const start = lineFrom + (match.index ?? 0);
    const end = start + match[0].length;
    if (editing(cursor, start, end)) continue;
    ranges.push(
      Decoration.replace({
        widget: new ImageWidget(match[2], match[1], resolveAsset),
      }).range(start, end),
    );
  }

  for (const match of text.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
    const start = lineFrom + (match.index ?? 0);
    const labelStart = start + 1;
    const labelEnd = labelStart + match[1].length;
    const end = start + match[0].length;
    if (editing(cursor, start, end)) continue;
    ranges.push(hidden.range(start, labelStart));
    ranges.push(
      Decoration.mark({
        class: "cm-live-link",
        attributes: { "data-href": match[2] },
      }).range(labelStart, labelEnd),
    );
    ranges.push(hidden.range(labelEnd, end));
  }

  for (const match of text.matchAll(/\[([ xX])\]/g)) {
    const start = lineFrom + (match.index ?? 0);
    const end = start + match[0].length;
    if (editing(cursor, start, end)) continue;
    ranges.push(
      Decoration.replace({ widget: new CheckboxWidget(view, start, /[xX]/.test(match[1])) }).range(
        start,
        end,
      ),
    );
  }

  function inline(source: string, pattern: RegExp, delimiter: number, className: string) {
    for (const match of source.matchAll(pattern)) {
      const start = lineFrom + (match.index ?? 0);
      const end = start + match[0].length;
      if (editing(cursor, start, end)) continue;
      ranges.push(hidden.range(start, start + delimiter));
      ranges.push(Decoration.mark({ class: className }).range(start + delimiter, end - delimiter));
      ranges.push(hidden.range(end - delimiter, end));
    }
  }
}

function hide(from: number, to: number, cursor: number, ranges: Range<Decoration>[]) {
  if (!editing(cursor, from, to)) ranges.push(hidden.range(from, to));
}

function editing(cursor: number, from: number, to: number) {
  return cursor >= from && cursor <= to;
}

class ImageWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly alt: string,
    private readonly resolveAsset: AssetResolver,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.href === this.href && other.alt === this.alt;
  }

  toDOM() {
    const wrapper = document.createElement("span");
    const image = document.createElement("img");
    wrapper.className = "cm-live-image";
    image.alt = this.alt;
    image.loading = "lazy";
    wrapper.append(image);
    void this.resolveAsset(this.href)
      .then((url) => {
        if (url) image.src = url;
        else wrapper.textContent = `이미지를 찾을 수 없습니다: ${this.href}`;
      })
      .catch(() => {
        wrapper.textContent = `이미지를 불러오지 못했습니다: ${this.href}`;
      });
    return wrapper;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly view: EditorView,
    private readonly from: number,
    private readonly checked: boolean,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.from === this.from && other.checked === this.checked;
  }

  toDOM() {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-live-checkbox";
    input.addEventListener("change", () => {
      this.view.dispatch({
        changes: { from: this.from, to: this.from + 3, insert: input.checked ? "[x]" : "[ ]" },
        userEvent: "input",
      });
    });
    return input;
  }

  ignoreEvent() {
    return true;
  }
}

class CodeLanguageWidget extends WidgetType {
  constructor(private readonly language: string) {
    super();
  }

  eq(other: CodeLanguageWidget) {
    return other.language === this.language;
  }

  toDOM() {
    const label = document.createElement("span");
    label.className = "cm-live-code-language";
    label.textContent = this.language;
    return label;
  }
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
