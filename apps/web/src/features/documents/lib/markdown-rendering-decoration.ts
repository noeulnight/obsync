import type { Range } from "@codemirror/state";
import { Decoration } from "@codemirror/view";

export type AssetResolver = (href: string) => Promise<string | undefined>;

export const hidden = Decoration.replace({});

export function editing(cursor: number, from: number, to: number) {
  return cursor >= from && cursor <= to;
}

export function hide(from: number, to: number, cursor: number, ranges: Range<Decoration>[]) {
  if (!editing(cursor, from, to)) ranges.push(hidden.range(from, to));
}
