import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { yCollab } from "y-codemirror.next";
import { livePreview } from "../lib/live-preview";
import type { WebDocument } from "../lib/sync";

export function Editor({
  session,
  onNavigate,
  resolveAsset,
  compact = false,
  readOnly = false,
}: {
  session: WebDocument;
  onNavigate: (href: string) => void;
  resolveAsset: (href: string) => Promise<string | undefined>;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const navigate = useRef(onNavigate);
  const asset = useRef(resolveAsset);
  navigate.current = onNavigate;
  asset.current = resolveAsset;

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
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorView.editable.of(!readOnly),
          compact ? compactEditorTheme : editorTheme,
          livePreview(
            (href) => navigate.current(href),
            (href) => asset.current(href),
          ),
          yCollab(session.text, session.provider.awareness),
        ],
      }),
    });
    if (!compact) view.focus();
    return () => view.destroy();
  }, [session, compact, readOnly]);

  useEffect(() => {
    session.acquire();
    return () => session.release();
  }, [session]);

  return <div ref={parent} className={compact ? "h-full" : undefined} />;
}

const editorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--background)", color: "var(--foreground)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "visible", fontFamily: "inherit" },
    ".cm-content": {
      width: "min(700px, calc(100% - 64px))",
      flexGrow: "0",
      margin: "0 auto",
      padding: "0 0 45vh",
      fontSize: "16px",
      lineHeight: "1.5",
      caretColor: "var(--foreground)",
    },
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
    ".cm-live-heading-1": {
      fontSize: "2em",
      lineHeight: "1.3",
      fontWeight: "750",
      paddingTop: "0.7em !important",
    },
    ".cm-live-heading-2": {
      fontSize: "1.6em",
      lineHeight: "1.35",
      fontWeight: "720",
      paddingTop: "0.6em !important",
    },
    ".cm-live-heading-3": {
      fontSize: "1.3em",
      fontWeight: "700",
      paddingTop: "0.45em !important",
    },
    ".cm-live-heading-4, .cm-live-heading-5, .cm-live-heading-6": {
      fontWeight: "700",
      paddingTop: "0.3em !important",
    },
    ".cm-live-strong": { fontWeight: "750" },
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
  },
  { dark: true },
);

const compactEditorTheme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "var(--card)", color: "var(--card-foreground)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
    ".cm-content": {
      minHeight: "100%",
      padding: "12px",
      fontSize: "14px",
      lineHeight: "1.55",
      caretColor: "var(--foreground)",
    },
    ".cm-line": { padding: "0" },
    ".cm-cursor": { borderLeftColor: "var(--foreground)" },
    ".cm-ySelectionInfo": {
      borderRadius: "var(--radius-sm)",
      padding: "2px 5px",
      font: "11px system-ui",
    },
  },
  { dark: true },
);
