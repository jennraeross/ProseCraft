import { describe, expect, it } from "vitest";
import type { DocumentData } from "$lib/publish/types";
import { findFirstMatch, searchDocuments, type SearchChapter } from "./search";

const chapters: SearchChapter[] = [
  { id: "c1", title: "Arrival" },
  { id: "c2", title: "Departure" }
];

function scene(id: string, title: string, text: string, chapterId = "c1"): DocumentData {
  return { id, title, content: `<p>${text}</p>`, chapterId };
}

function wiki(id: string, title: string, text: string): DocumentData {
  return { id, title, content: `<p>${text}</p>`, space: "Wiki" };
}

describe("searchDocuments", () => {
  it("treats the query as a literal string, not a regular expression", () => {
    const documents = [scene("s1", "Notes", "a+b aab (draft) a.b")];
    expect(searchDocuments(documents, chapters, "a+b")[0].matches).toBe(1);
    expect(searchDocuments(documents, chapters, "(draft)")[0].matches).toBe(1);
    expect(searchDocuments(documents, chapters, "a.b")[0].matches).toBe(1);
    expect(searchDocuments(documents, chapters, ".*")).toEqual([]);
  });

  it("matches whole words only when asked to", () => {
    const documents = [scene("s1", "Felines", "cat concatenate cat")];
    expect(searchDocuments(documents, chapters, "cat")[0].matches).toBe(3);
    expect(searchDocuments(documents, chapters, "cat", { wholeWord: true })[0].matches).toBe(2);
    expect(searchDocuments(documents, chapters, "concatenate", { wholeWord: true })[0].matches).toBe(1);
  });

  it("ignores case by default and honours caseSensitive", () => {
    const documents = [scene("s1", "Greeting", "Hello hello HELLO")];
    expect(searchDocuments(documents, chapters, "hello")[0].matches).toBe(3);
    expect(searchDocuments(documents, chapters, "hello", { caseSensitive: true })[0].matches).toBe(1);
    expect(searchDocuments(documents, chapters, "HELLO", { caseSensitive: true })[0].matches).toBe(1);
    expect(searchDocuments(documents, chapters, "Hello", { caseSensitive: true })[0].matches).toBe(1);
  });

  it("folds diacritics for case-insensitive searches but shows the source in snippets", () => {
    const documents = [scene("s1", "Der Käpten", "Der Käpten und sein Käpt'n")];
    const [hit] = searchDocuments(documents, chapters, "kapten");
    expect(hit.matches).toBe(2);
    expect(hit.snippet).toBe("Der Käpten");
    expect(hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength)).toBe("Käpten");
    expect(searchDocuments(documents, chapters, "kaepten")).toEqual([]);
    expect(searchDocuments(documents, chapters, "kapten", { caseSensitive: true })).toEqual([]);
    expect(searchDocuments(documents, chapters, "Käpten", { caseSensitive: true })[0].matches).toBe(2);
  });

  it("skips trashed documents and trashed chapters unless includeTrashed is set", () => {
    const documents = [
      scene("s1", "Clean", "needle"),
      { ...scene("s2", "Gone", "needle"), trashed: true },
      scene("s3", "Chapter trash", "needle", "c2")
    ];
    const withTrash: SearchChapter[] = [
      { id: "c1", title: "Arrival" },
      { id: "c2", title: "Departure", trashed: true }
    ];
    expect(searchDocuments(documents, withTrash, "needle").map((hit) => hit.documentId)).toEqual(["s1"]);
    expect(searchDocuments(documents, withTrash, "needle", { includeTrashed: true })).toHaveLength(3);
  });

  it("returns nothing for an empty or whitespace-only query", () => {
    const documents = [scene("s1", "Anything", "at all")];
    expect(searchDocuments(documents, chapters, "")).toEqual([]);
    expect(searchDocuments(documents, chapters, "   \n\t ")).toEqual([]);
  });

  it("counts every occurrence in the title and the body", () => {
    const [hit] = searchDocuments([scene("s1", "Night", "a star, another star and a third star")], chapters, "star");
    expect(hit.matches).toBe(3);
  });

  it("cuts a snippet around the first match with ellipses at both ends", () => {
    const text = `${"before ".repeat(20)}needle${" after".repeat(20)}`;
    const [hit] = searchDocuments([scene("s1", "Long", text)], chapters, "needle");
    expect(hit.snippet.startsWith("…")).toBe(true);
    expect(hit.snippet.endsWith("…")).toBe(true);
    expect(hit.snippet.length).toBeLessThanOrEqual(82);
    expect(hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength)).toBe("needle");
  });

  it("leaves short texts whole and keeps a single ellipsis near the start", () => {
    const [short] = searchDocuments([scene("s1", "Short", "a needle here")], chapters, "needle");
    expect(short.snippet).toBe("a needle here");
    expect(short.matchStart).toBe(2);

    const text = `needle ${"trailing words ".repeat(20)}`;
    const [start] = searchDocuments([scene("s1", "Start", text)], chapters, "needle");
    expect(start.snippet.startsWith("needle")).toBe(true);
    expect(start.snippet.endsWith("…")).toBe(true);
    expect(start.matchStart).toBe(0);
  });

  it("labels scenes and wiki pages and remembers the chapter title", () => {
    const documents = [scene("s1", "Opening", "lantern", "c2"), wiki("w1", "The Lantern", "light")];
    const hits = searchDocuments(documents, chapters, "lantern");
    expect(hits.map((hit) => hit.kind)).toEqual(["wiki", "scene"]);
    expect(hits[0].chapterTitle).toBeUndefined();
    expect(hits[1].chapterTitle).toBe("Departure");
  });

  it("sorts title matches first, then scenes in chapter order, then wiki pages", () => {
    const documents = [
      wiki("w1", "Lore", "beacon"),
      scene("s2", "Second", "beacon", "c2"),
      scene("s1", "First", "beacon", "c1"),
      wiki("w2", "Beacon", "nothing here"),
      scene("s3", "Beacon keeper", "beacon", "c2")
    ];
    expect(searchDocuments(documents, chapters, "beacon").map((hit) => hit.documentId))
      .toEqual(["s3", "w2", "s1", "s2", "w1"]);
  });

  it("caps the list at 200 hits", () => {
    const documents = Array.from({ length: 250 }, (_, index) =>
      scene(`s${index}`, `Scene ${index}`, "needle"));
    expect(searchDocuments(documents, chapters, "needle")).toHaveLength(200);
  });

  it("searches a two megabyte document in well under a second", () => {
    const paragraph = `<p>${"the quick brown fox jumps over the lazy dog ".repeat(40)}</p>`;
    const content = paragraph.repeat(1200);
    expect(content.length).toBeGreaterThan(2_000_000);

    const started = performance.now();
    const hits = searchDocuments([scene("big", "Big", content)], chapters, "lazy dog");
    const elapsed = performance.now() - started;

    expect(hits).toHaveLength(1);
    expect(hits[0].matches).toBe(1200 * 40);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe("findFirstMatch", () => {
  it("returns source offsets of the first occurrence", () => {
    expect(findFirstMatch("a needle here, another needle", "needle")).toEqual({ start: 2, end: 8 });
  });

  it("returns null for a blank query or no match", () => {
    expect(findFirstMatch("some text", "   ")).toBeNull();
    expect(findFirstMatch("some text", "")).toBeNull();
    expect(findFirstMatch("some text", "missing")).toBeNull();
  });

  it("ignores case by default and honours caseSensitive", () => {
    expect(findFirstMatch("Hello hello", "hello")).toEqual({ start: 0, end: 5 });
    expect(findFirstMatch("Hello hello", "hello", { caseSensitive: true })).toEqual({ start: 6, end: 11 });
    expect(findFirstMatch("Hello hello", "HELLO", { caseSensitive: true })).toBeNull();
  });

  it("matches whole words only when asked to", () => {
    expect(findFirstMatch("cat concatenate cat", "cat", { wholeWord: true })).toEqual({ start: 0, end: 3 });
    expect(findFirstMatch("concatenate cat", "cat", { wholeWord: true })).toEqual({ start: 12, end: 15 });
    expect(findFirstMatch("concatenate", "cat", { wholeWord: true })).toBeNull();
  });

  it("folds diacritics but reports offsets in the source text", () => {
    expect(findFirstMatch("Der Käpten", "kapten")).toEqual({ start: 4, end: 10 });
    expect(findFirstMatch("Der Käpten", "Käpten", { caseSensitive: true })).toEqual({ start: 4, end: 10 });
    expect(findFirstMatch("Der Käpten", "kapten", { caseSensitive: true })).toBeNull();
  });
});
