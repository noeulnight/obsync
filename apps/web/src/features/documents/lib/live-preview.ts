import type { Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from "@codemirror/view";
import { codeBlocks, decorateCodeLine } from "./live-preview-code";
import { type AssetResolver, editing } from "./live-preview-decoration";
import { decorateLine } from "./live-preview-inline";
import { frontmatter, propertyDecorations } from "./live-preview-properties";

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
