import { describe, expect, it } from "vitest";
import type { DocumentData } from "$lib/publish/types";
import { replaceInDocuments } from "./replace";
import { searchDocuments, type SearchChapter } from "./search";

const chapters: SearchChapter[] = [{ id: "c1", title: "Arrival" }];

function scene(id: string, title: string, content: string, chapterId = "c1"): DocumentData {
  return { id, title, content, chapterId };
}

function wiki(id: string, title: string, content: string): DocumentData {
  return { id, title, content, space: "Wiki" };
}

/** Rendered text, so assertions do not depend on how jsdom serializes entities. */
function textOf(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

describe("replaceInDocuments", () => {
  it("treats the query as a literal string, not a regular expression", () => {
    const documents = [scene("s1", "Notes", "<p>a+b aab (draft) a.b</p>")];
    expect(replaceInDocuments(documents, "a+b", "plus").documents[0].content)
      .toBe("<p>plus aab (draft) a.b</p>");
    expect(replaceInDocuments(documents, "(draft)", "note").total).toBe(1);
    expect(replaceInDocuments(documents, ".*", "x").total).toBe(0);
  });

  it("replaces plain text in every matching text node", () => {
    const documents = [scene("s1", "Night", "<h1>Star</h1><p>a star and another star</p>")];
    const result = replaceInDocuments(documents, "star", "sun");
    expect(result.documents[0].content).toBe("<h1>sun</h1><p>a sun and another sun</p>");
    expect(result.changed).toEqual([{ id: "s1", count: 3 }]);
    expect(result.total).toBe(3);
  });

  it("leaves tags and attribute values alone", () => {
    const documents = [scene("s1", "Link", `<p data-source="x">Meet <a href="x" title="x">x</a> here</p>`)];
    const result = replaceInDocuments(documents, "x", "y");
    expect(result.documents[0].content)
      .toBe(`<p data-source="x">Meet <a href="x" title="x">y</a> here</p>`);
    expect(result.total).toBe(1);
  });

  it("keeps formatting markup and only swaps the text", () => {
    const documents = [scene("s1", "Marks", "<p><strong>cat</strong> and <em>cat</em></p>")];
    expect(replaceInDocuments(documents, "cat", "dog").documents[0].content)
      .toBe("<p><strong>dog</strong> and <em>dog</em></p>");
  });

  it("treats entities as the characters they stand for", () => {
    const documents = [scene("s1", "Duo", "<p>Tom &amp; Jerry &amp; Tom</p>")];
    const result = replaceInDocuments(documents, "Tom", "Sam");
    expect(textOf(result.documents[0].content)).toBe("Sam & Jerry & Sam");
    expect(result.documents[0].content).toBe("<p>Sam &amp; Jerry &amp; Sam</p>");
    expect(result.total).toBe(2);
  });

  it("does not match inside entity source text or markup", () => {
    const documents = [scene("s1", "Duo", `<p>Tom &amp; Jerry</p>`)];
    const result = replaceInDocuments(documents, "amp", "AMP");
    expect(result.changed).toEqual([]);
    expect(result.documents[0]).toBe(documents[0]);
  });

  it("counts several matches inside one text node", () => {
    const result = replaceInDocuments([scene("s1", "Reprise", "<p>star, star, star</p>")], "star", "sun");
    expect(result.documents[0].content).toBe("<p>sun, sun, sun</p>");
    expect(result.changed).toEqual([{ id: "s1", count: 3 }]);
  });

  it("ignores case by default and honours caseSensitive", () => {
    const documents = [scene("s1", "Cats", "<p>cat bobcat CAT</p>")];
    expect(replaceInDocuments(documents, "cat", "dog").documents[0].content)
      .toBe("<p>dog bobdog dog</p>");
    expect(replaceInDocuments(documents, "cat", "dog", { caseSensitive: true }).documents[0].content)
      .toBe("<p>dog bobdog CAT</p>");
    expect(replaceInDocuments(documents, "cat", "dog", { caseSensitive: true, wholeWord: true }).total).toBe(1);
  });

  it("matches whole words only when asked to", () => {
    const documents = [scene("s1", "Cats", "<p>a cat, a bobcat and cat</p>")];
    expect(replaceInDocuments(documents, "cat", "dog").total).toBe(3);
    const result = replaceInDocuments(documents, "cat", "dog", { wholeWord: true });
    expect(result.documents[0].content).toBe("<p>a dog, a bobcat and dog</p>");
    expect(result.total).toBe(2);
  });

  it("folds diacritics when the search ignores case", () => {
    const documents = [scene("s1", "Der Käpten", "<p>Der Käpten ruft</p>")];
    const result = replaceInDocuments(documents, "kapten", "Captain");
    expect(result.documents[0].content).toBe("<p>Der Captain ruft</p>");
    expect(result.total).toBe(1);
    expect(replaceInDocuments(documents, "kapten", "Captain", { caseSensitive: true }).total).toBe(0);
    expect(replaceInDocuments(documents, "Käpten", "Captain", { caseSensitive: true }).total).toBe(1);
  });

  it("treats the replacement as literal text, not as a replacement pattern", () => {
    const documents = [scene("s1", "Dollar", "<p>x marks the spot</p>")];
    expect(textOf(replaceInDocuments(documents, "x", "$& $1 $$").documents[0].content))
      .toBe("$& $1 $$ marks the spot");
  });

  it("escapes the replacement text so it cannot break the markup", () => {
    const result = replaceInDocuments([scene("s1", "Less", "<p>star chart</p>")], "star", "a < b");
    expect(result.documents[0].content).toBe("<p>a &lt; b chart</p>");
    expect(textOf(result.documents[0].content)).toBe("a < b chart");
  });

  it("only touches the documents listed in onlyIds", () => {
    const documents = [
      scene("s1", "One", "<p>needle</p>"),
      scene("s2", "Two", "<p>needle</p>")
    ];
    const result = replaceInDocuments(documents, "needle", "thread", {}, new Set(["s2"]));
    expect(result.changed).toEqual([{ id: "s2", count: 1 }]);
    expect(result.documents[0]).toBe(documents[0]);
    expect(result.documents[1].content).toBe("<p>thread</p>");
    expect(result.total).toBe(1);
  });

  it("skips trashed documents unless includeTrashed is set", () => {
    const documents = [
      scene("s1", "Clean", "<p>needle</p>"),
      { ...scene("s2", "Gone", "<p>needle</p>"), trashed: true }
    ];
    expect(replaceInDocuments(documents, "needle", "thread").changed).toEqual([{ id: "s1", count: 1 }]);
    expect(replaceInDocuments(documents, "needle", "thread", { includeTrashed: true }).total).toBe(2);
  });

  it("ignores documents that are neither scenes nor wiki pages", () => {
    const documents: DocumentData[] = [{ id: "r1", title: "Note", content: "<p>needle</p>" }];
    const result = replaceInDocuments(documents, "needle", "thread");
    expect(result.changed).toEqual([]);
    expect(result.documents[0]).toBe(documents[0]);
  });

  it("leaves everything as it was when nothing matches", () => {
    const documents = [
      scene("s1", "Duo", "<p>Tom &amp; Jerry</p>"),
      wiki("w1", "Lore", "<p>nothing here</p>")
    ];
    const result = replaceInDocuments(documents, "needle", "thread");
    expect(result.documents).toEqual(documents);
    expect(result.documents).toHaveLength(2);
    result.documents.forEach((document, index) => expect(document).toBe(documents[index]));
    expect(result.changed).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns nothing for an empty or whitespace-only query", () => {
    const documents = [scene("s1", "Anything", "<p>at all</p>")];
    expect(replaceInDocuments(documents, "", "x").total).toBe(0);
    expect(replaceInDocuments(documents, "  \n\t ", "x").changed).toEqual([]);
  });

  it("does not mutate the input documents", () => {
    const documents = [scene("s1", "Night", "<p>a star</p>")];
    const before = structuredClone(documents);
    replaceInDocuments(documents, "star", "sun");
    expect(documents).toEqual(before);
  });

  it("replaces in titles only when includeTitles is set", () => {
    const documents = [{ ...scene("s1", "Star", "<p>night</p>"), markdownSource: "night\n" }];
    expect(replaceInDocuments(documents, "star", "sun").changed).toEqual([]);

    const result = replaceInDocuments(documents, "star", "sun", { includeTitles: true });
    expect(result.documents[0].title).toBe("sun");
    expect(result.documents[0].content).toBe("<p>night</p>");
    expect(result.total).toBe(1);
  });

  it("drops the Markdown mirror on body edits but keeps it for title-only edits", () => {
    const body = { ...scene("s1", "Night", "<p>a star</p>"), markdownSource: "a star\n" };
    const edited = replaceInDocuments([body], "star", "sun").documents[0];
    expect(edited.content).toBe("<p>a sun</p>");
    expect("markdownSource" in edited).toBe(false);

    const titled = { ...body, title: "Star", content: "<p>a moon</p>", markdownSource: "a moon\n" };
    const titleOnly = replaceInDocuments([titled], "star", "sun", { includeTitles: true });
    expect(titleOnly.documents[0].markdownSource).toBe("a moon\n");
    expect(titleOnly.documents[0].content).toBe("<p>a moon</p>");
  });

  it("counts the same matches as the search", () => {
    const documents = [
      scene("s1", "Night", "<p>a star, another star and a third star</p>"),
      wiki("w1", "Lore", "<p><em>star</em> lore</p>")
    ];
    const expected = searchDocuments(documents, chapters, "star")
      .reduce((sum, hit) => sum + hit.matches, 0);
    expect(replaceInDocuments(documents, "star", "sun").total).toBe(expected);
  });
});
