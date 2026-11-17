import { normalizeFootnotes, numberedFootnotes } from "../footnotes";
import { sanitizeHtml } from "../sanitize";
import { hasRichPlaceholders } from "../rich/model";
import { chapterLabel } from "./chapters";
import { countWords, hasVisibleText, htmlToPlainText } from "./content";
import type { MatterPage } from "./matter";
import type {
  ChapterData,
  CompiledBook,
  CompiledChapter,
  CompiledFootnote,
  CompiledMatterPage,
  CompiledScene,
  DocumentData
} from "./types";

type CompileInput = {
  title: string;
  author: string;
  subtitle: string;
  copyright: string;
  dedication: string;
  frontMatter: MatterPage[];
  backMatter: MatterPage[];
  chapters: ChapterData[];
  documents: DocumentData[];
  footnotesRestartPerChapter?: boolean;
};

function compileMatterPages(pages: MatterPage[]): CompiledMatterPage[] {
  return pages
    .map((page) => ({
      id: page.id,
      title: page.title.trim(),
      body: page.body.trim(),
      ...(page.blank === true ? { blank: true } : {})
    }))
    .filter((page) => page.title.length > 0 || page.body.length > 0 || page.blank === true);
}

/**
 * Collects every non-trashed scene in chapter order and returns the manuscript
 * that every exporter renders. Scenes that are empty after sanitizing are
 * omitted, as are chapters with no remaining scenes.
 */
export function compileBook(input: CompileInput): CompiledBook {
  const compiledChapters: CompiledChapter[] = [];
  let nextFootnoteNumber = 0;

  for (const chapter of input.chapters) {
    if (input.footnotesRestartPerChapter) nextFootnoteNumber = 0;
    const scenes: CompiledScene[] = [];
    for (const document of input.documents) {
      if (document.space || document.chapterId !== chapter.id || document.trashed) continue;
      const html = sanitizeHtml(document.content ?? "");
      const rawText = htmlToPlainText(html);
      const richContent = hasRichPlaceholders(html);
      if (!hasVisibleText(rawText) && !richContent
        && !/<img\b[^>]*\bsrc=["']data:image\/(?:png|jpeg|webp);base64,/i.test(html)) continue;
      const orderedFootnotes = numberedFootnotes(html, normalizeFootnotes(document.footnotes) ?? []);
      const footnotes: CompiledFootnote[] = orderedFootnotes.map((fn) => ({
        id: fn.id,
        html: fn.html,
        number: ++nextFootnoteNumber
      }));
      const footnoteNumbers = new Map(footnotes.map((fn) => [fn.id, fn.number]));
      const text = footnotes.length > 0
        ? htmlToPlainText(html, { footnoteNumbers })
        : rawText;
      // List markers are useful in the plain-text export, but they are not
      // words in the manuscript, so leave them out of the displayed count.
      // Math and diagram source are prose tooling, not manuscript words.
      const countableText = htmlToPlainText(html, { rich: "omit" })
        .replace(/^(?:•|\d+\.)\s+/gm, "");
      scenes.push({
        id: document.id,
        sourceId: document.id,
        title: document.title || "Untitled scene",
        html,
        text,
        words: countWords(countableText),
        ...(footnotes.length > 0 ? { footnotes } : {})
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
    frontMatter: compileMatterPages(input.frontMatter),
    backMatter: compileMatterPages(input.backMatter),
    chapters: compiledChapters,
    words: compiledChapters.reduce((total, chapter) => total + chapter.words, 0),
    scenes: compiledChapters.reduce((total, chapter) => total + chapter.scenes.length, 0)
  };
}

export function estimatedPages(words: number, wordsPerPage: number): number | null {
  if (wordsPerPage <= 0) return null;
  return Math.max(1, Math.ceil(words / wordsPerPage));
}
