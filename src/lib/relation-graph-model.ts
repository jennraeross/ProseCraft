import type { ChapterData } from "./publish/types";
import { relationActiveAt, type PageAppearances, type PagePair, type SourcedRelation } from "./relations";
import type { PageKind, RelationType, RelationTension } from "./story-meta";

/** One circle in the network: a wiki page with the label and initials it shows. */
export type RelationGraphNode = {
  id: string;
  label: string;
  kind: PageKind;
  initials: string;
};

export type RelationGraphEdgeStatus = "declared" | "suggested";

/**
 * One line in the network. Declared edges are stored relations, suggested
 * edges are pending "do these two belong together?" hints. `lane` spreads
 * edges that connect the same pair so they stay visible next to each other.
 */
export type RelationGraphEdge = {
  id: string;
  from: string;
  to: string;
  type: RelationType;
  label: string;
  tension?: RelationTension;
  status: RelationGraphEdgeStatus;
  /** Shared scenes behind a suggestion. */
  count?: number;
  lane: number;
  laneCount: number;
};

/** A wiki page as far as the graph is concerned. */
export type RelationGraphPage = { id: string; title: string; kind: PageKind };

export type RelationGraphInput = {
  pages: readonly RelationGraphPage[];
  /** Stored relations, one entry per source page (never reversed). */
  relations: readonly SourcedRelation[];
  appearances: ReadonlyMap<string, PageAppearances>;
  suggestions: readonly PagePair[];
  chapters: readonly ChapterData[];
  /** Chapter to focus, or `null` for the whole story. */
  chapterId?: string | null;
  /** Scene id -> chapter id. Without it a chapter filter falls back to first/last appearance. */
  sceneChapters?: ReadonlyMap<string, string>;
  /** Restrict the graph to these page kinds. */
  kinds?: readonly PageKind[];
};

export type RelationGraphModel = {
  nodes: RelationGraphNode[];
  edges: RelationGraphEdge[];
};

export type GraphBounds = { x: number; y: number; width: number; height: number };

/** Up to two initials: first and last word, or the first two letters of a single word. */
export function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function accepts(kinds: readonly PageKind[] | undefined, kind: PageKind): boolean {
  return !kinds || kinds.includes(kind);
}

/**
 * Whether a page shows up in a chapter. With `sceneChapters` this is exact;
 * without it the first/last appearance range is used as an approximation.
 */
function appearsInChapter(
  appearance: PageAppearances | undefined,
  chapterId: string,
  chapterIndex: number,
  sceneChapters: ReadonlyMap<string, string> | undefined
): boolean {
  if (!appearance) return false;
  if (sceneChapters) {
    return appearance.scenes.some((scene) => sceneChapters.get(scene.sceneId) === chapterId);
  }
  return (
    appearance.firstChapterIndex >= 0 &&
    appearance.firstChapterIndex <= chapterIndex &&
    chapterIndex <= appearance.lastChapterIndex
  );
}

/** How many scenes a pair shares inside the focused chapter. */
function sharedScenesInChapter(
  a: string,
  b: string,
  chapterId: string,
  appearances: ReadonlyMap<string, PageAppearances>,
  sceneChapters: ReadonlyMap<string, string>
): number {
  const otherScenes = new Set(appearances.get(b)?.scenes.map((scene) => scene.sceneId) ?? []);
  const scenes = appearances.get(a)?.scenes ?? [];
  return scenes.filter(
    (scene) => otherScenes.has(scene.sceneId) && sceneChapters.get(scene.sceneId) === chapterId
  ).length;
}

/**
 * Builds the node/edge view model for the relation network. Pure: the caller
 * supplies pages, stored relations, appearances and suggestions, so the same
 * inputs always produce the same graph.
 */
export function buildRelationGraph(input: RelationGraphInput): RelationGraphModel {
  const chapterId = input.chapterId ?? null;
  const chapterIndex =
    chapterId === null ? -1 : input.chapters.findIndex((chapter) => chapter.id === chapterId);

  const pages = input.pages.filter((page) => accepts(input.kinds, page.kind));
  const visibleIds = new Set<string>();

  if (chapterId === null) {
    for (const page of pages) visibleIds.add(page.id);
  } else {
    for (const page of pages) {
      if (appearsInChapter(input.appearances.get(page.id), chapterId, chapterIndex, input.sceneChapters)) {
        visibleIds.add(page.id);
      }
    }
  }

  const nodes: RelationGraphNode[] = pages
    .filter((page) => visibleIds.has(page.id))
    .map((page) => ({
      id: page.id,
      label: page.title,
      kind: page.kind,
      initials: initialsOf(page.title)
    }));

  const edges: RelationGraphEdge[] = [];
  const edgeIds = new Set<string>();
  const declaredPairs = new Set<string>();

  for (const { source, relation } of input.relations) {
    if (!visibleIds.has(source) || !visibleIds.has(relation.to) || source === relation.to) continue;
    declaredPairs.add(pairKey(source, relation.to));
    if (chapterId !== null && !relationActiveAt(relation, chapterId, input.chapters)) continue;
    const id = `declared:${source}:${relation.id}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      from: source,
      to: relation.to,
      type: relation.type,
      label: relation.label?.trim() || relation.type,
      tension: relation.tension,
      status: "declared",
      lane: 0,
      laneCount: 1
    });
  }

  const suggestions = [...input.suggestions]
    .filter(
      (pair) =>
        pair.a !== pair.b &&
        !declaredPairs.has(pairKey(pair.a, pair.b)) &&
        visibleIds.has(pair.a) &&
        visibleIds.has(pair.b)
    )
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

  for (const pair of suggestions) {
    let count = pair.count;
    if (chapterId !== null && input.sceneChapters) {
      count = sharedScenesInChapter(pair.a, pair.b, chapterId, input.appearances, input.sceneChapters);
      if (count === 0) continue;
    }
    const id = `suggested:${pair.key}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      from: pair.a,
      to: pair.b,
      type: "other",
      label: "",
      status: "suggested",
      count,
      lane: 0,
      laneCount: 1
    });
  }

  const pairTotals = new Map<string, number>();
  for (const edge of edges) {
    const key = pairKey(edge.from, edge.to);
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + 1);
  }
  const pairSeen = new Map<string, number>();
  for (const edge of edges) {
    const key = pairKey(edge.from, edge.to);
    const total = pairTotals.get(key) ?? 1;
    const index = pairSeen.get(key) ?? 0;
    pairSeen.set(key, index + 1);
    edge.lane = index - (total - 1) / 2;
    edge.laneCount = total;
  }

  return { nodes, edges };
}

/** Every node directly connected to `nodeId`, in either direction. */
export function neighbourIds(edges: readonly RelationGraphEdge[], nodeId: string): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.from === nodeId) ids.add(edge.to);
    else if (edge.to === nodeId) ids.add(edge.from);
  }
  return ids;
}

/** Every edge touching `nodeId`. */
export function incidentEdgeIds(edges: readonly RelationGraphEdge[], nodeId: string): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.from === nodeId || edge.to === nodeId) ids.add(edge.id);
  }
  return ids;
}

/** Nodes whose label contains the query, case-insensitively. Empty query matches nothing. */
export function matchingNodeIds(nodes: readonly RelationGraphNode[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return nodes.filter((node) => node.label.toLowerCase().includes(needle)).map((node) => node.id);
}

/** Bounding box around the given graph points; zero-sized when there are none. */
export function graphBounds(points: Iterable<{ x: number; y: number }>): GraphBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
