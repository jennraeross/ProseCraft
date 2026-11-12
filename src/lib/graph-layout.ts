/**
 * Deterministic force layout for the relationship graph.
 *
 * The module has no dependencies and never calls `Math.random`, so the same
 * graph always produces the same picture. Positions are world coordinates;
 * `fitView` maps them into the viewport.
 */

export type GraphPoint = { x: number; y: number };

/** A node passed to the layout. */
export type GraphLayoutNode = {
  id: string;
  /** Starting point when the node has no previous layout position. */
  x?: number;
  y?: number;
  /**
   * Keeps the node at the coordinates from `previous` (or its own `x`/`y`).
   * Pinned nodes are not moved by the forces or the collision pass.
   */
  pinned?: boolean;
};

export type GraphLayoutEdge = {
  from: string;
  to: string;
  /** Multiplies the attraction; defaults to 1. */
  weight?: number;
};

export type GraphLayoutOptions = {
  width?: number;
  height?: number;
  seed?: number;
  iterations?: number;
  /** Minimum distance kept between two node centers. */
  minDistance?: number;
  /** Positions of an earlier layout, reused as starting points. */
  previous?: Readonly<Record<string, GraphPoint>>;
};

export type GraphViewport = { width: number; height: number };

/** At `scale` 1 the layout is drawn 1:1: `screen = world * scale + translate`. */
export type GraphView = { scale: number; translate: GraphPoint };

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_ITERATIONS = 160;
/** Zoom limits the fit transform is clamped to, so a fit stays readable. */
const MIN_FIT_SCALE = 0.25;
const MAX_FIT_SCALE = 3;
const DEFAULT_SEED = 1;
const DEFAULT_MIN_DISTANCE = 34;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const COLLISION_ROUNDS = 24;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

type ComponentLayout = {
  members: number[];
  /** Translated positions, indexed by the node index in the layout. */
  positions: GraphPoint[];
};

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isPoint(value: unknown): value is GraphPoint {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Partial<GraphPoint>;
  return typeof point.x === "number"
    && Number.isFinite(point.x)
    && typeof point.y === "number"
    && Number.isFinite(point.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mulberry32: small, fast and fully deterministic for a given seed. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function boundsOf(points: readonly GraphPoint[], members?: readonly number[]): Bounds {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };
  const visit = (point: GraphPoint) => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  };
  if (members) for (const index of members) visit(points[index]);
  else for (const point of points) visit(point);
  return bounds;
}

/**
 * Lays out a relationship graph with a Fruchterman-Reingold style force
 * simulation. Nodes without a previous position are seeded from the injected
 * PRNG, connected components are laid out separately and packed apart, and a
 * final relaxation keeps at least `minDistance` between node centers.
 */
export function layoutGraph(
  nodes: readonly GraphLayoutNode[],
  edges: readonly GraphLayoutEdge[],
  options: GraphLayoutOptions = {}
): Record<string, GraphPoint> {
  const width = positiveNumber(options.width, DEFAULT_WIDTH);
  const height = positiveNumber(options.height, DEFAULT_HEIGHT);
  const iterations = Math.max(
    0,
    Math.round(positiveNumber(options.iterations, DEFAULT_ITERATIONS))
  );
  const minDistance = positiveNumber(options.minDistance, DEFAULT_MIN_DISTANCE);
  const random = createRandom(options.seed ?? DEFAULT_SEED);
  const previous = options.previous ?? {};

  const indexById = new Map<string, number>();
  const unique: GraphLayoutNode[] = [];
  for (const node of nodes) {
    if (!node.id || indexById.has(node.id)) continue;
    indexById.set(node.id, unique.length);
    unique.push(node);
  }
  const count = unique.length;
  const result: Record<string, GraphPoint> = {};
  if (count === 0) return result;

  const links: { from: number; to: number; weight: number }[] = [];
  const neighbors: number[][] = unique.map(() => []);
  for (const edge of edges) {
    const from = indexById.get(edge.from);
    const to = indexById.get(edge.to);
    if (from === undefined || to === undefined || from === to) continue;
    const weight = typeof edge.weight === "number" && Number.isFinite(edge.weight)
      ? clamp(edge.weight, 0.05, 8)
      : 1;
    links.push({ from, to, weight });
    neighbors[from].push(to);
    neighbors[to].push(from);
  }

  const componentOf = new Int32Array(count).fill(-1);
  const components: number[][] = [];
  for (let start = 0; start < count; start += 1) {
    if (componentOf[start] !== -1) continue;
    const id = components.length;
    const members: number[] = [];
    const stack = [start];
    componentOf[start] = id;
    while (stack.length > 0) {
      const current = stack.pop()!;
      members.push(current);
      for (const neighbor of neighbors[current]) {
        if (componentOf[neighbor] !== -1) continue;
        componentOf[neighbor] = id;
        stack.push(neighbor);
      }
    }
    members.sort((left, right) => left - right);
    components.push(members);
  }

  const points: GraphPoint[] = new Array(count);
  const pinned: boolean[] = new Array(count).fill(false);
  const previousPoints: (GraphPoint | undefined)[] = new Array(count);
  unique.forEach((node, index) => {
    const previousPoint = previous[node.id];
    const explicitPoint = isPoint(previousPoint)
      ? previousPoint
      : isPoint(node)
        ? { x: node.x, y: node.y }
        : undefined;
    const start = explicitPoint ?? {
      x: Math.cos(index * GOLDEN_ANGLE) * Math.min(width, height) * 0.35
        * Math.sqrt((index + 0.5) / count)
        + (random() - 0.5) * 4,
      y: Math.sin(index * GOLDEN_ANGLE) * Math.min(width, height) * 0.35
        * Math.sqrt((index + 0.5) / count)
        + (random() - 0.5) * 4
    };
    points[index] = { x: start.x, y: start.y };
    previousPoints[index] = explicitPoint;
    pinned[index] = node.pinned === true && explicitPoint !== undefined;
  });

  const layouts: ComponentLayout[] = [];
  for (const members of components) {
    const componentLinks = links
      .filter((link) => componentOf[link.from] === componentOf[members[0]])
      .map((link) => ({
        from: members.indexOf(link.from),
        to: members.indexOf(link.to),
        weight: link.weight
      }));
    const settled = members.some((index) => previousPoints[index] !== undefined);
    runForces(members, points, pinned, previousPoints, componentLinks, {
      width,
      height,
      iterations,
      minDistance,
      settled
    });
    const positions: GraphPoint[] = new Array(count);
    for (const index of members) positions[index] = { ...points[index] };
    layouts.push({ members, positions });
  }

  assignTargets(layouts, previousPoints, minDistance, width);

  for (const layout of layouts) {
    for (const index of layout.members) {
      const position = layout.positions[index];
      result[unique[index].id] = { x: position.x, y: position.y };
    }
  }

  const ordered: GraphPoint[] = unique.map((node) => result[node.id]);
  separateOverlaps(ordered, pinned, minDistance);
  unique.forEach((node, index) => {
    result[node.id] = ordered[index];
  });

  return result;
}

type ForceOptions = {
  width: number;
  height: number;
  iterations: number;
  minDistance: number;
  /** True when at least one node starts from a previous layout. */
  settled: boolean;
};

/** Local edge indices inside one component. */
type LocalLink = { from: number; to: number; weight: number };

/**
 * Runs the simulation on one connected component in place. A lone node is left
 * where it is: there is nothing to attract or repel it.
 */
function runForces(
  members: readonly number[],
  points: GraphPoint[],
  pinned: readonly boolean[],
  anchors: readonly (GraphPoint | undefined)[],
  links: readonly LocalLink[],
  options: ForceOptions
): void {
  const count = members.length;
  if (count < 2) return;

  const ideal = clamp(
    Math.sqrt((options.width * options.height) / count),
    options.minDistance * 1.4,
    Math.min(options.width, options.height) / 5
  );
  const temperatureStart = options.settled
    ? ideal * 0.12
    : Math.min(options.width, options.height) / 5;
  const gravity = 0.012;
  const anchorStrength = 0.12;
  const movesX = new Float64Array(count);
  const movesY = new Float64Array(count);
  // Gravity pulls towards the component's own center, so translating a
  // previous layout does not change its shape.
  let centerX = 0;
  let centerY = 0;
  for (const index of members) {
    centerX += points[index].x;
    centerY += points[index].y;
  }
  centerX /= count;
  centerY /= count;

  for (let step = 0; step < options.iterations; step += 1) {
    movesX.fill(0);
    movesY.fill(0);

    for (let first = 0; first < count; first += 1) {
      const a = points[members[first]];
      for (let second = first + 1; second < count; second += 1) {
        const b = points[members[second]];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 1e-6) {
          dx = 0;
          dy = 1;
          distance = 1;
        }
        const force = (ideal * ideal) / distance;
        const unitX = (dx / distance) * force;
        const unitY = (dy / distance) * force;
        movesX[first] += unitX;
        movesY[first] += unitY;
        movesX[second] -= unitX;
        movesY[second] -= unitY;
      }
    }

    for (const link of links) {
      const first = link.from;
      const second = link.to;
      const a = points[members[first]];
      const b = points[members[second]];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
      const force = ((distance * distance) / ideal) * link.weight;
      const pullX = (dx / distance) * force;
      const pullY = (dy / distance) * force;
      movesX[first] -= pullX;
      movesY[first] -= pullY;
      movesX[second] += pullX;
      movesY[second] += pullY;
    }

    const temperature = temperatureStart * (1 - step / options.iterations);
    for (let position = 0; position < count; position += 1) {
      const index = members[position];
      if (pinned[index]) continue;
      const point = points[index];
      movesX[position] -= (point.x - centerX) * gravity;
      movesY[position] -= (point.y - centerY) * gravity;
      const anchor = anchors[index];
      if (anchor) {
        movesX[position] += (anchor.x - point.x) * anchorStrength;
        movesY[position] += (anchor.y - point.y) * anchorStrength;
      }
      const length = Math.sqrt(movesX[position] ** 2 + movesY[position] ** 2);
      if (length < 1e-9) continue;
      const stepLength = Math.min(length, temperature) / length;
      point.x += movesX[position] * stepLength;
      point.y += movesY[position] * stepLength;
    }
  }
}

/**
 * Places every component in world coordinates. Components with previous
 * positions keep their centroid, so an existing picture stays where it was;
 * new components are packed in rows next to them (or around the origin when the
 * graph is laid out for the first time).
 */
function assignTargets(
  layouts: ComponentLayout[],
  previousPoints: readonly (GraphPoint | undefined)[],
  minDistance: number,
  width: number
): void {
  const gap = minDistance * 2;
  const rowLimit = Math.max(width, minDistance * 10);
  const anchored: ComponentLayout[] = [];
  const packed: ComponentLayout[] = [];
  const anchors = new Map<ComponentLayout, GraphPoint>();

  for (const layout of layouts) {
    const known = layout.members
      .map((index) => previousPoints[index])
      .filter((point): point is GraphPoint => point !== undefined);
    if (known.length === 0) {
      packed.push(layout);
      continue;
    }
    anchored.push(layout);
    anchors.set(layout, {
      x: known.reduce((sum, point) => sum + point.x, 0) / known.length,
      y: known.reduce((sum, point) => sum + point.y, 0) / known.length
    });
  }

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  for (const layout of packed) {
    const bounds = boundsOf(layout.positions, layout.members);
    const componentWidth = bounds.maxX - bounds.minX;
    const componentHeight = bounds.maxY - bounds.minY;
    if (cursorX > 0 && cursorX + componentWidth > rowLimit) {
      cursorY += rowHeight + gap;
      cursorX = 0;
      rowHeight = 0;
    }
    translate(layout, cursorX - bounds.minX, cursorY - bounds.minY);
    cursorX += componentWidth + gap;
    rowHeight = Math.max(rowHeight, componentHeight);
  }

  if (packed.length > 0 && anchored.length > 0) {
    const packedBounds = boundsOfLayouts(packed);
    const anchoredBounds = boundsOfLayouts(anchored);
    const shiftX = anchoredBounds.maxX + gap - packedBounds.minX;
    const shiftY = (anchoredBounds.minY + anchoredBounds.maxY) / 2
      - (packedBounds.minY + packedBounds.maxY) / 2;
    for (const layout of packed) translate(layout, shiftX, shiftY);
  } else if (packed.length > 0) {
    const bounds = boundsOfLayouts(packed);
    const shiftX = -(bounds.minX + bounds.maxX) / 2;
    const shiftY = -(bounds.minY + bounds.maxY) / 2;
    for (const layout of packed) translate(layout, shiftX, shiftY);
  }

  for (const layout of anchored) {
    const known = layout.members.filter((index) => previousPoints[index] !== undefined);
    const center = known.reduce(
      (sum, index) => ({ x: sum.x + layout.positions[index].x, y: sum.y + layout.positions[index].y }),
      { x: 0, y: 0 }
    );
    const anchor = anchors.get(layout)!;
    translate(layout, anchor.x - center.x / known.length, anchor.y - center.y / known.length);
  }
}

function boundsOfLayouts(layouts: readonly ComponentLayout[]): Bounds {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };
  for (const layout of layouts) {
    const component = boundsOf(layout.positions, layout.members);
    bounds.minX = Math.min(bounds.minX, component.minX);
    bounds.minY = Math.min(bounds.minY, component.minY);
    bounds.maxX = Math.max(bounds.maxX, component.maxX);
    bounds.maxY = Math.max(bounds.maxY, component.maxY);
  }
  return bounds;
}

function translate(layout: ComponentLayout, deltaX: number, deltaY: number): void {
  for (const index of layout.members) {
    layout.positions[index].x += deltaX;
    layout.positions[index].y += deltaY;
  }
}

/**
 * Pushes overlapping pairs apart until every center keeps `minDistance`.
 * Pinned nodes stay put and push their neighbour instead.
 */
function separateOverlaps(
  positions: GraphPoint[],
  pinned: readonly boolean[],
  minDistance: number
): void {
  for (let round = 0; round < COLLISION_ROUNDS; round += 1) {
    let moved = false;
    for (let first = 0; first < positions.length; first += 1) {
      for (let second = first + 1; second < positions.length; second += 1) {
        if (pinned[first] && pinned[second]) continue;
        const a = positions[first];
        const b = positions[second];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= minDistance) continue;
        if (distance < 1e-6) {
          dx = 0;
          dy = 1;
        } else {
          dx /= distance;
          dy /= distance;
        }
        const push = minDistance - Math.min(distance, minDistance);
        if (pinned[first]) {
          b.x -= dx * push;
          b.y -= dy * push;
        } else if (pinned[second]) {
          a.x += dx * push;
          a.y += dy * push;
        } else {
          a.x += (dx * push) / 2;
          a.y += (dy * push) / 2;
          b.x -= (dx * push) / 2;
          b.y -= (dy * push) / 2;
        }
        moved = true;
      }
    }
    if (!moved) return;
  }
}

/**
 * View transform that fits every position into the viewport with `padding`
 * pixels on all sides and centers the result.
 */
export function fitView(
  positions: Readonly<Record<string, GraphPoint>>,
  viewport: GraphViewport,
  padding = 40
): GraphView {
  const width = positiveNumber(viewport.width, DEFAULT_WIDTH);
  const height = positiveNumber(viewport.height, DEFAULT_HEIGHT);
  const inset = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const points = Object.values(positions).filter(isPoint);
  if (points.length === 0) {
    return { scale: 1, translate: { x: width / 2, y: height / 2 } };
  }

  const bounds = boundsOf(points);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const availableX = Math.max(1, width - inset * 2);
  const availableY = Math.max(1, height - inset * 2);
  const scales: number[] = [];
  if (spanX > 0) scales.push(availableX / spanX);
  if (spanY > 0) scales.push(availableY / spanY);
  const rawScale = scales.length > 0 ? Math.min(...scales) : 1;
  const scale = clamp(rawScale, MIN_FIT_SCALE, MAX_FIT_SCALE);

  return {
    scale,
    translate: {
      x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
      y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale
    }
  };
}

/**
 * Starting positions grouped by an arbitrary key: clusters are spread around a
 * ring and their members spiral outwards. Pass the result as `previous` so a
 * new graph keeps groups together without jumping.
 */
export function clusterByKey<T extends { id: string }>(
  nodes: readonly T[],
  key: (node: T) => string | undefined,
  options: { radius?: number; spacing?: number } = {}
): Record<string, GraphPoint> {
  const groups = new Map<string, T[]>();
  for (const node of nodes) {
    const group = key(node);
    if (!group) continue;
    const members = groups.get(group);
    if (members) members.push(node);
    else groups.set(group, [node]);
  }
  if (groups.size === 0) return {};

  const names = [...groups.keys()].sort();
  const ring = positiveNumber(options.radius, Math.max(220, names.length * 110));
  const spacing = positiveNumber(options.spacing, DEFAULT_MIN_DISTANCE * 1.6);
  const result: Record<string, GraphPoint> = {};

  names.forEach((name, groupIndex) => {
    const members = groups.get(name)!;
    const angle = (groupIndex / names.length) * Math.PI * 2 - Math.PI / 2;
    const centerX = names.length === 1 ? 0 : Math.cos(angle) * ring;
    const centerY = names.length === 1 ? 0 : Math.sin(angle) * ring;
    members.forEach((node, index) => {
      const radius = spacing * Math.sqrt(index + 0.5);
      const theta = index * GOLDEN_ANGLE + groupIndex * 0.7;
      result[node.id] = {
        x: centerX + Math.cos(theta) * radius,
        y: centerY + Math.sin(theta) * radius
      };
    });
  });

  return result;
}
