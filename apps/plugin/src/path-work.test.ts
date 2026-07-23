import { describe, expect, it } from "vite-plus/test";
import { PathWork } from "./path-work";

describe("PathWork", () => {
  it("serializes work and invalidates snapshots after a move", async () => {
    const work = new PathWork();
    const snapshot = work.snapshot("A.md");
    const order: string[] = [];
    const first = work.run(async () => {
      await Promise.resolve();
      order.push("first");
    });
    const second = work.run(async () => {
      order.push("second");
    });

    work.move();
    await Promise.all([first, second]);

    expect(order).toEqual(["first", "second"]);
    expect(work.current(snapshot, "A.md")).toBe(false);
    expect(work.current(work.snapshot("B.md"), "B.md")).toBe(true);
  });
});
