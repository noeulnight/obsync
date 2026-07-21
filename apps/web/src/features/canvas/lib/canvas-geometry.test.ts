import { describe, expect, it } from "vite-plus/test";
import type { CanvasNode } from "./sync";
import { edgeGeometry, edgePoint, nearestSide, previewEdgePath } from "./canvas-geometry";

const node = { id: "one", type: "text", x: 100, y: 50, width: 200, height: 100 } as CanvasNode;

describe("canvas geometry", () => {
  it("places connection points on node sides", () => {
    expect(edgePoint(node, "top")).toEqual({ x: 200, y: 50 });
    expect(edgePoint(node, "right")).toEqual({ x: 300, y: 100 });
    expect(edgePoint(node, "bottom")).toEqual({ x: 200, y: 150 });
    expect(edgePoint(node, "left")).toEqual({ x: 100, y: 100 });
  });

  it("finds the nearest side and builds stable edge paths", () => {
    const target = { ...node, id: "two", x: 500 } as CanvasNode;
    expect(nearestSide(target, { x: 510, y: 100 })).toBe("left");
    expect(edgeGeometry(node, target, "right", "left")).toEqual({
      path: "M 300 100 C 400 100, 400 100, 500 100",
      middle: { x: 400, y: 100 },
    });
    expect(previewEdgePath(node, "right", { x: 500, y: 100 })).toBe(
      "M 300 100 C 400 100, 500 100, 500 100",
    );
  });
});
