import { unzlibSync } from "fflate";
import type { jsPDF } from "jspdf";
import {
  PDF_FONT_FAMILIES,
  loadCjkKrFont,
  loadCjkScFont,
  loadPrimaryFontFiles,
  type PdfFontKey,
  type PdfFontVariant
} from "./pdf-font-data";

export type TextSegment = {
  text: string;
  family: string;
  variant: PdfFontVariant;
};

export type PdfFontSet = {
  primaryFamily: string;
  /** Splits text wherever the primary family cannot encode a character. */
  segment(text: string, variant: PdfFontVariant): TextSegment[];
  /** Width in points, using the same metrics the renderer will use. */
  width(segment: TextSegment, size: number): number;
};

export type FontEntry = {
  family: string;
  variant: PdfFontVariant;
  coverage: Map<number, boolean>;
  metadata: {
    characterToGlyph?: (codePoint: number) => number;
  };
};

const FONT_VARIANTS: PdfFontVariant[] = ["normal", "bold", "italic", "bolditalic"];

const HANGUL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x11ff],
  [0x3130, 0x318f],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xd7b0, 0xd7ff]
];

const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x2e80, 0x2eff],
  [0x2f00, 0x2fdf],
  [0x3000, 0x303f],
  [0x3040, 0x30ff],
  [0x3100, 0x312f],
  [0x31c0, 0x31ff],
  [0x3200, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe1f],
  [0xfe30, 0xfe4f],
  [0xff01, 0xff9f],
  [0xffe0, 0xffe6]
];

function inRanges(codePoint: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  for (const [start, end] of ranges) {
    if (codePoint >= start && codePoint <= end) return true;
  }
  return false;
}

function isHangul(codePoint: number): boolean {
  return inRanges(codePoint, HANGUL_RANGES);
}

function isCjk(codePoint: number): boolean {
  return inRanges(codePoint, CJK_RANGES);
}

function binaryString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return chunks.join("");
}

const binaryFontCache = new Map<string, string>();

/** Decompresses a bundled font once per family and weight. */
function binaryFont(cacheKey: string, data: string): string {
  const cached = binaryFontCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const binary = binaryString(unzlibSync(decodeBase64(data)));
  binaryFontCache.set(cacheKey, binary);
  return binary;
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function registerFont(
  doc: jsPDF,
  family: string,
  variant: PdfFontVariant,
  data: string
): FontEntry {
  const name = `${family}-${variant}`;
  doc.addFileToVFS(name, binaryFont(name, data));
  doc.addFont(name, family, variant);
  const font = (doc.getFont as unknown as (
    name: string,
    style: string
  ) => { metadata?: FontEntry["metadata"] } | undefined)(family, variant);
  return {
    family,
    variant,
    coverage: new Map(),
    metadata: font?.metadata ?? {}
  };
}

function hasGlyph(entry: FontEntry, codePoint: number): boolean {
  if (codePoint > 0xffff) return false;
  const cached = entry.coverage.get(codePoint);
  if (cached !== undefined) return cached;
  const glyph = typeof entry.metadata.characterToGlyph === "function"
    ? entry.metadata.characterToGlyph(codePoint)
    : 0;
  const present = glyph !== 0;
  entry.coverage.set(codePoint, present);
  return present;
}

/** True when jsPDF gave us the font's glyph table, so coverage can be asked for. */
function coversByName(entry: FontEntry): boolean {
  return typeof entry.metadata.characterToGlyph === "function";
}

/**
 * The bundled fallback for one character, or `undefined` when neither has it.
 * A font that can show the glyph wins. When no bundled font has a glyph table
 * (a jsPDF change), the family bundled for the character's script is used
 * instead: the primary family would draw a missing-glyph box, which is worse.
 */
export function chooseFallback(
  codePoint: number,
  sc: FontEntry | undefined,
  kr: FontEntry | undefined
): FontEntry | undefined {
  const ordered = isHangul(codePoint) ? [kr, sc] : [sc, kr];
  for (const entry of ordered) {
    if (entry && coversByName(entry) && hasGlyph(entry, codePoint)) return entry;
  }
  for (const entry of ordered) {
    if (entry && !coversByName(entry)) return entry;
  }
  return undefined;
}

/**
 * Registers the primary family and, when the book needs them, the CJK
 * fallbacks. A book with only Latin, Greek or Cyrillic text never downloads or
 * parses the large CJK fonts.
 */
export async function createPdfFontSet(
  doc: jsPDF,
  key: PdfFontKey,
  texts: Iterable<string>
): Promise<PdfFontSet> {
  const primaryFamily = PDF_FONT_FAMILIES[key];
  const files = await loadPrimaryFontFiles(key);
  const variants = {} as Record<PdfFontVariant, FontEntry>;
  for (const variant of FONT_VARIANTS) {
    variants[variant] = registerFont(doc, primaryFamily, variant, files[variant]);
  }

  let needSc = false;
  let needKr = false;
  outer: for (const text of texts) {
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined || codePoint < 0x80) continue;
      if (hasGlyph(variants.normal, codePoint)) continue;
      if (isHangul(codePoint)) needKr = true;
      else if (isCjk(codePoint)) needSc = true;
      if (needSc && needKr) break outer;
    }
  }

  let sc: FontEntry | undefined;
  let kr: FontEntry | undefined;
  if (needSc) {
    const { default: scData } = await loadCjkScFont();
    sc = registerFont(doc, "ProseCjkSC", "normal", scData);
  }
  if (needKr) {
    const { default: krData } = await loadCjkKrFont();
    kr = registerFont(doc, "ProseCjkKR", "normal", krData);
  }

  const segment = (text: string, variant: PdfFontVariant): TextSegment[] => {
    const segments: TextSegment[] = [];
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      let family = primaryFamily;
      let segmentVariant: PdfFontVariant = variant;
      if (codePoint !== undefined && codePoint >= 0x80 && !hasGlyph(variants[variant], codePoint)) {
        const fallback = chooseFallback(codePoint, sc, kr);
        if (fallback) {
          family = fallback.family;
          segmentVariant = "normal";
        }
      }
      const last = segments[segments.length - 1];
      if (last && last.family === family && last.variant === segmentVariant) {
        last.text += character;
      } else {
        segments.push({ text: character, family, variant: segmentVariant });
      }
    }
    return segments;
  };

  return {
    primaryFamily,
    segment,
    width(segmentToMeasure, size) {
      doc.setFont(segmentToMeasure.family, segmentToMeasure.variant);
      doc.setFontSize(size);
      return doc.getTextWidth(segmentToMeasure.text);
    }
  };
}
