import { describe, expect, it } from "vitest";
import type { CslItem } from "./csl";
import { computeDisambiguation, formatBibliography, formatCitation } from "./format";
import { STYLES, type CitationStyleId } from "./styles";

const BOOK_POPPER: CslItem = {
  id: "popper-1959",
  type: "book",
  author: [{ family: "Popper", given: "Karl R." }],
  title: "The Logic of Scientific Discovery",
  issued: { "date-parts": [[1959]] },
  publisher: "Hutchinson",
  "publisher-place": "London",
  edition: "2"
};

const ARTICLE_SHANNON: CslItem = {
  id: "shannon-1948",
  type: "article-journal",
  author: [
    { family: "Shannon", given: "Claude E." },
    { family: "Weaver", given: "Warren" }
  ],
  title: "A Mathematical Theory of Communication",
  "container-title": "Bell System Technical Journal",
  issued: { "date-parts": [[1948]] },
  volume: "27",
  issue: "3",
  page: "379-423",
  DOI: "10.1002/j.1538-7305.1948.tb01338.x"
};

const CHAPTER_OSTERGAARD: CslItem = {
  id: "ostergaard-2019",
  type: "chapter",
  author: [{ family: "Ostergaard", given: "Soren" }],
  editor: [{ family: "Lindqvist", given: "Astrid" }],
  title: "Nordic Archival Practices",
  "container-title": "European Archives in Transition",
  issued: { "date-parts": [[2019]] },
  publisher: "Campus Verlag",
  "publisher-place": "Berlin",
  page: "45-79"
};

const THREE_REFS = [BOOK_POPPER, ARTICLE_SHANNON, CHAPTER_OSTERGAARD];

describe("STYLES metadata", () => {
  it("exposes all 8 built-in styles with expected kinds", () => {
    expect(STYLES.map((s) => s.id)).toEqual([
      "apa7",
      "chicago-author-date",
      "chicago-notes",
      "mla9",
      "harvard",
      "ieee",
      "vancouver",
      "din1505"
    ]);
    expect(STYLES.find((s) => s.id === "chicago-notes")?.kind).toBe("note");
    expect(STYLES.find((s) => s.id === "ieee")?.kind).toBe("numeric");
    expect(STYLES.find((s) => s.id === "vancouver")?.kind).toBe("numeric");
    expect(STYLES.find((s) => s.id === "apa7")?.kind).toBe("author-date");
  });
});

describe("All 8 styles — 3 core reference items (book, journal article with DOI, edited chapter)", () => {
  it("formats apa7 in-text and bibliography entries", () => {
    expect(
      formatCitation("apa7", [{ item: BOOK_POPPER, locator: "42" }], { locale: "en" })
    ).toEqual({
      text: "(Popper, 1959, p. 42)",
      html: "(Popper, 1959, p. 42)"
    });
    expect(
      formatCitation("apa7", [{ item: ARTICLE_SHANNON }], { locale: "en" }).text
    ).toBe("(Shannon & Weaver, 1948)");

    const bib = formatBibliography("apa7", THREE_REFS, "en");
    expect(bib.map((e) => e.id)).toEqual(["ostergaard-2019", "popper-1959", "shannon-1948"]);
    expect(bib).toEqual([
      {
        id: "ostergaard-2019",
        text: "Ostergaard, S. (2019). Nordic Archival Practices. In A. Lindqvist (Ed.), European Archives in Transition (pp. 45–79). Campus Verlag.",
        html: "Ostergaard, S. (2019). Nordic Archival Practices. In A. Lindqvist (Ed.), <i>European Archives in Transition</i> (pp. 45–79). Campus Verlag."
      },
      {
        id: "popper-1959",
        text: "Popper, K. R. (1959). The Logic of Scientific Discovery (2nd ed.). Hutchinson.",
        html: "Popper, K. R. (1959). <i>The Logic of Scientific Discovery</i> (2nd ed.). Hutchinson."
      },
      {
        id: "shannon-1948",
        text: "Shannon, C. E., & Weaver, W. (1948). A Mathematical Theory of Communication. Bell System Technical Journal, 27(3), 379–423. https://doi.org/10.1002/j.1538-7305.1948.tb01338.x",
        html: "Shannon, C. E., &amp; Weaver, W. (1948). A Mathematical Theory of Communication. <i>Bell System Technical Journal</i>, <i>27</i>(3), 379–423. https://doi.org/10.1002/j.1538-7305.1948.tb01338.x"
      }
    ]);
  });

  it("formats chicago-author-date in-text and bibliography entries", () => {
    expect(
      formatCitation("chicago-author-date", [{ item: BOOK_POPPER, locator: "42" }], { locale: "en" })
        .text
    ).toBe("(Popper 1959, 42)");
    expect(
      formatCitation("chicago-author-date", [{ item: ARTICLE_SHANNON }], { locale: "en" }).text
    ).toBe("(Shannon and Weaver 1948)");

    const bib = formatBibliography("chicago-author-date", THREE_REFS, "en");
    expect(bib).toEqual([
      {
        id: "ostergaard-2019",
        text: 'Ostergaard, Soren. 2019. "Nordic Archival Practices." In European Archives in Transition, edited by Astrid Lindqvist, 45–79. Berlin: Campus Verlag.',
        html: "Ostergaard, Soren. 2019. &quot;Nordic Archival Practices.&quot; In <i>European Archives in Transition</i>, edited by Astrid Lindqvist, 45–79. Berlin: Campus Verlag."
      },
      {
        id: "popper-1959",
        text: "Popper, Karl R. 1959. The Logic of Scientific Discovery. 2nd ed. London: Hutchinson.",
        html: "Popper, Karl R. 1959. <i>The Logic of Scientific Discovery</i>. 2nd ed. London: Hutchinson."
      },
      {
        id: "shannon-1948",
        text: 'Shannon, Claude E., and Warren Weaver. 1948. "A Mathematical Theory of Communication." Bell System Technical Journal 27 (3): 379–423. https://doi.org/10.1002/j.1538-7305.1948.tb01338.x.',
        html: "Shannon, Claude E., and Warren Weaver. 1948. &quot;A Mathematical Theory of Communication.&quot; <i>Bell System Technical Journal</i> 27 (3): 379–423. https://doi.org/10.1002/j.1538-7305.1948.tb01338.x."
      }
    ]);
  });

  it("formats chicago-notes footnote citations and bibliography entries", () => {
    expect(
      formatCitation("chicago-notes", [{ item: BOOK_POPPER, locator: "42" }], { locale: "en" })
    ).toEqual({
      text: "Karl R. Popper, The Logic of Scientific Discovery, 2nd ed. (London: Hutchinson, 1959), 42.",
      html: "Karl R. Popper, <i>The Logic of Scientific Discovery</i>, 2nd ed. (London: Hutchinson, 1959), 42."
    });
    expect(
      formatCitation("chicago-notes", [{ item: ARTICLE_SHANNON, locator: "385" }], { locale: "en" })
        .text
    ).toBe(
      'Claude E. Shannon and Warren Weaver, "A Mathematical Theory of Communication," Bell System Technical Journal 27, no. 3 (1948): 385, https://doi.org/10.1002/j.1538-7305.1948.tb01338.x.'
    );
    expect(
      formatCitation("chicago-notes", [{ item: CHAPTER_OSTERGAARD, locator: "50" }], { locale: "en" })
        .text
    ).toBe(
      'Soren Ostergaard, "Nordic Archival Practices," in European Archives in Transition, ed. Astrid Lindqvist (Berlin: Campus Verlag, 2019), 50.'
    );

    const bib = formatBibliography("chicago-notes", THREE_REFS, "en");
    expect(bib.map((e) => e.text)).toEqual([
      'Ostergaard, Soren. "Nordic Archival Practices." In European Archives in Transition, edited by Astrid Lindqvist, 45–79. Berlin: Campus Verlag, 2019.',
      "Popper, Karl R. The Logic of Scientific Discovery. 2nd ed. London: Hutchinson, 1959.",
      'Shannon, Claude E., and Warren Weaver. "A Mathematical Theory of Communication." Bell System Technical Journal 27, no. 3 (1948): 379–423. https://doi.org/10.1002/j.1538-7305.1948.tb01338.x.'
    ]);
  });

  it("formats mla9 author-page citations and Works Cited entries", () => {
    expect(formatCitation("mla9", [{ item: BOOK_POPPER, locator: "42" }], { locale: "en" }).text).toBe(
      "(Popper 42)"
    );
    expect(formatCitation("mla9", [{ item: ARTICLE_SHANNON }], { locale: "en" }).text).toBe(
      "(Shannon and Weaver)"
    );

    const bib = formatBibliography("mla9", THREE_REFS, "en");
    expect(bib.map((e) => e.html)).toEqual([
      "Ostergaard, Soren. &quot;Nordic Archival Practices.&quot; <i>European Archives in Transition</i>, edited by Astrid Lindqvist, Campus Verlag, 2019, pp. 45–79.",
      "Popper, Karl R. <i>The Logic of Scientific Discovery</i>. 2nd ed., Hutchinson, 1959.",
      "Shannon, Claude E., and Warren Weaver. &quot;A Mathematical Theory of Communication.&quot; <i>Bell System Technical Journal</i>, vol. 27, no. 3, 1948, pp. 379–423, https://doi.org/10.1002/j.1538-7305.1948.tb01338.x."
    ]);
  });

  it("formats harvard citations and bibliography entries", () => {
    // Note: Harvard variants differ on spacing between initials ("K. R." vs "K.R.");
    // this formatter uses spaced dotted initials ("K. R.") consistently.
    expect(
      formatCitation("harvard", [{ item: BOOK_POPPER, locator: "42" }], { locale: "en" }).text
    ).toBe("(Popper, 1959, p. 42)");
    expect(formatCitation("harvard", [{ item: ARTICLE_SHANNON }], { locale: "en" }).text).toBe(
      "(Shannon and Weaver, 1948)"
    );

    const bib = formatBibliography("harvard", THREE_REFS, "en");
    expect(bib.map((e) => e.html)).toEqual([
      "Ostergaard, S. (2019) &#39;Nordic Archival Practices&#39;, in Lindqvist, A. (ed.) <i>European Archives in Transition</i>. Berlin: Campus Verlag, pp. 45–79.",
      "Popper, K. R. (1959) <i>The Logic of Scientific Discovery</i>. 2nd edn. London: Hutchinson.",
      "Shannon, C. E. and Weaver, W. (1948) &#39;A Mathematical Theory of Communication&#39;, <i>Bell System Technical Journal</i>, 27(3), pp. 379–423. Available at: https://doi.org/10.1002/j.1538-7305.1948.tb01338.x."
    ]);
  });

  it("formats ieee numeric citations and citation-order bibliography", () => {
    expect(
      formatCitation("ieee", [{ item: BOOK_POPPER, locator: "42" }], { index: 1, locale: "en" }).text
    ).toBe("[1, p. 42]");
    expect(
      formatCitation("ieee", [{ item: BOOK_POPPER }, { item: ARTICLE_SHANNON }], {
        index: 1,
        locale: "en"
      }).text
    ).toBe("[1], [2]");

    const bib = formatBibliography("ieee", THREE_REFS, "en");
    // Numeric styles preserve input / first-citation order rather than alphabetical order.
    expect(bib.map((e) => e.id)).toEqual(["popper-1959", "shannon-1948", "ostergaard-2019"]);
    expect(bib.map((e) => e.html)).toEqual([
      "[1] K. R. Popper, <i>The Logic of Scientific Discovery</i>, 2nd ed. London: Hutchinson, 1959.",
      "[2] C. E. Shannon and W. Weaver, &quot;A Mathematical Theory of Communication,&quot; <i>Bell System Technical Journal</i>, vol. 27, no. 3, pp. 379–423, 1948, doi: 10.1002/j.1538-7305.1948.tb01338.x.",
      "[3] S. Ostergaard, &quot;Nordic Archival Practices,&quot; in <i>European Archives in Transition</i>, A. Lindqvist, Ed. Berlin: Campus Verlag, 2019, pp. 45–79."
    ]);
  });

  it("formats vancouver numeric citations and plain-text bibliography", () => {
    expect(
      formatCitation("vancouver", [{ item: BOOK_POPPER, locator: "42" }], { index: 1, locale: "en" })
        .text
    ).toBe("(1, p. 42)");
    expect(
      formatCitation("vancouver", [{ item: BOOK_POPPER }, { item: ARTICLE_SHANNON }], {
        index: 1,
        locale: "en"
      }).text
    ).toBe("(1, 2)");

    const bib = formatBibliography("vancouver", THREE_REFS, "en");
    expect(bib.map((e) => e.id)).toEqual(["popper-1959", "shannon-1948", "ostergaard-2019"]);
    // Vancouver omits italics in standard ICMJE reference lists.
    expect(bib.map((e) => e.html)).toEqual([
      "1. Popper KR. The Logic of Scientific Discovery. 2nd ed. London: Hutchinson; 1959.",
      "2. Shannon CE, Weaver W. A Mathematical Theory of Communication. Bell System Technical Journal. 1948;27(3):379–423. doi: 10.1002/j.1538-7305.1948.tb01338.x.",
      "3. Ostergaard S. Nordic Archival Practices. In: Lindqvist A, editor. European Archives in Transition. Berlin: Campus Verlag; 2019. p. 45–79."
    ]);
  });

  it("formats din1505 citations and bibliography entries", () => {
    // Note: DIN 1505-2 has minor institutional variants (e.g. ALL-CAPS surnames vs normal case).
    // This implementation uses normal-case "Family, Given" with semicolon author separation.
    expect(
      formatCitation("din1505", [{ item: BOOK_POPPER, locator: "42" }], { locale: "de" }).text
    ).toBe("(Popper 1959, S. 42)");
    expect(formatCitation("din1505", [{ item: ARTICLE_SHANNON }], { locale: "de" }).text).toBe(
      "(Shannon und Weaver 1948)"
    );

    const bibDe = formatBibliography("din1505", THREE_REFS, "de");
    expect(bibDe.map((e) => e.html)).toEqual([
      "Ostergaard, Soren: Nordic Archival Practices. In: Lindqvist, Astrid (Hrsg.): <i>European Archives in Transition</i>. Berlin : Campus Verlag, 2019, S. 45–79.",
      "Popper, Karl R.: <i>The Logic of Scientific Discovery</i>. 2. Aufl. London : Hutchinson, 1959.",
      "Shannon, Claude E. ; Weaver, Warren: A Mathematical Theory of Communication. In: <i>Bell System Technical Journal</i> Bd. 27 (1948), Nr. 3, S. 379–423. DOI: 10.1002/j.1538-7305.1948.tb01338.x."
    ]);
  });
});

describe("et al. thresholds", () => {
  const threeAuthors: CslItem = {
    id: "three-2021",
    type: "book",
    author: [
      { family: "Alpha", given: "Anna" },
      { family: "Beta", given: "Bernd" },
      { family: "Gamma", given: "Clara" }
    ],
    title: "Three Authors Book",
    issued: { "date-parts": [[2021]] },
    publisher: "Press"
  };

  const fourAuthors: CslItem = {
    ...threeAuthors,
    id: "four-2021",
    author: [...(threeAuthors.author ?? []), { family: "Delta", given: "David" }]
  };

  const sevenAuthors: CslItem = {
    ...threeAuthors,
    id: "seven-2021",
    author: [
      ...(fourAuthors.author ?? []),
      { family: "Epsilon", given: "Eva" },
      { family: "Zeta", given: "Zoe" },
      { family: "Eta", given: "Emil" }
    ]
  };

  it("applies style-specific in-text et al. thresholds for 3 vs 4 authors", () => {
    expect(formatCitation("apa7", [{ item: threeAuthors }], { locale: "en" }).text).toBe(
      "(Alpha et al., 2021)"
    );
    expect(formatCitation("mla9", [{ item: threeAuthors }], { locale: "en" }).text).toBe(
      "(Alpha et al.)"
    );
    expect(formatCitation("din1505", [{ item: threeAuthors }], { locale: "de" }).text).toBe(
      "(Alpha et al. 2021)"
    );

    // Chicago and Harvard list 3 authors in-text and switch to et al. at 4+.
    expect(
      formatCitation("chicago-author-date", [{ item: threeAuthors }], { locale: "en" }).text
    ).toBe("(Alpha, Beta, and Gamma 2021)");
    expect(
      formatCitation("chicago-author-date", [{ item: fourAuthors }], { locale: "en" }).text
    ).toBe("(Alpha et al. 2021)");

    expect(formatCitation("harvard", [{ item: threeAuthors }], { locale: "en" }).text).toBe(
      "(Alpha, Beta and Gamma, 2021)"
    );
    expect(formatCitation("harvard", [{ item: fourAuthors }], { locale: "en" }).text).toBe(
      "(Alpha et al., 2021)"
    );
  });

  it("applies style-specific bibliography et al. thresholds", () => {
    // MLA 9 switches at 3+ authors in Works Cited.
    expect(formatBibliography("mla9", [threeAuthors], "en")[0].text).toBe(
      "Alpha, Anna, et al. Three Authors Book. Press, 2021."
    );
    // Harvard switches at 4+ authors.
    expect(formatBibliography("harvard", [threeAuthors], "en")[0].text).toBe(
      "Alpha, A., Beta, B. and Gamma, C. (2021) Three Authors Book. Press."
    );
    expect(formatBibliography("harvard", [fourAuthors], "en")[0].text).toBe(
      "Alpha, A. et al. (2021) Three Authors Book. Press."
    );
    // IEEE switches at 7+ authors (keeping 1); Vancouver switches at 7+ (keeping 6).
    expect(formatBibliography("ieee", [sevenAuthors], "en")[0].text).toBe(
      "[1] A. Alpha et al., Three Authors Book. Press, 2021."
    );
    expect(formatBibliography("vancouver", [sevenAuthors], "en")[0].text).toBe(
      "1. Alpha A, Beta B, Gamma C, Delta D, Epsilon E, Zeta Z, et al. Three Authors Book. Press; 2021."
    );
  });

  it("uses APA 7 ellipsis rule for 21+ authors", () => {
    const twentyOneAuthors: CslItem = {
      id: "many-2022",
      type: "book",
      author: Array.from({ length: 21 }, (_, idx) => ({
        family: `Author${idx + 1}`,
        given: "Test"
      })),
      title: "Big Collaboration",
      issued: { "date-parts": [[2022]] },
      publisher: "Science Press"
    };
    const entry = formatBibliography("apa7", [twentyOneAuthors], "en")[0].text;
    expect(entry).toContain("Author19, T., ... Author21, T. (2022).");
    expect(entry).not.toContain("Author20");
  });
});

describe("Disambiguation, missing date (n.d. / o. J.), missing author, and German locale", () => {
  const muellerB: CslItem = {
    id: "m-2020-b",
    type: "book",
    author: [{ family: "Müller", given: "Hans" }],
    title: "Zweiter Band",
    issued: { "date-parts": [[2020]] },
    publisher: "Suhrkamp"
  };

  const muellerA: CslItem = {
    id: "m-2020-a",
    type: "book",
    author: [{ family: "Müller", given: "Hans" }],
    title: "Erster Band",
    issued: { "date-parts": [[2020]] },
    publisher: "Suhrkamp"
  };

  it("assigns disambiguation letters (2020a, 2020b) sorted by title in author-date styles", () => {
    const styles: CitationStyleId[] = ["apa7", "chicago-author-date", "harvard", "din1505"];
    for (const style of styles) {
      const bib = formatBibliography(style, [muellerB, muellerA], "de");
      expect(bib.map((entry) => entry.id)).toEqual(["m-2020-a", "m-2020-b"]);
      expect(bib[0].text).toContain("2020a");
      expect(bib[1].text).toContain("2020b");

      const yearSuffixes = computeDisambiguation(style, [muellerB, muellerA], "de");
      const cite = formatCitation(
        style,
        [{ item: muellerB }, { item: muellerA }],
        { locale: "de", yearSuffixes }
      );
      expect(cite.text).toContain("2020b");
      expect(cite.text).toContain("2020a");
    }

    // Standalone multi-item formatCitation also disambiguates without an external map.
    expect(
      formatCitation("apa7", [{ item: muellerA }, { item: muellerB }], { locale: "en" }).text
    ).toBe("(Müller, 2020a; Müller, 2020b)");
  });

  it("handles missing dates with n.d. (en) and o. J. (de), including disambiguation", () => {
    const undated1: CslItem = {
      id: "undated-1",
      type: "webpage",
      author: [{ literal: "Bundesarchiv" }],
      title: "Archivportal",
      URL: "https://www.bundesarchiv.de"
    };
    const undated2: CslItem = {
      id: "undated-2",
      type: "webpage",
      author: [{ literal: "Bundesarchiv" }],
      title: "Handreichung",
      URL: "https://www.bundesarchiv.de/handreichung"
    };

    expect(formatCitation("apa7", [{ item: undated1 }], { locale: "en" }).text).toBe(
      "(Bundesarchiv, n.d.)"
    );
    expect(formatCitation("apa7", [{ item: undated1 }], { locale: "de" }).text).toBe(
      "(Bundesarchiv, o. J.)"
    );
    expect(formatCitation("din1505", [{ item: undated1 }], { locale: "de" }).text).toBe(
      "(Bundesarchiv o. J.)"
    );

    const bibDe = formatBibliography("apa7", [undated2, undated1], "de");
    expect(bibDe[0].text).toContain("(o. J.-a)");
    expect(bibDe[1].text).toContain("(o. J.-b)");
  });

  it("handles German locale words (und, Hrsg., S., o. J., Aufl.) across styles", () => {
    const editedBook: CslItem = {
      id: "edited-de",
      type: "book",
      editor: [
        { family: "Meier", given: "Anna" },
        { family: "Schulz", given: "Bernd" }
      ],
      title: "Handbuch der Editionswissenschaft",
      issued: { "date-parts": [[2022]] },
      publisher: "De Gruyter",
      "publisher-place": "Berlin",
      edition: "3"
    };

    expect(
      formatCitation("chicago-author-date", [{ item: editedBook, locator: "15-18" }], {
        locale: "de"
      }).text
    ).toBe("(Meier und Schulz 2022, 15–18)");
    expect(
      formatCitation("apa7", [{ item: editedBook, locator: "15", label: "chapter" }], {
        locale: "de"
      }).text
    ).toBe("(Meier & Schulz, 2022, Kap. 15)");
    expect(
      formatCitation("harvard", [{ item: editedBook, locator: "15", label: "section" }], {
        locale: "de"
      }).text
    ).toBe("(Meier und Schulz, 2022, Abschn. 15)");

    expect(formatBibliography("apa7", [editedBook], "de")[0].text).toBe(
      "Meier, A., & Schulz, B. (Hrsg.). (2022). Handbuch der Editionswissenschaft (3. Aufl.). De Gruyter."
    );
    expect(formatBibliography("din1505", [editedBook], "de")[0].text).toBe(
      "Meier, Anna ; Schulz, Bernd (Hrsg.): Handbuch der Editionswissenschaft. 3. Aufl. Berlin : De Gruyter, 2022."
    );
    expect(formatBibliography("chicago-notes", [editedBook], "de")[0].text).toBe(
      "Meier, Anna, und Bernd Schulz, Hrsg. Handbuch der Editionswissenschaft. 3. Aufl. Berlin: De Gruyter, 2022."
    );
  });

  it("moves title to author position when both author and editor are missing", () => {
    const anonReport: CslItem = {
      id: "anon-report",
      type: "report",
      title: "Annual Research Summary",
      issued: { "date-parts": [[2023]] },
      publisher: "National Lab"
    };

    expect(formatCitation("apa7", [{ item: anonReport }], { locale: "en" })).toEqual({
      text: "(Annual Research Summary, 2023)",
      html: "(<i>Annual Research Summary</i>, 2023)"
    });
    expect(formatBibliography("apa7", [anonReport], "en")[0]).toEqual({
      id: "anon-report",
      text: "Annual Research Summary. (2023). National Lab.",
      html: "<i>Annual Research Summary</i>. (2023). National Lab."
    });
  });

  it("supports paper-conference, thesis, prefix, suffix, and suppressAuthor", () => {
    const conf: CslItem = {
      id: "garcia-2020",
      type: "paper-conference",
      author: [{ family: "García", given: "José María" }],
      title: "Automatic Collations of Medieval Manuscripts",
      "container-title": "Proceedings of the Digital Humanities Conference",
      issued: { "date-parts": [[2020]] },
      "publisher-place": "Utrecht",
      page: "210-225"
    };
    const thesis: CslItem = {
      id: "schroeder-2018",
      type: "thesis",
      author: [{ family: "Schröder", given: "Katharina" }],
      title: "Spätmittelalterliche Briefkultur am Oberrhein",
      publisher: "Universität Freiburg",
      issued: { "date-parts": [[2018]] }
    };

    expect(
      formatCitation(
        "apa7",
        [{ item: conf, prefix: "see", suffix: "for details", suppressAuthor: true, locator: "212" }],
        { locale: "en" }
      ).text
    ).toBe("(see 2020, p. 212 for details)");

    expect(formatBibliography("apa7", [conf], "en")[0].html).toBe(
      "García, J. M. (2020). Automatic Collations of Medieval Manuscripts. In <i>Proceedings of the Digital Humanities Conference</i> (pp. 210–225). Utrecht."
    );
    expect(formatBibliography("apa7", [thesis], "de")[0].html).toBe(
      "Schröder, K. (2018). <i>Spätmittelalterliche Briefkultur am Oberrhein</i> [Dissertation, Universität Freiburg]."
    );
    expect(formatBibliography("vancouver", [thesis], "en")[0].text).toBe(
      "1. Schröder K. Spätmittelalterliche Briefkultur am Oberrhein [dissertation]. Universität Freiburg; 2018."
    );
  });

  it("escapes HTML special characters in titles and authors", () => {
    const special: CslItem = {
      id: "html-escape",
      type: "book",
      author: [{ family: "O'Connor", given: "Liam" }],
      title: "R&D <Systems> & Tools",
      issued: { "date-parts": [[2024]] },
      publisher: "Tech & Co"
    };
    const entry = formatBibliography("apa7", [special], "en")[0];
    expect(entry.text).toBe("O'Connor, L. (2024). R&D <Systems> & Tools. Tech & Co.");
    expect(entry.html).toBe(
      "O&#39;Connor, L. (2024). <i>R&amp;D &lt;Systems&gt; &amp; Tools</i>. Tech &amp; Co."
    );
  });

  it("renders page ranges and locator ranges with an en dash across all 8 styles", () => {
    const rangeArticle: CslItem = {
      id: "range-2024",
      type: "article-journal",
      author: [{ family: "Keller", given: "Eva" }],
      title: "Range Formatting",
      "container-title": "Journal of Typography",
      issued: { "date-parts": [[2024]] },
      volume: "12",
      page: "45-67"
    };

    for (const style of STYLES) {
      const bib = formatBibliography(style.id, [rangeArticle], "en")[0].text;
      expect(bib).toContain("45–67");
      expect(bib).not.toContain("45-67");

      const cite = formatCitation(style.id, [{ item: rangeArticle, locator: "42-44" }], {
        index: 1,
        locale: "en"
      }).text;
      expect(cite).toContain("42–44");
      expect(cite).not.toContain("42-44");
    }
  });
});
