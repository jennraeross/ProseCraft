import type { DocumentData } from "./publish/types";

/**
 * The character card lives in the Network view: the maintainer asked for it
 * there (context menu and network cards), so the editor header only shows the
 * title and the page text. The decision stays in one place so the card can be
 * brought back for a page kind without touching the route again.
 */
export function showCardInEditor(document: DocumentData | null | undefined): boolean {
  return false;
}
