import { autocompletion, type CompletionSource } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
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
}: {
  session: EditorSession;
  onNavigate: (href: string) => void;
  resolveAsset: (href: string) => Promise<string | undefined>;
  onPasteImages?: (files: File[]) => Promise<string[]>;
  files?: FileEntry[];
  compact?: boolean;
  readOnly?: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const navigate = useRef(onNavigate);
  const asset = useRef(resolveAsset);
  const pasteImages = useRef(onPasteImages);
  const vaultFiles = useRef(files);
  navigate.current = onNavigate;
  asset.current = resolveAsset;
  pasteImages.current = onPasteImages;
  vaultFiles.current = files;

  useEffect(() => {
    if (!parent.current) return;
    const view = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: session.text.toJSON(),
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          autocompletion({
            override: [wikiLinkCompletion(() => vaultFiles.current)],
          }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorView.editable.of(!readOnly),
          baseEditorTheme,
          compact ? compactEditorTheme : editorTheme,
          livePreviewTheme,
          EditorView.domEventHandlers({
            paste(event, view) {
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
          }),
          livePreview(
            (href) => navigate.current(href),
            (href) => asset.current(href),
          ),
          ...(!readOnly && session.provider
            ? [yCollab(session.text, session.provider.awareness)]
            : []),
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
    session.acquire();
    return () => session.release();
  }, [session]);

  return <div ref={parent} className={compact ? "h-full" : undefined} />;
}

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
      fontSize: "14px",
      lineHeight: "1.55",
      caretColor: "var(--foreground)",
    },
  },
  { dark: true },
);

const baseEditorTheme = EditorView.theme({
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit" },
  ".cm-line": { padding: "0" },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-ySelectionInfo": {
    borderRadius: "var(--radius-sm)",
    padding: "2px 5px",
    font: "11px system-ui",
    opacity: "1",
  },
});

const livePreviewTheme = EditorView.theme({
  ".cm-live-heading-1": {
    fontSize: "2em",
    lineHeight: "1.3",
    fontWeight: "700",
    paddingTop: "0.7em !important",
  },
  ".cm-live-heading-2": {
    fontSize: "1.6em",
    lineHeight: "1.35",
    fontWeight: "600",
    paddingTop: "0.6em !important",
  },
  ".cm-live-heading-3": {
    fontSize: "1.3em",
    fontWeight: "600",
    paddingTop: "0.45em !important",
  },
  ".cm-live-heading-4, .cm-live-heading-5, .cm-live-heading-6": {
    fontWeight: "600",
    paddingTop: "0.3em !important",
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
    color: "var(--sidebar-primary)",
    textDecoration: "none",
    cursor: "pointer",
  },
  ".cm-live-embed": { borderBottom: "1px dashed var(--sidebar-primary)" },
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
    marginBottom: "0.4rem",
    color: "var(--muted-foreground)",
    fontSize: "12px",
    fontWeight: "600",
  },
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
