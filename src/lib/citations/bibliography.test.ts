import { describe, expect, it } from "vitest";
import { footnoteMarkerHtml } from "../footnotes";
import { compileBook } from "../publish/compile";
import { defaultPublishOptions, normalizePublishOptions } from "../publish/types";
import {
  bibliographyHeading,
  collectCitedSources,
  resolveBookCitations
} from "./bibliography";
import { citeMarkerHtml } from "./cite-marker";
import type { CslItem } from "./csl";

const LIBRARY: CslItem[] = [
  {
    id: "kahneman2011",
    type: "book",
    author: [{ family: "Kahneman", given: "Daniel" }],
    title: "Thinking, Fast and Slow",
    issued: { "date-parts": [[2011]] },
    publisher: "Farrar, Straus and Giroux"
  },
  {
    id: "shannon1948",
    type: "article-journal",
    author: [{ family: "Shannon", given: "Claude E." }],
    title: "A Mathematical Theory of Communication",
    "container-title": "Bell System Technical Journal",
    volume: "27",
    page: "379-423",
    issued: { "date-parts": [[1948]] }
  },
  {
    id: "popper1959",
    type: "book",
    author: [{ family: "Popper", given: "Karl" }],
    title: "The Logic of Scientific Discovery",
    issued: { "date-parts": [[1959]] },
    publisher: "Hutchinson"
  },
  {
    id: "unused2025",
    type: "book",
    author: [{ family: "Unused", given: "Author" }],
    title: "Never Cited",
    issued: { "date-parts": [[2025]] }
  }
];

function buildFixtureBook() {
  return compileBook({
    title: "Citation Fixture",
    author: "Test Author",
    subtitle: "",
    copyright: "",
    dedication: "",
    frontMatter: [],
    backMatter: [],
    chapters: [{ id: "ch-1", title: "Chapter 1", expanded: true }],
    documents: [
      {
        id: "doc-1",
        title: "Opening",
        chapterId: "ch-1",
        content: `<p>First claim ${citeMarkerHtml([{ id: "shannon1948", locator: "380", label: "page" }])}${footnoteMarkerHtml("fn-1")} and second claim ${citeMarkerHtml([{ id: "kahneman2011" }])}.</p>`,
        footnotes: [
          {
            id: "fn-1",
            html: `See ${citeMarkerHtml([{ id: "popper1959", locator: "42", label: "page" }])}.`
          }
        ]
      }
    ],
    citations: LIBRARY
  });
}

describe("bibliography resolution", () => {
  it("returns localized bibliography headings", () => {
    expect(bibliographyHeading("en")).toBe("Bibliography");
    expect(bibliographyHeading("de")).toBe("Literaturverzeichnis");
  });

  it("collects cited sources in compile order across body and footnotes", () => {
    const book = buildFixtureBook();
    const collected = collectCitedSources(book.chapters, LIBRARY);
    // Shannon appears first in body, followed by footnote fn-1 (Popper), then Kahneman in body.
    expect(collected.map((item) => item.id)).toEqual(["shannon1948", "popper1959", "kahneman2011"]);
  });

  it("populates CompiledBook.bibliography during compileBook when citations exist", () => {
    const book = buildFixtureBook();
    expect(book.bibliography).toBeDefined();
    expect(book.bibliography?.heading).toBe("Bibliography");
    expect(book.bibliography?.entries.map((entry) => entry.id)).toEqual([
      "kahneman2011",
      "popper1959",
      "shannon1948"
    ]);
  });

  it("resolves APA 7 in-text citations and alphabetically sorted bibliography", () => {
    const resolved = resolveBookCitations(buildFixtureBook(), {
      citationStyle: "apa7",
      citationLocale: "en",
      includeBibliography: true
    });

    const scene = resolved.book.chapters[0].scenes[0];
    expect(scene.html).toContain("(Shannon, 1948, p. 380)");
    expect(scene.html).toContain("(Kahneman, 2011)");
    expect(scene.footnotes?.[0].html).toBe("See (Popper, 1959, p. 42).");
    expect(resolved.bibliography?.entries.map((entry) => entry.id)).toEqual([
      "kahneman2011",
      "popper1959",
      "shannon1948"
    ]);
  });

  it("numbers IEEE citations by first appearance in compile order", () => {
    const resolved = resolveBookCitations(buildFixtureBook(), {
      citationStyle: "ieee",
      citationLocale: "en",
      includeBibliography: true
    });

    const scene = resolved.book.chapters[0].scenes[0];
    expect(scene.html).toContain("[1, p. 380]");
    expect(scene.footnotes?.[0].html).toBe("See [2, p. 42].");
    expect(scene.html).toContain("[3]");
    expect(resolved.bibliography?.entries.map((entry) => entry.id)).toEqual([
      "shannon1948",
      "popper1959",
      "kahneman2011"
    ]);
    expect(resolved.bibliography?.entries[0].text.startsWith("[1] ")).toBe(true);
    expect(resolved.bibliography?.entries[1].text.startsWith("[2] ")).toBe(true);
    expect(resolved.bibliography?.entries[2].text.startsWith("[3] ")).toBe(true);
  });

  it("converts body citations into automatic footnotes in reading order for note styles", () => {
    const resolved = resolveBookCitations(buildFixtureBook(), {
      citationStyle: "chicago-notes",
      citationLocale: "en",
      includeBibliography: true
    });

    const scene = resolved.book.chapters[0].scenes[0];
    expect(scene.html).not.toContain("cite-ref");
    expect(scene.footnotes).toHaveLength(3);
    expect(scene.footnotes?.[0].html).toContain("Claude E. Shannon");
    expect(scene.footnotes?.[0].html).toContain("380");
    expect(scene.footnotes?.[1].html).toContain("See Karl Popper");
    expect(scene.footnotes?.[2].html).toContain("Daniel Kahneman");
    expect(scene.footnotes?.map((fn) => fn.number)).toEqual([1, 2, 3]);
  });

  it("respects includeBibliography: false while still resolving in-text labels", () => {
    const resolved = resolveBookCitations(buildFixtureBook(), {
      citationStyle: "apa7",
      citationLocale: "de",
      includeBibliography: false
    });

    expect(resolved.bibliography).toBeNull();
    expect(resolved.book.chapters[0].scenes[0].html).toContain("(Shannon, 1948, S. 380)");
  });

  it("normalizes includeBibliography with default true", () => {
    expect(defaultPublishOptions().includeBibliography).toBe(true);
    expect(normalizePublishOptions({}).includeBibliography).toBe(true);
    expect(normalizePublishOptions({ includeBibliography: false }).includeBibliography).toBe(false);
    expect(normalizePublishOptions({ includeBibliography: "no" }).includeBibliography).toBe(true);
  });
});
