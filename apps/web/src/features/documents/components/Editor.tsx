import { autocompletion, type CompletionSource } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef } from "react";
import { yCollab } from "y-codemirror.next";
import { livePreview, refreshLivePreview } from "../lib/live-preview";
import { markdownLinkOptions, type FileEntry } from "../lib/files";
import type { WebDocument } from "../lib/sync";

export type EditorSession = Pick<WebDocument, "text" | "acquire" | "release"> & {
  provider?: WebDocument["provider"];
};

export function Editor({
  session,
  onNavigate,
  resolveAsset,
  onPasteImages,
  files = [],
  compact = false,
  readOnly = false,
  sourceMode = false,
}: {
  session: EditorSession;
  onNavigate: (href: string) => void;
  resolveAsset: (href: string) => Promise<string | undefined>;
  onPasteImages?: (files: File[]) => Promise<string[]>;
  files?: FileEntry[];
  compact?: boolean;
  readOnly?: boolean;
  sourceMode?: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const navigate = useRef(onNavigate);
  const asset = useRef(resolveAsset);
  const pasteImages = useRef(onPasteImages);
  const vaultFiles = useRef(files);
  const preview = useRef(new Compartment());
  navigate.current = onNavigate;
  asset.current = resolveAsset;
  pasteImages.current = onPasteImages;
  vaultFiles.current = files;

  useLayoutEffect(() => {
    if (!parent.current) return;
    const view = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: session.text.toJSON(),
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          autocompletion({
            override: [wikiLinkCompletion(() => vaultFiles.current)],
          }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorView.editable.of(!readOnly),
          correctPointerLine,
          baseEditorTheme,
          compact ? compactEditorTheme : editorTheme,
          livePreviewTheme,
          EditorView.domEventHandlers({
            paste(event, view) {
              if (readOnly) return false;
              const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
                file.type.startsWith("image/"),
              );
              if (!images.length || !pasteImages.current) return false;
              event.preventDefault();
              void pasteImages.current(images).then((paths) => {
                if (!paths.length || editor.current !== view) return;
                view.dispatch(
                  view.state.replaceSelection(paths.map((path) => `![[${path}]]`).join("\n")),
                );
              });
              return true;
            },
            drop(event, view) {
              if (readOnly) return false;
              const images = [...(event.dataTransfer?.files ?? [])].filter((file) =>
                file.type.startsWith("image/"),
              );
              if (!images.length || !pasteImages.current) return false;
              const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (position !== null) view.dispatch({ selection: { anchor: position } });
              event.preventDefault();
              void pasteImages.current(images).then((paths) => {
                if (!paths.length || editor.current !== view) return;
                view.dispatch(
                  view.state.replaceSelection(paths.map((path) => `![[${path}]]`).join("\n")),
                );
              });
              return true;
            },
          }),
          preview.current.of(
            sourceMode
              ? []
              : livePreview(
                  (href) => navigate.current(href),
                  (href) => asset.current(href),
                ),
          ),
          ...(session.provider ? [yCollab(session.text, session.provider.awareness)] : []),
        ],
      }),
    });
    editor.current = view;
    if (!compact) view.focus();
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, [session, compact, readOnly]);

  useEffect(() => {
    editor.current?.dispatch({ effects: refreshLivePreview.of(undefined) });
  }, [files]);

  useEffect(() => {
    editor.current?.dispatch({
      effects: preview.current.reconfigure(
        sourceMode
          ? []
          : livePreview(
              (href) => navigate.current(href),
              (href) => asset.current(href),
            ),
      ),
    });
  }, [sourceMode]);

  useEffect(() => {
    session.acquire();
    return () => session.release();
  }, [session]);

  return <div ref={parent} className={compact ? "h-full" : undefined} />;
}

const correctPointerLine = EditorView.domEventHandlers({
  click(event, view) {
    if (
      event.button !== 0 ||
      event.detail !== 1 ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return false;
    }
    const target =
      event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null;
    if (!target || target.closest("[data-href], button, input, img")) return false;
    const line = target.closest<HTMLElement>(".cm-line");
    if (!line) return false;

    const lineStart = view.posAtDOM(line, 0);
    const documentLine = view.state.doc.lineAt(lineStart);
    const measured = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (measured === null || view.state.doc.lineAt(measured).number === documentLine.number) {
      return false;
    }

    const bounds = line.getBoundingClientRect();
    const ownerDocument = view.dom.ownerDocument;
    const caret = ownerDocument.caretPositionFromPoint?.(
      event.clientX,
      bounds.top + bounds.height / 2,
    );
    const range = (
      ownerDocument as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      }
    ).caretRangeFromPoint?.(event.clientX, bounds.top + bounds.height / 2);
    const offsetNode = caret?.offsetNode ?? range?.startContainer;
    const offset = caret?.offset ?? range?.startOffset;
    const position =
      offsetNode && offset !== undefined && line.contains(offsetNode)
        ? view.posAtDOM(offsetNode, offset)
        : event.clientX <= bounds.left
          ? documentLine.from
          : documentLine.to;

    view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
    view.focus();
    return true;
  },
});

function wikiLinkCompletion(files: () => FileEntry[]): CompletionSource {
  return (context) => {
    const match = context.matchBefore(/\[\[[^\]\n]*/);
    if (!match) return null;
    return {
      from: match.from + 2,
      validFor: /^[^\]\n]*$/,
      options: markdownLinkOptions(files()).map((option) => ({
        label: option.label,
        detail: option.detail,
        apply: `${option.target}]]`,
        type: "text",
      })),
    };
  };
}

const editorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--background)", color: "var(--foreground)" },
    ".cm-scroller": { overflow: "visible" },
    ".cm-content": {
      width: "min(700px, calc(100% - 64px))",
      flexGrow: "0",
      margin: "0 auto",
      padding: "0 0 45vh",
      fontSize: "16px",
      lineHeight: "1.5",
      letterSpacing: "normal",
      caretColor: "var(--foreground)",
    },
  },
  { dark: true },
);

const compactEditorTheme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "var(--card)", color: "var(--card-foreground)" },
    ".cm-scroller": { overflow: "auto" },
    ".cm-content": {
      minHeight: "100%",
      padding: "12px",
      fontSize: "16px",
      lineHeight: "1.5",
      letterSpacing: "normal",
      caretColor: "var(--foreground)",
    },
  },
  { dark: true },
);

const baseEditorTheme = EditorView.theme({
  "&.cm-focused": { outline: "none" },
  ".cm-content": { cursor: "text" },
  ".cm-scroller": { fontFamily: "var(--font-text)" },
  ".cm-line": { padding: "0" },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-ySelectionInfo": {
    borderRadius: "var(--radius-sm)",
    padding: "2px 5px",
    font: "11px system-ui",
    opacity: "0",
  },
  ".cm-ySelectionCaret:hover > .cm-ySelectionInfo": { opacity: "1" },
});

const livePreviewTheme = EditorView.theme({
  ".cm-live-heading-1": {
    fontSize: "1.618em",
    lineHeight: "1.2",
    fontWeight: "700",
    paddingTop: "1rem !important",
  },
  ".cm-live-heading-2": {
    fontSize: "1.462em",
    lineHeight: "1.2",
    fontWeight: "600",
    paddingTop: "1rem !important",
  },
  ".cm-live-heading-3": {
    fontSize: "1.318em",
    lineHeight: "1.3",
    fontWeight: "600",
    paddingTop: "1rem !important",
  },
  ".cm-live-heading-4": {
    fontSize: "1.188em",
    lineHeight: "1.4",
    fontWeight: "600",
    paddingTop: "1rem !important",
  },
  ".cm-live-heading-5": {
    fontSize: "1.076em",
    fontWeight: "600",
    paddingTop: "1rem !important",
  },
  ".cm-live-heading-6": {
    fontSize: "1em",
    fontWeight: "600",
    paddingTop: "1rem !important",
  },
  ".cm-live-heading-1, .cm-live-heading-2, .cm-live-heading-3, .cm-live-heading-4, .cm-live-heading-5, .cm-live-heading-6, .cm-live-heading-1 *, .cm-live-heading-2 *, .cm-live-heading-3 *, .cm-live-heading-4 *, .cm-live-heading-5 *, .cm-live-heading-6 *":
    {
      textDecoration: "none !important",
      borderBottom: "0 !important",
    },
  ".cm-live-strong": { fontWeight: "700" },
  ".cm-live-em": { fontStyle: "italic" },
  ".cm-live-strike": { textDecoration: "line-through", color: "var(--muted-foreground)" },
  ".cm-live-link, .cm-live-embed": {
    cursor: "pointer",
  },
  ".cm-live-internal-link, .cm-live-embed": {
    color: "var(--link-color)",
    textDecoration: "underline",
  },
  ".cm-live-external-link": {
    color: "var(--link-external-color)",
    textDecoration: "underline",
  },
  ".cm-live-internal-link:hover, .cm-live-embed:hover": { color: "var(--link-color-hover)" },
  ".cm-live-external-link:hover": { color: "var(--link-external-color-hover)" },
  ".cm-live-embed": { textDecorationStyle: "dashed" },
  ".cm-live-image": {
    display: "block",
    margin: "0.75rem 0",
    color: "var(--muted-foreground)",
    fontSize: "0.875rem",
  },
  ".cm-live-image img": {
    display: "block",
    maxWidth: "100%",
    maxHeight: "32rem",
    borderRadius: "var(--radius-lg)",
    objectFit: "contain",
  },
  ".cm-live-checkbox": { verticalAlign: "-2px", margin: "0 7px 0 1px" },
  ".cm-live-list-item": { position: "relative" },
  ".cm-live-bullet": {
    display: "inline-block",
    width: "1.25em",
    color: "var(--foreground)",
    textAlign: "center",
  },
  ".cm-live-horizontal-rule": {
    display: "inline-block",
    boxSizing: "border-box",
    width: "100%",
    height: "0",
    margin: "0",
    border: "0",
    borderTop: "2px solid var(--border)",
    verticalAlign: "middle",
  },
  ".cm-live-table-row": {
    display: "grid",
    gridTemplateColumns: "repeat(var(--table-columns), minmax(0, 1fr))",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
  },
  ".cm-live-table-row:has(+ .cm-live-table-separator)": {
    borderTop: "1px solid var(--border)",
    backgroundColor: "var(--muted)",
    fontWeight: "600",
  },
  ".cm-live-table-cell": {
    minWidth: "0",
    padding: "0.35rem 0.5rem",
    borderRight: "1px solid var(--border)",
  },
  '.cm-live-table-row > .cm-widgetBuffer, .cm-live-table-row > span[contenteditable="false"]:empty':
    {
      position: "absolute",
      width: "0",
      height: "0",
      overflow: "hidden",
    },
  ".cm-live-table-cell:last-child, .cm-live-table-cell:not(:has(~ .cm-live-table-cell))": {
    borderRight: "0",
  },
  ".cm-live-table-separator": {
    height: "0",
    overflow: "hidden",
    lineHeight: "0",
  },
  ".cm-live-code-line, .cm-live-code-fence": {
    backgroundColor: "color-mix(in oklab, var(--muted) 58%, transparent)",
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: "0.9em",
    padding: "0 14px",
  },
  ".cm-live-code-fence": {
    minHeight: "12px",
    color: "var(--muted-foreground)",
  },
  ".cm-live-code-language": {
    display: "inline-block",
    padding: "3px 0",
    color: "var(--muted-foreground)",
    fontSize: "11px",
    textTransform: "lowercase",
  },
  ".cm-live-properties": {
    marginBottom: "1.5rem",
    borderBottom: "1px solid var(--border)",
    padding: "0.25rem 0 1rem",
  },
  ".cm-live-properties-title": {
    display: "flex",
    width: "100%",
    marginBottom: "0.4rem",
    alignItems: "center",
    gap: "4px",
    border: "0",
    background: "transparent",
    padding: "3px 0",
    color: "var(--muted-foreground)",
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "16px",
    textAlign: "left",
    cursor: "pointer",
  },
  ".cm-live-properties-title svg": {
    width: "14px",
    height: "14px",
    flex: "0 0 14px",
    transition: "transform 120ms ease",
  },
  '.cm-live-properties-title[aria-expanded="false"] svg': { transform: "rotate(-90deg)" },
  ".cm-live-properties.is-collapsed": { paddingBottom: "0.25rem" },
  ".cm-live-properties.is-collapsed .cm-live-properties-title": { marginBottom: "0" },
  ".cm-live-properties.is-collapsed .cm-live-property, .cm-live-properties.is-collapsed .cm-live-property-add":
    { display: "none" },
  ".cm-live-property": {
    display: "grid",
    gridTemplateColumns: "minmax(110px, 0.38fr) minmax(0, 1fr)",
    alignItems: "center",
    minHeight: "32px",
    gap: "10px",
  },
  ".cm-live-property input": {
    minWidth: "0",
    border: "0",
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    padding: "4px 6px",
    color: "inherit",
    font: "inherit",
    outline: "none",
  },
  ".cm-live-property input:first-child": { color: "var(--muted-foreground)" },
  ".cm-live-property input:focus": { backgroundColor: "var(--muted)" },
  ".cm-live-property-list": {
    display: "flex",
    minHeight: "30px",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "5px",
    padding: "2px 6px",
  },
  ".cm-live-property-list > input": { minWidth: "80px", flex: "1" },
  ".cm-live-property-chip": {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    borderRadius: "999px",
    backgroundColor: "color-mix(in oklab, var(--primary) 20%, var(--muted))",
    padding: "2px 8px",
    color: "var(--foreground)",
    fontSize: "0.9em",
  },
  ".cm-live-property-chip button": {
    border: "0",
    background: "transparent",
    padding: "0",
    color: "inherit",
    cursor: "pointer",
  },
  ".cm-live-property-checkbox": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 6px",
  },
  ".cm-live-property-checkbox input": { width: "16px", height: "16px" },
  ".cm-live-property-menu": {
    position: "fixed",
    zIndex: "100",
    display: "grid",
    minWidth: "170px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    backgroundColor: "var(--popover)",
    padding: "6px",
    color: "var(--popover-foreground)",
    boxShadow: "var(--shadow-lg)",
  },
  ".cm-live-property-menu-title": {
    padding: "6px 8px",
    color: "var(--muted-foreground)",
    fontSize: "12px",
  },
  ".cm-live-property-menu button": {
    border: "0",
    borderRadius: "var(--radius-sm)",
    background: "transparent",
    padding: "7px 8px",
    color: "inherit",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  ".cm-live-property-menu button:hover": { backgroundColor: "var(--accent)" },
  ".cm-live-property-add": {
    marginTop: "4px",
    border: "0",
    background: "transparent",
    padding: "4px 6px",
    color: "var(--muted-foreground)",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-live-property-source": {
    color: "var(--muted-foreground)",
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: "0.9em",
  },
});
