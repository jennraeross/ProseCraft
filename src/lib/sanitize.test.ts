import { describe, expect, it } from "vitest";
import { sanitizeHtml, sanitizeInlineHtml } from "./sanitize";

const SRC = "data:image/png;base64,AA==";

describe("sanitizeHtml image layout", () => {
  it("keeps layout attributes with validated values", () => {
    expect(sanitizeHtml(
      `<img src="${SRC}" alt="Chart" data-size="small" data-align="right" data-wrap="wrap-left">`
    )).toBe(`<img src="${SRC}" alt="Chart" data-size="small" data-align="right" data-wrap="wrap-left">`);
  });

  it("keeps a custom size and clamps its width", () => {
    expect(sanitizeHtml(`<img src="${SRC}" data-size="custom" data-width="5">`))
      .toBe(`<img src="${SRC}" alt="" data-size="custom" data-width="10">`);
    expect(sanitizeHtml(`<img src="${SRC}" data-size="custom" data-width="140">`))
      .toBe(`<img src="${SRC}" alt="" data-size="custom" data-width="100">`);
  });

  it("drops hostile layout values", () => {
    const html = sanitizeHtml(
      `<img src="${SRC}" alt="Chart" data-size="x;background:url(https://evil.test/a.png)"`
      + ` data-width="60%);background:url(https://evil.test/a.png)"`
      + ` data-align="center;position:fixed" data-wrap="wrap-left;top:0">`
    );
    expect(html).toBe(`<img src="${SRC}" alt="Chart">`);
  });

  it("drops other data attributes, handlers, and styles", () => {
    const html = sanitizeHtml(
      `<img src="${SRC}" alt="Chart" data-inline="true" data-foo="bar"`
      + ` onerror="alert(1)" onclick="alert(1)" style="position:fixed;top:0">`
    );
    expect(html).toBe(`<img src="${SRC}" alt="Chart">`);
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("style=");
  });

  it("keeps valid pixel sizes next to the layout", () => {
    expect(sanitizeHtml(`<img src="${SRC}" alt="" width="320" height="200" data-size="medium">`))
      .toBe(`<img src="${SRC}" alt="" width="320" height="200" data-size="medium">`);
  });
});

describe("sanitizeHtml footnotes", () => {
  it("keeps valid footnote markers empty and non-editable", () => {
    expect(sanitizeHtml(
      `<p>Text<sup class="footnote-ref extra" data-footnote-id="fn-k3x9" data-num="4" contenteditable="true" onclick="alert(1)" style="color:red">4<b>bad</b></sup>.</p>`
    )).toBe(`<p>Text<sup class="footnote-ref" data-footnote-id="fn-k3x9" contenteditable="false"></sup>.</p>`);
  });

  it("drops footnote markers with missing or invalid ids", () => {
    expect(sanitizeHtml(`<p>A<sup class="footnote-ref">1</sup>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<sup class="footnote-ref" data-footnote-id="bad id!">1</sup>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<sup class="footnote-ref" data-footnote-id="${"a".repeat(33)}">1</sup>B</p>`)).toBe(`<p>AB</p>`);
  });

  it("unwraps ordinary sup tags without the footnote-ref class", () => {
    expect(sanitizeHtml(`<p>x<sup>2</sup></p>`)).toBe(`<p>x2</p>`);
  });
});

describe("sanitizeHtml citations", () => {
  it("keeps valid cite-ref markers empty, non-editable, and stripped of hostile attributes", () => {
    const clean = sanitizeHtml(
      `<p>Claim<span class="cite-ref extra" data-cites='[{"id":"key","locator":"42","label":"page","prefix":"see ","suffix":"","suppressAuthor":false}]' data-label="(see Key, p. 42)" contenteditable="true" onclick="alert(1)" style="color:red">stale<b>bad</b></span>.</p>`
    );
    expect(clean).toBe(
      `<p>Claim<span class="cite-ref" data-cites="[{&quot;id&quot;:&quot;key&quot;,&quot;locator&quot;:&quot;42&quot;,&quot;label&quot;:&quot;page&quot;,&quot;prefix&quot;:&quot;see &quot;}]" contenteditable="false"></span>.</p>`
    );
  });

  it("drops hostile, malformed, or oversized data-cites values", () => {
    expect(sanitizeHtml(`<p>A<span class="cite-ref">stale</span>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<span class="cite-ref" data-cites="{bad">stale</span>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<span class="cite-ref" data-cites="[]">stale</span>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<span class="cite-ref" data-cites='[{"id":"bad id!"}]'>stale</span>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<span class="cite-ref" data-cites='[{"id":"key","extra":"<script>"}]'>stale</span>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<span class="cite-ref" data-cites='[{"id":"key","label":"evil"}]'>stale</span>B</p>`)).toBe(`<p>AB</p>`);
    expect(sanitizeHtml(`<p>A<span class="cite-ref" data-cites='[{"id":"key","prefix":"${"x".repeat(201)}"}]'>stale</span>B</p>`)).toBe(`<p>AB</p>`);
  });

  it("unwraps ordinary span tags without the cite-ref class", () => {
    expect(sanitizeHtml(`<p><span>plain</span></p>`)).toBe(`<p>plain</p>`);
  });
});

describe("sanitizeInlineHtml", () => {
  it("allows inline formatting, links, line breaks, and valid cite-ref markers", () => {
    const html = `See <b>bold</b>, <strong>strong</strong>, <i>italic</i>, <em>em</em>, `
      + `<u>under</u>, <del>strike</del>, <code>code</code>, <a href="https://example.test" onclick="x()">link</a>`
      + `<span class="cite-ref" data-cites='[{"id":"key","locator":"42","label":"page"}]' contenteditable="true">bad</span><br>next.`;
    expect(sanitizeInlineHtml(html)).toBe(
      `See <b>bold</b>, <strong>strong</strong>, <i>italic</i>, <em>em</em>, `
      + `<u>under</u>, <s>strike</s>, <code>code</code>, <a href="https://example.test">link</a>`
      + `<span class="cite-ref" data-cites="[{&quot;id&quot;:&quot;key&quot;,&quot;locator&quot;:&quot;42&quot;,&quot;label&quot;:&quot;page&quot;}]" contenteditable="false"></span><br>next.`
    );
  });

  it("blocks headings, images, tables, scene breaks, nested footnote markers, and hostile citations", () => {
    const hostile = `<h1>Heading</h1>`
      + `<img src="${SRC}" alt="pic">`
      + `<table><tbody><tr><td>Cell</td></tr></tbody></table>`
      + `<div class="scene-break">* * *</div>`
      + `<div class="math-block" data-tex="x^2"></div>`
      + `<sup class="footnote-ref" data-footnote-id="fn-1">1</sup>`
      + `<span class="cite-ref" data-cites='[{"id":"key","evil":1}]'>dropped</span>`
      + `<a href="javascript:alert(1)">bad</a>`;
    expect(sanitizeInlineHtml(hostile)).toBe(`HeadingCell<a>bad</a>`);
  });
});

describe("sanitizeHtml screenplay markers", () => {
  it("keeps known element types on paragraphs", () => {
    expect(sanitizeHtml('<p data-sp="dialogue">Hello</p>')).toBe('<p data-sp="dialogue">Hello</p>');
    expect(sanitizeHtml('<p data-sp="scene-heading">INT. ROOM - DAY</p>'))
      .toBe('<p data-sp="scene-heading">INT. ROOM - DAY</p>');
  });

  it("drops unknown markers and markers outside paragraphs", () => {
    expect(sanitizeHtml('<p data-sp="dialogue;position:fixed">Hello</p>')).toBe("<p>Hello</p>");
    expect(sanitizeHtml('<p data-sp="">Hello</p>')).toBe("<p>Hello</p>");
    expect(sanitizeHtml('<div data-sp="action">Hello</div>')).toBe("<div>Hello</div>");
  });
});
