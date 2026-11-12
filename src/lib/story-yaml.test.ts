import { describe, expect, it } from "vitest";
import type { DocumentMeta } from "./story-meta";
import { parseStoryMeta, serializeStoryMeta } from "./story-yaml";

describe("serializeStoryMeta", () => {
  it("writes one key per line and omits undefined values", () => {
    const text = serializeStoryMeta({
      storyDate: "Day 14, Year 412",
      place: "place-archive",
      tags: ["archive", "night"]
    });
    expect(text).toBe(
      'storyDate: "Day 14, Year 412"\nplace: "place-archive"\ntags: ["archive","night"]'
    );
  });

  it("round trips characters, relations, sheet and unknown keys", () => {
    const meta: DocumentMeta = {
      kind: "character",
      characters: ["page-aria", "page-bram"],
      storyDate: "Day 14",
      tags: ["archive", "night"],
      sheet: { goal: "Find the ledger", age: "34" },
      relations: [
        {
          id: "rel-1",
          to: "page-bram",
          type: "rival",
          label: "old colleagues",
          tension: 4,
          from: "chapter-1",
          until: "chapter-3",
          note: "Trusts him with the truth"
        }
      ],
      moodBoard: { palette: ["ink", "amber"], pinned: true }
    };

    const result = parseStoryMeta(serializeStoryMeta(meta));
    expect(result).toEqual({ ok: true, meta });
  });

  it("quotes strings that would otherwise change meaning", () => {
    const meta: DocumentMeta = {
      storyDate: 'Day "14": dawn',
      tags: ["a: b", "[not a list]", "# not a comment"],
      place: "line one\nline two"
    };

    const text = serializeStoryMeta(meta);
    expect(text.split("\n")).toHaveLength(3);
    expect(parseStoryMeta(text)).toEqual({ ok: true, meta });
  });
});

describe("parseStoryMeta", () => {
  it("accepts comments and bare strings", () => {
    const result = parseStoryMeta('# scene data\nstoryDate: Day 14\nplace: The archive');
    expect(result).toEqual({
      ok: true,
      meta: { storyDate: "Day 14", place: "The archive" }
    });
  });

  it("returns an empty meta for empty input", () => {
    expect(parseStoryMeta("  \n\n")).toEqual({ ok: true, meta: undefined });
  });

  it("reports a line without a colon and leaves the meta untouched", () => {
    expect(parseStoryMeta("storyDate: Day 14\nnot a field")).toEqual({
      ok: false,
      error: 'Line 2: expected "key: value".'
    });
  });

  it("reports invalid keys", () => {
    expect(parseStoryMeta("story date: Day 14")).toEqual({
      ok: false,
      error: 'Line 1: "story date" is not a valid key.'
    });
  });

  it("reports missing values", () => {
    expect(parseStoryMeta("tags:")).toEqual({
      ok: false,
      error: "Line 1: missing value. Use [] for an empty list."
    });
  });

  it("reports malformed JSON values", () => {
    expect(parseStoryMeta('tags: ["archive",]')).toEqual({
      ok: false,
      error: "Line 1: invalid value. Use JSON for lists and objects."
    });
  });
});
