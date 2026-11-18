import { describe, expect, it } from "vitest";
import { rtfToHtml } from "./rtf";

describe("rtfToHtml", () => {
  it("converts paragraphs and line breaks", () => {
    expect(rtfToHtml("{\\rtf1\\ansi Hello\\par World\\par}")).toBe(
      "<p>Hello</p><p>World</p>"
    );
    expect(rtfToHtml("{\\rtf1\\ansi first\\line second\\par}")).toBe(
      "<p>first<br>second</p>"
    );
  });

  it("ignores raw CR/LF and reads an escaped line break as a paragraph break", () => {
    // Real Scrivener files write CRLF between the header groups.
    const header =
      "{\\rtf1\\ansi\\ansicpg1252\\deff0\r\n" +
      "{\\fonttbl{\\f0\\fnil Palatino;}}\r\n" +
      "{\\colortbl;\\red0\\green0\\blue0;}\r\n" +
      "\\pard\\plain \\f0\\fs28 Hello\\par}";
    expect(rtfToHtml(header)).toBe("<p>Hello</p>");
    expect(rtfToHtml(new TextEncoder().encode(header))).toBe("<p>Hello</p>");

    expect(rtfToHtml("{\\rtf1\\ansi Hello\r\nWorld\\par}")).toBe("<p>HelloWorld</p>");
    expect(rtfToHtml("{\\rtf1\\ansi Hello\\\nWorld\\par}")).toBe("<p>Hello</p><p>World</p>");
    expect(rtfToHtml("{\\rtf1\\ansi Hello\\\r\nWorld\\par}")).toBe("<p>Hello</p><p>World</p>");

    expect(rtfToHtml("{\\rtf1\\ansi one\\par\r\ntwo\\par}")).toBe("<p>one</p><p>two</p>");
  });

  it("returns an empty paragraph for empty or textless input", () => {
    expect(rtfToHtml("")).toBe("<p><br></p>");
    expect(rtfToHtml("{\\rtf1\\ansi}")).toBe("<p><br></p>");
    expect(rtfToHtml("{\\rtf1\\ansi\\par}")).toBe("<p><br></p>");
  });

  it("decodes Windows-1252 bytes with the declared code page", () => {
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg1252 M\\'e4dchen\\par}")).toBe(
      "<p>M\u00e4dchen</p>"
    );
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg1252 \\'93quoted\\'94\\par}")).toBe(
      "<p>\u201cquoted\u201d</p>"
    );
  });

  it("decodes the Japanese code page", () => {
    // "日本" in Shift_JIS; below, "中文" in GBK and in Big5, "é" in Mac Roman.
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg932 \\'93\\'fa\\'96\\'7b\\par}")).toBe("<p>\u65e5\u672c</p>");
  });

  it("decodes the Simplified Chinese code page", () => {
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg936 \\'d6\\'d0\\'ce\\'c4\\par}")).toBe("<p>\u4e2d\u6587</p>");
  });

  it("decodes the Traditional Chinese code page", () => {
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg950 \\'a4\\'a4\\'a4\\'e5\\par}")).toBe("<p>\u4e2d\u6587</p>");
  });

  it("decodes the Mac Roman code page", () => {
    expect(rtfToHtml("{\\rtf1\\mac\\ansicpg10000 caf\\'8e\\par}")).toBe("<p>caf\u00e9</p>");
  });

  it("keeps \\uN text, \\'hh bytes, tabs and escaped symbols in order", () => {
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg932\\uc0 \\u9731 \\'93\\'fa\\par}")).toBe("<p>\u2603\u65e5</p>");
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg1252 x\\'e9\\tab y\\par}")).toBe("<p>x\u00e9\ty</p>");
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg1252 \\'e9\\{\\par}")).toBe("<p>\u00e9{</p>");
  });

  it("keeps tabs and escaped braces in place in bytes, as scrivener passes them", () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(rtfToHtml(bytes("{\\rtf1\\ansi Name:\\tab Mara\\par}"))).toBe("<p>Name:\tMara</p>");
    expect(rtfToHtml(bytes("{\\rtf1\\ansi a \\{b\\} c\\\\\\par}"))).toBe("<p>a {b} c\\</p>");
  });

  it("decodes \\uNNNN escapes, including negative UTF-16 values", () => {
    expect(rtfToHtml("{\\rtf1\\ansi \\u228?\\par}")).toBe("<p>\u00e4</p>");
    expect(rtfToHtml("{\\rtf1\\ansi \\uc0\\u228?\\par}")).toBe("<p>\u00e4?</p>");
    expect(rtfToHtml("{\\rtf1\\ansi \\u-10179\\u-8704\\par}")).toBe(
      "<p>\ud83d\ude00</p>"
    );
  });

  it("applies nested character styles and resets them", () => {
    // The space after a control word is its delimiter, not text: `\b0 plain`
    // contributes "plain" without a leading space.
    expect(
      rtfToHtml("{\\rtf1\\ansi \\b bold \\i both\\i0 bold\\b0 plain\\par}")
    ).toBe("<p><strong>bold <em>both</em>bold</strong>plain</p>");
    expect(rtfToHtml("{\\rtf1\\ansi \\i \\ul \\strike all\\plain none\\par}")).toBe(
      "<p><em><u><s>all</s></u></em>none</p>"
    );
  });

  it("does not turn a trailing \\par into an empty paragraph", () => {
    expect(rtfToHtml("")).toBe("<p><br></p>");
    expect(rtfToHtml("{\\rtf1\\ansi one\\par two\\par}")).toBe("<p>one</p><p>two</p>");
    expect(rtfToHtml("{\\rtf1\\ansi one\\par\\par}")).toBe("<p>one</p>");
  });

  it("converts \\line to a break and \\tab to a tab", () => {
    expect(rtfToHtml("{\\rtf1\\ansi a\\line b\\par}")).toBe("<p>a<br>b</p>");
    expect(rtfToHtml("{\\rtf1\\ansi a\\tab b\\par}")).toBe("<p>a\tb</p>");
  });

  it("decodes a single \\'hh byte with the declared code page", () => {
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg1252 \\'e4\\par}")).toBe("<p>\u00e4</p>");
    // 0x80 is the euro sign in Windows-1252, not a Latin-1 control character.
    expect(rtfToHtml("{\\rtf1\\ansi\\ansicpg1252 \\'80\\par}")).toBe("<p>\u20ac</p>");
  });

  it("handles control symbols", () => {
    expect(rtfToHtml("{\\rtf1\\ansi a\\tab b\\~c\\_d\\-e\\par}")).toBe(
      "<p>a\tb&nbsp;c&#8209;de</p>"
    );
    expect(rtfToHtml("{\\rtf1\\ansi \\{x\\}\\\\y\\par}")).toBe("<p>{x}\\y</p>");
  });

  it("skips destinations and ignorable groups", () => {
    const rtf =
      "{\\rtf1\\ansi" +
      "{\\fonttbl{\\f0 Arial;}}" +
      "{\\colortbl;\\red0\\green0\\blue0;}" +
      "{\\stylesheet body;}" +
      "{\\info{\\title Hidden}}" +
      "{\\pict\\pngblip 89504e470d0a1a0a}" +
      "{\\header head}" +
      "{\\*\\unknown ignored}" +
      "Visible\\par}";
    expect(rtfToHtml(rtf)).toBe("<p>Visible</p>");
  });

  it("restores formatting at group boundaries", () => {
    expect(rtfToHtml("{\\rtf1\\ansi {\\b bold} plain\\par}")).toBe(
      "<p><strong>bold</strong> plain</p>"
    );
  });

  it("does not throw on malformed groups", () => {
    expect(() => rtfToHtml("{\\rtf1\\ansi broken")).not.toThrow();
    expect(rtfToHtml("{\\rtf1\\ansi broken")).toBe("<p>broken</p>");
    // The bold group is never closed, so the text stays bold up to the end of
    // the paragraph; tags are still closed so the HTML stays well-formed.
    expect(rtfToHtml("{\\rtf1\\ansi \\b bold")).toBe(
      "<p><strong>bold</strong></p>"
    );
    // A stray `}` closes nothing and must not drop the text around it.
    expect(rtfToHtml("{\\rtf1\\ansi a} extra\\par}")).toBe("<p>a extra</p>");
    expect(rtfToHtml("\\rtf1 no groups")).toBe("<p>no groups</p>");
  });

  it("reads the same content from bytes and from a string", () => {
    const rtf = new TextEncoder().encode("{\\rtf1\\ansi Bytes\\par}");
    expect(rtfToHtml(rtf)).toBe("<p>Bytes</p>");
  });
});
