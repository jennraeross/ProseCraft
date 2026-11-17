import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "./fountain";
import { SCREENPLAY_PDF, buildScreenplayPdf, screenplayLines } from "./pdf";

const action = (text: string): ScreenplayElement => ({ type: "action", text });

function pdfText(script: Uint8Array): string {
  return new TextDecoder("latin1").decode(script);
}

function pageCount(script: Uint8Array): number {
  return pdfText(script).match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

function paragraphs(count: number): ScreenplayElement[] {
  return Array.from({ length: count }, (_, index) => action(`Beat ${index + 1}.`));
}

describe("screenplay PDF", () => {
  it("returns PDF bytes", () => {
    const script = buildScreenplayPdf({
      title: "The Last Lighthouse",
      author: "Sascha",
      elements: [action("A door opens.")]
    });
    expect(script).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder("latin1").decode(script.slice(0, 5))).toBe("%PDF-");
  });

  it("prints a title page and 55-line pages", () => {
    const onePage = buildScreenplayPdf({ title: "The Last Lighthouse", author: "", elements: paragraphs(27) });
    expect(pageCount(onePage)).toBe(2);
    const twoPages = buildScreenplayPdf({ title: "The Last Lighthouse", author: "", elements: paragraphs(29) });
    expect(pageCount(twoPages)).toBe(3);
  });

  it("wraps long dialogue inside the dialogue column", () => {
    const lines = screenplayLines([
      { type: "character", text: "MARA" },
      { type: "dialogue", text: "The light went dark twenty years ago and nobody in this town has slept well since.".repeat(2) }
    ]);
    const dialogue = lines.filter((line) => line.x === SCREENPLAY_PDF.dialogue && line.text !== "");
    expect(dialogue.length).toBeGreaterThan(1);
    for (const line of dialogue) expect(line.text.length).toBeLessThanOrEqual(33);
  });

  it("places cues, parentheticals and transitions in their columns", () => {
    const lines = screenplayLines([
      { type: "scene-heading", text: "Ext. Lighthouse - night" },
      { type: "character", text: "Mara" },
      { type: "parenthetical", text: "(quietly)" },
      { type: "dialogue", text: "Is anyone there?" },
      { type: "transition", text: "Cut to:" }
    ]);
    expect(lines[0]).toMatchObject({
      text: "EXT. LIGHTHOUSE - NIGHT",
      x: SCREENPLAY_PDF.leftMargin,
      bold: true
    });
    expect(lines.find((line) => line.text === "MARA")?.x).toBeCloseTo(3.7 * 72);
    expect(lines.find((line) => line.text === "(quietly)")?.x).toBeCloseTo(3.1 * 72);
    expect(lines.find((line) => line.text === "Is anyone there?")?.x).toBeCloseTo(2.5 * 72);
    expect(lines.find((line) => line.text === "CUT TO:")).toMatchObject({ x: 7.5 * 72, align: "right" });
  });
});
