import type { Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { imagePath } from "./files";
import { decorateInlineHtml, overlapsHtml } from "./markdown-rendering-html";
import { type AssetResolver, editing, hidden, hide } from "./markdown-rendering-decoration";
import {
  isTableLine,
  tableAlignments,
  tableCells,
  tableSeparator,
} from "./markdown-rendering-table";

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
  const quote = /^(\s*>\s?)/.exec(text);
  if (quote) {
    const callout = calloutAt(view, lineFrom);
    ranges.push(
      Decoration.line({
        class: callout
          ? `cm-markdown-quote cm-markdown-callout cm-markdown-callout-${callout.type}`
          : "cm-markdown-quote",
      }).range(lineFrom),
    );
    const markerTo = lineFrom + quote[0].length;
    if (!editing(cursor, lineFrom, markerTo)) {
      ranges.push(Decoration.replace({ widget: new QuoteWidget() }).range(lineFrom, markerTo));
    }
    const header = /^\s*>\s*\[!([a-z][\w-]*)\]([+-])?\s*/i.exec(text);
    if (header && !editing(cursor, lineFrom, lineFrom + header[0].length)) {
      ranges.push(
        Decoration.replace({
          widget: new CalloutWidget(header[1], header[2] !== "-"),
        }).range(markerTo, lineFrom + header[0].length),
      );
    }
  }

  if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(text)) {
    if (!editing(cursor, lineFrom, lineTo)) {
      ranges.push(
        Decoration.replace({ widget: new HorizontalRuleWidget() }).range(lineFrom, lineTo),
      );
    }
    return;
  }

  const cells = tableCells(text);
  if (cells && isTableLine(view.state, lineFrom)) {
    if (tableSeparator(text)) {
      if (!editing(cursor, lineFrom, lineTo)) {
        ranges.push(Decoration.line({ class: "cm-markdown-table-separator" }).range(lineFrom));
        ranges.push(hidden.range(lineFrom, lineTo));
      }
      return;
    }
    if (!editing(cursor, lineFrom, lineTo)) {
      const alignments = tableAlignments(view.state, lineFrom);
      ranges.push(
        Decoration.line({
          class: "cm-markdown-table-row",
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
              class: "cm-markdown-table-cell",
              attributes:
                alignments[index] === "left"
                  ? undefined
                  : { style: `text-align:${alignments[index]}` },
            }).range(lineFrom + cell.from, lineFrom + cell.to),
          );
          for (const match of cell.text.matchAll(/\\\|/g)) {
            const slash = lineFrom + cell.from + (match.index ?? 0);
            ranges.push(hidden.range(slash, slash + 1));
          }
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
    ranges.push(Decoration.line({ class: "cm-markdown-list-item" }).range(lineFrom));
    if (!editing(cursor, from, to)) {
      ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to));
    }
  }

  const heading = /^(#{1,6})\s/.exec(text);
  if (heading) {
    ranges.push(
      Decoration.line({ class: `cm-markdown-heading-${heading[1].length}` }).range(lineFrom),
    );
    hide(lineFrom, lineFrom + heading[0].length, cursor, ranges);
  }

  const html = decorateInlineHtml(lineFrom, text, cursor, ranges);
  decorateInlineFormatting(view, lineFrom, lineTo, cursor, ranges, html);
  decorateObsidianFormatting(lineFrom, text, cursor, ranges, html);

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
        class: match[1] ? "cm-markdown-embed" : "cm-markdown-link cm-markdown-internal-link",
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
        class: `cm-markdown-link ${isExternalLink(match[2]) ? "cm-markdown-external-link" : "cm-markdown-internal-link"}`,
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

function calloutAt(view: EditorView, from: number) {
  let line = view.state.doc.lineAt(from);
  while (line.number > 1 && /^\s*>/.test(view.state.doc.line(line.number - 1).text)) {
    line = view.state.doc.line(line.number - 1);
  }
  const match = /^\s*>\s*\[!([a-z][\w-]*)\]/i.exec(line.text);
  return match ? { type: match[1].toLowerCase() } : undefined;
}

function decorateObsidianFormatting(
  lineFrom: number,
  text: string,
  cursor: number,
  ranges: Range<Decoration>[],
  html: { from: number; to: number }[],
) {
  for (const match of text.matchAll(/==(.+?)==/g)) {
    const from = lineFrom + (match.index ?? 0);
    const to = from + match[0].length;
    if (editing(cursor, from, to) || overlapsHtml(from - lineFrom, to - lineFrom, html)) continue;
    ranges.push(hidden.range(from, from + 2));
    ranges.push(Decoration.mark({ class: "cm-markdown-highlight" }).range(from + 2, to - 2));
    ranges.push(hidden.range(to - 2, to));
  }
  for (const match of text.matchAll(/%%(.+?)%%/g)) {
    const from = lineFrom + (match.index ?? 0);
    const to = from + match[0].length;
    if (!editing(cursor, from, to) && !overlapsHtml(from - lineFrom, to - lineFrom, html)) {
      ranges.push(hidden.range(from, to));
    }
  }
  for (const match of text.matchAll(/(?:^|[\s(])#[\p{L}\p{N}_/-]+/gu)) {
    const offset = match[0].search(/#/);
    const from = lineFrom + (match.index ?? 0) + offset;
    const to = lineFrom + (match.index ?? 0) + match[0].length;
    if (!editing(cursor, from, to)) {
      ranges.push(Decoration.mark({ class: "cm-markdown-tag" }).range(from, to));
    }
  }
  for (const match of text.matchAll(/\[\^([^\]]+)\]/g)) {
    const from = lineFrom + (match.index ?? 0);
    const to = from + match[0].length;
    if (!editing(cursor, from, to)) {
      ranges.push(Decoration.mark({ class: "cm-markdown-footnote" }).range(from, to));
    }
  }
  const block = /(?:^|\s)(\^[\p{L}\p{N}-]+)\s*$/u.exec(text);
  if (block) {
    const from = lineFrom + (block.index ?? 0) + block[0].indexOf("^");
    const to = from + block[1].length;
    if (!editing(cursor, from, to)) ranges.push(hidden.range(from, to));
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
    Emphasis: { className: "cm-markdown-em", markerLength: 1 },
    StrongEmphasis: { className: "cm-markdown-strong", markerLength: 2 },
    Strikethrough: { className: "cm-markdown-strike", markerLength: 2 },
    InlineCode: { className: "cm-markdown-inline-code", markerLength: 1 },
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

class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement("span");
    bullet.className = "cm-markdown-bullet";
    bullet.textContent = "•";
    return bullet;
  }
}

class QuoteWidget extends WidgetType {
  toDOM() {
    const quote = document.createElement("span");
    quote.className = "cm-markdown-quote-mark";
    quote.setAttribute("aria-hidden", "true");
    return quote;
  }
}

class CalloutWidget extends WidgetType {
  constructor(
    private readonly type: string,
    private readonly expanded: boolean,
  ) {
    super();
  }

  eq(other: CalloutWidget) {
    return other.type === this.type && other.expanded === this.expanded;
  }

  toDOM() {
    const label = document.createElement("span");
    label.className = "cm-markdown-callout-label";
    label.textContent = `${this.expanded ? "▾" : "▸"} ${this.type.replaceAll("-", " ")}`;
    return label;
  }
}

class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const rule = document.createElement("span");
    rule.className = "cm-markdown-horizontal-rule";
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
    wrapper.className = "cm-markdown-image";
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
    input.className = "cm-markdown-checkbox";
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
