import createDOMPurify, { type Config } from "dompurify";
import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const htmlConfig: Config = {
  ALLOW_UNKNOWN_PROTOCOLS: true,
  FORBID_TAGS: ["style"],
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["frameborder", "allowfullscreen", "allow", "sandbox", "data-tooltip-position"],
};

let purifierDocument: Document | undefined;
let purifier: ReturnType<typeof createDOMPurify> | undefined;

function sanitizeHtml(html: string, root: Document) {
  if (!purifier || purifierDocument !== root) {
    purifierDocument = root;
    purifier = createDOMPurify(root.defaultView ?? window);
    purifier.addHook("afterSanitizeAttributes", (node) => {
      if (node instanceof HTMLAnchorElement) {
        node.target = "_blank";
        if (!node.hasAttribute("rel")) node.rel = "noopener nofollow";
      }
    });
  }
  return purifier.sanitize(html, htmlConfig);
}

type HtmlRange = { from: number; to: number };

export function decorateInlineHtml(
  lineFrom: number,
  text: string,
  cursor: number,
  ranges: Range<Decoration>[],
) {
  const html = inlineHtmlRanges(text);
  for (const range of html) {
    const from = lineFrom + range.from;
    const to = lineFrom + range.to;
    if (cursor >= from && cursor <= to) continue;
    ranges.push(
      Decoration.replace({ widget: new HtmlWidget(text.slice(range.from, range.to)) }).range(
        from,
        to,
      ),
    );
  }
  return html;
}

export function overlapsHtml(from: number, to: number, html: HtmlRange[]) {
  return html.some((range) => from < range.to && range.from < to);
}

type HtmlBlocks = { decorations: DecorationSet; ranges: HtmlRange[] };

export const htmlBlockDecorations = StateField.define<HtmlBlocks>({
  create: htmlBlocks,
  update(value, transaction) {
    return transaction.docChanged || transaction.selection ? htmlBlocks(transaction.state) : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

export function htmlBlockRanges(state: EditorState) {
  return state.field(htmlBlockDecorations).ranges;
}

function htmlBlocks(state: EditorState): HtmlBlocks {
  const ranges: HtmlRange[] = [];
  const decorations: Range<Decoration>[] = [];
  const cursor = state.selection.main.head;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "HTMLBlock") return;
      ranges.push({ from: node.from, to: node.to });
      if (cursor >= node.from && cursor <= node.to) return;
      decorations.push(
        Decoration.replace({
          block: true,
          widget: new HtmlWidget(state.sliceDoc(node.from, node.to), true),
        }).range(node.from, node.to),
      );
    },
  });
  return { decorations: Decoration.set(decorations, true), ranges };
}

function inlineHtmlRanges(text: string) {
  const html: HtmlRange[] = [];
  const stack: string[] = [];
  let start: number | undefined;
  for (const match of text.matchAll(/<\/?([a-z][\w-]*)(?:\s[^<>]*)?\/?\s*>/gi)) {
    const source = match[0];
    const name = match[1].toLowerCase();
    const from = match.index ?? 0;
    const to = from + source.length;
    const closing = source.startsWith("</");
    const single = source.endsWith("/>") || voidTags.has(name);
    if (closing) {
      if (stack.at(-1) !== name) continue;
      stack.pop();
      if (!stack.length && start !== undefined) {
        html.push({ from: start, to });
        start = undefined;
      }
      continue;
    }
    if (!stack.length) start = from;
    if (single) {
      if (!stack.length && start !== undefined) {
        html.push({ from: start, to });
        start = undefined;
      }
      continue;
    }
    stack.push(name);
  }
  return html;
}

class HtmlWidget extends WidgetType {
  constructor(
    private readonly html: string,
    private readonly block = false,
  ) {
    super();
  }

  eq(other: HtmlWidget) {
    return other.html === this.html && other.block === this.block;
  }

  toDOM() {
    const wrapper = document.createElement(this.block ? "div" : "span");
    wrapper.className = "cm-live-html";
    wrapper.innerHTML = sanitizeHtml(this.html, wrapper.ownerDocument);
    return wrapper;
  }
}
