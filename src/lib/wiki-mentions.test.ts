import { describe, expect, it } from "vitest";
import { createWikiMentionMatcher } from "./wiki-mentions";

describe("createWikiMentionMatcher", () => {
  const articles = [
    { title: "Mira Vale" },
    { title: "Mira" },
    { title: "The Clockmaker's Key" }
  ];

  it("matches titles case-insensitively at word boundaries", () => {
    const matches = createWikiMentionMatcher(articles)("MIRA VALE met Miranda near Mira.");

    expect(matches.map(({ from, to, article }) => ({
      text: "MIRA VALE met Miranda near Mira.".slice(from, to),
      title: article.title
    }))).toEqual([
      { text: "MIRA VALE", title: "Mira Vale" },
      { text: "Mira", title: "Mira" }
    ]);
  });

  it("prefers the longest matching title and supports punctuation", () => {
    const matches = createWikiMentionMatcher(articles)(
      "She found the clockmaker's key; Mira followed."
    );

    expect(matches.map(({ article }) => article.title)).toEqual([
      "The Clockmaker's Key",
      "Mira"
    ]);
  });

  it("does not match empty article titles", () => {
    expect(createWikiMentionMatcher([{ title: " " }])("anything")).toEqual([]);
  });
});
