import { describe, expect, it } from "vitest";
import { graphTileModel } from "./graph-tile";
import type { ChapterData, DocumentData, ResearchFolder } from "./publish/types";
import { graphTarget, parseSplitTarget } from "./split";
import type { Relation } from "./story-meta";

describe("graph split targets", () => {
  it("builds and parses the scene graph target", () => {
    expect(graphTarget("scene")).toBe("graph:scene");
    expect(parseSplitTarget("graph:scene")).toEqual({ kind: "graph", mode: "scene", id: "" });
  });

  it("builds and parses a page graph target", () => {
    expect(graphTarget("page", "page-1")).toBe("graph:page:page-1");
    expect(parseSplitTarget(graphTarget("page", "page:1"))).toEqual({
      kind: "graph",
      mode: "page",
      id: "page:1"
    });
  });

  it("rejects graph targets without a page id and keeps the other kinds", () => {
    expect(parseSplitTarget("graph:page:")).toBeNull();
    expect(parseSplitTarget("graph:")).toBeNull();
    expect(parseSplitTarget("doc:a-1")).toEqual({ kind: "doc", id: "a-1" });
    expect(parseSplitTarget("file:f:2")).toEqual({ kind: "file", id: "f:2" });
  });
});

const folders: ResearchFolder[] = [
  { id: "folder-characters", title: "Characters", parentId: null },
  { id: "folder-places", title: "Places", parentId: null }
];

const chapters: ChapterData[] = [
  { id: "chapter-1", title: "One", expanded: true },
  { id: "chapter-2", title: "Two", expanded: true },
  { id: "chapter-3", title: "Three", expanded: true }
];

function page(id: string, overrides: Partial<DocumentData> = {}): DocumentData {
  return { id, title: id, content: "", space: "Wiki", folderId: "folder-characters", ...overrides };
}

function scene(
  id: string,
  chapterId: string,
  content: string,
  characters?: string[]
): DocumentData {
  return {
    id,
    title: id,
    content,
    chapterId,
    meta: characters ? { characters } : undefined
  };
}

function relation(id: string, to: string, overrides: Partial<Relation> = {}): Relation {
  return { id, to, type: "mentor", ...overrides };
}

const mira = page("mira", {
  title: "Mira",
  meta: { aliases: ["Captain"], relations: [relation("rel-1", "boris", { from: "chapter-2" })] }
});
const ren = page("ren", { title: "Ren" });
const boris = page("boris", { title: "Boris" });
const harbour = page("harbour", { title: "Harbour", folderId: "folder-places" });

const documents: DocumentData[] = [
  mira,
  ren,
  boris,
  harbour,
  scene("s1", "chapter-1", "The CAPTAIN waits in the harbour.", ["ren"]),
  scene("s2", "chapter-2", "Ren and Mira talk.", ["ren", "mira"])
];

describe("graph tile model", () => {
  it("lists confirmed and detected characters of the scene and suggests the unconfirmed ones", () => {
    const model = graphTileModel({ documents, chapters, folders, sceneId: "s1" });
    expect(model.sceneId).toBe("s1");
    expect(model.chapterId).toBe("chapter-1");
    expect(model.characters.map((entry) => [entry.id, entry.mode])).toEqual([
      ["ren", "confirmed"],
      ["mira", "auto"]
    ]);
    expect(model.suggestions.map((entry) => entry.id)).toEqual(["mira"]);
    expect(model.pages.map((entry) => entry.id)).toEqual(["ren", "mira"]);
  });

  it("ignores pages that are not characters", () => {
    const model = graphTileModel({ documents, chapters, folders, sceneId: "s1" });
    expect(model.characters.some((entry) => entry.id === "harbour")).toBe(false);
    expect(model.suggestions.some((entry) => entry.id === "harbour")).toBe(false);
  });

  it("keeps only relations that are active at the scene's chapter", () => {
    const early = graphTileModel({ documents, chapters, folders, sceneId: "s1" });
    expect(early.relations).toEqual([]);

    const later = graphTileModel({ documents, chapters, folders, sceneId: "s2" });
    expect(later.relations).toHaveLength(1);
    expect(later.relations[0].source).toBe("mira");
    expect(later.relations[0].relation.to).toBe("boris");
    expect(later.pages.map((entry) => entry.id)).toEqual(["ren", "mira", "boris"]);
  });

  it("drops the suggestion once the scene confirms the page", () => {
    const model = graphTileModel({ documents, chapters, folders, sceneId: "s2" });
    expect(model.characters.map((entry) => entry.id)).toEqual(["ren", "mira"]);
    expect(model.suggestions).toEqual([]);
  });

  it("centres the tile on a page and follows the derived direction of its relations", () => {
    const model = graphTileModel({ documents, chapters, folders, pageId: "boris" });
    expect(model.sceneId).toBeNull();
    expect(model.characters.map((entry) => entry.id)).toEqual(["boris"]);
    expect(model.relations).toHaveLength(1);
    expect(model.relations[0].source).toBe("boris");
    expect(model.relations[0].relation.to).toBe("mira");
    expect(model.pages.map((entry) => entry.id)).toEqual(["boris", "mira"]);
  });

  it("returns an empty model for a missing scene", () => {
    expect(graphTileModel({ documents, chapters, folders, sceneId: "gone" })).toEqual({
      sceneId: null,
      chapterId: null,
      characters: [],
      suggestions: [],
      relations: [],
      pages: []
    });
  });
});
