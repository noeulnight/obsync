import * as Y from "yjs";

export function replaceText(text: Y.Text, next: string) {
  const previous = text.toJSON();
  if (previous === next) return;

  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  text.doc?.transact(() => {
    const removed = previous.length - prefix - suffix;
    if (removed > 0) text.delete(prefix, removed);
    const inserted = next.slice(prefix, next.length - suffix);
    if (inserted) text.insert(prefix, inserted);
  });
}
