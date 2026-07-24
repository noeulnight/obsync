import type { FileEntry } from "@/features/documents/lib/files";

type Productivity = { pinned: string[]; recent: string[] };

const empty: Productivity = { pinned: [], recent: [] };

export function loadProductivity(vaultId: string): Productivity {
  try {
    const value = localStorage.getItem(key(vaultId));
    if (!value) return empty;
    const parsed = JSON.parse(value) as Partial<Productivity>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
    };
  } catch {
    return empty;
  }
}

export function saveProductivity(vaultId: string, value: Productivity) {
  localStorage.setItem(key(vaultId), JSON.stringify(value));
}

export function togglePinned(value: Productivity, id: string): Productivity {
  return {
    ...value,
    pinned: value.pinned.includes(id)
      ? value.pinned.filter((item) => item !== id)
      : [...value.pinned, id],
  };
}

export function recordRecent(value: Productivity, id: string): Productivity {
  return { ...value, recent: [id, ...value.recent.filter((item) => item !== id)].slice(0, 8) };
}

export function productivityEntries(entries: FileEntry[], ids: string[]) {
  const byId = new Map(
    entries
      .filter((entry) => !entry.deleted && entry.kind !== "folder")
      .map((entry) => [entry.id, entry]),
  );
  return ids.flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}

function key(vaultId: string) {
  return `obsync:${vaultId}:productivity`;
}
