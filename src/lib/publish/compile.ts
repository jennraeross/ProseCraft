import { sanitizeHtml } from "../sanitize";
import { chapterLabel } from "./chapters";
import { countWords, hasVisibleText, htmlToPlainText } from "./content";
import type {
  ChapterData,
  CompiledBook,
  CompiledChapter,
  CompiledScene,
  DocumentData
} from "./types";

type CompileInput = {
  title: string;
  author: string;
  subtitle: string;
  copyright: string;
  dedication: string;
  chapters: ChapterData[];
  documents: DocumentData[];
};

/**
 * Collects every non-trashed scene in chapter order and returns the manuscript
 * that every exporter renders. Scenes that are empty after sanitizing are
 * omitted, as are chapters with no remaining scenes.
 */
export function compileBook(input: CompileInput): CompiledBook {
  const compiledChapters: CompiledChapter[] = [];

  for (const chapter of input.chapters) {
    const scenes: CompiledScene[] = [];
    for (const document of input.documents) {
      if (document.space || document.chapterId !== chapter.id || document.trashed) continue;
      const html = sanitizeHtml(document.content ?? "");
      const text = htmlToPlainText(html);
      if (!hasVisibleText(text) && !/<img\b[^>]*\bsrc=["']data:image\/(?:png|jpeg|webp);base64,/i.test(html)) continue;
      // List markers are useful in the plain-text export, but they are not
      // words in the manuscript, so leave them out of the displayed count.
      const countableText = text.replace(/^(?:•|\d+\.)\s+/gm, "");
      scenes.push({
        id: document.id,
        sourceId: document.id,
        title: document.title || "Untitled scene",
        html,
        text,
        words: countWords(countableText)
      });
    }

    if (scenes.length === 0) continue;
    compiledChapters.push({
      id: chapter.id,
      label: chapterLabel(chapter, input.chapters),
      title: chapter.title,
      scenes,
      words: scenes.reduce((total, scene) => total + scene.words, 0)
    });
  }

  return {
    title: input.title.trim() || "Untitled",
    subtitle: input.subtitle.trim(),
    author: input.author.trim(),
    copyright: input.copyright.trim(),
    dedication: input.dedication.trim(),
    chapters: compiledChapters,
    words: compiledChapters.reduce((total, chapter) => total + chapter.words, 0),
    scenes: compiledChapters.reduce((total, chapter) => total + chapter.scenes.length, 0)
  };
}

export function estimatedPages(words: number, wordsPerPage: number): number | null {
  if (wordsPerPage <= 0) return null;
  return Math.max(1, Math.ceil(words / wordsPerPage));
}
