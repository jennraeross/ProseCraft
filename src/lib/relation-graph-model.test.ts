import { describe, expect, it } from "vitest";
import type { ChapterData } from "./publish/types";
import {
  buildRelationGraph,
  graphBounds,
  incidentEdgeIds,
  initialsOf,
  matchingNodeIds,
  neighbourIds,
  type RelationGraphEdge,
  type RelationGraphPage
} from "./relation-graph-model";
import type { PageAppearances, PagePair, SourcedRelation } from "./relations";
import type { PageKind, Relation } from "./story-meta";

const chapters: ChapterData[] = [
  { id: "c1", title: "One", expanded: false },
  { id: "c2", title: "Two", expanded: false },
  { id: "c3", title: "Three", expanded: false }
];

const pages: RelationGraphPage[] = [
  { id: "p-mira", title: "Mira Kessler", kind: "character" },
  { id: "p-jonas", title: "Jonas Moens", kind: "character" },
  { id: "p-palace", title: "Palace", kind: "place" },
  { id: "p-guild", title: "The Guild", kind: "organisation" }
];

function appearance(
  pageId: string,
  kind: PageKind,
  scenes: { id: string; chapter: number }[]
): PageAppearances {
  const indexes = scenes.map((scene) => scene.chapter);
  const first = indexes.length > 0 ? Math.min(...indexes) : -1;
  const last = indexes.length > 0 ? Math.max(...indexes) : -1;
  return {
    pageId,
    kind,
    scenes: scenes.map((scene) => ({ sceneId: scene.id, mode: "confirmed" })),
    sceneCount: scenes.length,
    confirmedCount: scenes.length,
    autoCount: 0,
    firstChapterId: first >= 0 ? chapters[first].id : null,
    lastChapterId: last >= 0 ? chapters[last].id : null,
    firstChapterIndex: first,
    lastChapterIndex: last
  };
}

const appearances = new Map<string, PageAppearances>([
  ["p-mira", appearance("p-mira", "character", [{ id: "s1", chapter: 0 }, { id: "s2", chapter: 1 }])],
  ["p-jonas", appearance("p-jonas", "character", [{ id: "s1", chapter: 0 }, { id: "s2", chapter: 1 }])],
  ["p-palace", appearance("p-palace", "place", [{ id: "s2", chapter: 1 }])],
  ["p-guild", appearance("p-guild", "organisation", [{ id: "s3", chapter: 2 }])]
]);

const sceneChapters = new Map([
  ["s1", "c1"],
  ["s2", "c2"],
  ["s3", "c3"]
]);

function relation(id: string, to: string, patch: Partial<Relation> = {}): Relation {
  return { id, to, type: "friend", ...patch };
}

function sourced(source: string, entry: Relation): SourcedRelation {
  return { source, relation: entry };
}

const suggestions: PagePair[] = [
  { a: "p-mira", b: "p-jonas", key: "p-jonas\u0000p-mira", count: 4 }
];

describe("initialsOf", () => {
  it("uses the first two letters of a single word", () => {
    expect(initialsOf("Kessler")).toBe("KE");
  });

  it("uses the first and last word of a full name", () => {
    expect(initialsOf("Arthur van Arcken")).toBe("AA");
    expect(initialsOf("Mira Kessler")).toBe("MK");
  });

  it("falls back to a question mark for an empty label", () => {
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("buildRelationGraph", () => {
  it("keeps every page in all mode and maps stored relations to edges", () => {
    const model = buildRelationGraph({
      pages,
      relations: [sourced("p-mira", relation("r1", "p-jonas", { type: "love", label: "fiancee" }))],
      appearances,
      suggestions: [],
      chapters,
      chapterId: null
    });

    expect(model.nodes.map((node) => node.id)).toEqual(["p-mira", "p-jonas", "p-palace", "p-guild"]);
    expect(model.nodes[0]).toMatchObject({ label: "Mira Kessler", kind: "character", initials: "MK" });
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({
      id: "declared:p-mira:r1",
      from: "p-mira",
      to: "p-jonas",
      type: "love",
      label: "fiancee",
      status: "declared",
      lane: 0,
      laneCount: 1
    });
  });

  it("falls back to the relation type as label", () => {
    const model = buildRelationGraph({
      pages,
      relations: [sourced("p-mira", relation("r1", "p-jonas", { type: "rival" }))],
      appearances,
      suggestions: [],
      chapters,
      chapterId: null
    });

    expect(model.edges[0].label).toBe("rival");
  });

  it("drops relations whose target page is unknown or points at the source", () => {
    const model = buildRelationGraph({
      pages,
      relations: [
        sourced("p-mira", relation("r1", "p-missing")),
        sourced("p-mira", relation("r2", "p-mira"))
      ],
      appearances,
      suggestions: [],
      chapters,
      chapterId: null
    });

    expect(model.edges).toEqual([]);
  });

  it("adds suggestions with their shared scene count", () => {
    const model = buildRelationGraph({
      pages,
      relations: [],
      appearances,
      suggestions,
      chapters,
      chapterId: null
    });

    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({
      id: "suggested:p-jonas\u0000p-mira",
      from: "p-mira",
      to: "p-jonas",
      status: "suggested",
      count: 4,
      label: ""
    });
  });

  it("hides suggestions for a pair that already has a relation in either direction", () => {
    const model = buildRelationGraph({
      pages,
      relations: [sourced("p-jonas", relation("r1", "p-mira", { type: "rival" }))],
      appearances,
      suggestions,
      chapters,
      chapterId: null
    });

    expect(model.edges).toHaveLength(1);
    expect(model.edges[0].status).toBe("declared");
  });

  it("spreads several edges between the same pair across lanes", () => {
    const model = buildRelationGraph({
      pages,
      relations: [
        sourced("p-mira", relation("r1", "p-jonas", { type: "love" })),
        sourced("p-jonas", relation("r2", "p-mira", { type: "friend" }))
      ],
      appearances,
      suggestions: [],
      chapters,
      chapterId: null
    });

    expect(model.edges.map((edge) => edge.lane)).toEqual([-0.5, 0.5]);
    expect(model.edges.map((edge) => edge.laneCount)).toEqual([2, 2]);
  });

  it("keeps only pages that appear in the focused chapter", () => {
    const model = buildRelationGraph({
      pages,
      relations: [sourced("p-mira", relation("r1", "p-jonas"))],
      appearances,
      suggestions,
      chapters,
      chapterId: "c1",
      sceneChapters
    });

    expect(model.nodes.map((node) => node.id)).toEqual(["p-mira", "p-jonas"]);
    expect(model.edges[0].count).toBeUndefined();
  });

  it("applies relation chapter bounds", () => {
    const model = buildRelationGraph({
      pages,
      relations: [sourced("p-mira", relation("r1", "p-jonas", { from: "c2", until: "c2" }))],
      appearances,
      suggestions: [],
      chapters,
      chapterId: "c1",
      sceneChapters
    });

    expect(model.edges).toEqual([]);
  });

  it("counts suggestion scenes inside the focused chapter", () => {
    const model = buildRelationGraph({
      pages,
      relations: [],
      appearances,
      suggestions,
      chapters,
      chapterId: "c1",
      sceneChapters
    });

    expect(model.edges).toHaveLength(1);
    expect(model.edges[0].count).toBe(1);
  });

  it("hides suggestions that share no scene in the focused chapter", () => {
    const model = buildRelationGraph({
      pages,
      relations: [],
      appearances,
      suggestions,
      chapters,
      chapterId: "c3",
      sceneChapters
    });

    expect(model.nodes.map((node) => node.id)).toEqual(["p-guild"]);
    expect(model.edges).toEqual([]);
  });

  it("filters by page kind", () => {
    const model = buildRelationGraph({
      pages,
      relations: [],
      appearances,
      suggestions: [],
      chapters,
      chapterId: null,
      kinds: ["place"]
    });

    expect(model.nodes.map((node) => node.id)).toEqual(["p-palace"]);
  });

  it("sorts suggestions by count", () => {
    const model = buildRelationGraph({
      pages,
      relations: [],
      appearances,
      suggestions: [
        { a: "p-mira", b: "p-palace", key: "p-mira\u0000p-palace", count: 2 },
        { a: "p-mira", b: "p-guild", key: "p-guild\u0000p-mira", count: 5 }
      ],
      chapters,
      chapterId: null
    });

    expect(model.edges.map((edge) => edge.count)).toEqual([5, 2]);
  });
});

const edges: RelationGraphEdge[] = [
  {
    id: "e1",
    from: "a",
    to: "b",
    type: "friend",
    label: "friend",
    status: "declared",
    lane: 0,
    laneCount: 1
  },
  {
    id: "e2",
    from: "b",
    to: "c",
    type: "rival",
    label: "rival",
    status: "declared",
    lane: 0,
    laneCount: 1
  }
];

describe("graph helpers", () => {
  it("collects neighbours in both directions", () => {
    expect([...neighbourIds(edges, "b")].sort()).toEqual(["a", "c"]);
    expect(neighbourIds(edges, "a")).toEqual(new Set(["b"]));
    expect(neighbourIds(edges, "missing").size).toBe(0);
  });

  it("collects incident edges", () => {
    expect(incidentEdgeIds(edges, "b")).toEqual(new Set(["e1", "e2"]));
    expect(incidentEdgeIds(edges, "a")).toEqual(new Set(["e1"]));
  });

  it("matches node labels case-insensitively", () => {
    const nodes = pages.map((page) => ({
      id: page.id,
      label: page.title,
      kind: page.kind,
      initials: initialsOf(page.title)
    }));
    expect(matchingNodeIds(nodes, "MIRA")).toEqual(["p-mira"]);
    expect(matchingNodeIds([], "mira")).toEqual([]);
  });

  it("treats an empty search as no match", () => {
    const nodes = [{ id: "n", label: "Nora", kind: "character" as const, initials: "NO" }];
    expect(matchingNodeIds(nodes, "  ")).toEqual([]);
  });

  it("computes bounds and handles an empty graph", () => {
    expect(graphBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(
      graphBounds([
        { x: -10, y: 4 },
        { x: 30, y: -6 }
      ])
    ).toEqual({ x: -10, y: -6, width: 40, height: 10 });
  });
});
