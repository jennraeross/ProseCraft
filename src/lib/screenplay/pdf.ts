import { jsPDF } from "jspdf";
import type { ScreenplayElement } from "./fountain";
import { wrapScreenplayText } from "./layout";

const INCH = 72;

/** Page geometry and column positions in points, following standard screenplay format. */
export const SCREENPLAY_PDF = {
  pageWidth: 8.5 * INCH,
  pageHeight: 11 * INCH,
  leftMargin: 1.5 * INCH,
  rightMargin: 1 * INCH,
  topMargin: 1 * INCH,
  bottomMargin: 1 * INCH,
  fontSize: 12,
  linesPerPage: 55,
  characterCue: 3.7 * INCH,
  dialogue: 2.5 * INCH,
  dialogueWidth: 3.3 * INCH,
  parenthetical: 3.1 * INCH,
  parentheticalWidth: 2.5 * INCH
} as const;

const LINE_HEIGHT = (SCREENPLAY_PDF.pageHeight
  - SCREENPLAY_PDF.topMargin
  - SCREENPLAY_PDF.bottomMargin) / SCREENPLAY_PDF.linesPerPage;
/** Courier is 0.6 em wide, so a 12 pt character is 7.2 pt wide. */
const CHAR_WIDTH = SCREENPLAY_PDF.fontSize * 0.6;
const TEXT_RIGHT = SCREENPLAY_PDF.pageWidth - SCREENPLAY_PDF.rightMargin;
const TEXT_WIDTH = TEXT_RIGHT - SCREENPLAY_PDF.leftMargin;
const TEXT_CENTER = SCREENPLAY_PDF.leftMargin + TEXT_WIDTH / 2;
const TITLE_WIDTH = 4 * INCH;

export type ScriptLine = {
  text: string;
  x: number;
  align: "left" | "center" | "right";
  bold: boolean;
  /** Stays on the same page as the line after it, so cues keep their dialogue. */
  keepWithNext: boolean;
  pageBreak: boolean;
};

export type ScreenplayScript = {
  title: string;
  author: string;
  elements: ScreenplayElement[];
};

function charsFor(width: number): number {
  return Math.max(1, Math.floor(width / CHAR_WIDTH));
}

function makeLine(text: string, x: number, options: Partial<ScriptLine> = {}): ScriptLine {
  return {
    text,
    x,
    align: options.align ?? "left",
    bold: options.bold ?? false,
    keepWithNext: options.keepWithNext ?? false,
    pageBreak: false
  };
}

const BLANK_LINE = makeLine("", 0);
const PAGE_BREAK: ScriptLine = { ...BLANK_LINE, pageBreak: true };

function wrapLines(
  text: string,
  width: number,
  x: number,
  options: Partial<ScriptLine> = {}
): ScriptLine[] {
  const words = text.replace(/\s+/g, " ").trim();
  if (words === "") return [];
  return wrapScreenplayText(words, charsFor(width))
    .map((line) => makeLine(line, x, options));
}

function elementLines(element: ScreenplayElement): ScriptLine[] {
  switch (element.type) {
    case "scene-heading":
      return wrapLines(element.text.toUpperCase(), TEXT_WIDTH, SCREENPLAY_PDF.leftMargin, {
        bold: true,
        keepWithNext: true
      });
    case "character":
      return wrapLines(
        element.text.toUpperCase(),
        TEXT_RIGHT - SCREENPLAY_PDF.characterCue,
        SCREENPLAY_PDF.characterCue,
        { keepWithNext: true }
      );
    case "dialogue":
      return wrapLines(element.text, SCREENPLAY_PDF.dialogueWidth, SCREENPLAY_PDF.dialogue);
    case "parenthetical":
      return wrapLines(element.text, SCREENPLAY_PDF.parentheticalWidth, SCREENPLAY_PDF.parenthetical, {
        keepWithNext: true
      });
    case "transition":
      return wrapLines(element.text.toUpperCase(), TEXT_WIDTH, TEXT_RIGHT, { align: "right" });
    case "centered":
      return wrapLines(element.text, TEXT_WIDTH, TEXT_CENTER, { align: "center" });
    case "action":
      return wrapLines(element.text, TEXT_WIDTH, SCREENPLAY_PDF.leftMargin);
    default:
      return [];
  }
}

/**
 * Turns script elements into printed lines. Headings, cues and parentheticals are
 * marked to stay with the line that follows them; sections, synopses, notes and
 * page breaks are not printed.
 */
export function screenplayLines(elements: ScreenplayElement[]): ScriptLine[] {
  const lines: ScriptLine[] = [];
  let previous: ScreenplayElement["type"] | null = null;
  for (const element of elements) {
    if (element.type === "page-break") {
      lines.push(PAGE_BREAK);
      previous = null;
      continue;
    }
    const block = elementLines(element);
    if (block.length === 0) continue;
    const glued = (element.type === "dialogue" || element.type === "parenthetical")
      && (previous === "character" || previous === "dialogue" || previous === "parenthetical");
    const atTop = lines.length === 0 || lines[lines.length - 1].pageBreak;
    if (!glued && !atTop) lines.push(BLANK_LINE);
    lines.push(...block);
    previous = element.type;
  }
  return lines;
}

/** Splits the script into pages of at most 55 lines, keeping cues with their dialogue. */
export function paginateScreenplay(lines: ScriptLine[]): ScriptLine[][] {
  const pages: ScriptLine[][] = [];
  let page: ScriptLine[] = [];

  const flush = () => {
    while (page.length > 0 && page[page.length - 1].text === "") page.pop();
    if (page.length > 0) pages.push(page);
    page = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.pageBreak) {
      flush();
      continue;
    }
    if (line.text === "" && page.length === 0) continue;
    if (page.length === SCREENPLAY_PDF.linesPerPage) flush();
    if (line.keepWithNext && page.length > 0) {
      let run = 1;
      while (index + run < lines.length && lines[index + run].keepWithNext) run += 1;
      if (page.length + run + 1 > SCREENPLAY_PDF.linesPerPage) flush();
    }
    page.push(line);
  }
  flush();
  return pages;
}

function renderTitlePage(doc: jsPDF, script: ScreenplayScript) {
  doc.setFont("courier", "normal");
  doc.setFontSize(SCREENPLAY_PDF.fontSize);
  const title = script.title.trim().toUpperCase();
  if (title !== "") {
    doc.setFont("courier", "bold");
    let y = SCREENPLAY_PDF.pageHeight * 0.3;
    for (const line of doc.splitTextToSize(title, TITLE_WIDTH) as string[]) {
      doc.text(line, TEXT_CENTER, y, { align: "center" });
      y += LINE_HEIGHT;
    }
  }
  const author = script.author.trim();
  if (author !== "") {
    doc.setFont("courier", "normal");
    const creditY = SCREENPLAY_PDF.pageHeight * 0.6;
    doc.text("Written by", TEXT_CENTER, creditY, { align: "center" });
    doc.text(author, TEXT_CENTER, creditY + LINE_HEIGHT, { align: "center" });
  }
}

function renderPage(doc: jsPDF, lines: ScriptLine[], pageNumber: number) {
  doc.setFont("courier", "normal");
  doc.setFontSize(SCREENPLAY_PDF.fontSize);
  const pageNumberY = SCREENPLAY_PDF.topMargin - LINE_HEIGHT;
  doc.text(`${pageNumber}.`, TEXT_RIGHT, pageNumberY, { align: "right" });
  lines.forEach((line, index) => {
    if (line.text === "") return;
    doc.setFont("courier", line.bold ? "bold" : "normal");
    const y = SCREENPLAY_PDF.topMargin + (index + 1) * LINE_HEIGHT;
    doc.text(line.text, line.x, y, { align: line.align });
  });
}

/** Builds a screenplay-format PDF: title page, then 55 lines per US Letter page. */
export function buildScreenplayPdf(script: ScreenplayScript): Uint8Array<ArrayBuffer> {
  const doc = new jsPDF({
    unit: "pt",
    format: [SCREENPLAY_PDF.pageWidth, SCREENPLAY_PDF.pageHeight],
    orientation: "portrait",
    compress: true
  });
  doc.setProperties({
    title: script.title,
    author: script.author || undefined,
    creator: "ProseCraft"
  });

  renderTitlePage(doc, script);
  for (const lines of paginateScreenplay(screenplayLines(script.elements))) {
    doc.addPage();
    renderPage(doc, lines, doc.getNumberOfPages());
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
