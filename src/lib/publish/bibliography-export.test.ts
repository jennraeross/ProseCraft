import { strFromU8, unzlibSync, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { citeMarkerHtml } from "../citations/cite-marker";
import type { CslItem } from "../citations/csl";
import { formatBibliography, formatCitation } from "../citations/format";
import { footnoteMarkerHtml } from "../footnotes";
import { compileBook } from "./compile";
import { exportDocx } from "./docx";
import { exportEpub } from "./epub";
import { exportHtml } from "./html";
import { exportMarkdown } from "./markdown";
import { exportPdf } from "./pdf";
import { exportText } from "./text";
import { defaultPublishOptions, type CompiledBook, type PublishOptions } from "./types";

const SHANNON: CslItem = {
  id: "shannon1948",
  type: "article-journal",
  author: [{ family: "Shannon", given: "Claude E." }],
  title: "A Mathematical Theory of Communication",
  "container-title": "Bell System Technical Journal",
  volume: "27",
  page: "379-423",
  issued: { "date-parts": [[1948]] }
};

const KAHNEMAN: CslItem = {
  id: "kahneman2011",
  type: "book",
  author: [{ family: "Kahneman", given: "Daniel" }],
  title: "Thinking, Fast and Slow",
  issued: { "date-parts": [[2011]] },
  publisher: "Farrar, Straus and Giroux"
};

const POPPER: CslItem = {
  id: "popper1959",
  type: "book",
  author: [{ family: "Popper", given: "Karl" }],
  title: "The Logic of Scientific Discovery",
  issued: { "date-parts": [[1959]] },
  publisher: "Hutchinson"
};

const FIXTURE_LIBRARY: CslItem[] = [SHANNON, KAHNEMAN, POPPER];

function citationFixtureBook(): CompiledBook {
  return compileBook({
    title: "Citation Export Fixture",
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
        // 2 cites in the body + 1 cite in a footnote.
        content: `<p>First body claim ${citeMarkerHtml([{ id: "shannon1948", locator: "380", label: "page" }])} and second body claim ${citeMarkerHtml([{ id: "kahneman2011" }])}${footnoteMarkerHtml("fn-1")}.</p>`,
        footnotes: [
          {
            id: "fn-1",
            html: `Footnote reference ${citeMarkerHtml([{ id: "popper1959", locator: "42", label: "page" }])}.`
          }
        ]
      }
    ],
    citations: FIXTURE_LIBRARY
  });
}

function apaOptions(overrides: Partial<PublishOptions> = {}): PublishOptions {
  return {
    ...defaultPublishOptions(),
    citationStyle: "apa7",
    citationLocale: "en",
    includeBibliography: true,
    ...overrides
  };
}

function ieeeOptions(overrides: Partial<PublishOptions> = {}): PublishOptions {
  return {
    ...defaultPublishOptions(),
    citationStyle: "ieee",
    citationLocale: "en",
    includeBibliography: true,
    ...overrides
  };
}

const EXPECTED_APA_CITE_1 = formatCitation("apa7", [{ item: SHANNON, locator: "380", label: "page" }], { locale: "en" }).text;
const EXPECTED_APA_CITE_2 = formatCitation("apa7", [{ item: KAHNEMAN }], { locale: "en" }).text;
const EXPECTED_APA_CITE_FN = formatCitation("apa7", [{ item: POPPER, locator: "42", label: "page" }], { locale: "en" }).text;
const EXPECTED_APA_BIB = formatBibliography("apa7", [SHANNON, KAHNEMAN, POPPER], "en").map((entry) => entry.text);

const EXPECTED_IEEE_CITE_1 = formatCitation("ieee", [{ item: SHANNON, locator: "380", label: "page" }], { locale: "en", index: 1 }).text;
const EXPECTED_IEEE_CITE_2 = formatCitation("ieee", [{ item: KAHNEMAN }], { locale: "en", index: 2 }).text;
const EXPECTED_IEEE_CITE_FN = formatCitation("ieee", [{ item: POPPER, locator: "42", label: "page" }], { locale: "en", index: 3 }).text;
const EXPECTED_IEEE_BIB = formatBibliography("ieee", [SHANNON, KAHNEMAN, POPPER], "en").map((entry) => entry.text);

function extractPdfText(bytes: Uint8Array): string {
  const raw = strFromU8(bytes, true);
  const parts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw)) !== null) {
    const start = match.index + match[0].indexOf("\n") + 1;
    const end = match.index + match[0].lastIndexOf("endstream");
    let slice = bytes.subarray(start, end);
    while (slice.length > 0 && (slice[slice.length - 1] === 10 || slice[slice.length - 1] === 13)) {
      slice = slice.subarray(0, slice.length - 1);
    }
    try {
      parts.push(strFromU8(unzlibSync(slice)));
    } catch {
      parts.push(strFromU8(slice));
    }
  }
  const combined = parts.join("\n");
  const literals: string[] = [];
  const literalRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
  while ((match = literalRe.exec(combined)) !== null) {
    literals.push(match[1].replace(/\\([()\\])/g, "$1"));
  }
  return literals.join("");
}

function xmlTextContent(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("citations and bibliography in all exporters", () => {
  it("exports APA 7 and IEEE in-text citations and hanging-indent bibliography in DOCX", async () => {
    const book = citationFixtureBook();

    const apaPayload = await exportDocx(book, apaOptions());
    const apaArchive = unzipSync(new Uint8Array(await apaPayload.blob.arrayBuffer()));
    const apaDocText = xmlTextContent(strFromU8(apaArchive["word/document.xml"]));
    const apaFnText = xmlTextContent(strFromU8(apaArchive["word/footnotes.xml"]));
    const apaStyles = strFromU8(apaArchive["word/styles.xml"]);

    expect(apaDocText).toContain(EXPECTED_APA_CITE_1);
    expect(apaDocText).toContain(EXPECTED_APA_CITE_2);
    expect(apaFnText).toContain(EXPECTED_APA_CITE_FN);
    expect(apaDocText).toContain("Bibliography");
    for (const entry of EXPECTED_APA_BIB) {
      expect(apaDocText).toContain(entry);
    }
    expect(apaStyles).toContain('w:styleId="BibliographyEntry"');
    expect(apaStyles).toContain('w:hanging="720"');

    const ieeePayload = await exportDocx(book, ieeeOptions());
    const ieeeArchive = unzipSync(new Uint8Array(await ieeePayload.blob.arrayBuffer()));
    const ieeeDocText = xmlTextContent(strFromU8(ieeeArchive["word/document.xml"]));
    const ieeeFnText = xmlTextContent(strFromU8(ieeeArchive["word/footnotes.xml"]));

    expect(ieeeDocText).toContain(EXPECTED_IEEE_CITE_1);
    expect(ieeeDocText).toContain(EXPECTED_IEEE_CITE_2);
    expect(ieeeFnText).toContain(EXPECTED_IEEE_CITE_FN);
    for (const entry of EXPECTED_IEEE_BIB) {
      expect(ieeeDocText).toContain(entry);
    }
  });

  it("exports APA 7 and IEEE in-text citations and valid bibliography XHTML in EPUB", async () => {
    const book = citationFixtureBook();

    const apaPayload = await exportEpub(book, apaOptions());
    const apaArchive = unzipSync(new Uint8Array(await apaPayload.blob.arrayBuffer()));
    const apaChapter = strFromU8(apaArchive["OEBPS/text/chapter-1.xhtml"]);
    const apaBib = strFromU8(apaArchive["OEBPS/text/bibliography.xhtml"]);
    const apaCss = strFromU8(apaArchive["OEBPS/styles.css"]);
    const apaOpf = strFromU8(apaArchive["OEBPS/content.opf"]);

    expect(apaChapter).toContain(EXPECTED_APA_CITE_1);
    expect(apaChapter).toContain(EXPECTED_APA_CITE_2);
    expect(apaChapter).toContain(EXPECTED_APA_CITE_FN);
    expect(apaBib).toContain("Bibliography");
    expect(apaBib).toContain('epub:type="bibliography"');
    expect(apaOpf).toContain('<itemref idref="bibliography" />');
    expect(apaCss).toContain("text-indent: -2em;");
    for (const entry of EXPECTED_APA_BIB) {
      expect(xmlTextContent(apaBib)).toContain(entry);
    }
    expect(new DOMParser().parseFromString(apaBib, "application/xhtml+xml").querySelector("parsererror")).toBeNull();

    const ieeePayload = await exportEpub(book, ieeeOptions());
    const ieeeArchive = unzipSync(new Uint8Array(await ieeePayload.blob.arrayBuffer()));
    const ieeeChapter = strFromU8(ieeeArchive["OEBPS/text/chapter-1.xhtml"]);
    const ieeeBib = strFromU8(ieeeArchive["OEBPS/text/bibliography.xhtml"]);

    expect(ieeeChapter).toContain(EXPECTED_IEEE_CITE_1);
    expect(ieeeChapter).toContain(EXPECTED_IEEE_CITE_2);
    expect(ieeeChapter).toContain(EXPECTED_IEEE_CITE_FN);
    for (const entry of EXPECTED_IEEE_BIB) {
      expect(xmlTextContent(ieeeBib)).toContain(entry);
    }
    expect(new DOMParser().parseFromString(ieeeBib, "application/xhtml+xml").querySelector("parsererror")).toBeNull();
  });

  it("exports APA 7 and IEEE in-text citations and hanging-indent bibliography in HTML", async () => {
    const book = citationFixtureBook();

    const apaHtml = await exportHtml(book, apaOptions()).blob.text();
    expect(apaHtml).toContain(EXPECTED_APA_CITE_1);
    expect(apaHtml).toContain(EXPECTED_APA_CITE_2);
    expect(apaHtml).toContain(EXPECTED_APA_CITE_FN);
    expect(apaHtml).toContain('<section class="matter-page back-matter bibliography" aria-label="Bibliography">');
    expect(apaHtml).toContain("text-indent: -2em;");
    const apaDoc = new DOMParser().parseFromString(apaHtml, "text/html");
    const apaBibEntries = Array.from(apaDoc.querySelectorAll(".bibliography-entry")).map((el) => el.textContent);
    expect(apaBibEntries).toEqual(EXPECTED_APA_BIB);

    const ieeeHtml = await exportHtml(book, ieeeOptions()).blob.text();
    expect(ieeeHtml).toContain(EXPECTED_IEEE_CITE_1);
    expect(ieeeHtml).toContain(EXPECTED_IEEE_CITE_2);
    expect(ieeeHtml).toContain(EXPECTED_IEEE_CITE_FN);
    const ieeeDoc = new DOMParser().parseFromString(ieeeHtml, "text/html");
    const ieeeBibEntries = Array.from(ieeeDoc.querySelectorAll(".bibliography-entry")).map((el) => el.textContent);
    expect(ieeeBibEntries).toEqual(EXPECTED_IEEE_BIB);
  });

  it("exports APA 7 and IEEE in-text citations and hanging-indent bibliography in PDF", async () => {
    const book = citationFixtureBook();

    const apaPdfBytes = new Uint8Array(await exportPdf(book, apaOptions()).blob.arrayBuffer());
    const apaPdfText = extractPdfText(apaPdfBytes);
    expect(apaPdfText).toContain(EXPECTED_APA_CITE_1);
    expect(apaPdfText).toContain(EXPECTED_APA_CITE_2);
    expect(apaPdfText).toContain(EXPECTED_APA_CITE_FN);
    expect(apaPdfText).toContain("Bibliography");
    expect(apaPdfText).toContain("Thinking, Fast and Slow");
    expect(apaPdfText).toContain("The Logic of Scientific Discovery");
    expect(apaPdfText).toContain("A Mathematical Theory of Communication");

    const ieeePdfBytes = new Uint8Array(await exportPdf(book, ieeeOptions()).blob.arrayBuffer());
    const ieeePdfText = extractPdfText(ieeePdfBytes);
    expect(ieeePdfText).toContain(EXPECTED_IEEE_CITE_1);
    expect(ieeePdfText).toContain(EXPECTED_IEEE_CITE_2);
    expect(ieeePdfText).toContain(EXPECTED_IEEE_CITE_FN);
    expect(ieeePdfText).toContain("[1] C. E. Shannon");
    expect(ieeePdfText).toContain("[2] D. Kahneman");
    expect(ieeePdfText).toContain("[3] K. Popper");
  });

  it("exports APA 7 and IEEE in-text citations and list bibliography in Markdown", async () => {
    const book = citationFixtureBook();

    const apaMd = await exportMarkdown(book, apaOptions()).blob.text();
    expect(apaMd).toContain(EXPECTED_APA_CITE_1);
    expect(apaMd).toContain(EXPECTED_APA_CITE_2);
    expect(apaMd).toContain(`[^1]: Footnote reference ${EXPECTED_APA_CITE_FN}.`);
    expect(apaMd).toContain("## Bibliography");
    expect(apaMd).toContain("- Kahneman, D. (2011). _Thinking, Fast and Slow_. Farrar, Straus and Giroux.");
    expect(apaMd).toContain("- Popper, K. (1959). _The Logic of Scientific Discovery_. Hutchinson.");

    const ieeeMd = await exportMarkdown(book, ieeeOptions()).blob.text();
    const unescapedIeeeMd = ieeeMd.replace(/\\([[\]])/g, "$1");
    expect(unescapedIeeeMd).toContain(EXPECTED_IEEE_CITE_1);
    expect(unescapedIeeeMd).toContain(EXPECTED_IEEE_CITE_2);
    expect(unescapedIeeeMd).toContain(`[^1]: Footnote reference ${EXPECTED_IEEE_CITE_FN}.`);
    expect(ieeeMd).toContain("## Bibliography");
    expect(unescapedIeeeMd).toContain("- [1] C. E. Shannon");
    expect(unescapedIeeeMd).toContain("- [2] D. Kahneman");
    expect(unescapedIeeeMd).toContain("- [3] K. Popper");
  });

  it("exports APA 7 and IEEE in-text citations and bibliography in Plain text", async () => {
    const book = citationFixtureBook();

    const apaTxt = await exportText(book, apaOptions()).blob.text();
    expect(apaTxt).toContain(EXPECTED_APA_CITE_1);
    expect(apaTxt).toContain(EXPECTED_APA_CITE_2);
    expect(apaTxt).toContain(`[1] Footnote reference ${EXPECTED_APA_CITE_FN}.`);
    expect(apaTxt).toContain(`BIBLIOGRAPHY\n${EXPECTED_APA_BIB.join("\n")}`);

    const ieeeTxt = await exportText(book, ieeeOptions()).blob.text();
    expect(ieeeTxt).toContain(EXPECTED_IEEE_CITE_1);
    expect(ieeeTxt).toContain(EXPECTED_IEEE_CITE_2);
    expect(ieeeTxt).toContain(`[1] Footnote reference ${EXPECTED_IEEE_CITE_FN}.`);
    expect(ieeeTxt).toContain(`BIBLIOGRAPHY\n${EXPECTED_IEEE_BIB.join("\n")}`);
  });

  it("uses Literaturverzeichnis heading for German locale and omits bibliography when disabled", async () => {
    const book = citationFixtureBook();

    const deHtml = await exportHtml(book, apaOptions({ citationLocale: "de" })).blob.text();
    expect(deHtml).toContain("Literaturverzeichnis");
    expect(deHtml).toContain("(Shannon, 1948, S. 380)");

    const deMd = await exportMarkdown(book, apaOptions({ citationLocale: "de" })).blob.text();
    expect(deMd).toContain("## Literaturverzeichnis");

    const disabledHtml = await exportHtml(book, apaOptions({ includeBibliography: false })).blob.text();
    expect(disabledHtml).toContain(EXPECTED_APA_CITE_1);
    expect(disabledHtml).not.toContain("Bibliography");
    expect(disabledHtml).not.toContain('class="bibliography-entry"');
  });

  it("converts body citations into automatic footnotes in note styles across exports", async () => {
    const book = citationFixtureBook();
    const noteOptions = {
      ...defaultPublishOptions(),
      citationStyle: "chicago-notes" as const,
      citationLocale: "en" as const,
      includeBibliography: true
    };

    const md = await exportMarkdown(book, noteOptions).blob.text();
    expect(md).toContain("First body claim [^1] and second body claim [^2][^3].");
    expect(md).toContain("[^1]: Claude E. Shannon");
    expect(md).toContain("[^2]: Daniel Kahneman");
    expect(md).toContain("[^3]: Footnote reference Karl Popper");
    expect(md).toContain("## Bibliography");

    const docxArchive = unzipSync(new Uint8Array(await (await exportDocx(book, noteOptions)).blob.arrayBuffer()));
    const docxFootnotes = xmlTextContent(strFromU8(docxArchive["word/footnotes.xml"]));
    expect(docxFootnotes).toContain("Claude E. Shannon");
    expect(docxFootnotes).toContain("Daniel Kahneman");
    expect(docxFootnotes).toContain("Karl Popper");
  });
});
