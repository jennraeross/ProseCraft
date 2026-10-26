export type BuiltinStyleId = "manuscript" | "classic" | "modern" | "ebook";

export type StyleFontId =
  | "georgia"
  | "iowan"
  | "times"
  | "literata"
  | "ibm-plex-serif"
  | "ibm-plex-sans"
  | "helvetica"
  | "courier";

export type StyleTrimId =
  | "letter"
  | "a4"
  | "a5"
  | "trade-6x9"
  | "trade-5.5x8.5"
  | "trade-5.25x8"
  | "trade-5x8";

export type StyleFont = {
  id: StyleFontId;
  label: string;
  cssFontFamily: string;
  docxFont: string;
  pdfFont: "times" | "helvetica" | "courier";
};

export type StyleTrim = {
  id: StyleTrimId;
  label: string;
  shortLabel: string;
  widthPt: number;
  heightPt: number;
};

export type PresetTokens = {
  id: string;
  label: string;
  description: string;
  detail: string;
  cssFontFamily: string;
  docxFont: string;
  pdfFont: "times" | "helvetica" | "courier";
  bodySizePt: number;
  lineHeight: number;
  paragraphIndentEm: number;
  paragraphSpacingEm: number;
  justify: boolean;
  chapterHeadingSizePt: number;
  chapterHeadingUppercase: boolean;
  chapterHeadingAlign: "left" | "center";
  chapterHeadingSpaceBefore: number;
  chapterHeadingSpaceAfter: number;
  sceneBreakSpacing: number;
  dropCap: boolean;
  page: {
    widthPt: number;
    heightPt: number;
    marginTopPt: number;
    marginRightPt: number;
    marginBottomPt: number;
    marginLeftPt: number;
  };
  wordsPerPage: number;
  runningHeader: boolean;
  pageNumbers: boolean;
};

/**
 * A project-owned style. The editor stores semantic choices rather than raw
 * CSS so every exporter can map them consistently and generated documents never
 * receive unsanitised style strings.
 */
export type CustomExportStyle = {
  id: string;
  label: string;
  fontId: StyleFontId;
  bodySizePt: number;
  lineHeight: number;
  paragraphIndentEm: number;
  paragraphSpacingEm: number;
  justify: boolean;
  chapterHeadingSizePt: number;
  chapterHeadingUppercase: boolean;
  chapterHeadingAlign: "left" | "center";
  chapterHeadingSpaceBefore: number;
  chapterHeadingSpaceAfter: number;
  sceneBreakSpacing: number;
  dropCap: boolean;
  trimId: StyleTrimId;
  marginTopIn: number;
  marginRightIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
  runningHeader: boolean;
  pageNumbers: boolean;
};

export type StyleSummary = {
  id: string;
  label: string;
  description: string;
  detail: string;
  custom: boolean;
};

type CustomStyleFields = Omit<CustomExportStyle, "id" | "label">;

export const CUSTOM_STYLE_ID_PREFIX = "custom-";
export const CUSTOM_STYLE_LABEL_LIMIT = 60;
export const MAX_CUSTOM_STYLES = 24;

export const STYLE_FONTS: readonly StyleFont[] = [
  {
    id: "georgia",
    label: "Georgia",
    cssFontFamily: "Georgia, 'Times New Roman', serif",
    docxFont: "Georgia",
    pdfFont: "times"
  },
  {
    id: "iowan",
    label: "Iowan Old Style",
    cssFontFamily: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
    docxFont: "Georgia",
    pdfFont: "times"
  },
  {
    id: "times",
    label: "Times New Roman",
    cssFontFamily: "'Times New Roman', Times, serif",
    docxFont: "Times New Roman",
    pdfFont: "times"
  },
  {
    id: "literata",
    label: "Literata",
    cssFontFamily: "'Literata', Georgia, serif",
    docxFont: "Georgia",
    pdfFont: "times"
  },
  {
    id: "ibm-plex-serif",
    label: "IBM Plex Serif",
    cssFontFamily: "'IBM Plex Serif', 'Literata', Georgia, serif",
    docxFont: "Georgia",
    pdfFont: "times"
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    cssFontFamily: "'IBM Plex Sans', Helvetica, Arial, sans-serif",
    docxFont: "Helvetica",
    pdfFont: "helvetica"
  },
  {
    id: "helvetica",
    label: "Helvetica / Arial",
    cssFontFamily: "Helvetica, Arial, sans-serif",
    docxFont: "Helvetica",
    pdfFont: "helvetica"
  },
  {
    id: "courier",
    label: "Courier",
    cssFontFamily: "'Courier New', Courier, monospace",
    docxFont: "Courier New",
    pdfFont: "courier"
  }
];

export const STYLE_TRIMS: readonly StyleTrim[] = [
  {
    id: "letter",
    label: "US Letter (8.5 × 11 in)",
    shortLabel: "US Letter",
    widthPt: 612,
    heightPt: 792
  },
  {
    id: "a4",
    label: "A4 (210 × 297 mm)",
    shortLabel: "A4",
    widthPt: 595.28,
    heightPt: 841.89
  },
  {
    id: "a5",
    label: "A5 (148 × 210 mm)",
    shortLabel: "A5",
    widthPt: 419.53,
    heightPt: 595.28
  },
  {
    id: "trade-6x9",
    label: "6 × 9 in trade",
    shortLabel: "6 × 9 in",
    widthPt: 432,
    heightPt: 648
  },
  {
    id: "trade-5.5x8.5",
    label: "5.5 × 8.5 in digest",
    shortLabel: "5.5 × 8.5 in",
    widthPt: 396,
    heightPt: 612
  },
  {
    id: "trade-5.25x8",
    label: "5.25 × 8 in",
    shortLabel: "5.25 × 8 in",
    widthPt: 378,
    heightPt: 576
  },
  {
    id: "trade-5x8",
    label: "5 × 8 in",
    shortLabel: "5 × 8 in",
    widthPt: 360,
    heightPt: 576
  }
];

export const PRESETS: Record<BuiltinStyleId, PresetTokens> = {
  manuscript: {
    id: "manuscript",
    label: "Manuscript",
    description: "Standard submission format",
    detail: "12 pt · double-spaced · title page · page numbers",
    cssFontFamily: "Georgia, 'Times New Roman', serif",
    docxFont: "Times New Roman",
    pdfFont: "times",
    bodySizePt: 12,
    lineHeight: 2,
    paragraphIndentEm: 2,
    paragraphSpacingEm: 0,
    justify: false,
    chapterHeadingSizePt: 14,
    chapterHeadingUppercase: true,
    chapterHeadingAlign: "center",
    chapterHeadingSpaceBefore: 0,
    chapterHeadingSpaceAfter: 1.5,
    sceneBreakSpacing: 1,
    dropCap: false,
    page: {
      widthPt: 612,
      heightPt: 792,
      marginTopPt: 72,
      marginRightPt: 72,
      marginBottomPt: 72,
      marginLeftPt: 72
    },
    wordsPerPage: 250,
    runningHeader: true,
    pageNumbers: true
  },
  classic: {
    id: "classic",
    label: "Classic novel",
    description: "Traditional book typography",
    detail: "11.5 pt · justified · drop caps · 6 × 9 in",
    cssFontFamily: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
    docxFont: "Georgia",
    pdfFont: "times",
    bodySizePt: 11.5,
    lineHeight: 1.5,
    paragraphIndentEm: 1.5,
    paragraphSpacingEm: 0,
    justify: true,
    chapterHeadingSizePt: 18,
    chapterHeadingUppercase: true,
    chapterHeadingAlign: "center",
    chapterHeadingSpaceBefore: 1.2,
    chapterHeadingSpaceAfter: 2,
    sceneBreakSpacing: 1.2,
    dropCap: true,
    page: {
      widthPt: 432,
      heightPt: 648,
      marginTopPt: 54,
      marginRightPt: 54,
      marginBottomPt: 54,
      marginLeftPt: 54
    },
    wordsPerPage: 330,
    runningHeader: true,
    pageNumbers: true
  },
  modern: {
    id: "modern",
    label: "Modern trade",
    description: "Clean contemporary layout",
    detail: "11 pt · left-aligned · generous spacing · 6 × 9 in",
    cssFontFamily: "'IBM Plex Serif', 'Literata', Georgia, serif",
    docxFont: "Georgia",
    pdfFont: "times",
    bodySizePt: 11,
    lineHeight: 1.45,
    paragraphIndentEm: 0,
    paragraphSpacingEm: 0.65,
    justify: false,
    chapterHeadingSizePt: 24,
    chapterHeadingUppercase: false,
    chapterHeadingAlign: "left",
    chapterHeadingSpaceBefore: 0.8,
    chapterHeadingSpaceAfter: 1.8,
    sceneBreakSpacing: 1.1,
    dropCap: false,
    page: {
      widthPt: 432,
      heightPt: 648,
      marginTopPt: 60,
      marginRightPt: 54,
      marginBottomPt: 60,
      marginLeftPt: 54
    },
    wordsPerPage: 400,
    runningHeader: false,
    pageNumbers: true
  },
  ebook: {
    id: "ebook",
    label: "Ebook",
    description: "Reflowable reader-friendly text",
    detail: "Relative spacing · no fixed margins · compact headings",
    cssFontFamily: "Georgia, 'Times New Roman', serif",
    docxFont: "Georgia",
    pdfFont: "times",
    bodySizePt: 11.5,
    lineHeight: 1.6,
    paragraphIndentEm: 1.4,
    paragraphSpacingEm: 0,
    justify: false,
    chapterHeadingSizePt: 18,
    chapterHeadingUppercase: false,
    chapterHeadingAlign: "left",
    chapterHeadingSpaceBefore: 1,
    chapterHeadingSpaceAfter: 1.4,
    sceneBreakSpacing: 1.1,
    dropCap: false,
    page: {
      widthPt: 432,
      heightPt: 648,
      marginTopPt: 42,
      marginRightPt: 42,
      marginBottomPt: 42,
      marginLeftPt: 42
    },
    wordsPerPage: 0,
    runningHeader: false,
    pageNumbers: false
  }
};

export const PRESET_ORDER: BuiltinStyleId[] = ["manuscript", "classic", "modern", "ebook"];
export const BUILTIN_STYLE_IDS: readonly BuiltinStyleId[] = PRESET_ORDER;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim()
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function fontById(id: StyleFontId): StyleFont {
  return STYLE_FONTS.find((font) => font.id === id) ?? STYLE_FONTS[0];
}

function trimById(id: StyleTrimId): StyleTrim {
  return STYLE_TRIMS.find((trim) => trim.id === id) ?? STYLE_TRIMS[0];
}

function ptToInches(points: number): number {
  return Math.round((points / 72) * 100) / 100;
}

function inchesToPt(inches: number): number {
  return Math.round(inches * 72 * 10) / 10;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function isBuiltinStyleId(value: string): value is BuiltinStyleId {
  return (BUILTIN_STYLE_IDS as readonly string[]).includes(value);
}

export function newCustomStyleId(): string {
  const unique = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${CUSTOM_STYLE_ID_PREFIX}${unique}`;
}

function fontIdForTokens(tokens: PresetTokens): StyleFontId {
  return STYLE_FONTS.find((font) => font.cssFontFamily === tokens.cssFontFamily)?.id
    ?? (tokens.pdfFont === "helvetica" ? "helvetica" : tokens.pdfFont === "courier" ? "courier" : "georgia");
}

function trimIdForTokens(tokens: PresetTokens): StyleTrimId {
  return STYLE_TRIMS.find((trim) =>
    trim.widthPt === tokens.page.widthPt && trim.heightPt === tokens.page.heightPt
  )?.id ?? "trade-6x9";
}

function customFieldsFromTokens(tokens: PresetTokens): CustomStyleFields {
  return {
    fontId: fontIdForTokens(tokens),
    bodySizePt: tokens.bodySizePt,
    lineHeight: tokens.lineHeight,
    paragraphIndentEm: tokens.paragraphIndentEm,
    paragraphSpacingEm: tokens.paragraphSpacingEm,
    justify: tokens.justify,
    chapterHeadingSizePt: tokens.chapterHeadingSizePt,
    chapterHeadingUppercase: tokens.chapterHeadingUppercase,
    chapterHeadingAlign: tokens.chapterHeadingAlign,
    chapterHeadingSpaceBefore: tokens.chapterHeadingSpaceBefore,
    chapterHeadingSpaceAfter: tokens.chapterHeadingSpaceAfter,
    sceneBreakSpacing: tokens.sceneBreakSpacing,
    dropCap: tokens.dropCap,
    trimId: trimIdForTokens(tokens),
    marginTopIn: ptToInches(tokens.page.marginTopPt),
    marginRightIn: ptToInches(tokens.page.marginRightPt),
    marginBottomIn: ptToInches(tokens.page.marginBottomPt),
    marginLeftIn: ptToInches(tokens.page.marginLeftPt),
    runningHeader: tokens.runningHeader,
    pageNumbers: tokens.pageNumbers
  };
}

function customFieldsFromStyle(style: CustomExportStyle): CustomStyleFields {
  return {
    fontId: style.fontId,
    bodySizePt: style.bodySizePt,
    lineHeight: style.lineHeight,
    paragraphIndentEm: style.paragraphIndentEm,
    paragraphSpacingEm: style.paragraphSpacingEm,
    justify: style.justify,
    chapterHeadingSizePt: style.chapterHeadingSizePt,
    chapterHeadingUppercase: style.chapterHeadingUppercase,
    chapterHeadingAlign: style.chapterHeadingAlign,
    chapterHeadingSpaceBefore: style.chapterHeadingSpaceBefore,
    chapterHeadingSpaceAfter: style.chapterHeadingSpaceAfter,
    sceneBreakSpacing: style.sceneBreakSpacing,
    dropCap: style.dropCap,
    trimId: style.trimId,
    marginTopIn: style.marginTopIn,
    marginRightIn: style.marginRightIn,
    marginBottomIn: style.marginBottomIn,
    marginLeftIn: style.marginLeftIn,
    runningHeader: style.runningHeader,
    pageNumbers: style.pageNumbers
  };
}

function coerceCustomStyleFields(value: Record<string, unknown>): CustomStyleFields {
  const fontIds = STYLE_FONTS.map((font) => font.id);
  const trimIds = STYLE_TRIMS.map((trim) => trim.id);
  return {
    fontId: choice(value.fontId, fontIds, "georgia"),
    bodySizePt: clampNumber(value.bodySizePt, 6, 36, 11.5),
    lineHeight: clampNumber(value.lineHeight, 1, 3, 1.5),
    paragraphIndentEm: clampNumber(value.paragraphIndentEm, 0, 4, 1.5),
    paragraphSpacingEm: clampNumber(value.paragraphSpacingEm, 0, 3, 0),
    justify: booleanField(value.justify, false),
    chapterHeadingSizePt: clampNumber(value.chapterHeadingSizePt, 8, 48, 18),
    chapterHeadingUppercase: booleanField(value.chapterHeadingUppercase, false),
    chapterHeadingAlign: choice(value.chapterHeadingAlign, ["left", "center"] as const, "left"),
    chapterHeadingSpaceBefore: clampNumber(value.chapterHeadingSpaceBefore, 0, 6, 1),
    chapterHeadingSpaceAfter: clampNumber(value.chapterHeadingSpaceAfter, 0, 6, 1.5),
    sceneBreakSpacing: clampNumber(value.sceneBreakSpacing, 0, 3, 1.1),
    dropCap: booleanField(value.dropCap, false),
    trimId: choice(value.trimId, trimIds, "trade-6x9"),
    marginTopIn: clampNumber(value.marginTopIn, 0.25, 1.5, 0.75),
    marginRightIn: clampNumber(value.marginRightIn, 0.25, 1.5, 0.75),
    marginBottomIn: clampNumber(value.marginBottomIn, 0.25, 1.5, 0.75),
    marginLeftIn: clampNumber(value.marginLeftIn, 0.25, 1.5, 0.75),
    runningHeader: booleanField(value.runningHeader, false),
    pageNumbers: booleanField(value.pageNumbers, true)
  };
}

function uniqueStyleLabel(base: string, customStyles: readonly CustomExportStyle[]): string {
  const used = new Set([
    ...PRESET_ORDER.map((id) => PRESETS[id].label.toLowerCase()),
    ...customStyles.map((style) => style.label.trim().toLowerCase())
  ]);
  const clean = base.trim().slice(0, CUSTOM_STYLE_LABEL_LIMIT) || "Custom style";
  if (!used.has(clean.toLowerCase())) return clean;
  let index = 2;
  while (true) {
    const suffix = ` ${index}`;
    const candidate = `${clean.slice(0, CUSTOM_STYLE_LABEL_LIMIT - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
    index += 1;
  }
}

function estimateWordsPerPage(style: CustomExportStyle, trim: StyleTrim): number {
  const contentWidth = trim.widthPt - inchesToPt(style.marginLeftIn) - inchesToPt(style.marginRightIn);
  const contentHeight = trim.heightPt - inchesToPt(style.marginTopIn) - inchesToPt(style.marginBottomIn);
  if (contentWidth <= 0 || contentHeight <= 0) return 0;
  const charactersPerLine = contentWidth / (style.bodySizePt * 0.55);
  const linesPerPage = contentHeight / (style.bodySizePt * style.lineHeight);
  return Math.max(1, Math.round((charactersPerLine * linesPerPage) / 6.2));
}

export function customStyleTokens(style: CustomExportStyle): PresetTokens {
  const font = fontById(style.fontId);
  const trim = trimById(style.trimId);
  return {
    id: style.id,
    label: style.label,
    description: "Custom style",
    detail: `${trimNumber(style.bodySizePt)} pt · ${font.label} · ${trim.shortLabel}`,
    cssFontFamily: font.cssFontFamily,
    docxFont: font.docxFont,
    pdfFont: font.pdfFont,
    bodySizePt: style.bodySizePt,
    lineHeight: style.lineHeight,
    paragraphIndentEm: style.paragraphIndentEm,
    paragraphSpacingEm: style.paragraphSpacingEm,
    justify: style.justify,
    chapterHeadingSizePt: style.chapterHeadingSizePt,
    chapterHeadingUppercase: style.chapterHeadingUppercase,
    chapterHeadingAlign: style.chapterHeadingAlign,
    chapterHeadingSpaceBefore: style.chapterHeadingSpaceBefore,
    chapterHeadingSpaceAfter: style.chapterHeadingSpaceAfter,
    sceneBreakSpacing: style.sceneBreakSpacing,
    dropCap: style.dropCap,
    page: {
      widthPt: trim.widthPt,
      heightPt: trim.heightPt,
      marginTopPt: inchesToPt(style.marginTopIn),
      marginRightPt: inchesToPt(style.marginRightIn),
      marginBottomPt: inchesToPt(style.marginBottomIn),
      marginLeftPt: inchesToPt(style.marginLeftIn)
    },
    wordsPerPage: estimateWordsPerPage(style, trim),
    runningHeader: style.runningHeader,
    pageNumbers: style.pageNumbers
  };
}

export function resolveStyleTokens(
  styleId: string,
  customStyles: readonly CustomExportStyle[] = []
): PresetTokens {
  if (isBuiltinStyleId(styleId)) return PRESETS[styleId];
  const custom = customStyles.find((style) => style.id === styleId);
  return custom ? customStyleTokens(custom) : PRESETS.manuscript;
}

export function styleSummaries(customStyles: readonly CustomExportStyle[]): StyleSummary[] {
  const builtins = PRESET_ORDER.map((id) => {
    const preset = PRESETS[id];
    return {
      id,
      label: preset.label,
      description: preset.description,
      detail: preset.detail,
      custom: false
    };
  });
  const customs = customStyles.map((style) => {
    const tokens = customStyleTokens(style);
    return {
      id: style.id,
      label: style.label,
      description: tokens.description,
      detail: tokens.detail,
      custom: true
    };
  });
  return [...builtins, ...customs];
}

export function createCustomStyle(
  sourceId: string,
  customStyles: readonly CustomExportStyle[] = []
): CustomExportStyle {
  const source = customStyles.find((style) => style.id === sourceId);
  const sourceTokens = resolveStyleTokens(sourceId, customStyles);
  return {
    id: newCustomStyleId(),
    label: uniqueStyleLabel(`${sourceTokens.label} copy`, customStyles),
    ...(source ? customFieldsFromStyle(source) : customFieldsFromTokens(sourceTokens))
  };
}

/**
 * Normalizes user-authored style records from storage. Invalid entries are
 * dropped; every retained field is clamped so a corrupt or hand-edited record
 * can never inject values into generated CSS or document properties.
 */
export function normalizeCustomStyles(value: unknown): CustomExportStyle[] {
  if (!Array.isArray(value)) return [];
  const result: CustomExportStyle[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || seen.has(id) || id.length > 100 || isBuiltinStyleId(id)) continue;
    const label = typeof entry.label === "string"
      ? entry.label.trim().slice(0, CUSTOM_STYLE_LABEL_LIMIT)
      : "";
    if (!label) continue;
    seen.add(id);
    result.push({
      id,
      label,
      ...coerceCustomStyleFields(entry)
    });
    if (result.length >= MAX_CUSTOM_STYLES) break;
  }
  return result;
}

/** Normalizes an in-progress editor draft so the live preview stays valid. */
export function normalizeCustomDraft(style: CustomExportStyle): CustomExportStyle {
  const id = typeof style.id === "string" && style.id.trim()
    ? style.id.trim()
    : newCustomStyleId();
  const label = typeof style.label === "string"
    ? style.label.trim().slice(0, CUSTOM_STYLE_LABEL_LIMIT)
    : "";
  return {
    id,
    label: label || "Custom style",
    ...coerceCustomStyleFields(style as unknown as Record<string, unknown>)
  };
}
