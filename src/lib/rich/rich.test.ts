import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeHtml } from "../sanitize";
import { compileBook } from "../publish/compile";
import { htmlToPlainText } from "../publish/content";
import { htmlToMarkdown, markdownToHtml } from "../publish/markdown";
import { editableNeighbor, ensureParagraphsAroundRichBlocks, renderRichWidgets, richClickSide } from "./dom";

const rendered = vi.hoisted(() => ({
  failSource: "" as string,
  calls: [] as Array<{ kind: string; source: string }>
}));

vi.mock("./render", () => ({
  renderRich: vi.fn(async (kind: string, source: string, options: { mode: string }) => {
    rendered.calls.push({ kind, source });
    if (source === rendered.failSource) throw new Error("Bad syntax");
    return {
      kind,
      source,
      alt: `Alt ${source}`,
      width: 20,
      height: 10,
      ...(options.mode === "svg" ? { svg: `<svg data-source="${source}"></svg>` } : { dataUrl: "data:image/png;base64,AA==" })
    };
  })
}));

import { prepareBookRichContent, prepareRichHtml } from "./prepare";
import type { CompiledBook } from "../publish/types";

const INLINE = `<span class="math-inline" data-tex="x^2"></span>`;
const BLOCK = `<div class="math-block" data-tex="\\int_0^1 x\\,dx"></div>`;
const DIAGRAM = `<div class="mermaid-diagram" data-source="graph TD; A-->B"></div>`;
const CALC = `<div class="calc-worksheet" data-source="m := 5 kg\nF := m g ="></div>`;

describe("rich placeholders", () => {
  beforeEach(() => {
    rendered.calls = [];
    rendered.failSource = "";
  });

  it("keeps only the source attributes when sanitizing rendered widgets", () => {
    const html = sanitizeHtml(
      `<p>Before <span class="math-inline" data-tex="a+b" onclick="alert(1)">`
      + `<svg><script>alert(1)</script></svg></span> after.</p>`
      + `<div class="mermaid-diagram" data-source="graph TD; A-->B"><p>stale</p></div>`
    );
    expect(html).toContain('class="math-inline"');
    expect(html).toContain('data-tex="a+b"');
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("onclick");
    expect(html).toContain('data-source="graph TD; A-->B"');
    expect(html).not.toContain("stale");
  });

  it("drops rich placeholders that have no source", () => {
    expect(sanitizeHtml(`<span class="math-inline"></span>`)).toBe("");
  });

  it("round-trips math and Mermaid source through Markdown", () => {
    const markdown = htmlToMarkdown(`<p>Inline ${INLINE} stays.</p>${BLOCK}${DIAGRAM}`);
    expect(markdown).toContain("$x^2$");
    expect(markdown).toContain("$$\n\\int_0^1 x\\,dx\n$$");
    expect(markdown).toContain("```mermaid\ngraph TD; A-->B\n```");

    const html = markdownToHtml(markdown);
    expect(html).toContain('class="math-inline"');
    expect(html).toContain('data-tex="x^2"');
    expect(html).toContain('class="math-block"');
    expect(html).toContain('data-tex="\\int_0^1 x\\,dx"');
    expect(html).toContain('class="mermaid-diagram"');
    expect(html).toContain('data-source="graph TD; A--&gt;B"');
  });

  it("round-trips calculations through Markdown and sanitizing", () => {
    const clean = sanitizeHtml(`<div class="calc-worksheet" data-source="x := 2" style="color:red"><svg></svg></div>`);
    expect(clean).toBe(`<div class="calc-worksheet" data-source="x := 2"></div>`);

    const markdown = htmlToMarkdown(CALC);
    expect(markdown).toBe("```calc\nm := 5 kg\nF := m g =\n```");
    const html = markdownToHtml(markdown);
    expect(html).toContain('class="calc-worksheet"');
    expect(html).toContain("F := m g =");
    expect(markdownToHtml("```mathcad\nx := 1\n```")).toContain('class="calc-worksheet"');
  });

  it("exports evaluated calculations as text and omits them from word counts", () => {
    const html = `<p>Weight:</p>${CALC}`;
    expect(htmlToPlainText(html)).toBe("Weight:\n\nm := 5 kg\nF := m g = 49.033 N");
    expect(htmlToPlainText(html, { rich: "omit" }).trim()).toBe("Weight:");
  });

  it("parses LaTeX-style inline and display delimiters", () => {
    const html = markdownToHtml("A \\(a+b\\) value.\n\n\\[c^2\\]\n");
    expect(html).toContain('class="math-inline"');
    expect(html).toContain('data-tex="a+b"');
    expect(html).toContain('class="math-block"');
    expect(html).toContain('data-tex="c^2"');
  });

  it("shows source in text export and omits it from word counts", () => {
    const html = `<p>See ${INLINE}.</p>${BLOCK}${DIAGRAM}`;
    expect(htmlToPlainText(html)).toContain("$x^2$");
    expect(htmlToPlainText(html)).toContain("\\int_0^1 x\\,dx");
    expect(htmlToPlainText(html)).toContain("[Diagram]");
    const countable = htmlToPlainText(html, { rich: "omit" });
    expect(countable).not.toContain("x^2");
    expect(countable).not.toContain("graph TD");
    expect(countable.trim()).toBe("See .");
  });

  it("keeps scenes that contain only rich content and excludes them from word counts", () => {
    const book = compileBook({
      title: "Book",
      author: "",
      subtitle: "",
      copyright: "",
      dedication: "",
      frontMatter: [],
      backMatter: [],
      chapters: [{ id: "chapter-1", title: "One" } as never],
      documents: [
        {
          id: "scene-1",
          title: "Scene",
          chapterId: "chapter-1",
          content: `<p>${INLINE}</p>${DIAGRAM}`,
          trashed: false,
          space: undefined
        } as never
      ]
    });
    expect(book.scenes).toBe(1);
    expect(book.chapters[0].scenes[0].html).toContain("math-inline");
    expect(book.chapters[0].scenes[0].html).toContain("mermaid-diagram");
    expect(book.words).toBe(0);
  });

  it("prepares every placeholder with the shared renderer", async () => {
    const html = await prepareRichHtml(`<p>${INLINE}</p>${BLOCK}${DIAGRAM}`, { mode: "svg" });
    expect(rendered.calls.map((call) => call.kind)).toEqual([
      "math-inline",
      "math-block",
      "diagram"
    ]);
    expect(html).toContain("rich-rendered");
    expect(html).toContain('aria-label="Alt x^2"');
    expect(html).toContain("<svg");
  });

  it("keeps editor widgets atomic after loading and rendering", async () => {
    const root = document.createElement("div");
    root.innerHTML = INLINE;
    await renderRichWidgets(root, { mode: "svg" });
    expect(root.firstElementChild?.getAttribute("contenteditable")).toBe("false");
  });

  it("keeps a paragraph around block widgets so the caret can reach both sides", () => {
    const root = document.createElement("div");
    root.innerHTML = `${CALC}${DIAGRAM}<p>text</p>${BLOCK}`;
    expect(ensureParagraphsAroundRichBlocks(root)).toBe(true);
    expect(Array.from(root.children, (child) => child.className || child.tagName)).toEqual([
      "P", "calc-worksheet", "P", "mermaid-diagram", "P", "math-block", "P"
    ]);
    expect(ensureParagraphsAroundRichBlocks(root)).toBe(false);

    const inline = document.createElement("div");
    inline.innerHTML = `<p>${INLINE}</p>`;
    expect(ensureParagraphsAroundRichBlocks(inline)).toBe(false);
  });

  it("tells clicks on a widget's rendering from clicks beside it", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p>before</p><div class="calc-worksheet" data-source="x := 1"><svg></svg></div>`;
    const block = root.querySelector<HTMLElement>(".calc-worksheet")!;
    block.querySelector("svg")!.getBoundingClientRect = () =>
      ({ left: 100, right: 200, top: 50, bottom: 90 }) as DOMRect;
    expect(richClickSide(block, 150, 70)).toBe("content");
    expect(richClickSide(block, 400, 70)).toBe("after");
    expect(richClickSide(block, 20, 70)).toBe("before");

    expect(editableNeighbor(block, "before")).toBe(root.firstElementChild);
    const after = editableNeighbor(block, "after");
    expect(after).toBe(root.lastElementChild);
    expect((after as Element).outerHTML).toBe("<p><br></p>");
  });

  it("falls back to readable source when a renderer fails", async () => {
    rendered.failSource = "x^2";
    const html = await prepareRichHtml(`<p>${INLINE}</p>`, { mode: "svg" });
    expect(html).toContain("rich-render-error");
    expect(html).toContain(">x^2</span>");
    expect(html).toContain('title="Bad syntax"');
  });

  it("prepares whole books only when rich content is present", async () => {
    const book = {
      title: "Book",
      chapters: [
        {
          id: "c1",
          label: "One",
          scenes: [{ id: "s1", title: "Scene", html: `<p>${INLINE}</p>`, text: "", words: 0 }]
        }
      ],
      scenes: 1,
      words: 0
    } as unknown as CompiledBook;
    const prepared = await prepareBookRichContent(book, { mode: "png", bodySizePt: 12 });
    expect(prepared.chapters[0].scenes[0].html).toContain('data:image/png;base64');
    expect(prepared.chapters[0].scenes[0].html).not.toContain("<svg");
  });
});
