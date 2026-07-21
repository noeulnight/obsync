import type { Range } from "@codemirror/state";
import { Decoration, type EditorView, WidgetType } from "@codemirror/view";
import { editing, hidden } from "./live-preview-decoration";

type CodeBlock = {
  start: number;
  end: number;
  from: number;
  to: number;
  language: string;
};

export function codeBlocks(view: EditorView) {
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

export function decorateCodeLine(
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
