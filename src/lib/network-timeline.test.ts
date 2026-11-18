import { describe, expect, it } from "vitest";
import { relationBoundaryIndexes } from "./network-timeline";
import type { ChapterData } from "./publish/types";
import type { Relation } from "./story-meta";
import type { SourcedRelation } from "./relations";

const chapters: ChapterData[] = [
  { id: "chapter-1", title: "One", expanded: true },
  { id: "chapter-2", title: "Two", expanded: true },
  { id: "chapter-3", title: "Three", expanded: true },
  { id: "chapter-4", title: "Four", expanded: true },
  { id: "chapter-5", title: "Five", expanded: true },
  { id: "chapter-6", title: "Six", expanded: true }
];

function relation(id: string, patch: Partial<Relation> = {}): Relation {
  return { id, to: "page-b", type: "rival", ...patch };
}

function sourced(source: string, entry: Relation): SourcedRelation {
  return { source, relation: entry };
}

describe("relationBoundaryIndexes", () => {
  it("returns no markers without relations", () => {
    expect(relationBoundaryIndexes([], chapters)).toEqual([]);
  });

  it("marks every chapter where a relation starts or stops", () => {
    const relations = [
      sourced("page-a", relation("relation-1", { from: "chapter-2", until: "chapter-4" }))
    ];
    expect(relationBoundaryIndexes(relations, chapters)).toEqual([1, 4]);
  });

  it("collapses chapters that share the same active relations", () => {
    const relations = [
      sourced("page-a", relation("relation-1", { from: "chapter-2" })),
      sourced("page-b", relation("relation-2", { from: "chapter-2", until: "chapter-5" }))
    ];
    expect(relationBoundaryIndexes(relations, chapters)).toEqual([1, 5]);
  });

  it("keeps open-ended relations active to the end", () => {
    const relations = [sourced("page-a", relation("relation-1"))];
    expect(relationBoundaryIndexes(relations, chapters)).toEqual([0]);
  });

  it("ignores bounds that no longer resolve to a chapter", () => {
    const relations = [
      sourced("page-a", relation("relation-1", { from: "chapter-missing" })),
      sourced("page-b", relation("relation-2", { until: "chapter-missing" }))
    ];
    expect(relationBoundaryIndexes(relations, chapters)).toEqual([0]);
  });
});
