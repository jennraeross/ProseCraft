import type { StylePreset } from "./types";

export type PresetTokens = {
  id: StylePreset;
  label: string;
  description: string;
  detail: string;
  cssFontFamily: string;
  docxFont: string;
  pdfFont: "times" | "helvetica";
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

export const PRESETS: Record<StylePreset, PresetTokens> = {
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

export const PRESET_ORDER: StylePreset[] = ["manuscript", "classic", "modern", "ebook"];
