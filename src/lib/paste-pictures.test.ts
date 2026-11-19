import { describe, expect, it } from "vitest";
import { pastedPictureHtml } from "./paste-pictures";
import { markdownToHtml } from "./publish/markdown";
import { sanitizeHtml } from "./sanitize";

const SRC = "data:image/png;base64,AA==";

describe("pastedPictureHtml", () => {
  it("leaves HTML without pictures to the browser", () => {
    expect(pastedPictureHtml("<b>bold</b> words")).toBeNull();
  });

  it("keeps an embedded picture without the copy's edge breaks", () => {
    expect(pastedPictureHtml(
      `<br class="Apple-interchange-newline"><img src="${SRC}" alt="pic"><br class="Apple-interchange-newline">`
    )).toBe(`<img src="${SRC}" alt="pic">`);
  });

  it("keeps the text of a copied web page and drops its linked pictures", () => {
    expect(pastedPictureHtml(
      `<meta charset="utf-8"><span>Look </span><img src="https://example.test/a.png"><span> here</span>`
    )).toBe("Look  here");
    expect(pastedPictureHtml(`<img src="https://example.test/a.png">`)).toBe("");
  });

  it("unwraps the normal-weight bold wrapper of a Google Docs copy and keeps real bold", () => {
    expect(pastedPictureHtml(
      `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234abcd">`
        + `<p>One <b>bold</b> <span style="font-weight:700">word</span></p><p><img src="${SRC}" alt="pic"></p></b>`
    )).toBe(`<p>One <b>bold</b> word</p><p><img src="${SRC}" alt="pic"></p>`);
    expect(pastedPictureHtml(`<strong style="font-weight: 400">plain</strong><img src="${SRC}">`))
      .toBe(`plain<img src="${SRC}" alt="">`);
  });

  it("drops the text of style, script and similar tags", () => {
    expect(pastedPictureHtml(
      `<style>.x { color: red }</style><img src="${SRC}" alt="pic"><script>x()</script>`
        + `<template><p>t</p></template><noscript>n</noscript><title>x</title>`
    )).toBe(`<img src="${SRC}" alt="pic">`);
  });

  it("leaves the sanitizer alone, so Markdown that names those tags keeps its words", () => {
    expect(sanitizeHtml(markdownToHtml("The <title> element names the page.\n\nSecond paragraph stays.")))
      .toContain("Second paragraph stays.");
    expect(sanitizeHtml(markdownToHtml("She wrote <script> on the board.\n\nNext paragraph.")))
      .toContain("on the board.");
  });
});
