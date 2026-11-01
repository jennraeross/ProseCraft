import {
  createRichPlaceholder,
  hasRichPlaceholders,
  readRichPlaceholder,
  richPlaceholders,
  type RichKind
} from "./model";
import { applyRichRender, showRichFallback } from "./dom";
import { renderRich, type RichRenderOptions } from "./render";
import type { CompiledBook, CompiledChapter, CompiledScene } from "../publish/types";
import type { ManuscriptSection } from "../publish/sections";

/** Renders every placeholder in a fragment, leaving source text on failure. */
export async function prepareRichHtml(
  html: string,
  options: RichRenderOptions
): Promise<string> {
  if (!hasRichPlaceholders(html)) return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const placeholders = richPlaceholders(parsed.body);
  for (const element of placeholders) {
    const placeholder = readRichPlaceholder(element);
    if (!placeholder) continue;
    try {
      applyRichRender(element, await renderRich(placeholder.kind, placeholder.source, options));
    } catch (error) {
      showRichFallback(
        element,
        placeholder.source,
        error instanceof Error ? error.message : "Could not render this content."
      );
    }
  }
  return parsed.body.innerHTML;
}

export async function prepareChapterRichContent(
  chapter: CompiledChapter,
  options: RichRenderOptions
): Promise<CompiledChapter> {
  if (!chapter.scenes.some((scene) => hasRichPlaceholders(scene.html))) return chapter;
  const scenes: CompiledScene[] = [];
  for (const scene of chapter.scenes) {
    scenes.push({ ...scene, html: await prepareRichHtml(scene.html, options) });
  }
  return { ...chapter, scenes };
}

/** Prepares every chapter for a full-document export. */
export async function prepareBookRichContent(
  book: CompiledBook,
  options: RichRenderOptions
): Promise<CompiledBook> {
  if (!book.chapters.some((chapter) =>
    chapter.scenes.some((scene) => hasRichPlaceholders(scene.html))
  )) {
    return book;
  }
  const chapters: CompiledChapter[] = [];
  for (const chapter of book.chapters) {
    chapters.push(await prepareChapterRichContent(chapter, options));
  }
  return { ...book, chapters };
}

/**
 * Prepares only the chapter that the publish preview is showing. This keeps
 * preview responsive in manuscripts with many equations or diagrams.
 */
export async function prepareBookSectionRichContent(
  book: CompiledBook,
  section: ManuscriptSection | null,
  options: RichRenderOptions
): Promise<CompiledBook> {
  if (!section || section.kind !== "chapter") return book;
  const chapter = book.chapters.find((entry) => entry.id === section.chapterId);
  if (!chapter) return book;
  const prepared = await prepareChapterRichContent(chapter, options);
  return {
    ...book,
    chapters: book.chapters.map((entry) => entry.id === prepared.id ? prepared : entry)
  };
}

export type { RichKind };
export { createRichPlaceholder };
