import { describe, expect, it } from "vitest";
import {
  MAX_CITATION_ITEMS,
  MAX_CITATION_TITLE_LENGTH,
  normalizeCslItems,
  normalizeCslItemsDetailed
} from "./csl";
import { importCitations } from "./import";

const ZOTERO_BIBTEX_FIXTURE = String.raw`
@comment{Exported from Zotero Better BibTeX}
@string{suhrkamp = "Suhrkamp " # {Verlag}}
@string{jhi = {Journal of Historical } # "Informatics"}

@book{habermas1962,
  title = {{Strukturwandel der {\"O}ffentlichkeit}: Untersuchungen zu einer Kategorie der b{\"u}rgerlichen Gesellschaft},
  author = {Habermas, J{\"u}rgen},
  year = {1962},
  month = oct,
  publisher = suhrkamp,
  address = {Frankfurt am Main},
  isbn = {978-3-518-28491-9},
  edition = {1},
  language = {de}
}

@article{muller2021,
  title = {Digitalisierung und {Quellenkritik} in der {Geschichtswissenschaft}},
  author = {M\"{u}ller, Hans-Peter and {\v{C}}ern{\'y}, Tom{\'a}{\v{s}} and Fran{\c{c}}ois Lef{\`e}vre},
  journal = jhi,
  year = 2021,
  month = mar,
  volume = {14},
  number = {2},
  pages = {112--138},
  doi = {10.1234/jhi.2021.14.2.112},
  url = {https://example.org/~muller/digital_sources},
  abstract = {Eine Analyse zu Gro{\ss}projekten und {\"U}berlieferungsgeschichte.}
}

@incollection{ostergaard2019,
  title = {Nordic Archival Practices},
  author = {{\O}stergaard, S{\o}ren},
  editor = {Lindqvist, Astrid and {Deutsche Forschungsgemeinschaft}},
  booktitle = {European Archives in Transition},
  date = {2019-11-04},
  publisher = "Campus" # " Verlag",
  location = {Berlin},
  pages = {45--79},
  isbn = {978-3-593-51000-2}
}

@inproceedings{garcia2020,
  title = {Automatic Collations of {Medieval} Manuscripts},
  author = {Garc{\'{\i}}a, Jos{\'e} Mar{\'{\i}}a and Ludwig van Beethoven},
  booktitle = {Proceedings of the Digital Humanities Conference},
  year = {2020},
  month = {July},
  pages = {210--225},
  address = {Utrecht}
}

@phdthesis{schroeder2018,
  title = {Sp{\"a}tmittelalterliche Briefkultur am Oberrhein},
  author = {Schr{\"o}der, Katharina},
  school = {Universit{\"a}t Freiburg},
  year = {2018},
  address = {Freiburg im Breisgau}
}

@online{bundesarchiv2024,
  title = {Digitales Archivportal --- Handreichung},
  author = {{Bundesarchiv}},
  year = {2024},
  url = {https://www.bundesarchiv.de/handreichung}
}
`;

const RIS_FIXTURE = `TY  - BOOK
ID  - popper1959
AU  - Popper, Karl R.
TI  - The Logic of Scientific
  Discovery
PY  - 1959///
PB  - Hutchinson
CY  - London
SN  - 978-0-415-27844-7
ER  -

TY  - JOUR
ID  - shannon1948
AU  - Shannon, Claude E.
T1  - A Mathematical Theory of Communication
JF  - Bell System Technical Journal
JO  - Bell Syst. Tech. J.
DA  - 1948/07/01
VL  - 27
IS  - 3
SP  - 379
EP  - 423
DO  - 10.1002/j.1538-7305.1948.tb01338.x
UR  - https://example.org/shannon1948
ER  -

TY  - CHAP
ID  - keller2022
AU  - Keller, Anna
A2  - Weber, Max
A2  - Braun, Clara
TI  - Methods of Textual Scholarship
  in Practice
T2  - Companion to Editorial Theory
Y1  - 2022/03//
PB  - Walter de Gruyter
CY  - Berlin
SP  - 88
EP  - 114
SN  - 978-3-11-070000-0
ER  -
`;

const CSL_JSON_FIXTURE = JSON.stringify([
  {
    id: "knuth1984",
    type: "article-journal",
    title: "Literate Programming",
    author: [{ family: "Knuth", given: "Donald E." }],
    issued: { "date-parts": [[1984, 5]] },
    "container-title": "The Computer Journal",
    volume: 27,
    issue: 2,
    page: "97-111",
    DOI: "10.1093/comjnl/27.2.97",
    abstract: "Treating programs as works of literature."
  },
  {
    id: "w3c2023",
    type: "webpage",
    title: "Web Content Accessibility Guidelines (WCAG) 2.2",
    author: [{ literal: "World Wide Web Consortium" }],
    issued: { "date-parts": [[2023, 10, 5]] },
    URL: "https://www.w3.org/TR/WCAG22/",
    language: "en",
    "abstract-free": "Accessibility standard for web content."
  }
]);

describe("citation normalization (csl.ts)", () => {
  it("validates fields, enforces item and string length caps, and preserves stable unique ids", () => {
    const oversizedTitle = "A".repeat(MAX_CITATION_TITLE_LENGTH + 250);
    const items = normalizeCslItems([
      {
        type: "book",
        title: oversizedTitle,
        author: [{ family: "Smith", given: "Ada" }],
        issued: { "date-parts": [[2022]] },
        URL: "javascript:alert(1)"
      },
      {
        type: "book",
        title: oversizedTitle,
        author: [{ family: "Smith", given: "Ada" }],
        issued: { "date-parts": [[2022]] },
        URL: "https://example.org/safe"
      }
    ]);

    expect(items).toHaveLength(2);
    expect(items[0].title?.length).toBe(MAX_CITATION_TITLE_LENGTH);
    expect(items[0].URL).toBeUndefined();
    expect(items[1].URL).toBe("https://example.org/safe");
    expect(items[0].id).toMatch(/^smith-2022-/);
    expect(items[1].id).not.toBe(items[0].id);

    // Fallback ids are deterministic when run again on identical input.
    const repeated = normalizeCslItems([
      {
        type: "book",
        title: oversizedTitle,
        author: [{ family: "Smith", given: "Ada" }],
        issued: { "date-parts": [[2022]] }
      }
    ]);
    expect(repeated[0].id).toBe(items[0].id);
  });

  it("caps imported libraries at MAX_CITATION_ITEMS (5000)", () => {
    const huge = Array.from({ length: MAX_CITATION_ITEMS + 25 }, (_, i) => ({
      id: `item-${i}`,
      type: "book",
      title: `Book ${i}`
    }));

    const result = normalizeCslItemsDetailed(huge);
    expect(result.items).toHaveLength(MAX_CITATION_ITEMS);
    expect(result.warnings.some((w) => w.includes("5000"))).toBe(true);
  });
});

describe("citation importers", () => {
  it("imports a Zotero-style BibTeX export with 6 entries, German umlauts, macros, and accents", () => {
    const result = importCitations(ZOTERO_BIBTEX_FIXTURE, "zotero-export.bib");

    expect(result.format).toBe("bibtex");
    expect(result.warnings).toEqual([]);
    expect(result.items).toHaveLength(6);

    const [habermas, muller, ostergaard, garcia, schroeder, bundesarchiv] = result.items;

    expect(habermas).toMatchObject({
      id: "habermas1962",
      citeKey: "habermas1962",
      type: "book",
      title: "Strukturwandel der Öffentlichkeit: Untersuchungen zu einer Kategorie der bürgerlichen Gesellschaft",
      author: [{ family: "Habermas", given: "Jürgen" }],
      issued: { "date-parts": [[1962, 10]] },
      publisher: "Suhrkamp Verlag",
      "publisher-place": "Frankfurt am Main",
      ISBN: "978-3-518-28491-9",
      edition: "1",
      language: "de"
    });

    expect(muller).toMatchObject({
      id: "muller2021",
      type: "article-journal",
      title: "Digitalisierung und Quellenkritik in der Geschichtswissenschaft",
      author: [
        { family: "Müller", given: "Hans-Peter" },
        { family: "Černý", given: "Tomáš" },
        { family: "Lefèvre", given: "François" }
      ],
      "container-title": "Journal of Historical Informatics",
      issued: { "date-parts": [[2021, 3]] },
      volume: "14",
      issue: "2",
      page: "112-138",
      DOI: "10.1234/jhi.2021.14.2.112",
      URL: "https://example.org/~muller/digital_sources",
      "abstract-free": "Eine Analyse zu Großprojekten und Überlieferungsgeschichte."
    });

    expect(ostergaard).toMatchObject({
      id: "ostergaard2019",
      type: "chapter",
      author: [{ family: "Østergaard", given: "Søren" }],
      editor: [
        { family: "Lindqvist", given: "Astrid" },
        { literal: "Deutsche Forschungsgemeinschaft" }
      ],
      "container-title": "European Archives in Transition",
      issued: { "date-parts": [[2019, 11, 4]] },
      publisher: "Campus Verlag",
      "publisher-place": "Berlin",
      page: "45-79"
    });

    expect(garcia).toMatchObject({
      id: "garcia2020",
      type: "paper-conference",
      author: [
        { family: "García", given: "José María" },
        { family: "van Beethoven", given: "Ludwig" }
      ],
      issued: { "date-parts": [[2020, 7]] },
      page: "210-225"
    });

    expect(schroeder).toMatchObject({
      id: "schroeder2018",
      type: "thesis",
      title: "Spätmittelalterliche Briefkultur am Oberrhein",
      author: [{ family: "Schröder", given: "Katharina" }],
      publisher: "Universität Freiburg",
      "publisher-place": "Freiburg im Breisgau",
      issued: { "date-parts": [[2018]] }
    });

    expect(bundesarchiv).toMatchObject({
      id: "bundesarchiv2024",
      type: "webpage",
      title: "Digitales Archivportal — Handreichung",
      author: [{ literal: "Bundesarchiv" }],
      URL: "https://www.bundesarchiv.de/handreichung"
    });
  });

  it("imports a RIS file with a book, an article, and a chapter including multi-line fields", () => {
    const result = importCitations(RIS_FIXTURE, "library.ris");

    expect(result.format).toBe("ris");
    expect(result.warnings).toEqual([]);
    expect(result.items).toHaveLength(3);

    const [book, article, chapter] = result.items;

    expect(book).toMatchObject({
      id: "popper1959",
      type: "book",
      title: "The Logic of Scientific Discovery",
      author: [{ family: "Popper", given: "Karl R." }],
      issued: { "date-parts": [[1959]] },
      publisher: "Hutchinson",
      "publisher-place": "London",
      ISBN: "978-0-415-27844-7"
    });

    expect(article).toMatchObject({
      id: "shannon1948",
      type: "article-journal",
      title: "A Mathematical Theory of Communication",
      author: [{ family: "Shannon", given: "Claude E." }],
      "container-title": "Bell System Technical Journal",
      issued: { "date-parts": [[1948, 7, 1]] },
      volume: "27",
      issue: "3",
      page: "379-423",
      DOI: "10.1002/j.1538-7305.1948.tb01338.x",
      URL: "https://example.org/shannon1948"
    });

    expect(chapter).toMatchObject({
      id: "keller2022",
      type: "chapter",
      title: "Methods of Textual Scholarship in Practice",
      author: [{ family: "Keller", given: "Anna" }],
      editor: [
        { family: "Weber", given: "Max" },
        { family: "Braun", given: "Clara" }
      ],
      "container-title": "Companion to Editorial Theory",
      issued: { "date-parts": [[2022, 3]] },
      publisher: "Walter de Gruyter",
      "publisher-place": "Berlin",
      page: "88-114",
      ISBN: "978-3-11-070000-0"
    });
  });

  it("imports CSL JSON and detects formats by content when filename has no matching extension", () => {
    const byExt = importCitations(CSL_JSON_FIXTURE, "references.json");
    expect(byExt.format).toBe("csl-json");
    expect(byExt.warnings).toEqual([]);
    expect(byExt.items).toHaveLength(2);
    expect(byExt.items[0]).toMatchObject({
      id: "knuth1984",
      type: "article-journal",
      volume: "27",
      issue: "2",
      "abstract-free": "Treating programs as works of literature."
    });
    expect(byExt.items[1]["abstract-free"]).toBe("Accessibility standard for web content.");

    expect(importCitations(CSL_JSON_FIXTURE, "export.txt").format).toBe("csl-json");
    expect(importCitations(ZOTERO_BIBTEX_FIXTURE, "").format).toBe("bibtex");
    expect(importCitations(RIS_FIXTURE, "notes.txt").format).toBe("ris");
  });

  it("handles empty input, malformed entries, and duplicate keys with warnings", () => {
    const empty = importCitations("   \n\t ", "empty.bib");
    expect(empty.items).toEqual([]);
    expect(empty.warnings.length).toBeGreaterThan(0);

    const malformedBib = `
@book{valid2020,
  title = {Valid Book},
  author = {Valid, Author},
  year = {2020}
}
@article{,
  title = {Missing Key}
}
@book{valid2020,
  title = {Duplicate Key Book},
  author = {Second, Author},
  year = {2021}
}
@article{unclosed2022,
  title = {Never closed
`;
    const bibResult = importCitations(malformedBib, "broken.bib");
    expect(bibResult.items).toHaveLength(2);
    expect(bibResult.items.map((item) => item.id)).toEqual(["valid2020", "valid2020-2"]);
    expect(bibResult.warnings.length).toBeGreaterThanOrEqual(3);

    const malformedRis = `
TY  - BOOK
ID  - dup1
TI  - First Book
ER  -

TY  - BOOK
ID  - dup1
TI  - Second Book
ER  -

TY  - JOUR
TI  - Missing End Tag
`;
    const risResult = importCitations(malformedRis, "broken.ris");
    expect(risResult.items).toHaveLength(2);
    expect(risResult.items.map((item) => item.id)).toEqual(["dup1", "dup1-2"]);
    expect(risResult.warnings.length).toBeGreaterThanOrEqual(2);

    const malformedJson = JSON.stringify([
      { id: "ok1", type: "book", title: "Good Entry" },
      { id: "bad1", title: "Missing Type" },
      "not-an-object",
      { id: "ok1", type: "book", title: "Duplicate Id" }
    ]);
    const jsonResult = importCitations(malformedJson, "broken.json");
    expect(jsonResult.items).toHaveLength(2);
    expect(jsonResult.items.map((item) => item.id)).toEqual(["ok1", "ok1-2"]);
    expect(jsonResult.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
