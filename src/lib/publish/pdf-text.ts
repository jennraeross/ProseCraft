/**
 * Extracts text from a generated PDF for assertions. jsPDF embeds subsetted
 * TrueType fonts with Identity-H encoding, so the raw content streams contain
 * glyph ids rather than readable strings; pdf.js resolves them through the
 * ToUnicode CMaps.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join("")
    );
  }
  await loadingTask.destroy();
  return pages.join("\n");
}
