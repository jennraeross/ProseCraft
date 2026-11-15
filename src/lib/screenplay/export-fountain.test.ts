import { describe, expect, it } from "vitest";
import type { CompiledBook, CompiledChapter, CompiledScene } from "../publish/types";
import { bookToFountain, documentToFountain } from "./export-fountain";

const SCRIPT_HTML = [
  '<p data-sp="scene-heading">EXT. LIGHTHOUSE - NIGHT</p>',
  '<p data-sp="action">Waves crash against the rocks.</p>',
  '<p data-sp="character">MARA</p>',
  '<p data-sp="parenthetical">(quietly)</p>',
  '<p data-sp="dialogue">Is anyone there?</p>',
  '<p data-sp="transition">CUT TO:</p>'
].join("");

function scene(id: string, html: string): CompiledScene {
  return { id, sourceId: id, title: id, html, text: "", words: 0 };
}

function chapter(id: string, scenes: CompiledScene[]): CompiledChapter {
  return { id, label: id, title: id, scenes, words: 0 };
}

function book(overrides: Partial<CompiledBook> = {}): CompiledBook {
  return {
    title: "The Last Lighthouse",
    subtitle: "",
    author: "Sascha",
    copyright: "",
    dedication: "",
    frontMatter: [],
    backMatter: [],
    chapters: [],
    words: 0,
    scenes: 0,
    ...overrides
  };
}

describe("documentToFountain", () => {
  it("writes every element type back to Fountain without a title page", () => {
    expect(documentToFountain({ id: "doc", title: "Opening", content: SCRIPT_HTML })).toBe(
      "EXT. LIGHTHOUSE - NIGHT\n"
      + "\n"
      + "Waves crash against the rocks.\n"
      + "\n"
      + "MARA\n"
      + "(quietly)\n"
      + "Is anyone there?\n"
      + "\n"
      + "CUT TO:\n"
    );
  });

  it("treats unmarked paragraphs as action", () => {
    expect(documentToFountain({ id: "doc", title: "Opening", content: "<p>A door opens.</p>" }))
      .toBe("A door opens.\n");
  });
});

describe("bookToFountain", () => {
  it("writes a title page from the project name and author", () => {
    const fountain = bookToFountain(book({ chapters: [chapter("c1", [scene("s1", SCRIPT_HTML)])] }));
    expect(fountain.startsWith(
      "Title: The Last Lighthouse\nCredit: Written by\nAuthor: Sascha\n\n"
    )).toBe(true);
    expect(fountain).toContain("EXT. LIGHTHOUSE - NIGHT");
  });

  it("leaves the credit out when the project has no author", () => {
    const fountain = bookToFountain(book({ author: "  ", chapters: [chapter("c1", [scene("s1", SCRIPT_HTML)])] }));
    expect(fountain.startsWith("Title: The Last Lighthouse\n\n")).toBe(true);
    expect(fountain).not.toContain("Credit:");
  });

  it("joins every document in chapter order", () => {
    const fountain = bookToFountain(book({
      chapters: [
        chapter("c1", [
          scene("s1", '<p data-sp="scene-heading">INT. LIGHTHOUSE - DAY</p>'),
          scene("s2", '<p data-sp="scene-heading">INT. KITCHEN - DAY</p>')
        ]),
        chapter("c2", [scene("s3", '<p data-sp="scene-heading">EXT. CLIFF - NIGHT</p>')])
      ]
    }));
    const first = fountain.indexOf("INT. LIGHTHOUSE - DAY");
    const second = fountain.indexOf("INT. KITCHEN - DAY");
    const third = fountain.indexOf("EXT. CLIFF - NIGHT");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });
});
