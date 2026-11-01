import { prepareBookRichContent } from "../rich/prepare";
import { resolveCoverImage } from "./cover";
import { exportHtml } from "./html";
import { resolveStyleTokens } from "./presets";
import type { CompiledBook, ExportPayload, ExportFormat, PublishOptions } from "./types";

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
  }
}
