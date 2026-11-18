import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize";
import {
  buildChapterHtml,
  chapterSceneIds,
  chapterSectionTargets,
  joinChapterMarkdown,
  sceneBreakHtml,
  sectionIsBlank,
  splitChapterHtml,
  splitChapterMarkdown
} from "./chapter-sections";

describe("sceneBreakHtml", () => {
  it("renders the publish glyph per separator", () => {
    expect(sceneBreakHtml("hash")).toContain("#");
    expect(sceneBreakHtml("asterisks")).toContain("* * *");
    expect(sceneBreakHtml("line")).toContain("scene-break-line");
    expect(sceneBreakHtml("blank")).toContain("scene-break-blank");
    expect(sceneBreakHtml("none")).toContain("scene-break-blank");
  });

  it("is atomic in the editor", () => {
    expect(sceneBreakHtml("hash")).toContain('contenteditable="false"');
  });
});

describe("buildChapterHtml / splitChapterHtml", () => {
  it("round-trips multiple sections", () => {
    const sections = ["<p>One</p>", "<p>Two</p><p>Three</p>", "<h2>Four</h2>"];
    expect(splitChapterHtml(buildChapterHtml(sections, "hash"))).toEqual(sections);
  });

  it("pads empty sections so the caret always has a home", () => {
    const split = splitChapterHtml(buildChapterHtml(["<p>A</p>", "", "<p>C</p>"], "hash"));
    expect(split).toHaveLength(3);
    expect(split[1]).toContain("<br>");
  });

  it("returns a single section when there are no dividers", () => {
    expect(splitChapterHtml("<p>Lonely</p>")).toEqual(["<p>Lonely</p>"]);
  });

  it("drops nested dividers from pastes", () => {
    const split = splitChapterHtml(`<p>A</p><div>${sceneBreakHtml("hash")}</div><div class="scene-break" contenteditable="false">#</div><p>B</p>`);
    expect(split).toHaveLength(2);
  });
});

describe("sectionIsBlank", () => {
  it("detects empty sections", () => {
    expect(sectionIsBlank("")).toBe(true);
    expect(sectionIsBlank("<p><br></p>")).toBe(true);
    expect(sectionIsBlank("<p>  </p>")).toBe(true);
    expect(sectionIsBlank("<p>Hi</p>")).toBe(false);
  });

  it("keeps media-only and widget-only sections", () => {
    expect(sectionIsBlank('<p><img src="x"></p>')).toBe(false);
    expect(sectionIsBlank('<div class="math-block" data-tex="x"></div>')).toBe(false);
  });
});

describe("splitChapterMarkdown / joinChapterMarkdown", () => {
  it("round-trips sections through marker lines", () => {
    const sections = ["# A\n\ntext", "more *text*", ""];
    expect(splitChapterMarkdown(joinChapterMarkdown(sections))).toEqual(sections);
  });

  it("tolerates whitespace around markers", () => {
    expect(splitChapterMarkdown("a\n  <!-- scene-break -->  \nb")).toEqual(["a", "b"]);
  });
});

describe("scene ids on dividers", () => {
  it("names the scene after each divider and reads the ids back", () => {
    const html = buildChapterHtml(["<p>A</p>", "<p>B</p>", "<p>C</p>"], "hash", ["a", "b", "c"]);
    expect(html).toBe(
      '<p>A</p><div class="scene-break" data-scene-id="b" contenteditable="false">#</div><p>B</p>'
      + '<div class="scene-break" data-scene-id="c" contenteditable="false">#</div><p>C</p>'
    );
    expect(chapterSceneIds(html)).toEqual(["", "b", "c"]);
    expect(splitChapterHtml(html)).toEqual(["<p>A</p>", "<p>B</p>", "<p>C</p>"]);
    expect(chapterSceneIds(sanitizeHtml(html))).toEqual(["", "b", "c"]);
    expect(sceneBreakHtml("hash", 'x" onclick="y')).not.toContain("data-scene-id");
  });

  it("sends each section to its own scene when the ids say so", () => {
    // The divider before B deleted: A takes A+B, C keeps C, B is left out.
    expect(chapterSectionTargets(["a", "b", "c"], [], ["", "c"], 2)).toEqual(["a", "c"]);
    // Undoing it brings B back from the trash in its place.
    expect(chapterSectionTargets(["a", "c"], ["b"], ["", "b", "c"], 3)).toEqual(["a", "b", "c"]);
    // A new scene from Enter on an empty paragraph.
    expect(chapterSectionTargets(["a", "n", "b"], [], ["", "n", "b"], 3)).toEqual(["a", "n", "b"]);
  });

  it("falls back to positions when the ids can't say", () => {
    expect(chapterSectionTargets(["a", "b"], [], undefined, 2)).toBeNull();
    expect(chapterSectionTargets(["a", "b"], [], ["", ""], 2)).toBeNull();
    expect(chapterSectionTargets(["a", "b"], [], ["", "zz"], 2)).toBeNull();
    expect(chapterSectionTargets(["a", "b"], [], ["", "b", "b"], 3)).toBeNull();
    expect(chapterSectionTargets(["a", "b"], [], ["", "a"], 2)).toBeNull();
    expect(chapterSectionTargets(["a", "b"], [], ["", "b"], 3)).toBeNull();
  });
});
