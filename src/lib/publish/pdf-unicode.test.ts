import { describe, expect, it } from "vitest";
import { compileBook } from "./compile";
import { exportPdf } from "./pdf";
import { extractPdfText } from "./pdf-text";
import { defaultPublishOptions, type CompiledBook } from "./types";

function unicodeBook(): CompiledBook {
  return compileBook({
    title: "Łódź i Привет",
    author: "Test Author",
    subtitle: "",
    copyright: "",
    dedication: "",
    frontMatter: [],
    backMatter: [],
    chapters: [{ id: "ch-1", title: "Ελληνικά", expanded: true }],
    documents: [
      {
        id: "doc-1",
        title: "Opening",
        chapterId: "ch-1",
        content: [
          "<p>He said “yes” — then left. It’s fine… €5</p>",
          "<p>Łódź is a city.</p>",
          "<p>Žluťoučký kůň</p>",
          "<p>Καλημέρα κόσμε</p>",
          "<p>Привет, мир</p>",
          "<p><em>Łódź</em> and <strong>Žluťoučký</strong></p>",
          "<p>日本語の本</p>",
          "<p>中文书籍</p>",
          "<p>한국어 책</p>"
        ].join(""),
        footnotes: []
      }
    ]
  });
}

describe("PDF export with Unicode text", () => {
  it("encodes extended Latin, Greek, Cyrillic and CJK as readable text", { timeout: 60_000 }, async () => {
    const payload = await exportPdf(unicodeBook(), defaultPublishOptions());
    const text = await extractPdfText(new Uint8Array(await payload.blob.arrayBuffer()));

    for (const phrase of [
      "Łódź is a city.",
      "Žluťoučký kůň",
      "Καλημέρα κόσμε",
      "Привет, мир",
      "日本語の本",
      "中文书籍",
      "한국어 책"
    ]) {
      expect(text).toContain(phrase);
    }

    // The title page and chapter heading go through separate layout paths.
    expect(text).toContain("Łódź i Привет");
    expect(text).toContain("ΕΛΛΗΝΙΚΆ");
  });
});
