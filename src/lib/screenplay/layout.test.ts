import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "./fountain";
import {
  SCREENPLAY_PAGE,
  elementsToHtml,
  estimatePages,
  estimateRuntime,
  htmlToElements,
  screenplayStats,
  wrapScreenplayText
} from "./layout";
import { sanitizeHtml } from "../sanitize";

const action = (text = "Something happens."): ScreenplayElement => ({ type: "action", text });
const actions = (count: number, text?: string): ScreenplayElement[] =>
  Array.from({ length: count }, () => action(text));

describe("screenplay HTML mapping", () => {
  it("marks paragraphs with the element type and renders emphasis", () => {
    expect(elementsToHtml([
      { type: "scene-heading", text: "INT. LIGHTHOUSE - NIGHT" },
      { type: "action", text: "The *lamp* turns **red** and _shakes_." },
      { type: "dialogue", text: "***Run*** now." }
    ])).toBe(
      '<p data-sp="scene-heading">INT. LIGHTHOUSE - NIGHT</p>'
      + '<p data-sp="action">The <em>lamp</em> turns <strong>red</strong> and <u>shakes</u>.</p>'
      + '<p data-sp="dialogue"><strong><em>Run</em></strong> now.</p>'
    );
  });

  it("escapes markup that is part of the text", () => {
    expect(elementsToHtml([{ type: "action", text: "a < b & c > d" }]))
      .toBe('<p data-sp="action">a &lt; b &amp; c &gt; d</p>');
  });

  it("round-trips elements, including emphasis", () => {
    const elements: ScreenplayElement[] = [
      { type: "scene-heading", text: "INT. LIGHTHOUSE - NIGHT" },
      { type: "action", text: "The *lamp* turns **red** and _shakes_." },
      { type: "character", text: "MARA" },
      { type: "parenthetical", text: "(quietly)" },
      { type: "dialogue", text: "***Run*** now, or the \"light\" dies." },
      { type: "transition", text: "CUT TO:" },
      { type: "centered", text: "THE END" },
      { type: "page-break", text: "" }
    ];
    expect(htmlToElements(elementsToHtml(elements))).toEqual(elements);
  });

  it("reads unknown paragraphs as action", () => {
    const html = '<p data-sp="scene-heading">INT. ROOM - DAY</p>'
      + '<p data-sp="dialogue">Hi <em>there</em></p>'
      + '<p data-sp="nonsense">Odd</p>'
      + "<div>Bare</div>";
    expect(htmlToElements(html)).toEqual([
      { type: "scene-heading", text: "INT. ROOM - DAY" },
      { type: "dialogue", text: "Hi *there*" },
      { type: "action", text: "Odd" },
      { type: "action", text: "Bare" }
    ]);
  });

  it("survives the sanitizer with its markers and emphasis", () => {
    const elements: ScreenplayElement[] = [
      { type: "scene-heading", text: "INT. ROOM - DAY" },
      { type: "dialogue", text: "A < B & *C*" }
    ];
    const html = elementsToHtml(elements);
    expect(sanitizeHtml(html)).toBe(html);
    expect(htmlToElements(sanitizeHtml(html))).toEqual(elements);
  });
});

describe("screenplay page layout", () => {
  it("uses the industry-standard page and column widths", () => {
    expect(SCREENPLAY_PAGE).toMatchObject({
      fontFamily: "Courier",
      fontSize: 12,
      linesPerPage: 55,
      actionWidth: 60,
      dialogueWidth: 35,
      parentheticalWidth: 25,
      characterIndent: 37,
      transitionAlign: "right"
    });
  });

  it("wraps action, dialogue, and parentheticals at their widths", () => {
    const text = (width: number) => `${"x".repeat(width)} tail`;
    expect(wrapScreenplayText(text(SCREENPLAY_PAGE.actionWidth), SCREENPLAY_PAGE.actionWidth))
      .toEqual(["x".repeat(60), "tail"]);
    expect(wrapScreenplayText(text(SCREENPLAY_PAGE.dialogueWidth), SCREENPLAY_PAGE.dialogueWidth))
      .toEqual(["x".repeat(35), "tail"]);
    expect(wrapScreenplayText(text(SCREENPLAY_PAGE.parentheticalWidth), SCREENPLAY_PAGE.parentheticalWidth))
      .toEqual(["x".repeat(25), "tail"]);
  });

  it("counts a known sample at 55 lines per page", () => {
    // Every action occupies one line plus the blank line that separates it.
    expect(estimatePages(actions(28))).toEqual({ pages: 1, lines: 55, byScene: [] });
    expect(estimatePages(actions(29))).toMatchObject({ pages: 2, lines: 57 });
  });

  it("starts a new page at an explicit page break", () => {
    expect(estimatePages([
      action("One."),
      { type: "page-break", text: "" },
      action("Two.")
    ])).toMatchObject({ pages: 2, lines: 2 });
  });

  it("ignores outline and note elements", () => {
    expect(estimatePages([
      { type: "section", text: "Act One", level: 1 },
      { type: "synopsis", text: "Mara arrives." },
      { type: "note", text: "Check the tide table." },
      action()
    ])).toMatchObject({ pages: 1, lines: 1 });
  });

  it("assigns pages to scenes", () => {
    const estimate = estimatePages([
      { type: "scene-heading", text: "INT. LIGHTHOUSE - NIGHT" },
      ...actions(26),
      { type: "scene-heading", text: "EXT. ROCKS - DAWN" },
      action("Waves break.")
    ]);
    expect(estimate.pages).toBe(2);
    expect(estimate.byScene).toEqual([
      { heading: "INT. LIGHTHOUSE - NIGHT", startPage: 1, pages: 1 },
      { heading: "EXT. ROCKS - DAWN", startPage: 2, pages: 1 }
    ]);
  });

  it("keeps a scene heading off the bottom of a page", () => {
    // The heading would land on line 55 with its scene on the next page.
    const estimate = estimatePages([
      ...actions(27),
      { type: "scene-heading", text: "EXT. ROCKS - DAWN" },
      action("Waves break.")
    ]);
    expect(estimate.byScene[0]).toEqual({
      heading: "EXT. ROCKS - DAWN",
      startPage: 2,
      pages: 1
    });
  });

  it("keeps a character cue off the bottom of a page", () => {
    // Without the rule the cue sits on line 55 and the second page holds one
    // more line, so the script fits in two pages instead of three.
    expect(estimatePages([
      ...actions(27),
      { type: "character", text: "MARA" },
      { type: "dialogue", text: "Hello?" },
      ...actions(27)
    ]).pages).toBe(3);
  });

  it("estimates one minute per page", () => {
    expect(estimateRuntime(0)).toBe(0);
    expect(estimateRuntime(1.4)).toBe(1);
    expect(estimateRuntime(2.5)).toBe(3);
  });
});

const STATS_SAMPLE: ScreenplayElement[] = [
  { type: "scene-heading", text: "INT. LIGHTHOUSE - NIGHT" },
  { type: "action", text: "Waves crash against the rocks." },
  { type: "character", text: "MARA (V.O.)" },
  { type: "parenthetical", text: "(quietly)" },
  { type: "dialogue", text: "Is anyone there?" },
  { type: "character", text: "OLD KEEPER" },
  { type: "dialogue", text: "No one has come for years." },
  { type: "scene-heading", text: "EXT. ROCKS - DAWN" },
  { type: "character", text: "Mara" },
  { type: "dialogue", text: "Then we are alone." },
  { type: "transition", text: "CUT TO:" }
];

describe("screenplayStats", () => {
  it("counts scenes, characters, and dialogue words", () => {
    const stats = screenplayStats(STATS_SAMPLE);
    expect(stats.scenes).toBe(2);
    expect(stats.characters).toEqual([
      { name: "MARA", lines: 2, words: 7 },
      { name: "OLD KEEPER", lines: 1, words: 6 }
    ]);
    expect(stats.dialogue).toEqual({ lines: 3, words: 13 });
    expect(stats.action).toEqual({ lines: 1, words: 5 });
    expect(stats.dialogueRatio).toBeCloseTo(13 / 18);
  });

  it("reads locations from scene headings", () => {
    expect(screenplayStats(STATS_SAMPLE).locations).toEqual([
      { heading: "INT. LIGHTHOUSE - NIGHT", setting: "INT", place: "LIGHTHOUSE", timeOfDay: "NIGHT" },
      { heading: "EXT. ROCKS - DAWN", setting: "EXT", place: "ROCKS", timeOfDay: "DAWN" }
    ]);
    expect(screenplayStats([
      { type: "scene-heading", text: "INT./EXT. CAR - DAY" },
      { type: "scene-heading", text: "MONTAGE" }
    ]).locations).toEqual([
      { heading: "INT./EXT. CAR - DAY", setting: "INT/EXT", place: "CAR", timeOfDay: "DAY" },
      { heading: "MONTAGE", setting: "OTHER", place: "MONTAGE", timeOfDay: "" }
    ]);
  });

  it("is empty for an empty script", () => {
    expect(screenplayStats([])).toEqual({
      scenes: 0,
      characters: [],
      locations: [],
      action: { lines: 0, words: 0 },
      dialogue: { lines: 0, words: 0 },
      dialogueRatio: 0
    });
  });
});
