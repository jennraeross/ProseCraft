import { describe, expect, it } from "vitest";
import {
  clusterByKey,
  fitView,
  layoutGraph,
  type GraphLayoutEdge,
  type GraphLayoutNode,
  type GraphPoint
} from "./graph-layout";

const distance = (a: GraphPoint, b: GraphPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

function graph(count: number): { nodes: GraphLayoutNode[]; edges: GraphLayoutEdge[] } {
  const nodes = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }));
  const edges: GraphLayoutEdge[] = [];
  for (let index = 1; index < count; index += 1) {
    edges.push({ from: `n${index - 1}`, to: `n${index}` });
  }
  return { nodes, edges };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("layoutGraph", () => {
  it("produces the same positions for the same graph and seed", () => {
    const { nodes, edges } = graph(12);
    edges.push({ from: "n0", to: "n6" }, { from: "n2", to: "n9", weight: 2 });

    const first = layoutGraph(nodes, edges, { seed: 42 });
    const second = layoutGraph(nodes, edges, { seed: 42 });

    expect(second).toEqual(first);
    expect(layoutGraph(nodes, edges, { seed: 43 })).not.toEqual(first);
    for (const point of Object.values(first)) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it("handles an empty graph and a single node", () => {
    expect(layoutGraph([], [])).toEqual({});
    expect(layoutGraph([{ id: "solo" }], [])).toEqual({ solo: { x: 0, y: 0 } });
  });

  it("keeps a single node on its previous position", () => {
    const positions = layoutGraph([{ id: "solo" }], [], {
      previous: { solo: { x: 120, y: -40 } }
    });
    expect(positions.solo).toEqual({ x: 120, y: -40 });
  });

  it("keeps every node center apart for 40 nodes", () => {
    const { nodes, edges } = graph(40);
    for (let index = 0; index < 40; index += 1) {
      edges.push({ from: `n${index}`, to: `n${(index * 7 + 3) % 40}` });
    }

    const minDistance = 34;
    const positions = layoutGraph(nodes, edges, { minDistance });
    const points = nodes.map((node) => positions[node.id]);

    for (let first = 0; first < points.length; first += 1) {
      for (let second = first + 1; second < points.length; second += 1) {
        expect(distance(points[first], points[second])).toBeGreaterThanOrEqual(
          minDistance - 1e-6
        );
      }
    }
  });

  it("uses previous positions instead of jumping", () => {
    const { nodes, edges } = graph(10);
    const first = layoutGraph(nodes, edges, { seed: 7 });

    const repeated = layoutGraph(nodes, edges, { seed: 7, previous: first });
    const drift = nodes.map((node) => distance(repeated[node.id], first[node.id]));
    expect(mean(drift)).toBeLessThan(60);

    const extended = layoutGraph(nodes, [...edges, { from: "n0", to: "n2" }], {
      seed: 7,
      previous: first
    });
    const extendedDrift = nodes.map((node) => distance(extended[node.id], first[node.id]));
    expect(mean(extendedDrift)).toBeLessThan(150);

    const withNewcomer = layoutGraph(
      [...nodes, { id: "n10" }],
      [...edges, { from: "n4", to: "n10" }],
      { seed: 7, previous: first }
    );
    const newcomerDrift = nodes.map((node) => distance(withNewcomer[node.id], first[node.id]));
    expect(mean(newcomerDrift)).toBeLessThan(150);
  });

  it("keeps the previous centroid of a component", () => {
    const { nodes, edges } = graph(5);
    const offset = { x: 5000, y: -3000 };
    const previous = Object.fromEntries(
      nodes.map((node, index) => [
        node.id,
        { x: offset.x + index * 10, y: offset.y - index * 10 }
      ])
    );

    const positions = layoutGraph(nodes, edges, { previous });
    const center = {
      x: mean(Object.values(positions).map((point) => point.x)),
      y: mean(Object.values(positions).map((point) => point.y))
    };

    expect(center.x).toBeCloseTo(offset.x + 20, 6);
    expect(center.y).toBeCloseTo(offset.y - 20, 6);
  });

  it("does not move pinned nodes", () => {
    const { nodes, edges } = graph(6);
    const pinned = [
      { id: "n0", x: -120, y: 40, pinned: true },
      { id: "n1", x: 130, y: -30, pinned: true }
    ];
    const positions = layoutGraph([...nodes.slice(2), ...pinned], edges, { seed: 3 });

    expect(positions.n0).toEqual({ x: -120, y: 40 });
    expect(positions.n1).toEqual({ x: 130, y: -30 });
  });

  it("places disconnected components apart", () => {
    const first = graph(4);
    const second = graph(4);
    const secondNodes = second.nodes.map((node) => ({ id: `b-${node.id}` }));
    const secondEdges = second.edges.map((edge) => ({
      from: `b-${edge.from}`,
      to: `b-${edge.to}`
    }));
    const nodes = [...first.nodes, ...secondNodes];
    const positions = layoutGraph(nodes, [...first.edges, ...secondEdges], { seed: 11 });

    const bounds = (ids: string[]) => {
      const points = ids.map((id) => positions[id]);
      return {
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxY: Math.max(...points.map((point) => point.y))
      };
    };
    const a = bounds(first.nodes.map((node) => node.id));
    const b = bounds(secondNodes.map((node) => node.id));
    const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    expect(overlapX < 0 || overlapY < 0).toBe(true);
  });

  it("lays out about 300 nodes quickly", () => {
    const count = 300;
    const nodes = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }));
    const edges = Array.from({ length: count }, (_, index) => ({
      from: `n${index}`,
      to: `n${(index * 13 + 7) % count}`
    }));

    const started = performance.now();
    const positions = layoutGraph(nodes, edges);
    const elapsed = performance.now() - started;

    expect(Object.keys(positions)).toHaveLength(count);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe("fitView", () => {
  it("centers an empty graph", () => {
    expect(fitView({}, { width: 400, height: 300 }))
      .toEqual({ scale: 1, translate: { x: 200, y: 150 } });
  });

  it("fits a bounding box into the viewport and centers it", () => {
    const view = fitView(
      { a: { x: 0, y: 0 }, b: { x: 100, y: 100 } },
      { width: 320, height: 220 },
      20
    );

    expect(view.scale).toBeCloseTo(1.8, 6);
    expect(view.translate.x).toBeCloseTo(70, 6);
    expect(view.translate.y).toBeCloseTo(20, 6);
    expect(view.translate.y + 0 * view.scale).toBeCloseTo(20, 6);
    expect(view.translate.y + 100 * view.scale).toBeCloseTo(200, 6);
  });

  it("keeps a single node centered at zoom 1", () => {
    expect(fitView({ only: { x: 40, y: -10 } }, { width: 500, height: 400 }))
      .toEqual({ scale: 1, translate: { x: 210, y: 210 } });
  });
});

describe("clusterByKey", () => {
  it("spreads groups apart and keeps members of a group together", () => {
    const nodes = [
      ...Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, group: "character" })),
      ...Array.from({ length: 5 }, (_, index) => ({ id: `p${index}`, group: "place" })),
      ...Array.from({ length: 5 }, (_, index) => ({ id: `i${index}`, group: "item" }))
    ];
    const positions = clusterByKey(nodes, (node) => node.group, { radius: 400, spacing: 30 });

    expect(Object.keys(positions)).toHaveLength(15);
    for (const group of ["character", "place", "item"]) {
      const members = nodes.filter((node) => node.group === group);
      for (let first = 0; first < members.length; first += 1) {
        for (let second = first + 1; second < members.length; second += 1) {
          expect(distance(positions[members[first].id], positions[members[second].id]))
            .toBeLessThan(130);
        }
      }
    }
    expect(distance(positions.c0, positions.p0)).toBeGreaterThan(200);
    expect(clusterByKey(nodes, (node) => node.group, { radius: 400, spacing: 30 }))
      .toEqual(positions);
  });
});
