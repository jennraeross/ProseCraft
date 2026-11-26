import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { footnoteMarkerHtml } from "../footnotes";
import { compileBook } from "./compile";
import { exportDocx } from "./docx";
import { exportEpub } from "./epub";
import { exportHtml } from "./html";
import { exportMarkdown } from "./markdown";
import { exportPdf } from "./pdf";
import { extractPdfText } from "./pdf-text";
import { exportText } from "./text";
import { defaultPublishOptions, normalizePublishOptions } from "./types";
import { htmlToXhtml } from "./xhtml";

function twoFootnoteBook() {
  return compileBook({
    title: "Footnote Fixture",
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
        content: `<p>First claim${footnoteMarkerHtml("fn-a")} and second claim${footnoteMarkerHtml("fn-b")}.</p>`,
        footnotes: [
          { id: "fn-a", html: "First <em>italic note</em> here." },
          { id: "fn-b", html: "Second <i>emphasized</i> detail." }
        ]
      }
    ]
  });
}

function twoChapterBook() {
  return compileBook({
    title: "Multi Chapter Footnotes",
    author: "Test Author",
    subtitle: "",
    copyright: "",
    dedication: "",
    frontMatter: [],
    backMatter: [],
    chapters: [
      { id: "ch-1", title: "Chapter 1", expanded: true },
      { id: "ch-2", title: "Chapter 2", expanded: true }
    ],
    documents: [
      {
        id: "doc-1",
        title: "Scene 1",
        chapterId: "ch-1",
        content: `<p>Alpha${footnoteMarkerHtml("fn-1")} beta${footnoteMarkerHtml("fn-2")}.</p>`,
        footnotes: [
          { id: "fn-1", html: "Chapter one <em>first</em>." },
          { id: "fn-2", html: "Chapter one <em>second</em>." }
        ]
      },
      {
        id: "doc-2",
        title: "Scene 2",
        chapterId: "ch-2",
        content: `<p>Gamma${footnoteMarkerHtml("fn-1")}.</p>`,
        footnotes: [{ id: "fn-1", html: "Chapter two <em>note</em>." }]
      }
    ]
  });
}

describe("footnotes in exports", () => {
  it("defaults footnotesRestartPerChapter to false and normalizes booleans", () => {
    expect(defaultPublishOptions().footnotesRestartPerChapter).toBe(false);
    expect(normalizePublishOptions({ footnotesRestartPerChapter: true }).footnotesRestartPerChapter).toBe(true);
    expect(normalizePublishOptions({ footnotesRestartPerChapter: "yes" }).footnotesRestartPerChapter).toBe(false);
  });

  it("exports real Word footnotes in DOCX", async () => {
    const payload = await exportDocx(twoFootnoteBook(), defaultPublishOptions());
    const archive = unzipSync(new Uint8Array(await payload.blob.arrayBuffer()));
    const documentXml = strFromU8(archive["word/document.xml"]);
    const footnotesXml = strFromU8(archive["word/footnotes.xml"]);

    expect(documentXml).toContain('<w:footnoteReference w:id="1"/>');
    expect(documentXml).toContain('<w:footnoteReference w:id="2"/>');
    expect(footnotesXml).toContain('<w:footnote w:id="1">');
    expect(footnotesXml).toContain('<w:footnote w:id="2">');
    expect(footnotesXml).toContain("italic note");
    expect(footnotesXml).toContain("emphasized");
    expect(footnotesXml).toContain("<w:i/>");
  });

  it("restarts DOCX section footnote numbering when footnotesRestartPerChapter is true", async () => {
    const options = { ...defaultPublishOptions(), footnotesRestartPerChapter: true };
    const payload = await exportDocx(twoChapterBook(), options);
    const archive = unzipSync(new Uint8Array(await payload.blob.arrayBuffer()));
    const documentXml = strFromU8(archive["word/document.xml"]);
    const footnotesXml = strFromU8(archive["word/footnotes.xml"]);

    expect(documentXml).toContain('<w:numRestart w:val="eachSect"/>');
    expect(documentXml).toContain('<w:footnoteReference w:id="3"/>');
    expect(footnotesXml).toContain("Chapter two");
  });

  it("exports EPUB 3 noterefs and aside footnotes per chapter and allows them in xhtml.ts", async () => {
    const xhtml = htmlToXhtml(
      '<p>Word<a epub:type="noteref" href="#fn-1"><sup>1</sup></a></p>'
      + '<aside epub:type="footnote" id="fn-1"><p>Note <em>italic</em></p></aside>'
    );
    expect(xhtml).toContain('<a epub:type="noteref" href="#fn-1"><sup>1</sup></a>');
    expect(xhtml).toContain('<aside id="fn-1" epub:type="footnote"><p>Note <em>italic</em></p></aside>');

    const payload = await exportEpub(twoFootnoteBook(), defaultPublishOptions());
    const archive = unzipSync(new Uint8Array(await payload.blob.arrayBuffer()));
    const chapter1 = strFromU8(archive["OEBPS/text/chapter-1.xhtml"]);

    expect(chapter1).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
    expect(chapter1).toContain('<a epub:type="noteref" href="#fn-1" id="fnref-1" class="footnote-ref"><sup>1</sup></a>');
    expect(chapter1).toContain('<a epub:type="noteref" href="#fn-2" id="fnref-2" class="footnote-ref"><sup>2</sup></a>');
    expect(chapter1).toContain('<aside epub:type="footnote" id="fn-1" class="footnote">');
    expect(chapter1).toContain('<aside epub:type="footnote" id="fn-2" class="footnote">');
    expect(chapter1).toContain("<em>italic note</em>");
    expect(chapter1).toContain("<i>emphasized</i>");
    expect(chapter1).toContain('href="#fnref-1"');
    expect(chapter1).toContain('href="#fnref-2"');

    const parsed = new DOMParser().parseFromString(chapter1, "application/xhtml+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
  });

  it("exports EPUB footnotes continuously by default and restarts per chapter when enabled", async () => {
    const continuous = await exportEpub(twoChapterBook(), defaultPublishOptions());
    const contArchive = unzipSync(new Uint8Array(await continuous.blob.arrayBuffer()));
    const contCh2 = strFromU8(contArchive["OEBPS/text/chapter-2.xhtml"]);
    expect(contCh2).toContain('<a epub:type="noteref" href="#fn-3" id="fnref-3" class="footnote-ref"><sup>3</sup></a>');
    expect(contCh2).toContain('<aside epub:type="footnote" id="fn-3" class="footnote">');

    const restarted = await exportEpub(twoChapterBook(), {
      ...defaultPublishOptions(),
      footnotesRestartPerChapter: true
    });
    const restArchive = unzipSync(new Uint8Array(await restarted.blob.arrayBuffer()));
    const restCh2 = strFromU8(restArchive["OEBPS/text/chapter-2.xhtml"]);
    expect(restCh2).toContain('<a epub:type="noteref" href="#fn-1" id="fnref-1" class="footnote-ref"><sup>1</sup></a>');
    expect(restCh2).toContain('<aside epub:type="footnote" id="fn-1" class="footnote">');
  });

  it("exports HTML endnotes with backlinks and continuous or per-chapter numbering", async () => {
    const payload = exportHtml(twoFootnoteBook(), defaultPublishOptions());
    const html = await payload.blob.text();

    expect(html).toContain('<sup class="footnote-ref" id="fnref-1"><a href="#fn-1">1</a></sup>');
    expect(html).toContain('<sup class="footnote-ref" id="fnref-2"><a href="#fn-2">2</a></sup>');
    expect(html).toContain('<section class="footnotes" aria-label="Footnotes">');
    expect(html).toContain('<li id="fn-1" value="1">First <em>italic note</em> here. <a href="#fnref-1"');
    expect(html).toContain('<li id="fn-2" value="2">Second <i>emphasized</i> detail. <a href="#fnref-2"');
    expect(html).toContain("↩</a></li>");

    const continuous = await exportHtml(twoChapterBook(), defaultPublishOptions()).blob.text();
    expect(continuous).toContain('<li id="fn-3" value="3">Chapter two <em>note</em>.');

    const restarted = await exportHtml(twoChapterBook(), {
      ...defaultPublishOptions(),
      footnotesRestartPerChapter: true
    }).blob.text();
    expect(restarted).toContain('<li id="fn-ch1-1" value="1">Chapter one <em>first</em>.');
    expect(restarted).toContain('<li id="fn-ch2-1" value="1">Chapter two <em>note</em>.');
  });

  it("exports standard [^n] footnotes in Markdown", async () => {
    const md = await exportMarkdown(twoFootnoteBook(), defaultPublishOptions()).blob.text();
    expect(md).toContain("First claim[^1] and second claim[^2].");
    expect(md).toContain("[^1]: First _italic note_ here.");
    expect(md).toContain("[^2]: Second _emphasized_ detail.");

    const continuous = await exportMarkdown(twoChapterBook(), defaultPublishOptions()).blob.text();
    expect(continuous).toContain("Gamma[^3].");
    expect(continuous).toContain("[^3]: Chapter two _note_.");

    const restarted = await exportMarkdown(twoChapterBook(), {
      ...defaultPublishOptions(),
      footnotesRestartPerChapter: true
    }).blob.text();
    expect(restarted).toContain("Alpha[^1-1] beta[^1-2].");
    expect(restarted).toContain("Gamma[^2-1].");
    expect(restarted).toContain("[^2-1]: Chapter two _note_.");
  });

  it("exports bracketed [n] endnotes in plain text", async () => {
    const txt = await exportText(twoFootnoteBook(), defaultPublishOptions()).blob.text();
    expect(txt).toContain("First claim[1] and second claim[2].");
    expect(txt).toContain("NOTES\n[1] First italic note here.\n[2] Second emphasized detail.");

    const continuous = await exportText(twoChapterBook(), defaultPublishOptions()).blob.text();
    expect(continuous).toContain("Gamma[3].");
    expect(continuous).toContain("[3] Chapter two note.");

    const restarted = await exportText(twoChapterBook(), {
      ...defaultPublishOptions(),
      footnotesRestartPerChapter: true
    }).blob.text();
    expect(restarted).toContain("Gamma[1].");
    expect(restarted).toContain("NOTES\n[1] Chapter two note.");
  });

  it("exports chapter endnotes in PDF", { timeout: 30_000 }, async () => {
    const payload = await exportPdf(twoFootnoteBook(), defaultPublishOptions());
    const bytes = new Uint8Array(await payload.blob.arrayBuffer());
    const text = await extractPdfText(bytes);

    expect(text).toContain("Notes");
    expect(text).toContain("1. First italic note here.");
    expect(text).toContain("2. Second emphasized detail.");

    const restarted = await exportPdf(twoChapterBook(), {
      ...defaultPublishOptions(),
      footnotesRestartPerChapter: true
    });
    const restartedText = await extractPdfText(new Uint8Array(await restarted.blob.arrayBuffer()));
    expect(restartedText).toContain("1. Chapter one first.");
    expect(restartedText).toContain("1. Chapter two note.");
  });
});
