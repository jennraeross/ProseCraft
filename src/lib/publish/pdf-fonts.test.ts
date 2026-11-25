import { describe, expect, it } from "vitest";
import { chooseFallback, type FontEntry } from "./pdf-fonts";

/** A font entry with a glyph table holding `glyphs`, or none at all. */
function font(family: string, glyphs?: readonly number[]): FontEntry {
  return {
    family,
    variant: "normal",
    coverage: new Map(),
    metadata: glyphs
      ? { characterToGlyph: (codePoint: number) => (glyphs.includes(codePoint) ? 7 : 0) }
      : {}
  };
}

const HAN = 0x4e2d; // 中
const HANGUL = 0xd55c; // 한

describe("chooseFallback", () => {
  it("prefers the family bundled for the script", () => {
    const sc = font("ProseCjkSC", [HAN, HANGUL]);
    const kr = font("ProseCjkKR", [HAN, HANGUL]);
    expect(chooseFallback(HAN, sc, kr)).toBe(sc);
    expect(chooseFallback(HANGUL, sc, kr)).toBe(kr);
  });

  it("takes the other family when only it has the glyph", () => {
    const sc = font("ProseCjkSC", []);
    const kr = font("ProseCjkKR", [HANGUL]);
    expect(chooseFallback(HANGUL, sc, kr)).toBe(kr);
    const onlySc = font("ProseCjkSC", [HAN]);
    const emptyKr = font("ProseCjkKR", []);
    expect(chooseFallback(HAN, onlySc, emptyKr)).toBe(onlySc);
  });

  it("returns nothing when neither family has the glyph", () => {
    expect(chooseFallback(HAN, font("ProseCjkSC", []), font("ProseCjkKR", []))).toBeUndefined();
    expect(chooseFallback(HAN, undefined, undefined)).toBeUndefined();
  });

  it("falls back by script when jsPDF gives no glyph table", () => {
    // A jsPDF upgrade that drops `metadata` must not turn CJK into tofu.
    const sc = font("ProseCjkSC");
    const kr = font("ProseCjkKR");
    expect(chooseFallback(HAN, sc, kr)).toBe(sc);
    expect(chooseFallback(HANGUL, sc, kr)).toBe(kr);
    // A family whose coverage is unknown is still better than the primary
    // family drawing a missing-glyph box.
    expect(chooseFallback(HAN, sc, font("ProseCjkKR", []))).toBe(sc);
    expect(chooseFallback(HAN, font("ProseCjkSC", []), font("ProseCjkKR"))).toBeDefined();
  });
});
