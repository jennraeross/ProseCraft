import { describe, expect, it } from "vitest";
import type { ChapterData, DocumentData, ResearchFolder } from "./publish/types";
import type { Relation } from "./story-meta";
import {
  addRelation,
  appearances,
  characterPages,
  coAppearanceCounts,
  pageKind,
  relationActiveAt,
  relationsOf,
  removeRelation,
  reverseView,
  suggestRelations,
  updateRelation
} from "./relations";

const folders: ResearchFolder[] = [
  { id: "folder-characters", title: "Characters", parentId: null },
  { id: "folder-places", title: "places", parentId: null },
  { id: "folder-orgs", title: "Organisations", parentId: null },
  { id: "folder-orgs-us", title: "Organizations", parentId: null },
  { id: "folder-items", title: "Items", parentId: null },
  { id: "folder-notes", title: "Notes", parentId: null }
];

const chapters: ChapterData[] = [
  { id: "chapter-1", title: "One", expanded: true },
  { id: "chapter-2", title: "Two", expanded: true },
  { id: "chapter-3", title: "Three", expanded: true }
];

function page(id: string, overrides: Partial<DocumentData> = {}): DocumentData {
  return { id, title: id, content: "", space: "Wiki", ...overrides };
}

function scene(
  id: string,
  chapterId: string,
  content: string,
  characters?: string[],
  trashed = false
): DocumentData {
  return {
    id,
    title: id,
    content,
    chapterId,
    trashed,
    meta: characters ? { characters } : undefined
  };
}

function relation(id: string, to: string, overrides: Partial<Relation> = {}): Relation {
  return { id, to, type: "friend", ...overrides };
}

const mira = page("mira", {
  title: "Mira",
  folderId: "folder-characters",
  meta: { aliases: ["Captain"] }
});
const ren = page("ren", { title: "Ren", folderId: "folder-characters" });
const unused = page("unused", { title: "Unused" });

const storyDocuments: DocumentData[] = [
  scene("s3", "chapter-2", "The CAPTAIN and Ren talk.", ["ren"]),
  scene("s5", "chapter-3", "Ren again."),
  scene("s1", "chapter-1", "Mira walks in."),
  scene("s4", "chapter-2", "Mira and Ren argue.", ["mira"]),
  scene("s2", "chapter-1", "Nobody here.", ["mira", "ghost"]),
  scene("s6", "chapter-2", "Mira in a deleted scene", ["mira"], true),
  mira,
  ren,
  unused
];

describe("pageKind", () => {
  it("prefers the declared kind and otherwise derives it from the folder", () => {
    const kind = (overrides: Partial<DocumentData>) => pageKind(page("page", overrides), folders);

    expect(kind({ meta: { kind: "character" }, folderId: "folder-places" })).toBe("character");
    expect(kind({ folderId: "folder-characters" })).toBe("character");
    expect(kind({ folderId: "folder-places" })).toBe("place");
    expect(kind({ folderId: "folder-orgs" })).toBe("organisation");
    expect(kind({ folderId: "folder-orgs-us" })).toBe("organisation");
    expect(kind({ folderId: "folder-items" })).toBe("item");
    expect(kind({ folderId: "folder-notes" })).toBe("other");
    expect(kind({ folderId: "missing-folder" })).toBe("other");
    expect(kind({})).toBe("other");
  });
});

describe("characterPages", () => {
  it("keeps untrashed wiki pages that are characters by kind or folder", () => {
    const documents = [
      page("by-folder", { folderId: "folder-characters" }),
      page("by-meta", { meta: { kind: "character" } }),
      page("place", { folderId: "folder-places" }),
      page("trashed", { folderId: "folder-characters", trashed: true }),
      scene("scene", "chapter-1", "Mira walks in.")
    ];

    expect(characterPages(documents, folders).map((doc) => doc.id)).toEqual([
      "by-folder",
      "by-meta"
    ]);
  });
});

describe("relationsOf and reverseView", () => {
  it("pairs every stored relation with its source and derives the incoming direction", () => {
    const documents = [
      page("mira", { meta: { relations: [relation("rel-1", "ren", { type: "family", from: "chapter-1" })] } }),
      page("ren", { meta: { relations: [relation("rel-2", "mira", { type: "rival" })] } }),
      page("trashed", { trashed: true, meta: { relations: [relation("rel-3", "mira")] } })
    ];

    const stored = relationsOf(documents);
    expect(stored).toEqual([
      { source: "mira", relation: relation("rel-1", "ren", { type: "family", from: "chapter-1" }) },
      { source: "ren", relation: relation("rel-2", "mira", { type: "rival" }) }
    ]);

    expect(reverseView(stored)).toEqual([
      {
        source: "ren",
        relation: { id: "reverse:rel-1", to: "mira", type: "family", from: "chapter-1" }
      },
      { source: "mira", relation: { id: "reverse:rel-2", to: "ren", type: "rival" } }
    ]);
    expect(documents[0].meta?.relations?.[0]).toEqual(
      relation("rel-1", "ren", { type: "family", from: "chapter-1" })
    );
  });
});

describe("relationActiveAt", () => {
  it("compares inclusive chapter bounds by chapter order", () => {
    const open = relation("rel-1", "ren");

    expect(relationActiveAt(open, "chapter-2", chapters)).toBe(true);
    expect(relationActiveAt(open, "missing-chapter", chapters)).toBe(false);

    const from = relation("rel-2", "ren", { from: "chapter-2" });
    expect(relationActiveAt(from, "chapter-1", chapters)).toBe(false);
    expect(relationActiveAt(from, "chapter-2", chapters)).toBe(true);
    expect(relationActiveAt(from, "chapter-3", chapters)).toBe(true);

    const until = relation("rel-3", "ren", { until: "chapter-3" });
    expect(relationActiveAt(until, "chapter-2", chapters)).toBe(true);
    expect(relationActiveAt(until, "chapter-3", chapters)).toBe(true);
    expect(relationActiveAt(until, "chapter-4", chapters)).toBe(false);

    const range = relation("rel-4", "ren", { from: "chapter-2", until: "chapter-3" });
    expect(relationActiveAt(range, "chapter-1", chapters)).toBe(false);
    expect(relationActiveAt(range, "chapter-2", chapters)).toBe(true);
    expect(relationActiveAt(range, "chapter-3", chapters)).toBe(true);
    expect(relationActiveAt(range, "chapter-4", chapters)).toBe(false);

    const inverted = relation("rel-5", "ren", { from: "chapter-3", until: "chapter-2" });
    expect(relationActiveAt(inverted, "chapter-2", chapters)).toBe(false);
    expect(relationActiveAt(inverted, "chapter-3", chapters)).toBe(false);

    const unknownBound = relation("rel-6", "ren", { from: "deleted-chapter" });
    expect(relationActiveAt(unknownBound, "chapter-1", chapters)).toBe(true);
  });
});

describe("relation writes", () => {
  const documents = [
    page("mira", { meta: { kind: "character", aliases: ["Captain"] } }),
    page("ren"),
    page("old", { meta: { relations: [relation("rel-0", "mira")] } })
  ];

  it("adds a relation immutably and keeps the other meta fields", () => {
    const added = addRelation(
      documents,
      "mira",
      { to: "ren", type: "rival", from: "chapter-1" },
      () => "rel-1"
    );

    expect(added[0]).toEqual(
      page("mira", {
        meta: {
          kind: "character",
          aliases: ["Captain"],
          relations: [{ id: "rel-1", to: "ren", type: "rival", from: "chapter-1" }]
        }
      })
    );
    expect(added[1]).toBe(documents[1]);
    expect(documents[0].meta?.relations).toBeUndefined();
  });

  it("patches one relation without touching the others", () => {
    const added = addRelation(documents, "mira", { to: "ren", type: "rival" }, () => "rel-1");
    const updated = updateRelation(added, "mira", "rel-1", {
      tension: 4,
      label: "Bitter rivals"
    });

    expect(updated[0].meta?.relations).toEqual([
      { id: "rel-1", to: "ren", type: "rival", tension: 4, label: "Bitter rivals" }
    ]);
    expect(updated[1]).toBe(added[1]);
    expect(updated[2]).toBe(added[2]);
  });

  it("removes a relation and drops meta once it is empty", () => {
    const added = addRelation(documents, "mira", { to: "ren", type: "rival" }, () => "rel-1");
    const updated = updateRelation(added, "mira", "rel-1", { tension: 2 });
    const removed = removeRelation(updated, "mira", "rel-1");

    expect(removed[0].meta).toEqual({ kind: "character", aliases: ["Captain"] });
    expect("meta" in removed[0]).toBe(true);

    const stripped = removeRelation(documents, "old", "rel-0");
    expect("meta" in stripped[2]).toBe(false);
  });
});

describe("appearances", () => {
  const result = appearances(storyDocuments, chapters, folders);

  it("lists confirmed and detected scenes in story order", () => {
    expect(result.get("mira")?.scenes).toEqual([
      { sceneId: "s1", mode: "auto" },
      { sceneId: "s2", mode: "confirmed" },
      { sceneId: "s3", mode: "auto" },
      { sceneId: "s4", mode: "confirmed" }
    ]);
    expect(result.get("mira")).toMatchObject({
      sceneCount: 4,
      confirmedCount: 2,
      autoCount: 2,
      firstChapterId: "chapter-1",
      lastChapterId: "chapter-2",
      firstChapterIndex: 0,
      lastChapterIndex: 1
    });
  });

  it("matches aliases case-insensitively and prefers confirmation over detection", () => {
    expect(result.get("ren")?.scenes).toEqual([
      { sceneId: "s3", mode: "confirmed" },
      { sceneId: "s4", mode: "auto" },
      { sceneId: "s5", mode: "auto" }
    ]);
    expect(result.get("ren")).toMatchObject({
      sceneCount: 3,
      confirmedCount: 1,
      autoCount: 2,
      firstChapterId: "chapter-2",
      lastChapterId: "chapter-3",
      firstChapterIndex: 1,
      lastChapterIndex: 2
    });
  });

  it("keeps pages without appearances and skips trashed scenes and unknown ids", () => {
    expect(result.get("unused")).toMatchObject({
      scenes: [],
      sceneCount: 0,
      firstChapterId: null,
      lastChapterId: null,
      firstChapterIndex: -1,
      lastChapterIndex: -1
    });
    expect(result.get("ghost")).toBeUndefined();
    expect(result.get("mira")?.scenes.some((entry) => entry.sceneId === "s6")).toBe(false);
  });
});

describe("coAppearanceCounts and suggestRelations", () => {
  const storyAppearances = appearances(storyDocuments, chapters, folders);
  const suggestionDocuments = [
    page("a", { title: "Aria" }),
    page("b", { title: "Bran" }),
    scene("s1", "chapter-1", "Aria and Bran meet."),
    scene("s2", "chapter-2", "Aria waits for Bran."),
    scene("s3", "chapter-3", "Bran follows Aria.")
  ];
  const suggestionAppearances = appearances(suggestionDocuments, chapters, folders);

  it("counts the scenes each pair shares", () => {
    expect(coAppearanceCounts(storyAppearances)).toEqual([
      { a: "mira", b: "ren", key: "mira|ren", count: 2 }
    ]);
    expect(coAppearanceCounts(suggestionAppearances)).toEqual([
      { a: "a", b: "b", key: "a|b", count: 3 }
    ]);
  });

  it("suggests pairs above the threshold and hides dismissed ones", () => {
    expect(suggestRelations(storyAppearances, [], [])).toEqual([]);
    expect(suggestRelations(suggestionAppearances, [], [])).toEqual([
      { a: "a", b: "b", key: "a|b", count: 3 }
    ]);
    expect(suggestRelations(suggestionAppearances, [], ["a|b"])).toEqual([]);
  });

  it("does not suggest a pair that already has a relation in either direction", () => {
    expect(
      suggestRelations(suggestionAppearances, [{ source: "a", relation: relation("rel-1", "b") }], [])
    ).toEqual([]);
    expect(
      suggestRelations(suggestionAppearances, [{ source: "b", relation: relation("rel-2", "a") }], [])
    ).toEqual([]);
  });
});
