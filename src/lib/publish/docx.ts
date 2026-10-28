import {
  AlignmentType,
  Document,
  DropCapType,
  ExternalHyperlink,
  Footer,
  FrameAnchorType,
  FrameWrap,
  Header,
  HorizontalPositionAlign,
  ImageRun,
  LineRuleType,
  PageNumber,
  PageBreak,
  Packer,
  Paragraph,
  TableOfContents,
  TextRun,
  VerticalAlignSection,
  VerticalPositionAlign,
  type FileChild,
  type IRunOptions,
  type ISectionOptions,
  type ParagraphChild
} from "docx";
import { matterParagraphs } from "./matter";
import { resolveStyleTokens } from "./presets";
import { decodeEmbeddedImage } from "./embedded-image";
import { blocksFromHtml, trimRuns, type Block, type InlineRun } from "./rich-text";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type CompiledCover,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

const twip = (points: number) => Math.round(points * 20);
const halfPoint = (points: number) => Math.round(points * 2);

function runOptions(run: InlineRun): Pick<IRunOptions, "bold" | "italics" | "underline" | "strike"> {
  return {
    bold: run.bold || undefined,
    italics: run.italic || undefined,
    underline: run.underline ? {} : undefined,
    strike: run.strike || undefined
  };
}

function linesToTextRuns(text: string, textOptions: Omit<IRunOptions, "text" | "break"> = {}): TextRun[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines.flatMap((line, index) => [
    ...(index > 0 ? [new TextRun({ break: 1 })] : []),
    new TextRun({ text: line, ...textOptions })
  ]);
}

function inlineToChildren(runs: InlineRun[]): ParagraphChild[] {
  return runs.map((run) => {
    if (run.lineBreak) return new TextRun({ break: 1 });
    if (run.link) {
      return new ExternalHyperlink({
        link: run.link,
        children: [new TextRun({ text: run.text, ...runOptions(run) })]
      });
    }
    return new TextRun({ text: run.text, ...runOptions(run) });
  });
}

function blockToParagraph(block: Block, options: {
  firstInScene: boolean;
  dropCap: boolean;
  bodyStyle: string;
}): Paragraph[] {
  if (block.kind === "image") return [];
  if (block.kind === "heading") {
    return [new Paragraph({
      style: block.level === 1 ? "SceneHeading1" : block.level === 2 ? "SceneHeading2" : "SceneHeading3",
      children: inlineToChildren(block.runs)
    })];
  }

  if (block.kind === "quote") {
    return [new Paragraph({
      style: "Quote",
      children: inlineToChildren(block.runs)
    })];
  }

  if (block.kind === "list") {
    const marker = new TextRun({ text: `${block.marker} `, ...runOptions({ text: "" }) });
    return [new Paragraph({
      style: "ListParagraph",
      children: [marker, ...inlineToChildren(block.runs)]
    })];
  }

  if (block.eyebrow) {
    return [new Paragraph({
      style: "Eyebrow",
      children: inlineToChildren(block.runs)
    })];
  }

  let runs = block.runs;
  const paragraphs: Paragraph[] = [];

  if (options.dropCap) {
    const firstIndex = runs.findIndex((run) => !run.lineBreak && /\S/.test(run.text));
    if (firstIndex >= 0) {
      const run = runs[firstIndex];
      const match = run.text.match(/^(\s*)(\S)/);
      if (match) {
        const [, leading, letter] = match;
        const rest = run.text.slice(leading.length + letter.length);
        const dropCapParagraph = new Paragraph({
          frame: {
            type: "alignment",
            alignment: { x: HorizontalPositionAlign.LEFT, y: VerticalPositionAlign.TOP },
            anchor: { horizontal: FrameAnchorType.TEXT, vertical: FrameAnchorType.TEXT },
            dropCap: DropCapType.DROP,
            lines: 3,
            wrap: FrameWrap.AROUND
          },
          children: [new TextRun({ text: letter, bold: true })]
        });
        paragraphs.push(dropCapParagraph);
        runs = [...runs];
        if (rest.length > 0) {
          runs[firstIndex] = { ...run, text: rest };
        } else {
          runs.splice(firstIndex, 1);
        }
        runs = trimRuns(runs);
      }
    }
  }

  paragraphs.push(new Paragraph({
    style: options.bodyStyle,
    indent: options.firstInScene || options.dropCap ? { firstLine: 0 } : undefined,
    children: inlineToChildren(runs)
  }));
  return paragraphs;
}

async function imageToParagraph(block: Block, maxWidth: number, maxHeight: number): Promise<Paragraph> {
  const src = block.image?.src;
  if (!src) throw new Error("The document contains an image without source data.");
  const image = await decodeEmbeddedImage(src);
  const width = block.image?.width ?? image.width;
  const height = block.image?.height ?? image.height;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  const displayWidth = Math.max(1, Math.round(width * scale));
  const displayHeight = Math.max(1, Math.round(height * scale));
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      data: image.bytes,
      type: image.extension,
      transformation: { width: displayWidth, height: displayHeight },
      altText: { name: block.image?.alt || "Embedded image", description: block.image?.alt ?? "" }
    })]
  });
}

function separatorParagraph(separator: SceneSeparator): Paragraph | null {
  const symbol = separator === "hash"
    ? "#"
    : separator === "asterisks"
      ? "* * *"
      : separator === "line"
        ? "—"
        : "";
  if (separator === "none") return null;
  return new Paragraph({
    style: "SceneBreak",
    children: [new TextRun({ text: symbol || " ", size: halfPoint(10) })]
  });
}

async function coverSection(
  cover: CompiledCover,
  page: { widthPt: number; heightPt: number }
): Promise<ISectionOptions> {
  const image = await decodeEmbeddedImage(cover.dataUrl);
  const pageWidthPx = page.widthPt * 96 / 72;
  const pageHeightPx = page.heightPt * 96 / 72;
  const scale = Math.min(pageWidthPx / image.width, pageHeightPx / image.height);
  const displayWidth = Math.max(1, Math.round(image.width * scale));
  const displayHeight = Math.max(1, Math.round(image.height * scale));

  return {
    properties: {
      page: {
        size: { width: twip(page.widthPt), height: twip(page.heightPt) },
        margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 }
      }
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            data: image.bytes,
            type: image.extension,
            transformation: { width: displayWidth, height: displayHeight },
            altText: { name: "Cover", description: "" }
          })
        ]
      })
    ]
  };
}

export async function exportDocx(book: CompiledBook, options: PublishOptions): Promise<ExportPayload> {
  const tokens = resolveStyleTokens(options.style, options.customStyles);
  const bodySize = halfPoint(tokens.bodySizePt);
  const chapterSize = halfPoint(tokens.chapterHeadingSizePt);
  const lineSpacing = Math.round(tokens.lineHeight * 240);
  const paragraphSpacing = Math.round(tokens.paragraphSpacingEm * tokens.bodySizePt * 20);
  const firstLineIndent = Math.round(tokens.paragraphIndentEm * tokens.bodySizePt * 20);

  const pageProperties = {
    size: { width: twip(tokens.page.widthPt), height: twip(tokens.page.heightPt) },
    margin: {
      top: twip(tokens.page.marginTopPt),
      right: twip(tokens.page.marginRightPt),
      bottom: twip(tokens.page.marginBottomPt),
      left: twip(tokens.page.marginLeftPt),
      header: 720,
      footer: 720
    }
  };

  const titleMatter: Paragraph[] = [];
  if (options.includeTitlePage) {
    titleMatter.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: book.title, bold: true, size: 56 })]
    }));
    if (book.subtitle) {
      titleMatter.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
        children: [new TextRun({ text: book.subtitle, italics: true, size: 26, color: "666666" })]
      }));
    }
    if (book.author) {
      titleMatter.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 720 },
        children: [new TextRun({ text: `by ${book.author}`, allCaps: true, size: 24, color: "666666" })]
      }));
    }
    if (book.copyright && !options.includeCopyrightPage) {
      titleMatter.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 2400 },
        children: linesToTextRuns(book.copyright, { size: 18, color: "666666" })
      }));
    }
  }

  if (options.includeCopyrightPage && book.copyright) {
    if (titleMatter.length > 0) {
      titleMatter.push(new Paragraph({ children: [new PageBreak()] }));
    }
    titleMatter.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3600 },
      children: linesToTextRuns(book.copyright, { size: 18, color: "666666" })
    }));
  }

  if (book.dedication) {
    if (titleMatter.length > 0) {
      titleMatter.push(new Paragraph({ children: [new PageBreak()] }));
    }
    titleMatter.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3600 },
      children: linesToTextRuns(book.dedication, { italics: true, size: bodySize })
    }));
  }

  const frontMatter: FileChild[] = [];
  if (options.includeTableOfContents && book.chapters.length > 0) {
    frontMatter.push(new TableOfContents("Contents", {
      hyperlink: true,
      headingStyleRange: "1-1",
      cachedEntries: book.chapters.map((chapter) => ({ title: chapter.label, level: 1 }))
    }));
  }
  for (const page of book.frontMatter) {
    if (frontMatter.length > 0) {
      frontMatter.push(new Paragraph({ children: [new PageBreak()] }));
    }
    const paragraphs = matterParagraphs(page.body);
    if (page.title) {
      frontMatter.push(new Paragraph({
        style: "MatterTitle",
        children: linesToTextRuns(page.title)
      }));
    }
    for (const paragraph of paragraphs) {
      frontMatter.push(new Paragraph({
        style: "MatterBody",
        children: linesToTextRuns(paragraph)
      }));
    }
    if (page.blank && !page.title && paragraphs.length === 0) {
      frontMatter.push(new Paragraph({ children: [] }));
    }
  }

  const body: Paragraph[] = [];
  const imageMaxWidth = (tokens.page.widthPt - tokens.page.marginLeftPt - tokens.page.marginRightPt) * 96 / 72;
  const imageMaxHeight = Math.min(
    384,
    (tokens.page.heightPt - tokens.page.marginTopPt - tokens.page.marginBottomPt) * 96 / 72
  );
  for (const [chapterIndex, chapter] of book.chapters.entries()) {
    const pageBreakBefore = chapterIndex > 0 && options.pageBreakBeforeChapters;
    if (options.includeChapterTitles) {
      body.push(new Paragraph({
        style: "ChapterTitle",
        pageBreakBefore,
        children: [new TextRun({ text: chapter.label })]
      }));
    } else if (pageBreakBefore) {
      body.push(new Paragraph({ pageBreakBefore, spacing: { before: 0, after: 0 } }));
    }

    for (const [sceneIndex, scene] of chapter.scenes.entries()) {
      if (options.includeSceneTitles) {
        body.push(new Paragraph({
          style: "SceneTitle",
          children: [new TextRun({ text: scene.title })]
        }));
      }
      const blocks = blocksFromHtml(scene.html);
      const dropCapIndex = options.dropCaps && tokens.dropCap && sceneIndex === 0
        ? blocks.findIndex((block) => block.kind === "paragraph" && !block.eyebrow)
        : -1;
      for (const [blockIndex, block] of blocks.entries()) {
        if (block.kind === "image") {
          body.push(await imageToParagraph(block, imageMaxWidth, imageMaxHeight));
          continue;
        }
        body.push(...blockToParagraph(block, {
          firstInScene: blockIndex === 0,
          dropCap: blockIndex === dropCapIndex,
          bodyStyle: "BodyText"
        }));
      }
      if (sceneIndex < chapter.scenes.length - 1) {
        const separator = separatorParagraph(options.sceneSeparator);
        if (separator) body.push(separator);
      }
    }
  }

  for (const page of book.backMatter) {
    body.push(new Paragraph({ children: [new PageBreak()] }));
    const paragraphs = matterParagraphs(page.body);
    if (page.title) {
      body.push(new Paragraph({
        style: "MatterTitle",
        children: linesToTextRuns(page.title)
      }));
    }
    for (const paragraph of paragraphs) {
      body.push(new Paragraph({
        style: "MatterBody",
        children: linesToTextRuns(paragraph)
      }));
    }
    if (page.blank && !page.title && paragraphs.length === 0) {
      body.push(new Paragraph({ children: [] }));
    }
  }

  const sections: ISectionOptions[] = [];
  if (book.cover) {
    sections.push(await coverSection(book.cover, tokens.page));
  }
  if (titleMatter.length > 0) {
    sections.push({
      properties: { page: pageProperties, verticalAlign: VerticalAlignSection.CENTER },
      children: titleMatter
    });
  }
  if (frontMatter.length > 0) {
    sections.push({
      properties: { page: pageProperties },
      children: frontMatter
    });
  }

  sections.push({
    properties: { page: pageProperties },
    headers: tokens.runningHeader
      ? { default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: book.author ? `${book.author} / ${book.title}` : book.title,
          size: 18,
          color: "777777",
          allCaps: true
        })]
      })] }) }
      : undefined,
    footers: tokens.pageNumbers
      ? { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "777777" })]
      })] }) }
      : undefined,
    children: body
  });

  const doc = new Document({
    title: book.title,
    creator: book.author || undefined,
    description: book.subtitle || undefined,
    styles: {
      default: {
        document: {
          run: { font: tokens.docxFont, size: bodySize },
          paragraph: {
            spacing: { line: lineSpacing, lineRule: LineRuleType.AUTO, after: paragraphSpacing }
          }
        }
      },
      paragraphStyles: [
        {
          id: "BodyText",
          name: "Body Text",
          basedOn: "Normal",
          next: "BodyText",
          quickFormat: true,
          run: { font: tokens.docxFont, size: bodySize },
          paragraph: {
            alignment: tokens.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
            spacing: { line: lineSpacing, lineRule: LineRuleType.AUTO, after: paragraphSpacing },
            indent: { firstLine: firstLineIndent }
          }
        },
        {
          id: "ChapterTitle",
          name: "Chapter Title",
          basedOn: "Normal",
          next: "BodyText",
          quickFormat: true,
          run: {
            font: tokens.docxFont,
            size: chapterSize,
            bold: true,
            allCaps: tokens.chapterHeadingUppercase
          },
          paragraph: {
            alignment: tokens.chapterHeadingAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
            outlineLevel: 0,
            spacing: {
              before: Math.round(tokens.chapterHeadingSpaceBefore * tokens.chapterHeadingSizePt * 20),
              after: Math.round(tokens.chapterHeadingSpaceAfter * tokens.chapterHeadingSizePt * 20)
            },
            keepNext: true
          }
        },
        {
          id: "MatterTitle",
          name: "Matter Title",
          basedOn: "Normal",
          next: "MatterBody",
          quickFormat: true,
          run: {
            font: tokens.docxFont,
            size: halfPoint(tokens.bodySizePt * 1.5),
            bold: true
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 1200, after: 360 },
            indent: { firstLine: 0 },
            keepNext: true
          }
        },
        {
          id: "MatterBody",
          name: "Matter Body",
          basedOn: "BodyText",
          next: "MatterBody",
          quickFormat: true,
          run: { font: tokens.docxFont, size: bodySize },
          paragraph: {
            spacing: { line: lineSpacing, lineRule: LineRuleType.AUTO, after: paragraphSpacing },
            indent: { firstLine: 0 }
          }
        },
        {
          id: "Eyebrow",
          name: "Eyebrow",
          basedOn: "Normal",
          next: "BodyText",
          quickFormat: true,
          run: {
            font: tokens.docxFont,
            size: halfPoint(tokens.bodySizePt * 0.68),
            bold: true,
            allCaps: true,
            color: "777777"
          },
          paragraph: {
            spacing: { before: 120, after: 120 },
            indent: { firstLine: 0 },
            keepNext: true
          }
        },
        {
          id: "SceneTitle",
          name: "Scene Title",
          basedOn: "BodyText",
          next: "BodyText",
          quickFormat: true,
          run: { font: tokens.docxFont, size: bodySize, bold: true, italics: true },
          paragraph: { spacing: { before: 240, after: 120 }, indent: { firstLine: 0 } }
        },
        {
          id: "SceneHeading1",
          name: "Scene Heading 1",
          basedOn: "BodyText",
          next: "BodyText",
          quickFormat: true,
          run: { font: tokens.docxFont, size: halfPoint(tokens.bodySizePt * 1.45), bold: true },
          paragraph: { spacing: { before: 240, after: 120 }, indent: { firstLine: 0 }, keepNext: true }
        },
        {
          id: "SceneHeading2",
          name: "Scene Heading 2",
          basedOn: "BodyText",
          next: "BodyText",
          quickFormat: true,
          run: { font: tokens.docxFont, size: halfPoint(tokens.bodySizePt * 1.28), bold: true },
          paragraph: { spacing: { before: 220, after: 110 }, indent: { firstLine: 0 }, keepNext: true }
        },
        {
          id: "SceneHeading3",
          name: "Scene Heading 3",
          basedOn: "BodyText",
          next: "BodyText",
          quickFormat: true,
          run: { font: tokens.docxFont, size: halfPoint(tokens.bodySizePt * 1.12), bold: true },
          paragraph: { spacing: { before: 200, after: 100 }, indent: { firstLine: 0 }, keepNext: true }
        },
        {
          id: "Quote",
          name: "Quote",
          basedOn: "BodyText",
          next: "BodyText",
          quickFormat: true,
          run: { font: tokens.docxFont, size: bodySize, italics: true, color: "666666" },
          paragraph: {
            spacing: { before: 120, after: 120 },
            indent: { left: 720, firstLine: 0 }
          }
        },
        {
          id: "ListParagraph",
          name: "List Paragraph",
          basedOn: "BodyText",
          next: "BodyText",
          quickFormat: true,
          paragraph: {
            spacing: { after: 120 },
            indent: { left: 720, hanging: 360, firstLine: 0 }
          }
        },
        {
          id: "SceneBreak",
          name: "Scene Break",
          basedOn: "BodyText",
          next: "BodyText",
          quickFormat: true,
          run: { font: tokens.docxFont, size: halfPoint(10), color: "777777" },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: {
              before: Math.round(tokens.sceneBreakSpacing * tokens.bodySizePt * 20),
              after: Math.round(tokens.sceneBreakSpacing * tokens.bodySizePt * 20)
            },
            indent: { firstLine: 0 }
          }
        }
      ]
    },
    sections
  });

  const blob = await Packer.toBlob(doc);
  return {
    blob,
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.docx.extension}`,
    extension: FORMAT_INFO.docx.extension,
    formatName: FORMAT_INFO.docx.formatName
  };
}
