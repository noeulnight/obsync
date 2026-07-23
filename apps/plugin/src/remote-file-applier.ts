import type { FileEntry } from "./sync-types";

export type RemoteChange = { entry: FileEntry; previous?: FileEntry };
export type ApplyingPaths = {
  add(path: string): void;
  delete(path: string): void;
  has(path: string): boolean;
} & Iterable<string>;

class ApplyingPathCounts implements ApplyingPaths {
  private readonly counts = new Map<string, number>();

  add(path: string) {
    this.counts.set(path, (this.counts.get(path) ?? 0) + 1);
  }

  delete(path: string) {
    const count = this.counts.get(path) ?? 0;
    if (count <= 1) this.counts.delete(path);
    else this.counts.set(path, count - 1);
  }

  has(path: string) {
    return this.counts.has(path);
  }

  get size() {
    return this.counts.size;
  }

  [Symbol.iterator]() {
    return this.counts.keys();
  }
}

export class RemoteFileApplier {
  readonly applying = new ApplyingPathCounts();
  private readonly queues = new Map<string, Promise<void>>();
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

  queue(path: string, work: () => Promise<void>) {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(path, next);
    const cleanup = () => {
      if (this.queues.get(path) === next) this.queues.delete(path);
    };
    void next.then(cleanup, cleanup);
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
