import type { DocumentData } from "./publish/types";

export type TileDocumentPatch = { title?: string; content?: string };

/**
 * Applies an edit made in a reference tile to one document. A changed body
 * drops the cached markdown source, like the main editor's input handler does;
 * title-only patches leave the content alone.
 */
export function patchTileDocument(
  documents: readonly DocumentData[],
  id: string,
  patch: TileDocumentPatch
): DocumentData[] {
  return documents.map((doc) => {
    if (doc.id !== id) return doc;
    const title = patch.title ?? doc.title;
    if (patch.content === undefined || patch.content === doc.content) {
      return title === doc.title ? doc : { ...doc, title };
    }
    const { markdownSource: _markdownSource, ...withoutMarkdownSource } = doc;
    return { ...withoutMarkdownSource, title, content: patch.content };
  });
}
