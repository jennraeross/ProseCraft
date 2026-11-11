import type { DocumentData } from "./publish/types";

/**
 * Story data belongs to scenes: documents that sit in a chapter and are not
 * wiki pages. Trashed scenes and the empty selection never show the panel.
 */
export function shouldShowStoryData(document: DocumentData | null | undefined): document is DocumentData {
  if (!document) return false;
  if (document.trashed) return false;
  if (document.space === "Wiki") return false;
  return Boolean(document.chapterId);
}
