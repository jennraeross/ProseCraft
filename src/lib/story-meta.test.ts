import { describe, expect, it } from "vitest";
import { normalizeMeta, type Relation } from "./story-meta";

function relation(overrides: Record<string, unknown> = {}): Relation {
  return { id: "relation-1", to: "doc-2", type: "friend", ...overrides } as Relation;
}

describe("normalizeMeta", () => {
  it("returns undefined for values that are not a plain object", () => {
    expect(normalizeMeta(undefined)).toBeUndefined();
    expect(normalizeMeta(null)).toBeUndefined();
    expect(normalizeMeta("character")).toBeUndefined();
    expect(normalizeMeta(["character"])).toBeUndefined();
    expect(normalizeMeta({})).toBeUndefined();
  });

  it("keeps valid fields and trims text", () => {
    expect(
      normalizeMeta({
        kind: "character",
        aliases: [" Mara Voss ", "The Captain", 7, ""],
        characters: ["doc-2"],
        place: " Bridge ",
        storyDate: " 2189-04-12 ",
        tags: ["crew", "noir"],
        sheet: { secret: "Mutineer", empty: "" },
        relations: [relation({ tension: 4, from: "chapter-1", note: "Uneasy allies" })]
      })
    ).toEqual({
      kind: "character",
      aliases: ["Mara Voss", "The Captain"],
      characters: ["doc-2"],
      place: "Bridge",
      storyDate: "2189-04-12",
      tags: ["crew", "noir"],
      sheet: { secret: "Mutineer", empty: "" },
      relations: [
        { id: "relation-1", to: "doc-2", type: "friend", tension: 4, from: "chapter-1", note: "Uneasy allies" }
      ]
    });
  });

  it("drops unknown page kinds, empty lists and empty strings", () => {
    expect(normalizeMeta({ kind: "villain", aliases: [], place: "   ", tags: ["ok", 3] }))
      .toEqual({ tags: ["ok"] });
  });

  it("drops invalid relations and keeps the valid ones", () => {
    const meta = normalizeMeta({
      relations: [
        relation(),
        relation({ id: "" }),
        relation({ to: "   " }),
        relation({ type: "enemy" }),
        { id: "relation-2", type: "rival" },
        relation({ id: "relation-3", type: "rival" })
      ]
    });

    expect(meta?.relations).toEqual([relation(), relation({ id: "relation-3", type: "rival" })]);
  });

  it("clamps tension into the 1-5 range and drops invalid values", () => {
    const tensions = normalizeMeta({
      relations: [
        relation({ id: "low", tension: 0 }),
        relation({ id: "high", tension: 42 }),
        relation({ id: "rounded", tension: 3.4 }),
        relation({ id: "text", tension: "3" })
      ]
    })?.relations;

    expect(tensions?.map((entry) => entry.tension)).toEqual([1, 5, 3, undefined]);
  });

  it("caps relation, alias and character lists", () => {
    const meta = normalizeMeta({
      aliases: Array.from({ length: 25 }, (_, index) => `Alias ${index}`),
      characters: Array.from({ length: 250 }, (_, index) => `doc-${index}`),
      relations: Array.from({ length: 250 }, (_, index) => relation({ id: `relation-${index}` }))
    });

    expect(meta?.aliases).toHaveLength(20);
    expect(meta?.characters).toHaveLength(200);
    expect(meta?.relations).toHaveLength(200);
    expect(meta?.relations?.at(-1)?.id).toBe("relation-199");
  });

  it("keeps a sheet template id and drops empty or invalid ones", () => {
    expect(normalizeMeta({ sheetTemplate: " thriller " })).toEqual({ sheetTemplate: "thriller" });
    expect(normalizeMeta({ sheetTemplate: "" })).toBeUndefined();
    expect(normalizeMeta({ sheetTemplate: 7 })).toBeUndefined();
  });

  it("preserves unknown keys that survive JSON", () => {
    expect(normalizeMeta({ kind: "place", mood: "bleak", nested: { tags: [1, true, null] } })).toEqual({
      kind: "place",
      mood: "bleak",
      nested: { tags: [1, true, null] }
    });
  });

  it("drops unknown values that cannot be serialised to JSON", () => {
    const meta = normalizeMeta({
      kind: "place",
      callback: () => "nope",
      missing: undefined,
      count: BigInt(1)
    });

    expect(meta).toEqual({ kind: "place" });
    expect(normalizeMeta({ callback: () => "nope" })).toBeUndefined();
  });
});
