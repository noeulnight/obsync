import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView, keymap, type KeyBinding } from "@codemirror/view";

type Cell = { from: number; to: number; text: string };
type Row = { from: number; to: number; cells: Cell[]; separator: boolean };
type Table = { from: number; to: number; rows: Row[] };
type Alignment = "left" | "center" | "right";

export function tableCells(text: string, lineFrom = 0) {
  const pipes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "|" || escaped(text, index)) continue;
    pipes.push(index);
  }
  const startsWithPipe = /^\s*\|/.test(text);
  const endsWithPipe = /\|\s*$/.test(text);
  const edges = [startsWithPipe ? pipes.shift()! : 0, ...pipes, text.length];
  if (endsWithPipe) edges.pop();
  if (edges.length < 3) return;
  return edges.slice(0, -1).map((boundary, index) => {
    const sourceFrom = boundary + (boundary === 0 && !startsWithPipe ? 0 : 1);
    const sourceTo = edges[index + 1];
    const source = text.slice(sourceFrom, sourceTo);
    const leading = source.length - source.trimStart().length;
    const trailing = source.length - source.trimEnd().length;
    const from = lineFrom + sourceFrom + leading;
    const to = lineFrom + sourceTo - trailing;
    return { from, to, text: text.slice(from - lineFrom, to - lineFrom) };
  });
}

export function tableSeparator(text: string) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?\s*\|?)\s*$/.test(text);
}

export function tableAlignments(state: EditorState, from: number) {
  return (
    tableAt(state, from)
      ?.rows.find((row) => row.separator)
      ?.cells.map(alignment) ?? []
  );
}

export function isTableLine(state: EditorState, from: number) {
  return Boolean(tableAt(state, from));
}

export function tableEditing() {
  return [
    keymap.of(tableKeys),
    EditorView.domEventHandlers({
      contextmenu(event, view) {
        if (!view.state.facet(EditorView.editable)) return false;
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null || !tableCellAt(view.state, position)) return false;
        event.preventDefault();
        showTableMenu(view, position, event.clientX, event.clientY);
        return true;
      },
    }),
  ];
}

const tableKeys: KeyBinding[] = [
  { key: "Tab", run: (view) => moveCell(view, 1) },
  { key: "Shift-Tab", run: (view) => moveCell(view, -1) },
];

function tableAt(state: EditorState, position: number): Table | undefined {
  const cursor = syntaxTree(state).cursorAt(position, 1);
  while (cursor.name !== "Table" && cursor.parent()) {
    // Walk to the enclosing GFM table.
  }
  if (cursor.name !== "Table") return;
  const rows: Row[] = [];
  let line = state.doc.lineAt(cursor.from);
  while (line.from <= cursor.to) {
    const cells = tableCells(line.text, line.from);
    if (cells) {
      rows.push({
        from: line.from,
        to: line.to,
        cells,
        separator: tableSeparator(line.text),
      });
    }
    if (line.to >= state.doc.length || line.to >= cursor.to) break;
    line = state.doc.line(line.number + 1);
  }
  return rows.length >= 2 ? { from: rows[0].from, to: rows.at(-1)!.to, rows } : undefined;
}

function tableCellAt(state: EditorState, position: number) {
  const table = tableAt(state, position);
  if (!table) return;
  const row = table.rows.find((item) => position >= item.from && position <= item.to);
  if (!row || row.separator) return;
  const cell =
    row.cells.find((item) => position >= item.from && position <= item.to) ??
    row.cells.reduce((closest, item) =>
      Math.abs(item.from - position) < Math.abs(closest.from - position) ? item : closest,
    );
  return {
    table,
    row,
    cell,
    rowIndex: editableRows(table).indexOf(row),
    column: row.cells.indexOf(cell),
  };
}

function moveCell(view: EditorView, direction: number) {
  const current = tableCellAt(view.state, view.state.selection.main.head);
  if (!current) return false;
  const rows = editableRows(current.table);
  const columns = current.row.cells.length;
  const flat = current.rowIndex * columns + current.column + direction;
  if (flat < 0) return false;
  if (flat >= rows.length * columns) {
    return rewriteTable(view, current.table, rows.length, 0, (matrix) => {
      matrix.push(Array.from({ length: columns }, () => ""));
    });
  }
  const next = rows[Math.floor(flat / columns)]?.cells[flat % columns];
  if (!next) return false;
  view.dispatch({ selection: { anchor: next.from, head: next.to }, scrollIntoView: true });
  return true;
}

function showTableMenu(view: EditorView, position: number, x: number, y: number) {
  document.querySelector(".cm-markdown-table-menu")?.remove();
  const current = tableCellAt(view.state, position);
  if (!current) return;
  const menu = document.createElement("div");
  menu.className = "cm-markdown-table-menu";
  menu.setAttribute("role", "menu");
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const actions: Array<[string, () => void]> = [
    ["Add row above", () => editRows(view, position, "add-before")],
    ["Add row below", () => editRows(view, position, "add-after")],
    ["Move row up", () => editRows(view, position, "move-before")],
    ["Move row down", () => editRows(view, position, "move-after")],
    ["Delete row", () => editRows(view, position, "delete")],
    ["Add column left", () => editColumns(view, position, "add-before")],
    ["Add column right", () => editColumns(view, position, "add-after")],
    ["Move column left", () => editColumns(view, position, "move-before")],
    ["Move column right", () => editColumns(view, position, "move-after")],
    ["Sort ascending", () => sortColumn(view, position, 1)],
    ["Sort descending", () => sortColumn(view, position, -1)],
    ["Delete column", () => editColumns(view, position, "delete")],
  ];
  for (const [label, action] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("role", "menuitem");
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      menu.remove();
      setTimeout(action);
    });
    menu.append(button);
  }
  document.body.append(menu);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
  const close = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) menu.remove();
  };
  setTimeout(() => document.addEventListener("pointerdown", close, { once: true }));
}

type Edit = "add-before" | "add-after" | "move-before" | "move-after" | "delete";

function editRows(view: EditorView, position: number, edit: Edit) {
  const current = tableCellAt(view.state, position);
  if (!current) return;
  const columns = current.row.cells.length;
  const target = edit.endsWith("before") ? current.rowIndex : current.rowIndex + 1;
  rewriteTable(view, current.table, Math.max(0, target), current.column, (matrix) => {
    if (edit.startsWith("add"))
      matrix.splice(
        target,
        0,
        Array.from({ length: columns }, () => ""),
      );
    else if (edit === "delete" && matrix.length > 1) matrix.splice(current.rowIndex, 1);
    else move(matrix, current.rowIndex, edit === "move-before" ? -1 : 1);
  });
}

function editColumns(view: EditorView, position: number, edit: Edit) {
  const current = tableCellAt(view.state, position);
  if (!current) return;
  const target = edit.endsWith("before") ? current.column : current.column + 1;
  rewriteTable(view, current.table, current.rowIndex, Math.max(0, target), (matrix, alignments) => {
    if (edit.startsWith("add")) {
      for (const row of matrix) row.splice(target, 0, "");
      alignments.splice(target, 0, "left");
    } else if (edit === "delete" && matrix[0].length > 1) {
      for (const row of matrix) row.splice(current.column, 1);
      alignments.splice(current.column, 1);
    } else {
      const offset = edit === "move-before" ? -1 : 1;
      for (const row of matrix) move(row, current.column, offset);
      move(alignments, current.column, offset);
    }
  });
}

function sortColumn(view: EditorView, position: number, direction: number) {
  const current = tableCellAt(view.state, position);
  if (!current) return;
  rewriteTable(view, current.table, current.rowIndex, current.column, (matrix) => {
    const body = matrix.splice(1);
    body.sort(
      (left, right) =>
        direction *
        left[current.column].localeCompare(right[current.column], undefined, { numeric: true }),
    );
    matrix.push(...body);
  });
}

function rewriteTable(
  view: EditorView,
  table: Table,
  targetRow: number,
  targetColumn: number,
  mutate: (matrix: string[][], alignments: Alignment[]) => void,
) {
  const rows = editableRows(table);
  const matrix = rows.map((row) => row.cells.map((cell) => cell.text.trim()));
  const alignments =
    table.rows.find((row) => row.separator)?.cells.map(alignment) ??
    Array.from({ length: matrix[0].length }, () => "left" as const);
  mutate(matrix, alignments);
  const formatted = formatTable(matrix, alignments);
  const row = Math.min(targetRow, matrix.length - 1);
  const column = Math.min(targetColumn, matrix[0].length - 1);
  const relative = cellPosition(formatted, row, column);
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: formatted },
    selection: {
      anchor: table.from + relative.from,
      head: table.from + relative.to,
    },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

function editableRows(table: Table) {
  return table.rows.filter((row) => !row.separator);
}

function alignment(cell: Cell): Alignment {
  const text = cell.text.trim();
  if (text.startsWith(":")) return text.endsWith(":") ? "center" : "left";
  return text.endsWith(":") ? "right" : "left";
}

function formatTable(matrix: string[][], alignments: Alignment[]) {
  const widths = alignments.map((_, column) =>
    Math.max(3, ...matrix.map((row) => row[column]?.length ?? 0)),
  );
  const row = (values: string[]) =>
    `| ${widths.map((width, column) => (values[column] ?? "").padEnd(width)).join(" | ")} |`;
  const separator = `| ${widths
    .map((width, column) => {
      const fill = "-".repeat(
        Math.max(
          3,
          width - (alignments[column] === "center" ? 2 : alignments[column] === "right" ? 1 : 0),
        ),
      );
      if (alignments[column] === "center") return `:${fill}:`;
      if (alignments[column] === "right") return `${fill}:`;
      return fill;
    })
    .join(" | ")} |`;
  return [row(matrix[0]), separator, ...matrix.slice(1).map(row)].join("\n");
}

function cellPosition(markdown: string, rowIndex: number, column: number) {
  const lines = markdown.split("\n");
  const lineIndex = rowIndex ? rowIndex + 1 : 0;
  const lineFrom = lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0);
  const cells = tableCells(lines[lineIndex] ?? lines[0], lineFrom)!;
  return cells[Math.min(column, cells.length - 1)];
}

function move<T>(items: T[], index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
}

function escaped(text: string, index: number) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}
