import { prepareBookRichContent } from "../rich/prepare";
import { resolveCoverImage } from "./cover";
import { exportHtml } from "./html";
import { resolveStyleTokens } from "./presets";
import type { CompiledBook, ExportPayload, ExportFormat, PublishOptions } from "./types";
import { FORMAT_INFO, slugifyFilename } from "./types";

const COVER_FORMATS: ExportFormat[] = ["pdf", "epub", "docx", "html"];
const RICH_FORMATS: ExportFormat[] = ["pdf", "epub", "docx", "html"];

/**
 * Loads only the exporter for the chosen format. The document libraries are
 * relatively heavy, so keeping them out of the initial app chunk makes the
 * editor start faster.
 */
export async function renderExport(
  book: CompiledBook,
  options: PublishOptions
): Promise<ExportPayload> {
  const cover = COVER_FORMATS.includes(options.format)
    ? await resolveCoverImage(book, options)
    : null;
  const withCover = cover ? { ...book, cover } : book;
  const preparedBook = RICH_FORMATS.includes(options.format)
    ? await prepareBookRichContent(withCover, {
      mode: options.format === "html" ? "svg" : "png",
      bodySizePt: resolveStyleTokens(options.style, options.customStyles).bodySizePt,
      color: "#1d211d"
    })
    : withCover;

  switch (options.format) {
    case "pdf": {
      const { exportPdf } = await import("./pdf");
      return exportPdf(preparedBook, options);
    }
    case "epub": {
      const { exportEpub } = await import("./epub");
      return exportEpub(preparedBook, options);
    }
    case "docx": {
      const { exportDocx } = await import("./docx");
      return exportDocx(preparedBook, options);
    }
    case "markdown": {
      const { exportMarkdown } = await import("./markdown");
      return exportMarkdown(preparedBook, options);
    }
    case "html":
      return exportHtml(preparedBook, options);
    case "text": {
      const { exportText } = await import("./text");
      return exportText(preparedBook, options);
    }
    case "fountain": {
      const { bookToFountain } = await import("../screenplay/export-fountain");
      return {
        blob: new Blob([bookToFountain(preparedBook)], { type: "text/plain;charset=utf-8" }),
        filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.fountain.extension}`,
        extension: FORMAT_INFO.fountain.extension,
        formatName: FORMAT_INFO.fountain.formatName
      };
    }
    case "screenplay-pdf": {
      const { bookToElements } = await import("../screenplay/export-fountain");
      const { buildScreenplayPdf } = await import("../screenplay/pdf");
      const bytes = buildScreenplayPdf({
        title: preparedBook.title,
        author: preparedBook.author,
        elements: bookToElements(preparedBook)
      });
      return {
        blob: new Blob([bytes], { type: "application/pdf" }),
        filename: `${slugifyFilename(book.title)}.${FORMAT_INFO["screenplay-pdf"].extension}`,
        extension: FORMAT_INFO["screenplay-pdf"].extension,
        formatName: FORMAT_INFO["screenplay-pdf"].formatName
      };
    }
  }
}
