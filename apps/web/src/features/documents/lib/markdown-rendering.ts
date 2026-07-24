import { StateEffect, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import { codeBlocks, decorateCodeLine } from "./markdown-rendering-code";
import type { AssetResolver } from "./markdown-rendering-decoration";
import { htmlBlockDecorations, htmlBlockRanges, overlapsHtml } from "./markdown-rendering-html";
import { decorateLine } from "./markdown-rendering-inline";
import { isTableLine, tableWidgets } from "./markdown-rendering-table";
import { frontmatter, propertyDecorations } from "./markdown-rendering-properties";

export const refreshMarkdownRendering = StateEffect.define<void>();

export function markdownRendering(onNavigate: (href: string) => void, resolveAsset: AssetResolver) {
  return [
    htmlBlockDecorations,
    ...tableWidgets(),
    EditorView.decorations.compute(["doc", "selection"], propertyDecorations),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        private assetRevision = 0;

        constructor(view: EditorView) {
          this.decorations = decorations(view, resolveAsset, this.assetRevision);
        }

        update(update: ViewUpdate) {
          const refreshAssets = update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refreshMarkdownRendering)),
          );
          if (refreshAssets) this.assetRevision += 1;
          if (update.docChanged || update.selectionSet || update.viewportChanged || refreshAssets) {
            this.decorations = decorations(update.view, resolveAsset, this.assetRevision);
          }
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.domEventHandlers({
      mousedown(event) {
        if (event.button !== 0) return false;
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

function decorations(view: EditorView, resolveAsset: AssetResolver, assetRevision: number) {
  const ranges: Range<Decoration>[] = [];
  const cursor = view.state.selection.main.head;
  const html = htmlBlockRanges(view.state);
  const properties = frontmatter(view.state);
  const blocks = codeBlocks(view);
  for (const visible of view.visibleRanges) {
    let line = view.state.doc.lineAt(visible.from);
    while (line.from <= visible.to) {
      if (!properties || line.to < properties.from || line.from > properties.to) {
        const block = blocks.find((item) => line.number >= item.start && line.number <= item.end);
        if (block) decorateCodeLine(line.from, line.to, line.number, cursor, block, ranges);
        else if (!isTableLine(view.state, line.from) && !overlapsHtml(line.from, line.to, html))
          decorateLine(view, line.from, line.text, cursor, ranges, resolveAsset, assetRevision);
      }
      if (line.to >= view.state.doc.length) break;
      line = view.state.doc.line(line.number + 1);
    }
  }
  return Decoration.set(ranges, true);
}
