import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize";

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
