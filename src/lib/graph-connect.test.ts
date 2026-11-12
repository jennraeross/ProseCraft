import { describe, expect, it } from "vitest";
import {
  canConnect,
  connectionTarget,
  hasDeclaredRelation,
  nodeAtPoint,
  screenToWorld,
  type ConnectNode
} from "./graph-connect";
import type { GraphView } from "./graph-layout";

const nodes: ConnectNode[] = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 100, y: 0 },
  { id: "c", x: 0, y: 100 }
];

describe("screenToWorld", () => {
  it("undoes pan and zoom of the view transform", () => {
    const view: GraphView = { scale: 2, translate: { x: 40, y: -20 } };
    expect(screenToWorld({ x: 240, y: 80 }, view)).toEqual({ x: 100, y: 50 });
  });

  it("keeps the point under the pointer when the view is untransformed", () => {
    const view: GraphView = { scale: 1, translate: { x: 0, y: 0 } };
    expect(screenToWorld({ x: 12, y: 34 }, view)).toEqual({ x: 12, y: 34 });
  });
});

describe("nodeAtPoint", () => {
  it("finds the page whose centre is inside the radius", () => {
    expect(nodeAtPoint(nodes, { x: 90, y: 0 }, 20)).toBe("b");
  });

  it("returns null when no page is close enough", () => {
    expect(nodeAtPoint(nodes, { x: 50, y: 50 }, 20)).toBeNull();
  });

  it("prefers the nearest of two overlapping pages", () => {
    expect(nodeAtPoint(nodes, { x: 8, y: 0 }, 20)).toBe("a");
  });

  it("accepts a point exactly on the radius", () => {
    expect(nodeAtPoint(nodes, { x: 0, y: 20 }, 20)).toBe("a");
  });
});

describe("hasDeclaredRelation", () => {
  const relations = [{ from: "a", to: "b" }];

  it("matches the declared direction", () => {
    expect(hasDeclaredRelation(relations, "a", "b")).toBe(true);
  });

  it("ignores the derived reverse direction", () => {
    expect(hasDeclaredRelation(relations, "b", "a")).toBe(false);
  });
});

describe("canConnect", () => {
  const relations = [{ from: "a", to: "b" }];

  it("rejects a page connected to itself", () => {
    expect(canConnect(relations, "a", "a")).toBe(false);
  });

  it("rejects a duplicate in the same direction", () => {
    expect(canConnect(relations, "a", "b")).toBe(false);
  });

  it("allows the reverse direction and unknown pairs", () => {
    expect(canConnect(relations, "b", "a")).toBe(true);
    expect(canConnect(relations, "a", "c")).toBe(true);
  });
});

describe("connectionTarget", () => {
  const relations = [{ from: "a", to: "b" }];

  it("snaps to the page under the pointer", () => {
    expect(connectionTarget(nodes, relations, "a", { x: 100, y: 4 }, 20)).toEqual({
      id: "b",
      valid: false
    });
  });

  it("marks a new page as a valid target", () => {
    expect(connectionTarget(nodes, relations, "a", { x: 0, y: 100 }, 20)).toEqual({
      id: "c",
      valid: true
    });
  });

  it("never snaps back to the source page", () => {
    expect(connectionTarget(nodes, relations, "a", { x: 2, y: 0 }, 20)).toBeNull();
  });

  it("returns null over empty background", () => {
    expect(connectionTarget(nodes, relations, "a", { x: 50, y: 50 }, 20)).toBeNull();
  });
});
