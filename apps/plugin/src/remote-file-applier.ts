import type { FileEntry } from "./sync-types";

export type RemoteChange = { entry: FileEntry; previous?: FileEntry };

class ApplyingPaths extends Set<string> {
  private readonly counts = new Map<string, number>();

  override add(path: string) {
    const count = (this.counts.get(path) ?? 0) + 1;
    this.counts.set(path, count);
    if (count === 1) super.add(path);
    return this;
  }

  override delete(path: string) {
    const count = this.counts.get(path) ?? 0;
    if (count > 1) {
      this.counts.set(path, count - 1);
      return true;
    }
    this.counts.delete(path);
    return super.delete(path);
  }

  override clear() {
    this.counts.clear();
    super.clear();
  }
}

export class RemoteFileApplier {
  readonly applying = new ApplyingPaths();
  // ponytail: serialize Vault I/O; split by non-overlapping roots only if profiling requires it.
  private queueChain: Promise<void> = Promise.resolve();
  private chain: Promise<unknown> = Promise.resolve();
  private readonly attempts = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private destroyed = false;

  constructor(
    private readonly apply: (entry: FileEntry, previous?: FileEntry) => Promise<void>,
    private readonly recovered: () => void,
    private readonly report: (error: unknown) => void,
  ) {}

  destroy() {
    this.destroyed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  applyBatch(changes: RemoteChange[]) {
    const next = this.chain
      .catch(() => undefined)
      .then(async () => {
        if (this.destroyed) return true;
        changes.sort(({ entry: left }, { entry: right }) => {
          if (left.deleted !== right.deleted) return left.deleted ? 1 : -1;
          if (left.kind === "folder" && right.kind !== "folder") return left.deleted ? 1 : -1;
          if (right.kind === "folder" && left.kind !== "folder") return right.deleted ? -1 : 1;
          return depth(left.path) - depth(right.path);
        });
        let complete = true;
        for (const change of changes) {
          try {
            await this.apply(change.entry, change.previous);
            this.attempts.delete(change.entry.id);
            const timer = this.timers.get(change.entry.id);
            if (timer) clearTimeout(timer);
            this.timers.delete(change.entry.id);
          } catch (error) {
            complete = false;
            this.report(error);
            this.schedule(change);
          }
        }
        return complete;
      });
    this.chain = next;
    return next;
  }

  queue(_path: string, work: () => Promise<void>) {
    const next = this.queueChain
      .catch(() => undefined)
      .then(() => {
        if (!this.destroyed) return work();
      });
    this.queueChain = next;
    return next;
  }

  async whileApplying<T>(paths: string[], work: () => Promise<T>) {
    for (const path of paths) this.applying.add(path);
    try {
      return await work();
    } finally {
      for (const path of paths) this.applying.delete(path);
    }
  }

  private schedule(change: RemoteChange) {
    if (this.destroyed || this.timers.has(change.entry.id)) return;
    const attempt = (this.attempts.get(change.entry.id) ?? 0) + 1;
    this.attempts.set(change.entry.id, attempt);
    const timer = setTimeout(
      () => {
        this.timers.delete(change.entry.id);
        void this.applyBatch([change]).then((complete) => {
          if (complete) this.recovered();
        });
      },
      Math.min(1_000 * 2 ** (attempt - 1), 30_000),
    );
    this.timers.set(change.entry.id, timer);
  }
}

function depth(path: string) {
  return path.split("/").length;
}
