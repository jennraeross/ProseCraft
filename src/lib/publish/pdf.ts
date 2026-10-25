import { jsPDF } from "jspdf";
import { PRESETS, type PresetTokens } from "./presets";
import { blocksFromHtml, type Block, type InlineRun } from "./rich-text";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

type TextToken = {
  text: string;
  width: number;
  isSpace: boolean;
  lineBreak?: boolean;
  run: InlineRun;
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
  bold?: boolean;
  italic?: boolean;
  spacingBefore?: number;
  spacingAfter?: number;
  color?: [number, number, number];
  dropCap?: boolean;
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

export function exportPdf(book: CompiledBook, options: PublishOptions): ExportPayload {
  const tokens = PRESETS[options.style];
  const pdfFont = tokens.pdfFont;
  const pageWidth = tokens.page.widthPt;
  const pageHeight = tokens.page.heightPt;
  const contentLeft = tokens.page.marginLeftPt;
  const contentRight = pageWidth - tokens.page.marginRightPt;
  const contentTop = tokens.page.marginTopPt;
  const contentBottom = pageHeight - tokens.page.marginBottomPt;
  const contentWidth = contentRight - contentLeft;
  const bodySize = tokens.bodySizePt;
  const bodyLine = bodySize * tokens.lineHeight;
  const hasFrontMatter = options.includeTitlePage || Boolean(book.dedication);

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

  let pageNumber = 1;
  let y = contentTop + bodySize;
  let bodyStarted = false;

  const setFont = (style: string, size: number) => {
    doc.setFont(pdfFont, style);
    doc.setFontSize(size);
  };

  const setColor = (color: [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);

  const drawHeaderFooter = () => {
    if (tokens.runningHeader) {
      const header = book.author ? `${book.author} / ${book.title}` : book.title;
      setFont("normal", 8.5);
      setColor(MUTED);
      doc.text(header, pageWidth / 2, tokens.page.marginTopPt / 2 + 3, { align: "center" });
    }
    if (tokens.pageNumbers) {
      setFont("normal", 8.5);
      setColor(MUTED);
      doc.text(String(pageNumber), pageWidth / 2, pageHeight - tokens.page.marginBottomPt / 2 + 3, { align: "center" });
    }
    setColor(INK);
  };

  const newBodyPage = () => {
    doc.addPage();
    pageNumber += 1;
    y = contentTop + bodySize;
    drawHeaderFooter();
  };

  const beginBody = () => {
    if (bodyStarted) return;
    if (hasFrontMatter) {
      doc.addPage();
      pageNumber += 1;
    }
    bodyStarted = true;
    y = contentTop + bodySize;
    drawHeaderFooter();
  };

  const ensureSpace = (height: number) => {
    if (y + height > contentBottom) newBodyPage();
  };

  const measure = (text: string, run: InlineRun, size: number, bold = false, italic = false): number => {
    setFont(fontStyle(run, bold, italic), size);
    return doc.getTextWidth(text);
  };

  const tokenize = (runs: InlineRun[], size: number, forceBold = false, forceItalic = false): TextToken[] => {
    const tokens: TextToken[] = [];
    for (const run of runs) {
      if (run.lineBreak) {
        tokens.push({ text: "", width: 0, isSpace: false, lineBreak: true, run });
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
      setFont(fontStyle(token.run, forceBold, forceItalic), size);
      doc.text(token.text, cursor, baseline);
      if (token.run.underline) {
        doc.line(cursor, baseline + 2, cursor + token.width, baseline + 2);
      }
      if (token.run.strike) {
        doc.line(cursor, baseline - size * 0.3, cursor + token.width, baseline - size * 0.3);
      }
      cursor += token.width + (token.isSpace ? extra : 0);
    }
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
          setFont("bold", bodySize * 5.2);
          dropCapWidth = doc.getTextWidth(letter) + 3;
        }
      }
    }

    const tokens = tokenize(drawRuns, opts.size, opts.bold, opts.italic);
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
      drawLine(
        line,
        contentLeft + leftIndent + indent + offset,
        y,
        opts.size,
        opts.bold ?? false,
        opts.italic ?? false,
        opts.justify ?? false
      );
      y += opts.lineHeight;
    }

    if (dropCapLetter) {
      setColor(color);
      setFont("bold", bodySize * 5.2);
      const dropBaseline = startY + (dropCapLines - 1) * opts.lineHeight;
      doc.text(dropCapLetter, contentLeft + leftIndent, dropBaseline);
      if (lines.length < dropCapLines) {
        y += (dropCapLines - lines.length) * opts.lineHeight;
      }
    }

    y += opts.spacingAfter ?? 0;
    setColor(INK);
  };

  const renderHeading = (block: Block, size: number) => {
    const spacingBefore = size * 0.8;
    const spacingAfter = size * 0.35;
    const runs = block.runs.map((run) => ({ ...run, bold: true }));
    renderParagraph(runs, {
      size,
      lineHeight: size * 1.3,
      firstIndent: 0,
      spacingBefore,
      spacingAfter,
      bold: true
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

  const renderBlock = (block: Block, firstInScene: boolean, allowDropCap: boolean) => {
    if (block.kind === "image") {
      renderImage(block);
      return;
    }
    if (block.kind === "heading") {
      const size = bodySize * (block.level === 1 ? 1.45 : block.level === 2 ? 1.28 : 1.12);
      renderHeading(block, size);
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
          color: MUTED
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
          spacingAfter: bodySize * 0.2
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
          color: MUTED
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
      dropCap: allowDropCap
    });
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
      setFont("normal", bodySize * 0.9);
      doc.text("#", pageWidth / 2, y, { align: "center" });
    } else if (separator === "asterisks") {
      setFont("normal", bodySize * 0.9);
      doc.text("* * *", pageWidth / 2, y, { align: "center" });
    } else if (separator === "line") {
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.line(pageWidth / 2 - 32, y - bodySize * 0.3, pageWidth / 2 + 32, y - bodySize * 0.3);
    }
    y += spacing / 2;
    setColor(INK);
  };

  const renderTitlePage = () => {
    const titleSize = Math.min(bodySize * 2.7, 34);
    setFont("normal", titleSize);
    setColor(INK);
    const titleLines = doc.splitTextToSize(book.title, contentWidth) as string[];
    const titleBlock = titleLines.length * titleSize * 1.18;
    let titleY = pageHeight * 0.3;
    for (const line of titleLines) {
      doc.text(line, pageWidth / 2, titleY, { align: "center" });
      titleY += titleSize * 1.18;
    }
    if (book.subtitle) {
      setFont("italic", bodySize * 1.1);
      setColor(MUTED);
      doc.text(book.subtitle, pageWidth / 2, titleY + 16, { align: "center" });
    }
    if (book.author) {
      setFont("normal", bodySize);
      setColor(MUTED);
      doc.text(`by ${book.author}`, pageWidth / 2, pageHeight * 0.55, { align: "center" });
    }
    if (book.copyright) {
      setFont("normal", 8.5);
      setColor(MUTED);
      const lines = doc.splitTextToSize(book.copyright, contentWidth * 0.9) as string[];
      let copyrightY = pageHeight - tokens.page.marginBottomPt - (lines.length - 1) * 11;
      for (const line of lines) {
        doc.text(line, pageWidth / 2, copyrightY, { align: "center" });
        copyrightY += 11;
      }
    }
    setColor(INK);
  };

  const renderDedication = () => {
    setFont("italic", bodySize * 1.05);
    setColor(MUTED);
    const lines = doc.splitTextToSize(book.dedication, contentWidth * 0.7) as string[];
    let dedicationY = pageHeight * 0.45;
    for (const line of lines) {
      doc.text(line, pageWidth / 2, dedicationY, { align: "center" });
      dedicationY += bodySize * 1.55;
    }
    setColor(INK);
    y = contentTop + bodySize;
  };

  // Front matter.
  if (options.includeTitlePage) renderTitlePage();
  if (book.dedication) {
    if (options.includeTitlePage) {
      doc.addPage();
      pageNumber += 1;
    }
    renderDedication();
  }

  book.chapters.forEach((chapter, chapterIndex) => {
    if (chapterIndex === 0) {
      beginBody();
    } else if (options.pageBreakBeforeChapters) {
      newBodyPage();
    } else {
      ensureSpace(bodyLine * 2);
      y += bodySize * 1.4;
    }

    if (options.includeChapterTitles) {
      const headingSize = tokens.chapterHeadingSizePt;
      const headingText = tokens.chapterHeadingUppercase ? chapter.label.toUpperCase() : chapter.label;
      const headingLines = doc.splitTextToSize(headingText, contentWidth) as string[];
      ensureSpace(headingLines.length * headingSize * 1.25 + bodyLine * 2);
      y += tokens.chapterHeadingSpaceBefore * headingSize;
      setFont("bold", headingSize);
      setColor(INK);
      for (const line of headingLines) {
        doc.text(line, tokens.chapterHeadingAlign === "center" ? pageWidth / 2 : contentLeft, y, {
          align: tokens.chapterHeadingAlign === "center" ? "center" : "left"
        });
        y += headingSize * 1.25;
      }
      y += tokens.chapterHeadingSpaceAfter * headingSize;
    }

    chapter.scenes.forEach((scene, sceneIndex) => {
      if (options.includeSceneTitles) renderSceneTitle(scene.title);
      const blocks = blocksFromHtml(scene.html);
      const dropCapIndex = options.dropCaps && tokens.dropCap && sceneIndex === 0
        ? blocks.findIndex((block) => block.kind === "paragraph" && !block.eyebrow)
        : -1;
      blocks.forEach((block, blockIndex) => {
        renderBlock(
          block,
          blockIndex === 0,
          blockIndex === dropCapIndex
        );
      });
      if (sceneIndex < chapter.scenes.length - 1) renderSeparator(options.sceneSeparator);
    });
  });

  const blob = doc.output("blob");
  return {
    blob,
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.pdf.extension}`,
    extension: FORMAT_INFO.pdf.extension,
    formatName: FORMAT_INFO.pdf.formatName
  };
}
