export type PdfFontKey = "times" | "helvetica" | "courier";

export type PdfFontVariant = "normal" | "bold" | "italic" | "bolditalic";

export type PdfFontFiles = Record<PdfFontVariant, string>;

/**
 * Embedded families for the three PDF font choices. They are metrically
 * compatible with Times New Roman, Arial and Courier New, so Latin pages keep
 * the layout the standard PDF fonts produced, while extended Latin, Greek and
 * Cyrillic are encoded from a real Unicode font.
 *
 * Each family is a separate lazily imported chunk; exporting a serif book does
 * not download the sans or mono files.
 */
export const PDF_FONT_FAMILIES: Record<PdfFontKey, string> = {
  times: "ProseSerif",
  helvetica: "ProseSans",
  courier: "ProseMono"
};

export function loadPrimaryFontFiles(key: PdfFontKey): Promise<PdfFontFiles> {
  switch (key) {
    case "times":
      return import("./fonts-serif").then((module) => module.SERIF_FONT_FILES);
    case "helvetica":
      return import("./fonts-sans").then((module) => module.SANS_FONT_FILES);
    case "courier":
      return import("./fonts-mono").then((module) => module.MONO_FONT_FILES);
  }
}

/**
 * CJK fallbacks are large, so they are only fetched when a book actually
 * contains characters the primary family cannot encode.
 */
export function loadCjkScFont(): Promise<{ default: string }> {
  return import("./fonts/NotoSansSC-CJK.ttf?font-data");
}

export function loadCjkKrFont(): Promise<{ default: string }> {
  return import("./fonts/NotoSansKR-Hangul.ttf?font-data");
}
