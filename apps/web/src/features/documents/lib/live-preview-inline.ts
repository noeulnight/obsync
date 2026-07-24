import type { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { imagePath } from "./files";
import { decorateInlineHtml, overlapsHtml } from "./live-preview-html";
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
      const alignments = tableAlignments(view, lineFrom);
      ranges.push(
        Decoration.line({
          class: "cm-live-table-row",
          attributes: { style: `--table-columns:${cells.length}` },
        }).range(lineFrom),
      );
      let hiddenFrom = 0;
      for (const [index, cell] of cells.entries()) {
        if (cell.from > hiddenFrom) {
          ranges.push(hidden.range(lineFrom + hiddenFrom, lineFrom + cell.from));
        }
        if (cell.to > cell.from) {
          ranges.push(
            Decoration.mark({
              class: "cm-live-table-cell",
              attributes:
                alignments[index] === "left"
                  ? undefined
                  : { style: `text-align:${alignments[index]}` },
            }).range(lineFrom + cell.from, lineFrom + cell.to),
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

  const html = decorateInlineHtml(lineFrom, text, cursor, ranges);
  decorateInlineFormatting(view, lineFrom, lineTo, cursor, ranges, html);

  for (const match of text.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
    const start = lineFrom + (match.index ?? 0);
    const contentStart = start + match[1].length + 2;
    const end = start + match[0].length;
    if (editing(cursor, start, end) || overlapsHtml(start - lineFrom, end - lineFrom, html))
      continue;
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
        class: match[1] ? "cm-live-embed" : "cm-live-link cm-live-internal-link",
        attributes: { "data-href": href },
      }).range(labelFrom, end - 2),
    );
    ranges.push(hidden.range(end - 2, end));
  }

  for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    const start = lineFrom + (match.index ?? 0);
    const end = start + match[0].length;
    if (editing(cursor, start, end) || overlapsHtml(start - lineFrom, end - lineFrom, html))
      continue;
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
    if (editing(cursor, start, end) || overlapsHtml(start - lineFrom, end - lineFrom, html))
      continue;
    ranges.push(hidden.range(start, labelStart));
    ranges.push(
      Decoration.mark({
        class: `cm-live-link ${isExternalLink(match[2]) ? "cm-live-external-link" : "cm-live-internal-link"}`,
        attributes: { "data-href": match[2] },
      }).range(labelStart, labelEnd),
    );
    ranges.push(hidden.range(labelEnd, end));
  }

  for (const match of text.matchAll(/\[([ xX])\]/g)) {
    const start = lineFrom + (match.index ?? 0);
    const end = start + match[0].length;
    if (editing(cursor, start, end) || overlapsHtml(start - lineFrom, end - lineFrom, html))
      continue;
    ranges.push(
      Decoration.replace({ widget: new CheckboxWidget(view, start, /[xX]/.test(match[1])) }).range(
        start,
        end,
      ),
    );
  }
}

function isExternalLink(href: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//");
}

function decorateInlineFormatting(
  view: EditorView,
  lineFrom: number,
  lineTo: number,
  cursor: number,
  ranges: Range<Decoration>[],
  html: { from: number; to: number }[],
) {
  const formats: Record<string, { className: string; markerLength: number }> = {
    Emphasis: { className: "cm-live-em", markerLength: 1 },
    StrongEmphasis: { className: "cm-live-strong", markerLength: 2 },
    Strikethrough: { className: "cm-live-strike", markerLength: 2 },
  };
  syntaxTree(view.state).iterate({
    from: lineFrom,
    to: lineTo,
    enter(node) {
      const format = formats[node.name];
      if (
        !format ||
        node.from < lineFrom ||
        node.to > lineTo ||
        editing(cursor, node.from, node.to) ||
        overlapsHtml(node.from - lineFrom, node.to - lineFrom, html)
      ) {
        return;
      }
      ranges.push(hidden.range(node.from, node.from + format.markerLength));
      ranges.push(
        Decoration.mark({ class: format.className }).range(
          node.from + format.markerLength,
          node.to - format.markerLength,
        ),
      );
      ranges.push(hidden.range(node.to - format.markerLength, node.to));
    },
  });
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

function tableAlignments(view: EditorView, from: number) {
  const cursor = syntaxTree(view.state).cursorAt(from, 1);
  while (cursor.name !== "Table" && cursor.parent()) {
    // Walk to the enclosing GFM table.
  }
  if (cursor.name !== "Table") return [];

  let line = view.state.doc.lineAt(cursor.from);
  while (line.from <= cursor.to) {
    if (tableSeparator(line.text)) {
      return (tableCells(line.text) ?? []).map((cell) => {
        const source = line.text.slice(cell.from, cell.to);
        if (source.startsWith(":")) return source.endsWith(":") ? "center" : "left";
        return source.endsWith(":") ? "right" : "left";
      });
    }
    if (line.to >= view.state.doc.length) break;
    line = view.state.doc.line(line.number + 1);
  }
  return [];
}

function isTableLine(view: EditorView, from: number) {
  const cursor = syntaxTree(view.state).cursorAt(from, 1);
  do {
    if (cursor.name === "Table") return true;
  } while (cursor.parent());
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
    rule.setAttribute("role", "separator");
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
