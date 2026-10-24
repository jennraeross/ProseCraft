import { exportHtml } from "./html";
import type { CompiledBook, ExportPayload, PublishOptions } from "./types";

/**
 * Loads only the exporter for the chosen format. The document libraries are
 * relatively heavy, so keeping them out of the initial app chunk makes the
 * editor start faster.
 */
export async function renderExport(
  book: CompiledBook,
  options: PublishOptions
): Promise<ExportPayload> {
  switch (options.format) {
    case "pdf": {
      const { exportPdf } = await import("./pdf");
      return exportPdf(book, options);
    }
    case "epub": {
      const { exportEpub } = await import("./epub");
      return exportEpub(book, options);
    }
    case "docx": {
      const { exportDocx } = await import("./docx");
      return exportDocx(book, options);
    }
    case "markdown": {
      const { exportMarkdown } = await import("./markdown");
      return exportMarkdown(book, options);
    }
    case "html":
      return exportHtml(book, options);
    case "text": {
      const { exportText } = await import("./text");
      return exportText(book, options);
    }
  }
}
