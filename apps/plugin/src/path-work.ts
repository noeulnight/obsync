export type PathSnapshot = { path: string; version: number };

export class PathWork {
  private chain: Promise<unknown> = Promise.resolve();
  private version = 0;

  move() {
    this.version += 1;
  }

  snapshot(path: string): PathSnapshot {
    return { path, version: this.version };
  }

  current(snapshot: PathSnapshot, path: string) {
    return snapshot.version === this.version && snapshot.path === path;
  }

  run<T>(work: () => Promise<T>) {
    const next = this.chain.catch(() => undefined).then(work);
    this.chain = next;
    return next;
  }
}
