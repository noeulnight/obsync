import type { CanvasNode, CanvasSide } from "./sync";

export type CanvasPoint = { x: number; y: number };

export function edgeGeometry(
  from: CanvasNode,
  to: CanvasNode,
  fromSide: CanvasSide,
  toSide: CanvasSide,
) {
  const start = edgePoint(from, fromSide);
  const end = edgePoint(to, toSide);
  const distance = controlDistance(start, end);
  const first = offsetPoint(start, fromSide, distance);
  const second = offsetPoint(end, toSide, distance);
  return {
    path: `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`,
    middle: {
      x: (start.x + 3 * first.x + 3 * second.x + end.x) / 8,
      y: (start.y + 3 * first.y + 3 * second.y + end.y) / 8,
    },
  };
}

export function previewEdgePath(node: CanvasNode, side: CanvasSide, end: CanvasPoint) {
  const start = edgePoint(node, side);
  const first = offsetPoint(start, side, controlDistance(start, end));
  return `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${end.x} ${end.y}, ${end.x} ${end.y}`;
}

export function edgePoint(node: CanvasNode, side: CanvasSide): CanvasPoint {
  if (side === "top") return { x: node.x + node.width / 2, y: node.y };
  if (side === "right") return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === "bottom") return { x: node.x + node.width / 2, y: node.y + node.height };
  return { x: node.x, y: node.y + node.height / 2 };
}

export function nearestSide(node: CanvasNode, point: CanvasPoint): CanvasSide {
  const distances: [CanvasSide, number][] = [
    ["top", Math.abs(point.y - node.y)],
    ["right", Math.abs(point.x - node.x - node.width)],
    ["bottom", Math.abs(point.y - node.y - node.height)],
    ["left", Math.abs(point.x - node.x)],
  ];
  return distances.reduce((closest, current) => (current[1] < closest[1] ? current : closest))[0];
}

function controlDistance(start: CanvasPoint, end: CanvasPoint) {
  return Math.min(180, Math.max(48, Math.hypot(end.x - start.x, end.y - start.y) / 2));
}

function offsetPoint(point: CanvasPoint, side: CanvasSide, distance: number): CanvasPoint {
  if (side === "top") return { x: point.x, y: point.y - distance };
  if (side === "right") return { x: point.x + distance, y: point.y };
  if (side === "bottom") return { x: point.x, y: point.y + distance };
  return { x: point.x - distance, y: point.y };
}
