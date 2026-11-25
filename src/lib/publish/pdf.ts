import { jsPDF } from "jspdf";
import { resolveBookCitations } from "../citations/bibliography";
import { resolveBookFootnotes, type ResolvedFootnote } from "./footnotes";
import { matterParagraphs } from "./matter";
import { createPdfFontSet, type PdfFontSet, type TextSegment } from "./pdf-fonts";
import type { PdfFontVariant } from "./pdf-font-data";
import { resolveStyleTokens, type PresetTokens } from "./presets";
import { blocksFromHtml, inlineRunsFromHtml, type Block, type InlineRun } from "./rich-text";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type CompiledMatterPage,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

type TextToken = {
  text: string;
  width: number;
  isSpace: boolean;
  lineBreak?: boolean;
  superscript?: boolean;
  run: InlineRun;
  image?: { src: string; fileType: string; width: number; height: number };
};

type WrappedLine = {
  tokens: TextToken[];
  width: number;
  available: number;
  last: boolean;
};

type ParagraphOptions = {
  size: number;
  lineHeight: number;
  firstIndent: number;
  leftIndent?: number;
  justify?: boolean;
  align?: "left" | "center";
  bold?: boolean;
  italic?: boolean;
  spacingBefore?: number;
  spacingAfter?: number;
  color?: [number, number, number];
  dropCap?: boolean;
  sceneFootnotes?: ReadonlyMap<string, ResolvedFootnote>;
};

const INK: [number, number, number] = [29, 33, 29];
const MUTED: [number, number, number] = [115, 119, 111];
const RULE: [number, number, number] = [185, 189, 181];

function fontStyle(run: InlineRun, forceBold = false, forceItalic = false): string {
  const bold = run.bold || forceBold;
  const italic = run.italic || forceItalic;
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

function pdfColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(value)) return [255, 255, 255];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function pdfImageFormat(mediaType: string): string {
  if (mediaType === "image/jpeg") return "JPEG";
  if (mediaType === "image/webp") return "WEBP";
  return "PNG";
}

/**
 * Collects every non-ASCII string in the compiled book so the exporter can
 * decide whether the (large) CJK fallback fonts are needed. Image payloads are
 * skipped: they are ASCII base64 and cannot contain text.
 */
function collectBookText(book: CompiledBook): string[] {
  const texts: string[] = [];
  const seen = new Set<object>();
  const skippedKeys = new Set(["cover", "image", "src", "dataUrl", "dataURL"]);
  const visit = (value: unknown, depth: number): void => {
    if (typeof value === "string") {
      if (!/[^\x00-\x7f]/.test(value)) return;
      texts.push(value.length > 100_000 ? value.replace(/data:[^"')\s]+/g, " ") : value);
      return;
    }
    if (depth > 20 || value === null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (!skippedKeys.has(key)) visit(child, depth + 1);
    }
  };
  visit(book, 0);
  return texts;
}

export async function exportPdf(book: CompiledBook, options: PublishOptions): Promise<ExportPayload> {
  const { book: resolvedBook, bibliography } = resolveBookCitations(book, options);
  book = resolvedBook;
  const tokens = resolveStyleTokens(options.style, options.customStyles);
  const pageWidth = tokens.page.widthPt;
  const pageHeight = tokens.page.heightPt;
  const contentLeft = tokens.page.marginLeftPt;
  const contentRight = pageWidth - tokens.page.marginRightPt;
  const contentTop = tokens.page.marginTopPt;
  const contentBottom = pageHeight - tokens.page.marginBottomPt;
  const contentWidth = contentRight - contentLeft;
  const bodySize = tokens.bodySizePt;
  const bodyLine = bodySize * tokens.lineHeight;
  const hasTitlePage = options.includeTitlePage;
  const hasCopyrightPage = options.includeCopyrightPage && Boolean(book.copyright);
  const hasDedication = Boolean(book.dedication);
  const hasTableOfContents = options.includeTableOfContents && book.chapters.length > 0;

  const doc = new jsPDF({
    unit: "pt",
    format: [pageWidth, pageHeight],
    orientation: pageWidth > pageHeight ? "landscape" : "portrait",
    compress: true
  });
  doc.setProperties({
    title: book.title,
    author: book.author || undefined,
    subject: book.subtitle || undefined,
    creator: "ProseCraft"
  });

  const fontSet: PdfFontSet = await createPdfFontSet(doc, tokens.pdfFont, collectBookText(book));

  let pageNumber = 1;
  let y = contentTop + bodySize;
  let bodyStarted = false;
  let pageHasContent = false;
  let frontMatterMode = false;

  const measureSegments = (segments: TextSegment[], size: number): number =>
    segments.reduce((sum, segment) => sum + fontSet.width(segment, size), 0);

  const measureText = (text: string, variant: PdfFontVariant, size: number): number =>
    measureSegments(fontSet.segment(text, variant), size);

  const drawText = (
    text: string,
    x: number,
    baseline: number,
    opts: { variant: PdfFontVariant; size: number; align?: "left" | "center" | "right" }
  ): number => {
    const segments = fontSet.segment(text, opts.variant);
    const width = measureSegments(segments, opts.size);
    let cursor = x;
    if (opts.align === "center") cursor -= width / 2;
    else if (opts.align === "right") cursor -= width;
    for (const segment of segments) {
      doc.setFont(segment.family, segment.variant);
      doc.setFontSize(opts.size);
      doc.text(segment.text, cursor, baseline);
      cursor += fontSet.width(segment, opts.size);
    }
    return width;
  };

  const wrapPlainText = (
    text: string,
    maxWidth: number,
    variant: PdfFontVariant,
    size: number
  ): string[] => {
    const lines: string[] = [];
    const paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
    for (const paragraph of paragraphs) {
      if (paragraph.trim().length === 0) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const word of paragraph.split(/(\s+)/).filter((part) => part.length > 0)) {
        const candidate = current + word;
        if (current.trim().length > 0 && measureText(candidate.trimEnd(), variant, size) > maxWidth) {
          lines.push(current.trimEnd());
          current = word.trimStart();
        } else {
          current = candidate;
        }
        while (measureText(current, variant, size) > maxWidth && current.length > 1) {
          const characters = Array.from(current);
          let index = 1;
          while (
            index < characters.length
            && measureText(characters.slice(0, index + 1).join(""), variant, size) <= maxWidth
          ) {
            index += 1;
          }
          lines.push(characters.slice(0, index).join("").trimEnd());
          current = characters.slice(index).join("").trimStart();
        }
      }
      lines.push(current.trimEnd());
    }
    return lines;
  };

  const setColor = (color: [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);

  const drawHeaderFooter = () => {
    if (tokens.runningHeader) {
      const header = book.author ? `${book.author} / ${book.title}` : book.title;
      setColor(MUTED);
      drawText(header, pageWidth / 2, tokens.page.marginTopPt / 2 + 3, {
        variant: "normal",
        size: 8.5,
        align: "center"
      });
    }
    if (tokens.pageNumbers) {
      setColor(MUTED);
      drawText(String(pageNumber), pageWidth / 2, pageHeight - tokens.page.marginBottomPt / 2 + 3, {
        variant: "normal",
        size: 8.5,
        align: "center"
      });
    }
    setColor(INK);
  };

  const startFrontMatterPage = () => {
    if (pageHasContent) {
      doc.addPage();
      pageNumber += 1;
    }
    pageHasContent = true;
    y = contentTop + bodySize;
  };

  const newBodyPage = () => {
    doc.addPage();
    pageNumber += 1;
    y = contentTop + bodySize;
    drawHeaderFooter();
  };

  const beginBody = () => {
    if (bodyStarted) return;
    if (pageHasContent) {
      doc.addPage();
      pageNumber += 1;
    }
    pageHasContent = true;
    bodyStarted = true;
    y = contentTop + bodySize;
    drawHeaderFooter();
  };

  const ensureSpace = (height: number) => {
    if (y + height <= contentBottom) return;
    if (frontMatterMode) {
      startFrontMatterPage();
    } else {
      newBodyPage();
    }
  };

  const measure = (text: string, run: InlineRun, size: number, bold = false, italic = false): number =>
    measureText(text, fontStyle(run, bold, italic) as PdfFontVariant, size);

  const tokenize = (
    runs: InlineRun[],
    size: number,
    forceBold = false,
    forceItalic = false,
    sceneFootnotes?: ReadonlyMap<string, ResolvedFootnote>
  ): TextToken[] => {
    const tokens: TextToken[] = [];
    for (const run of runs) {
      if (run.footnoteId) {
        const note = sceneFootnotes?.get(run.footnoteId);
        if (note) {
          const text = String(note.number);
          const supSize = size * 0.68;
          tokens.push({
            text,
            width: measure(text, run, supSize, forceBold, forceItalic),
            isSpace: false,
            superscript: true,
            run
          });
        }
        continue;
      }
      if (run.lineBreak) {
        tokens.push({ text: "", width: 0, isSpace: false, lineBreak: true, run });
        continue;
      }
      if (run.image) {
        const properties = doc.getImageProperties(run.image.src);
        const naturalWidth = run.image.width ?? properties.width;
        const naturalHeight = run.image.height ?? properties.height;
        const height = size * 1.15;
        const width = Math.max(1, height * (naturalWidth / naturalHeight));
        tokens.push({
          text: "",
          width,
          isSpace: false,
          run,
          image: {
            src: run.image.src,
            fileType: properties.fileType,
            width,
            height
          }
        });
        continue;
      }
      const parts = run.text.split(/(\s+)/).filter((part) => part.length > 0);
      for (const part of parts) {
        const isSpace = /^\s+$/.test(part);
        const text = isSpace ? " " : part;
        tokens.push({
          text,
          width: measure(text, run, size, forceBold, forceItalic),
          isSpace,
          run
        });
      }
    }
    return tokens;
  };

  const splitToken = (token: TextToken, maxWidth: number, size: number, forceBold: boolean, forceItalic: boolean): [TextToken, TextToken | null] => {
    if (token.text.length <= 1) return [token, null];
    let index = 1;
    while (index < token.text.length) {
      const candidate = token.text.slice(0, index + 1);
      if (measure(candidate, token.run, size, forceBold, forceItalic) > maxWidth) break;
      index += 1;
    }
    const head = token.text.slice(0, index);
    const rest = token.text.slice(index);
    return [
      { ...token, text: head, width: measure(head, token.run, size, forceBold, forceItalic) },
      rest.length > 0
        ? { ...token, text: rest, width: measure(rest, token.run, size, forceBold, forceItalic) }
        : null
    ];
  };

  const wrapTokens = (
    input: TextToken[],
    maxWidth: number,
    firstIndent: number,
    size: number,
    forceBold: boolean,
    forceItalic: boolean,
    offsetLines = 0,
    offsetWidth = 0
  ): WrappedLine[] => {
    const lines: WrappedLine[] = [];
    let current: TextToken[] = [];
    let lineWidth = 0;
    let lineIndex = 0;
    let available = maxWidth - firstIndent - (lineIndex < offsetLines ? offsetWidth : 0);

    const pushLine = () => {
      while (current.length > 0 && current[current.length - 1].isSpace) {
        lineWidth -= current[current.length - 1].width;
        current.pop();
      }
      lines.push({ tokens: current, width: lineWidth, available, last: false });
      current = [];
      lineWidth = 0;
      lineIndex += 1;
      available = maxWidth - (lineIndex < offsetLines ? offsetWidth : 0);
    };

    for (const original of input) {
      let token = original;
      if (token.lineBreak) {
        pushLine();
        continue;
      }
      if (token.image) {
        if (lineWidth + token.width > available && current.some((item) => !item.isSpace)) {
          pushLine();
        }
        if (token.width > available) {
          const scale = available / token.width;
          token = {
            ...token,
            width: available,
            image: {
              ...token.image,
              width: available,
              height: token.image.height * scale
            }
          };
        }
        current.push(token);
        lineWidth += token.width;
        continue;
      }
      if (token.isSpace) {
        if (current.length === 0) continue;
        if (lineWidth + token.width > available) {
          pushLine();
          continue;
        }
        current.push(token);
        lineWidth += token.width;
        continue;
      }

      if (lineWidth + token.width > available && current.some((item) => !item.isSpace)) {
        pushLine();
      }

      while (token.width > available) {
        const [head, rest] = splitToken(token, available, size, forceBold, forceItalic);
        current.push(head);
        lineWidth = head.width;
        pushLine();
        if (!rest) {
          token = { ...token, text: "", width: 0 };
          break;
        }
        token = rest;
      }

      if (token.text.length > 0) {
        current.push(token);
        lineWidth += token.width;
      }
    }

    if (current.length > 0 || lines.length === 0) pushLine();
    if (lines.length > 0) lines[lines.length - 1].last = true;
    return lines;
  };

  const drawLine = (line: WrappedLine, x: number, baseline: number, size: number, forceBold: boolean, forceItalic: boolean, justify: boolean) => {
    const gaps = line.tokens.filter((token) => token.isSpace).length;
    const extra = justify && !line.last && gaps > 0
      ? Math.max(0, (line.available - line.width) / gaps)
      : 0;
    let cursor = x;
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    for (const token of line.tokens) {
      if (token.image) {
        doc.addImage(
          token.image.src,
          token.image.fileType,
          cursor,
          baseline - token.image.height * 0.82,
          token.image.width,
          token.image.height,
          undefined,
          "FAST"
        );
        cursor += token.width;
        continue;
      }
      if (token.superscript) {
        const supSize = size * 0.68;
        cursor += drawText(token.text, cursor, baseline - size * 0.35, {
          variant: fontStyle(token.run, forceBold, forceItalic) as PdfFontVariant,
          size: supSize
        });
        continue;
      }
      const tokenWidth = drawText(token.text, cursor, baseline, {
        variant: fontStyle(token.run, forceBold, forceItalic) as PdfFontVariant,
        size
      });
      if (token.run.underline) {
        doc.line(cursor, baseline + 2, cursor + tokenWidth, baseline + 2);
      }
      if (token.run.strike) {
        doc.line(cursor, baseline - size * 0.3, cursor + tokenWidth, baseline - size * 0.3);
      }
      cursor += tokenWidth + (token.isSpace ? extra : 0);
    }
  };

  const plainRuns = (text: string): InlineRun[] => {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    return lines.flatMap((line, index) => [
      ...(index > 0 ? [{ text: "", lineBreak: true } as InlineRun] : []),
      { text: line }
    ]);
  };

  const renderParagraph = (runs: InlineRun[], opts: ParagraphOptions) => {
    if (runs.length === 0) return;
    const leftIndent = opts.leftIndent ?? 0;
    const maxWidth = contentWidth - leftIndent;
    let drawRuns = runs;
    let dropCapLetter = "";
    let dropCapWidth = 0;
    const dropCapLines = 3;

    if (opts.dropCap) {
      const firstIndex = drawRuns.findIndex((run) => !run.lineBreak && /\S/.test(run.text));
      if (firstIndex >= 0) {
        const run = drawRuns[firstIndex];
        const match = run.text.match(/^(\s*)(\S)/);
        if (match) {
          const [, leading, letter] = match;
          dropCapLetter = letter;
          const rest = run.text.slice(leading.length + letter.length);
          drawRuns = [...drawRuns];
          if (rest.length > 0) drawRuns[firstIndex] = { ...run, text: rest };
          else drawRuns.splice(firstIndex, 1);
          if (drawRuns.length === 0) return;
          dropCapWidth = measureText(letter, "bold", bodySize * 5.2) + 3;
        }
      }
    }

    const tokens = tokenize(drawRuns, opts.size, opts.bold, opts.italic, opts.sceneFootnotes);
    const firstIndent = dropCapLetter ? 0 : opts.firstIndent;
    const lines = wrapTokens(
      tokens,
      maxWidth,
      firstIndent,
      opts.size,
      opts.bold ?? false,
      opts.italic ?? false,
      dropCapLetter ? dropCapLines : 0,
      dropCapWidth
    );
    if (lines.length === 0) return;

    y += opts.spacingBefore ?? 0;
    ensureSpace((dropCapLetter ? dropCapLines : 1) * opts.lineHeight);
    const color = opts.color ?? INK;
    setColor(color);
    const startY = y;

    for (let index = 0; index < lines.length; index += 1) {
      ensureSpace(opts.lineHeight);
      const line = lines[index];
      const offset = index < (dropCapLetter ? dropCapLines : 0) ? dropCapWidth : 0;
      const indent = index === 0 ? firstIndent : 0;
      const x = opts.align === "center"
        ? contentLeft + leftIndent + offset + Math.max(0, (maxWidth - offset - indent - line.width) / 2)
        : contentLeft + leftIndent + indent + offset;
      drawLine(
        line,
        x,
        y,
        opts.size,
        opts.bold ?? false,
        opts.italic ?? false,
        (opts.justify ?? false) && opts.align !== "center"
      );
      y += opts.lineHeight;
    }

    if (dropCapLetter) {
      setColor(color);
      const dropBaseline = startY + (dropCapLines - 1) * opts.lineHeight;
      drawText(dropCapLetter, contentLeft + leftIndent, dropBaseline, {
        variant: "bold",
        size: bodySize * 5.2
      });
      if (lines.length < dropCapLines) {
        y += (dropCapLines - lines.length) * opts.lineHeight;
      }
    }

    y += opts.spacingAfter ?? 0;
    setColor(INK);
  };

  const renderHeading = (
    block: Block,
    size: number,
    sceneFootnotes?: ReadonlyMap<string, ResolvedFootnote>
  ) => {
    const spacingBefore = size * 0.8;
    const spacingAfter = size * 0.35;
    const runs = block.runs.map((run) => ({ ...run, bold: true }));
    renderParagraph(runs, {
      size,
      lineHeight: size * 1.3,
      firstIndent: 0,
      spacingBefore,
      spacingAfter,
      bold: true,
      sceneFootnotes
    });
  };

  const renderImage = (block: Block) => {
    const src = block.image?.src;
    if (!src) throw new Error("The document contains an image without source data.");
    const properties = doc.getImageProperties(src);
    const width = block.image?.width ?? properties.width;
    const height = block.image?.height ?? properties.height;
    const maxImageHeight = Math.min(288, contentBottom - contentTop - bodyLine * 0.5);
    const scale = Math.min(1, contentWidth / width, maxImageHeight / height);
    const imageWidth = width * scale;
    const imageHeight = height * scale;
    ensureSpace(imageHeight + bodyLine * 0.5);
    doc.addImage(
      src,
      properties.fileType,
      contentLeft + (contentWidth - imageWidth) / 2,
      y,
      imageWidth,
      imageHeight,
      undefined,
      "FAST"
    );
    y += imageHeight + bodyLine * 0.5;
  };

  const renderBlock = (
    block: Block,
    firstInScene: boolean,
    allowDropCap: boolean,
    sceneFootnotes?: ReadonlyMap<string, ResolvedFootnote>
  ) => {
    if (block.kind === "image") {
      renderImage(block);
      return;
    }
    if (block.kind === "heading") {
      const size = bodySize * (block.level === 1 ? 1.45 : block.level === 2 ? 1.28 : 1.12);
      renderHeading(block, size, sceneFootnotes);
      return;
    }
    if (block.kind === "quote") {
      renderParagraph(
        block.runs.map((run) => ({ ...run, italic: true })),
        {
          size: bodySize,
          lineHeight: bodyLine,
          firstIndent: 0,
          leftIndent: bodySize * 1.5,
          spacingBefore: bodySize * 0.4,
          spacingAfter: bodySize * 0.4,
          color: MUTED,
          sceneFootnotes
        }
      );
      return;
    }
    if (block.kind === "list") {
      renderParagraph(
        [{ text: `${block.marker ?? "•"} `, bold: false }, ...block.runs],
        {
          size: bodySize,
          lineHeight: bodyLine,
          firstIndent: 0,
          leftIndent: bodySize * 1.5,
          spacingAfter: bodySize * 0.2,
          sceneFootnotes
        }
      );
      return;
    }
    if (block.eyebrow) {
      renderParagraph(
        block.runs.map((run) => ({ ...run, text: run.text.toUpperCase(), bold: true })),
        {
          size: bodySize * 0.68,
          lineHeight: bodySize * 1.15,
          firstIndent: 0,
          spacingBefore: bodySize * 0.2,
          spacingAfter: bodySize * 0.45,
          color: MUTED,
          sceneFootnotes
        }
      );
      return;
    }
    renderParagraph(block.runs, {
      size: bodySize,
      lineHeight: bodyLine,
      firstIndent: firstInScene ? 0 : tokens.paragraphIndentEm * bodySize,
      justify: tokens.justify,
      spacingAfter: tokens.paragraphSpacingEm * bodySize,
      dropCap: allowDropCap,
      sceneFootnotes
    });
  };

  // Footnotes are rendered as chapter endnotes in this version; page-bottom
  // footnote layout is not required here.
  const renderChapterEndnotes = (notes: readonly ResolvedFootnote[]) => {
    if (notes.length === 0) return;
    const noteSize = bodySize * 0.85;
    const noteLine = noteSize * 1.4;
    ensureSpace(bodyLine * 2.5);
    y += bodySize * 0.7;
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.line(contentLeft, y, contentLeft + Math.min(96, contentWidth * 0.3), y);
    y += bodySize * 1.1;
    renderParagraph([{ text: "Notes", bold: true }], {
      size: noteSize,
      lineHeight: noteLine,
      firstIndent: 0,
      spacingAfter: noteSize * 0.4,
      bold: true,
      color: MUTED
    });
    for (const note of notes) {
      const runs = inlineRunsFromHtml(note.html);
      renderParagraph([{ text: `${note.number}. `, bold: true }, ...runs], {
        size: noteSize,
        lineHeight: noteLine,
        firstIndent: 0,
        leftIndent: noteSize * 0.9,
        spacingAfter: noteSize * 0.35,
        color: INK
      });
    }
  };

  const renderSceneTitle = (title: string) => {
    renderParagraph([{ text: title, bold: true, italic: true }], {
      size: bodySize,
      lineHeight: bodyLine,
      firstIndent: 0,
      bold: true,
      italic: true,
      spacingBefore: bodySize * 0.7,
      spacingAfter: bodySize * 0.35
    });
  };

  const renderSeparator = (separator: SceneSeparator) => {
    if (separator === "none") return;
    const spacing = bodySize * tokens.sceneBreakSpacing;
    ensureSpace(spacing);
    y += spacing / 2;
    setColor(MUTED);
    if (separator === "hash") {
      drawText("#", pageWidth / 2, y, { variant: "normal", size: bodySize * 0.9, align: "center" });
    } else if (separator === "asterisks") {
      drawText("* * *", pageWidth / 2, y, { variant: "normal", size: bodySize * 0.9, align: "center" });
    } else if (separator === "line") {
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.line(pageWidth / 2 - 32, y - bodySize * 0.3, pageWidth / 2 + 32, y - bodySize * 0.3);
    }
    y += spacing / 2;
    setColor(INK);
  };

  const renderCoverPage = () => {
    const cover = book.cover;
    if (!cover) return;
    const ratio = cover.width / cover.height;
    const pageRatio = pageWidth / pageHeight;
    let drawWidth = pageWidth;
    let drawHeight = pageHeight;
    if (ratio > pageRatio) {
      drawWidth = pageWidth;
      drawHeight = drawWidth / ratio;
    } else {
      drawHeight = pageHeight;
      drawWidth = drawHeight * ratio;
    }
    const [red, green, blue] = pdfColor(cover.background);
    doc.setFillColor(red, green, blue);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.addImage(
      cover.dataUrl,
      pdfImageFormat(cover.mediaType),
      (pageWidth - drawWidth) / 2,
      (pageHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
      undefined,
      "FAST"
    );
    pageHasContent = true;
  };

  const renderTitlePage = () => {
    const titleSize = Math.min(bodySize * 2.7, 34);
    setColor(INK);
    const titleLines = wrapPlainText(book.title, contentWidth, "normal", titleSize);
    const titleBlock = titleLines.length * titleSize * 1.18;
    let titleY = pageHeight * 0.3;
    for (const line of titleLines) {
      drawText(line, pageWidth / 2, titleY, { variant: "normal", size: titleSize, align: "center" });
      titleY += titleSize * 1.18;
    }
    if (book.subtitle) {
      setColor(MUTED);
      drawText(book.subtitle, pageWidth / 2, titleY + 16, {
        variant: "italic",
        size: bodySize * 1.1,
        align: "center"
      });
    }
    if (book.author) {
      setColor(MUTED);
      drawText(`by ${book.author}`, pageWidth / 2, pageHeight * 0.55, {
        variant: "normal",
        size: bodySize,
        align: "center"
      });
    }
    if (book.copyright && !options.includeCopyrightPage) {
      setColor(MUTED);
      const lines = wrapPlainText(book.copyright, contentWidth * 0.9, "normal", 8.5);
      let copyrightY = pageHeight - tokens.page.marginBottomPt - (lines.length - 1) * 11;
      for (const line of lines) {
        drawText(line, pageWidth / 2, copyrightY, { variant: "normal", size: 8.5, align: "center" });
        copyrightY += 11;
      }
    }
    setColor(INK);
  };

  const renderDedication = () => {
    setColor(MUTED);
    const lines = wrapPlainText(book.dedication, contentWidth * 0.7, "italic", bodySize * 1.05);
    let dedicationY = pageHeight * 0.45;
    for (const line of lines) {
      drawText(line, pageWidth / 2, dedicationY, {
        variant: "italic",
        size: bodySize * 1.05,
        align: "center"
      });
      dedicationY += bodySize * 1.55;
    }
    setColor(INK);
    y = contentTop + bodySize;
  };

  const renderCopyrightPage = () => {
    const size = bodySize * 0.82;
    const lineHeight = size * 1.6;
    setColor(MUTED);
    const lines = wrapPlainText(book.copyright, contentWidth * 0.85, "normal", size);
    let copyrightY = Math.min(pageHeight * 0.45, contentBottom - (lines.length - 1) * lineHeight);
    for (const line of lines) {
      drawText(line, pageWidth / 2, copyrightY, { variant: "normal", size, align: "center" });
      copyrightY += lineHeight;
    }
    setColor(INK);
  };

  const renderMatterPage = (page: CompiledMatterPage) => {
    if (page.title) {
      renderParagraph(plainRuns(page.title), {
        size: bodySize * 1.5,
        lineHeight: bodySize * 1.8,
        firstIndent: 0,
        bold: true,
        align: "center",
        spacingAfter: bodySize * 0.8
      });
    }
    for (const paragraph of matterParagraphs(page.body)) {
      renderParagraph(plainRuns(paragraph), {
        size: bodySize,
        lineHeight: bodyLine,
        firstIndent: 0,
        justify: tokens.justify,
        spacingAfter: bodySize * 0.6
      });
    }
  };

  const tocHeadingSize = bodySize * 1.5;
  const tocHeadingBaseline = contentTop + tocHeadingSize;
  const tocFirstBaseline = tocHeadingBaseline + bodySize * 1.7;
  const tocLineHeight = bodyLine;
  const tocEntryGap = bodySize * 0.35;
  const tocMaxWidth = contentWidth - 48;
  const tocBottomLimit = contentBottom - bodySize * 0.5;
  const tocEntries = hasTableOfContents
    ? book.chapters.map((chapter) => ({
      label: chapter.label,
      lines: wrapPlainText(chapter.label, tocMaxWidth, "normal", bodySize),
      pageNumber: 0
    }))
    : [];
  let tocPageCount = 0;
  if (hasTableOfContents) {
    tocPageCount = 1;
    let cursor = tocFirstBaseline;
    for (const entry of tocEntries) {
      const height = Math.max(1, entry.lines.length) * tocLineHeight + tocEntryGap;
      if (cursor + height > tocBottomLimit) {
        tocPageCount += 1;
        cursor = contentTop + bodySize;
      }
      cursor += height;
    }
  }
  const tocPageNumbers: number[] = [];
  const chapterStartPages: number[] = [];

  const renderTableOfContents = () => {
    if (!hasTableOfContents || tocPageNumbers.length === 0) return;
    let tocPageIndex = 0;
    let cursor = tocFirstBaseline;
    doc.setPage(tocPageNumbers[0]);
    setColor(INK);
    drawText("Contents", pageWidth / 2, tocHeadingBaseline, {
      variant: "bold",
      size: tocHeadingSize,
      align: "center"
    });

    tocEntries.forEach((entry, index) => {
      const height = Math.max(1, entry.lines.length) * tocLineHeight + tocEntryGap;
      if (cursor + height > tocBottomLimit && tocPageIndex < tocPageNumbers.length - 1) {
        tocPageIndex += 1;
        doc.setPage(tocPageNumbers[tocPageIndex]);
        cursor = contentTop + bodySize;
      }
      setColor(INK);
      entry.lines.forEach((line, lineIndex) => {
        drawText(line, contentLeft, cursor, { variant: "normal", size: bodySize });
        if (lineIndex === entry.lines.length - 1) {
          drawText(String(chapterStartPages[index] ?? 0), contentRight, cursor, {
            variant: "normal",
            size: bodySize,
            align: "right"
          });
        }
        cursor += tocLineHeight;
      });
      cursor += tocEntryGap;
    });
    setColor(INK);
  };

  // Front matter.
  if (book.cover) {
    renderCoverPage();
  }
  if (hasTitlePage) {
    startFrontMatterPage();
    renderTitlePage();
  }
  if (hasCopyrightPage) {
    startFrontMatterPage();
    renderCopyrightPage();
  }
  if (hasDedication) {
    startFrontMatterPage();
    renderDedication();
  }
  if (hasTableOfContents) {
    for (let index = 0; index < tocPageCount; index += 1) {
      startFrontMatterPage();
      tocPageNumbers.push(pageNumber);
    }
  }
  for (const page of book.frontMatter) {
    startFrontMatterPage();
    frontMatterMode = true;
    renderMatterPage(page);
    frontMatterMode = false;
  }

  const bookFootnotes = resolveBookFootnotes(book, options);

  book.chapters.forEach((chapter, chapterIndex) => {
    if (chapterIndex === 0) {
      beginBody();
    } else if (options.pageBreakBeforeChapters) {
      newBodyPage();
    } else {
      ensureSpace(bodyLine * 2);
      y += bodySize * 1.4;
    }

    let chapterStartPage = pageNumber;
    if (options.includeChapterTitles) {
      const headingSize = tokens.chapterHeadingSizePt;
      const headingText = tokens.chapterHeadingUppercase ? chapter.label.toUpperCase() : chapter.label;
      const headingLines = wrapPlainText(headingText, contentWidth, "bold", headingSize);
      ensureSpace(headingLines.length * headingSize * 1.25 + bodyLine * 2);
      chapterStartPage = pageNumber;
      y += tokens.chapterHeadingSpaceBefore * headingSize;
      setColor(INK);
      for (const line of headingLines) {
        drawText(line, tokens.chapterHeadingAlign === "center" ? pageWidth / 2 : contentLeft, y, {
          variant: "bold",
          size: headingSize,
          align: tokens.chapterHeadingAlign === "center" ? "center" : "left"
        });
        y += headingSize * 1.25;
      }
      y += tokens.chapterHeadingSpaceAfter * headingSize;
    }
    chapterStartPages.push(chapterStartPage);

    chapter.scenes.forEach((scene, sceneIndex) => {
      if (options.includeSceneTitles) renderSceneTitle(scene.title);
      const blocks = blocksFromHtml(scene.html);
      const sceneFootnotes = bookFootnotes.byScene.get(scene);
      const dropCapIndex = options.dropCaps && tokens.dropCap && sceneIndex === 0
        ? blocks.findIndex((block) => block.kind === "paragraph" && !block.eyebrow)
        : -1;
      blocks.forEach((block, blockIndex) => {
        renderBlock(
          block,
          blockIndex === 0,
          blockIndex === dropCapIndex,
          sceneFootnotes
        );
      });
      if (sceneIndex < chapter.scenes.length - 1) renderSeparator(options.sceneSeparator);
    });
    renderChapterEndnotes(bookFootnotes.byChapter.get(chapter) ?? []);
  });

  for (const page of book.backMatter) {
    if (bodyStarted) {
      newBodyPage();
    } else {
      beginBody();
    }
    renderMatterPage(page);
  }

  if (bibliography && bibliography.entries.length > 0) {
    if (bodyStarted) {
      newBodyPage();
    } else {
      beginBody();
    }
    renderParagraph(plainRuns(bibliography.heading), {
      size: bodySize * 1.5,
      lineHeight: bodySize * 1.8,
      firstIndent: 0,
      bold: true,
      align: "center",
      spacingAfter: bodySize * 0.8
    });
    const hangingIndent = bodySize * 1.8;
    for (const entry of bibliography.entries) {
      renderParagraph(inlineRunsFromHtml(entry.html), {
        size: bodySize,
        lineHeight: bodyLine,
        firstIndent: -hangingIndent,
        leftIndent: hangingIndent,
        justify: false,
        spacingAfter: bodySize * 0.5
      });
    }
  }

  renderTableOfContents();

  const blob = doc.output("blob");
  return {
    blob,
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.pdf.extension}`,
    extension: FORMAT_INFO.pdf.extension,
    formatName: FORMAT_INFO.pdf.formatName
  };
}
