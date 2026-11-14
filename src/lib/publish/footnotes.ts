import type { CompiledBook, CompiledChapter, CompiledScene, PublishOptions } from "./types";

export type ResolvedFootnote = {
  /** 1-based manuscript-wide index (always unique across the book). */
  index: number;
  /** 1-based displayed number (continuous across book by default, or per-chapter). */
  number: number;
  /** 0-based chapter index in `book.chapters`. */
  chapterIndex: number;
  /** Original footnote id within its scene (`DocumentData.footnotes`). */
  sourceId: string;
  /** Sanitized inline HTML of the footnote body. */
  html: string;
};

export type BookFootnotes = {
  byScene: Map<CompiledScene, Map<string, ResolvedFootnote>>;
  byChapter: Map<CompiledChapter, ResolvedFootnote[]>;
  all: ResolvedFootnote[];
};

/**
 * Resolves footnote numbering across a compiled book in compile order.
 * Continuous across the manuscript by default; restarts at 1 per chapter when
 * `footnotesRestartPerChapter` is true.
 */
export function resolveBookFootnotes(
  book: CompiledBook,
  options?: Pick<PublishOptions, "footnotesRestartPerChapter">
): BookFootnotes {
  const restartPerChapter = Boolean(options?.footnotesRestartPerChapter);
  const byScene = new Map<CompiledScene, Map<string, ResolvedFootnote>>();
  const byChapter = new Map<CompiledChapter, ResolvedFootnote[]>();
  const all: ResolvedFootnote[] = [];
  let globalIndex = 0;

  book.chapters.forEach((chapter, chapterIndex) => {
    const chapterNotes: ResolvedFootnote[] = [];
    for (const scene of chapter.scenes) {
      const sceneMap = new Map<string, ResolvedFootnote>();
      for (const fn of scene.footnotes ?? []) {
        if (sceneMap.has(fn.id)) continue;
        globalIndex += 1;
        const number = restartPerChapter ? chapterNotes.length + 1 : globalIndex;
        const resolved: ResolvedFootnote = {
          index: globalIndex,
          number,
          chapterIndex,
          sourceId: fn.id,
          html: fn.html
        };
        sceneMap.set(fn.id, resolved);
        chapterNotes.push(resolved);
        all.push(resolved);
      }
      if (sceneMap.size > 0) byScene.set(scene, sceneMap);
    }
    if (chapterNotes.length > 0) byChapter.set(chapter, chapterNotes);
  });

  return { byScene, byChapter, all };
}

/** Maps a scene's original footnote ids to their resolved export numbers. */
export function sceneFootnoteNumberMap(
  sceneMap: ReadonlyMap<string, ResolvedFootnote> | undefined
): Map<string, number> {
  const numbers = new Map<string, number>();
  if (!sceneMap) return numbers;
  for (const [id, note] of sceneMap) {
    numbers.set(id, note.number);
  }
  return numbers;
}
