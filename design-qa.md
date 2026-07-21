# Design QA

- Source visual truth: `/tmp/obsync-design/obsidian-editor-cursor-current.jpeg`, `/tmp/obsync-design/obsidian-canvas-current.jpeg`, `/tmp/obsync-design/obsidian-editor.jpg`, `/tmp/obsync-design/obsidian-canvas.jpg`, `/Users/limtaehyun/Library/Application Support/CleanShot/media/media_pmsmIVWQc3/CleanShot 2026-07-20 at 15.21.11.png`
- Implementation screenshots: `/tmp/obsync-design/web-canvas-current.png`, `/tmp/obsync-design/web-editor.png`, `/tmp/obsync-design/web-canvas-final.png`, `/tmp/obsync-design/web-canvas-edges-normal.png`
- Full-view comparisons: `/tmp/obsync-design/canvas-comparison-final.png`, `/tmp/obsync-design/compare-editor.png`, `/tmp/obsync-design/compare-canvas-final.png`
- Focused edge comparison: `/tmp/obsync-design/compare-canvas-edges-focus.png`
- Implementation: `http://127.0.0.1:5173/`
- Viewport: 922 x 768 for the original pass; normalized 680 x 720 Canvas-pane crops for the edge pass, dark theme
- State: `Work.md` editor and selected text node in `Untitled.canvas`

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the editor uses the source's 700 px line width, 32 px page margins, 16 px body size, 1.5 line height, and 32 px document title hierarchy. The matched `Work.md` content preserves wrapping and density.
- Spacing and layout rhythm: the 40 px file header, editor inset, Canvas dot grid, node radius, selection toolbar, right-side controls, and bottom insertion controls match the source composition.
- Colors and visual tokens: background, card surface, muted controls, borders, and the purple selected-node accent match the Obsidian dark appearance.
- Image and asset fidelity: these matched states contain no source raster artwork. Interface icons use one consistent Lucide stroke family; attachment nodes use the original uploaded image instead of a generated substitute.
- Copy and content: editor copy comes from the synchronized document. Canvas control labels are accessible names and do not add visible instructional copy to the default state.
- Accessibility and interaction: buttons and menus have accessible names, text nodes expose a real textarea, document nodes preserve the real editor, and selected nodes show a visible focus/selection state.
- Canvas edges: persisted `fromSide`, `toSide`, endpoint style, color, and label data now drive side-aware cubic paths, arrowheads, and optional labels. Four directional drag targets appear only on hover or keyboard focus, matching Obsidian's quiet selected state.

## Accepted Differences

- The Web shell keeps the existing Vault breadcrumb instead of Obsidian's desktop back/forward controls. This is an intentional product constraint from the current Web navigation design, outside the editor and Canvas fidelity target.
- The Web file tree does not include Obsidian's desktop-only ribbon. The editor and Canvas content panes retain the same internal geometry after accounting for that shell difference.

## Comparison History

### Pass 1

- [P2] `화면에 맞춤` enlarged a small Canvas to 200%, producing a much larger card and denser controls than the source.
  - Fix: capped fit zoom at 100%; it now only scales down when content does not fit.
- [P2] newly inserted Canvas cards shared the same default coordinates and overlapped exactly.
  - Fix: new cards now receive a small deterministic stagger while retaining Obsidian's default card sizes.
- [P2] the selected-node toolbar exposed a fifth connection action that was not present in the source toolbar.
  - Fix: restored the four-action toolbar and moved connection creation to the selected node's edge handle.

### Pass 2

- Post-fix evidence: `/tmp/obsync-design/compare-canvas-final.png`
- Result: the Canvas card scale, four-action selection toolbar, purple selection outline, edge handle, right controls, and bottom controls match the source with no remaining P0/P1/P2 issue.
- Editor evidence: `/tmp/obsync-design/compare-editor.png`
- Result: title hierarchy, text width, margins, line height, scrolling surface, and dark tokens match with no P0/P1/P2 issue.

### Pass 3: Canvas edges

- [P1] Web rendered every edge as a straight right-to-left line and ignored the Canvas file's `fromSide` and `toSide` values.
  - Fix: side-aware cubic paths now leave and enter the persisted node sides.
- [P1] Web edges had no destination arrow, so direction was materially less clear than Obsidian.
  - Fix: destination arrows are rendered by default, with persisted `fromEnd` and `toEnd` overrides supported.
- [P2] only the right edge of a node could start a connection.
  - Fix: top, right, bottom, and left drag targets now persist the selected source side and infer the nearest destination side.

### Pass 4: Canvas edge polish

- [P2] all four connection handles were permanently visible after selection, while Obsidian reveals a handle only during edge interaction.
  - Fix: handles are visually hidden until hover, keyboard focus, or an active drag.
- Post-fix evidence: `/tmp/obsync-design/compare-canvas-edges-focus.png`
- Result: curve direction, attachment sides, arrow scale, stroke weight, selection surface, and control density match with no remaining P0/P1/P2 issue.

### Pass 5: current Obsidian parity and presence lifecycle

- [P1] Web could destroy the shared document provider during an editor remount, leaving cached content visible while outgoing edits and cursor presence stopped.
  - Fix: document sessions now use acquire/release ownership and defer teardown, so an immediate remount keeps the same live provider.
- [P2] Canvas initially opened at 100% and could place the attachment node outside the viewport.
  - Fix: the first non-empty Canvas render automatically applies the same scale-down-to-fit behavior as Obsidian; manual zoom remains unchanged.
- [P2] the Web tree and Canvas document nodes exposed extensions and omitted the quiet file labels used by Obsidian.
  - Fix: file extensions moved to muted type badges, Markdown/Canvas titles omit their extension, and file nodes expose the same outside filename plus internal document title.
- Fresh source-to-implementation evidence: `/tmp/obsync-design/canvas-comparison-final.png`.
- Live presence evidence: `/tmp/obsync-design/obsidian-editor-cursor-current.jpeg`; a Web edit and its named cursor were observed in the open Obsidian editor.

### Pass 6: selected-node toolbar behavior

- [P1] The color action silently cycled colors and kept the selected node's purple outline, so it appeared to do nothing.
  - Fix: the palette now opens an Obsidian-style named color menu, and the chosen color adds a restrained card tint that remains visible while selected.
- [P1] `선택한 노드로 이동` only scrolled at the current scale and could be clamped into an imperceptible movement.
  - Fix: it now computes a node-focused zoom, applies that scale, and centers the selected card in the viewport.
- [P2] Edit was functional but had no regression coverage.
  - Fix: the toolbar test now verifies that edit transfers focus to the selected node's textarea.
- Source-to-implementation toolbar evidence: `/tmp/obsync-design/canvas-toolbar-comparison.png`.
- Result: delete, color, focus, and edit retain the four-action Obsidian geometry and now have visible, verified behavior.

Focused crops were used for the edge pass because the supplied reference contains the Obsidian window over the Web app. The 680 x 720 Canvas-pane crops remove unrelated desktop chrome while preserving the nodes, curves, arrowheads, selection toolbar, and grid at readable scale.

## Primary Interactions Tested

- Open Markdown and Canvas files from the file tree.
- Enter Canvas text-edit mode by double-clicking a node.
- Select a node and expose resize, color, focus, delete, edit, and connection affordances.
- Open the selected-node color menu, apply a color, focus/zoom the selected node, and enter text-edit mode from the toolbar.
- Drag from any of the four node sides and release on another node; the selected source and inferred destination sides are persisted.
- Add a real Markdown document node from the bottom toolbar, select it, and delete the temporary test node.
- Toggle/reset/fit Canvas zoom controls.
- Open Canvas from a fresh document state and verify all four nodes, the attachment preview, and the connected edge are visible without a manual fit action.
- Remount the Web editor, publish a Web edit, and verify both content and named cursor presence in Obsidian.
- Restart the collaboration server and verify the existing client republishes user and cursor awareness after reconnecting.
- Reload the page while watching browser `pageerror` and `console` events; neither emitted an error.

## Validation

- Monorepo formatting, lint, and type checks: passed for API, plugin, and Web.
- Tests: API 24 passed, plugin 22 passed, Web 28 passed; 74 total.
- Production builds: API, plugin, and Web passed.

## Follow-up Polish

- [P3] A future desktop-shell pass could add Obsidian-style history arrows and a status bar, but neither changes the editor or Canvas core interaction.

final result: passed
