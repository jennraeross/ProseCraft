import { describe, expect, it } from "vitest";
import { defaultPublishOptions, normalizePublishOptions, type DocumentData } from "$lib/publish/types";
import { citeMarkerHtml } from "./cite-marker";
import type { CslItem } from "./csl";
import {
  countSourceCitations,
  formatAuthorList,
  generateCitationKey,
  matchesLibraryQuery,
  mergeImportedCitations,
  parseAuthorList
} from "./library";

describe("citation library helpers", () => {
  it("generates readable keys like mueller2020 and avoids collisions", () => {
    const existing: CslItem[] = [
      { id: "mueller2020", type: "book", title: "Existing" }
    ];

    expect(
      generateCitationKey(
        {
          author: [{ family: "Müller", given: "Hans" }],
          year: "2020"
        },
        []
      )
    ).toBe("mueller2020");

    expect(
      generateCitationKey(
        {
          author: [{ family: "Müller", given: "Hans" }],
          year: "2020"
        },
        existing
      )
    ).toBe("mueller2020-2");
  });

  it("parses and formats author lists round-trip", () => {
    const parsed = parseAuthorList("Müller, Hans; Anna Schmidt");
    expect(parsed).toEqual([
      { family: "Müller", given: "Hans" },
      { family: "Schmidt", given: "Anna" }
    ]);
    expect(formatAuthorList(parsed)).toBe("Müller, Hans; Schmidt, Anna");
  });

  it("merges imported citations and renames colliding IDs with warnings", () => {
    const existing: CslItem[] = [{ id: "popper1959", type: "book", title: "Existing" }];
    const imported: CslItem[] = [
      { id: "popper1959", type: "book", title: "Imported Duplicate" },
      { id: "shannon1948", type: "article-journal", title: "Communication" }
    ];
    const merged = mergeImportedCitations(existing, imported);
    expect(merged.addedCount).toBe(2);
    expect(merged.items.map((item) => item.id)).toEqual(["popper1959", "popper1959-2", "shannon1948"]);
    expect(merged.warnings).toHaveLength(1);
    expect(merged.warnings[0]).toContain("popper1959-2");
  });

  it("counts citations across body HTML and footnote HTML using citationIdsInHtml", () => {
    const docs: DocumentData[] = [
      {
        id: "doc-1",
        title: "One",
        content: `<p>Text ${citeMarkerHtml([{ id: "mueller2020" }])}</p>`
      },
      {
        id: "doc-2",
        title: "Two",
        content: "<p>Body</p>",
        footnotes: [
          {
            id: "fn-1",
            html: `See ${citeMarkerHtml([{ id: "mueller2020", locator: "12" }])}`
          }
        ]
      },
      {
        id: "doc-3",
        title: "Three",
        content: `<p>Other ${citeMarkerHtml([{ id: "other2021" }])}</p>`
      }
    ];

    const result = countSourceCitations({ id: "mueller2020" }, docs);
    expect(result.documentCount).toBe(2);
    expect(result.docIds).toEqual(["doc-1", "doc-2"]);
  });

  it("filters items by title, author, year, and type", () => {
    const item: CslItem = {
      id: "ostergaard-2019",
      type: "chapter",
      author: [{ family: "Ostergaard", given: "Soren" }],
      title: "Nordic Archival Practices",
      issued: { "date-parts": [[2019]] }
    };
    expect(matchesLibraryQuery(item, "nordic")).toBe(true);
    expect(matchesLibraryQuery(item, "ostergaard")).toBe(true);
    expect(matchesLibraryQuery(item, "2019")).toBe(true);
    expect(matchesLibraryQuery(item, "chapter")).toBe(true);
    expect(matchesLibraryQuery(item, "quantum")).toBe(false);
  });

  it("normalizes PublishOptions citationStyle and citationLocale with safe defaults", () => {
    const defaults = defaultPublishOptions();
    expect(defaults.citationStyle).toBe("apa7");
    expect(defaults.citationLocale).toBe("en");

    expect(
      normalizePublishOptions({ citationStyle: "din1505", citationLocale: "de" })
    ).toMatchObject({
      citationStyle: "din1505",
      citationLocale: "de"
    });

    expect(
      normalizePublishOptions({ citationStyle: "unknown-style", citationLocale: "fr" })
    ).toMatchObject({
      citationStyle: "apa7",
      citationLocale: "en"
    });
  });
});
