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
  const lineTo = lineFrom + text.length;
  if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(text)) {
    if (!editing(cursor, lineFrom, lineTo)) {
      ranges.push(
        Decoration.replace({ widget: new HorizontalRuleWidget() }).range(lineFrom, lineTo),
      );
    }
    return;
  }

  const cells = tableCells(text);
  if (cells && isTableLine(view, lineFrom)) {
    if (tableSeparator(text)) {
      if (!editing(cursor, lineFrom, lineTo)) {
        ranges.push(Decoration.line({ class: "cm-live-table-separator" }).range(lineFrom));
        ranges.push(hidden.range(lineFrom, lineTo));
      }
      return;
    }
    if (!editing(cursor, lineFrom, lineTo)) {
      ranges.push(
        Decoration.line({
          class: "cm-live-table-row",
          attributes: { style: `--table-columns:${cells.length}` },
        }).range(lineFrom),
      );
      let hiddenFrom = 0;
      for (const cell of cells) {
        if (cell.from > hiddenFrom) {
          ranges.push(hidden.range(lineFrom + hiddenFrom, lineFrom + cell.from));
        }
        if (cell.to > cell.from) {
          ranges.push(
            Decoration.mark({ class: "cm-live-table-cell" }).range(
              lineFrom + cell.from,
              lineFrom + cell.to,
            ),
          );
        }
        hiddenFrom = cell.to;
      }
      if (hiddenFrom < text.length) ranges.push(hidden.range(lineFrom + hiddenFrom, lineTo));
    }
  }

  const bullet = /^(\s*)[-+*]\s+(?!\[[ xX]\])/.exec(text);
  if (bullet) {
    const from = lineFrom + bullet[1].length;
    const to = lineFrom + bullet[0].length;
    ranges.push(Decoration.line({ class: "cm-live-list-item" }).range(lineFrom));
    if (!editing(cursor, from, to)) {
      ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to));
    }
  }

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
    const separator = match[2].indexOf("|");
    const href = separator < 0 ? match[2] : match[2].slice(0, separator);
    const labelFrom = separator < 0 ? contentStart : contentStart + separator + 1;
    ranges.push(hidden.range(start, contentStart));
    if (separator >= 0) ranges.push(hidden.range(contentStart, labelFrom));
    ranges.push(
      Decoration.mark({
        class: match[1] ? "cm-live-embed" : "cm-live-link",
        attributes: { "data-href": href },
      }).range(labelFrom, end - 2),
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

function tableCells(text: string) {
  if (!text.includes("|")) return;
  const boundaries = [...text.matchAll(/\|/g)].map((match) => match.index);
  const startsWithPipe = /^\s*\|/.test(text);
  const endsWithPipe = /\|\s*$/.test(text);
  const edges = [startsWithPipe ? boundaries.shift()! : 0, ...boundaries, text.length];
  if (endsWithPipe) edges.pop();
  if (edges.length < 3) return;
  return edges.slice(0, -1).map((boundaryFrom, index) => {
    const sourceFrom = boundaryFrom + (boundaryFrom === 0 && !startsWithPipe ? 0 : 1);
    const sourceTo = edges[index + 1];
    const content = text.slice(sourceFrom, sourceTo);
    const leading = content.length - content.trimStart().length;
    const trailing = content.length - content.trimEnd().length;
    return {
      from: sourceFrom + leading,
      to: sourceTo - trailing,
    };
  });
}

function tableSeparator(text: string) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*\|?)\s*$/.test(text);
}

function isTableLine(view: EditorView, from: number) {
  const current = view.state.doc.lineAt(from);
  for (let number = current.number; number >= 1; number -= 1) {
    const line = view.state.doc.line(number);
    if (!line.text.trim()) break;
    if (tableSeparator(line.text)) return true;
  }
  for (let number = current.number + 1; number <= view.state.doc.lines; number += 1) {
    const line = view.state.doc.line(number);
    if (!line.text.trim()) break;
    if (tableSeparator(line.text)) return true;
  }
  return false;
}

class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-live-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-live-horizontal-rule";
    return rule;
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
