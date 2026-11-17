import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "../sanitize";
import { htmlToMarkdown, markdownToDocument, markdownToHtml } from "./markdown";

const SRC = "data:image/png;base64,AA==";

/** HTML -> Markdown -> HTML -> sanitizer, the path the open layout takes. */
function roundTrip(html: string): string {
  return sanitizeHtml(markdownToHtml(htmlToMarkdown(html)));
}

function image(html: string): HTMLImageElement {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const element = parsed.querySelector("img");
  if (!element) throw new Error(`No image in ${html}`);
  return element;
}

describe("htmlToMarkdown", () => {
  it("leaves the surrounding text conversion unchanged", () => {
    const html = `<h2>Title</h2><p>Body with <em>emphasis</em> and a`
      + ` <a href="https://example.test/a">link</a>.</p>`;

    expect(htmlToMarkdown(html))
      .toBe("## Title\n\nBody with _emphasis_ and a [link](https://example.test/a).");
  });
});

describe("htmlToMarkdown image layout", () => {
  it("keeps a full layout through the Markdown round trip", () => {
    const html = `<p><img src="${SRC}" alt="Chart" data-size="custom" data-width="40"`
      + ` data-align="left" data-wrap="wrap-right"></p>`;
    const markdown = htmlToMarkdown(html);

    expect(markdown).toBe(
      `<img src="${SRC}" alt="Chart" data-size="custom" data-width="40"`
      + ` data-align="left" data-wrap="wrap-right">`
    );
    expect(roundTrip(html)).toBe(markdown);
  });

  it("keeps single layout attributes inside a paragraph", () => {
    const html = `<p>Before <img src="${SRC}" alt="Chart" data-size="medium"> after</p>`;
    expect(htmlToMarkdown(html))
      .toBe(`Before <img src="${SRC}" alt="Chart" data-size="medium"> after`);

    const back = roundTrip(html);
    expect(back).toBe(`<p>Before <img src="${SRC}" alt="Chart" data-size="medium"> after</p>\n`);
    expect(image(back).getAttribute("data-size")).toBe("medium");
  });

  it("turns images without layout into plain Markdown", () => {
    expect(htmlToMarkdown(`<p><img src="${SRC}" alt="Plain"></p>`))
      .toBe(`![Plain](${SRC})`);
    expect(roundTrip(`<p><img src="${SRC}" alt="Plain"></p>`))
      .toBe(`<p><img src="${SRC}" alt="Plain"></p>\n`);
  });

  it("treats default layout values as no layout", () => {
    const html = `<p><img src="${SRC}" alt="Plain" data-size="large" data-align="center"`
      + ` data-wrap="block"></p>`;
    expect(htmlToMarkdown(html)).toBe(`![Plain](${SRC})`);
  });

  it("keeps alt text with quotes, brackets, tags, and ampersands", () => {
    const html = `<p><img src="${SRC}" alt="A &quot;quote&quot; [b] &lt;tag&gt; &amp; more"`
      + ` data-size="small" data-align="right"></p>`;
    const markdown = htmlToMarkdown(html);

    expect(markdown).toBe(
      `<img src="${SRC}" alt="A &quot;quote&quot; [b] &lt;tag&gt; &amp; more"`
      + ` data-size="small" data-align="right">`
    );
    const back = image(roundTrip(html));
    expect(back.getAttribute("src")).toBe(SRC);
    expect(back.getAttribute("alt")).toBe(`A "quote" [b] <tag> & more`);
    expect(back.getAttribute("data-size")).toBe("small");
    expect(back.getAttribute("data-align")).toBe("right");
  });

  it("drops hostile layout values instead of echoing them", () => {
    const html = `<p><img src="${SRC}" alt="Chart"`
      + ` data-size="x;background:url(https://evil.test/a.png)"`
      + ` data-width="60%);background:url(https://evil.test/a.png)"`
      + ` data-align="center;position:fixed" data-wrap="wrap-left;top:0"></p>`;
    const markdown = htmlToMarkdown(html);

    expect(markdown).toBe(`![Chart](${SRC})`);
    expect(roundTrip(html)).not.toContain("evil.test");
  });

  it("escapes alt text that tries to break out of the tag", () => {
    const html = `<p><img src="${SRC}" alt="x&quot; onerror=&quot;alert(1)" data-size="small"></p>`;
    const markdown = htmlToMarkdown(html);

    expect(markdown).toBe(`<img src="${SRC}" alt="x&quot; onerror=&quot;alert(1)" data-size="small">`);
    const back = image(roundTrip(html));
    expect(back.getAttribute("onerror")).toBeNull();
    expect(back.getAttribute("alt")).toBe(`x" onerror="alert(1)`);
  });
});

describe("markdownToHtml image layout", () => {
  it("keeps raw layout images readable by the sanitizer", () => {
    const markdown = `<img src="${SRC}" alt="Chart" data-size="small" data-wrap="wrap-left">`;
    const html = sanitizeHtml(markdownToHtml(markdown));

    const back = image(html);
    expect(back.getAttribute("src")).toBe(SRC);
    expect(back.getAttribute("alt")).toBe("Chart");
    expect(back.getAttribute("data-size")).toBe("small");
    expect(back.getAttribute("data-wrap")).toBe("wrap-left");
  });
});

describe("markdown footnotes round trip", () => {
  it("serializes markers and definitions and parses both back cleanly", () => {
    const html =
      `<p>First <em>claim</em><sup class="footnote-ref" data-footnote-id="fn-1" contenteditable="false"></sup>`
      + ` and second<sup class="footnote-ref" data-footnote-id="fn-2" contenteditable="false"></sup>.</p>`;
    const footnotes = [
      {
        id: "fn-1",
        html: `See <strong>Source</strong>, <u>Ch. 2</u>, <s>old</s>, `
          + `<a href="https://example.test/ref">link</a>, and <code>x</code>.`
      },
      {
        id: "fn-2",
        html: `Line one<br>Line two`
      }
    ];

    const md = htmlToMarkdown(html, footnotes);
    expect(md).toBe(
      `First _claim_[^fn-1] and second[^fn-2].\n\n`
      + `[^fn-1]: See **Source**, <u>Ch. 2</u>, ~~old~~, [link](https://example.test/ref), and \`x\`.\n`
      + `[^fn-2]: Line one  \n    Line two`
    );

    const parsed = markdownToDocument(md);
    expect(sanitizeHtml(parsed.html)).toBe(`${html}\n`);
    expect(parsed.footnotes).toEqual(footnotes);
  });

  it("omits footnote definitions from markdownToHtml body output", () => {
    const md = "Body[^fn-a] text.\n\n[^fn-a]: Hidden from body.";
    const html = sanitizeHtml(markdownToHtml(md));
    expect(html).toBe(
      `<p>Body<sup class="footnote-ref" data-footnote-id="fn-a" contenteditable="false"></sup> text.</p>\n`
    );
  });

  it("keeps literal footnote syntax inside code and sanitizes hostile definition html", () => {
    const md = [
      "Use `[^fn-code]` literally.",
      "",
      "```",
      "[^fn-fence]: not a definition",
      "```",
      "",
      "Real[^fn-1].",
      "",
      `[^fn-1]: Note <img src="data:image/png;base64,AA=="> <a href="javascript:alert(1)">bad</a>`
    ].join("\n");

    const parsed = markdownToDocument(md);
    expect(parsed.html).toContain("<code>[^fn-code]</code>");
    expect(parsed.html).toContain("[^fn-fence]: not a definition");
    expect(parsed.html).toContain(`data-footnote-id="fn-1"`);
    expect(parsed.footnotes).toEqual([{ id: "fn-1", html: "Note  <a>bad</a>" }]);
  });
});
