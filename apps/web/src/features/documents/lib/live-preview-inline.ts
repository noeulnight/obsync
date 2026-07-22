import type { Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { imagePath } from "./files";
import { type AssetResolver, editing, hidden, hide } from "./live-preview-decoration";

export function decorateLine(
  view: EditorView,
  lineFrom: number,
  text: string,
  cursor: number,
  ranges: Range<Decoration>[],
  resolveAsset: AssetResolver,
  assetRevision: number,
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
          widget: new ImageWidget(image, "", resolveAsset, assetRevision),
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
        widget: new ImageWidget(match[2], match[1], resolveAsset, assetRevision),
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

class ImageWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly alt: string,
    private readonly resolveAsset: AssetResolver,
    private readonly assetRevision: number,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return (
      other.href === this.href &&
      other.alt === this.alt &&
      other.assetRevision === this.assetRevision
    );
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
        else wrapper.textContent = `Image not found: ${this.href}`;
      })
      .catch(() => {
        wrapper.textContent = `Failed to load image: ${this.href}`;
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
