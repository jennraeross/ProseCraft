import { htmlToPlainText } from "$lib/publish/content";
import type { DocumentData } from "$lib/publish/types";

export type SearchHit = {
  documentId: string;
  title: string;
  kind: "scene" | "wiki";
  chapterTitle?: string;
  snippet: string;
  matchStart: number;
  matchLength: number;
  matches: number;
};

export type SearchChapter = { id: string; title: string; trashed?: boolean };

export type SearchOptions = {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includeTrashed?: boolean;
};

/** Hits beyond this count are dropped so huge projects stay scannable. */
export const MAX_SEARCH_HITS = 200;

/** Roughly how much source text a snippet shows around its match. */
const SNIPPET_LENGTH = 80;
const SNIPPET_CONTEXT_BEFORE = 40;
const ELLIPSIS = "…";

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE = /\s+/g;
const WORD_CHARACTER_AT_END = /[\p{L}\p{N}_]$/u;
const WORD_CHARACTER_AT_START = /^[\p{L}\p{N}_]/u;

type MatchRange = { start: number; length: number };
type Matches = { first: MatchRange | null; count: number };

type Candidate = {
  hit: SearchHit;
  titleMatch: boolean;
  kindRank: number;
  chapterIndex: number;
  documentIndex: number;
};

type Haystack = {
  /** Text the query is compared against; folded when the search ignores case. */
  text: string;
  /** Original text that snippets are cut from. */
  source: string;
  /** Source index per folded character; `null` when folding kept every offset. */
  offsets: number[] | null;
};

/**
 * Lowercases and strips diacritics so "Kapten" finds "Käpten". Only the
 * case-insensitive path folds; snippets always show the source text.
 */
function fold(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

function foldWithOffsets(value: string): { text: string; offsets: number[] } {
  let text = "";
  const offsets: number[] = [];
  let index = 0;
  for (const character of value) {
    const folded = fold(character);
    text += folded;
    for (let offset = 0; offset < folded.length; offset += 1) offsets.push(index);
    index += character.length;
  }
  return { text, offsets };
}

export function makeHaystack(value: string, caseSensitive: boolean): Haystack {
  if (caseSensitive) return { text: value, source: value, offsets: null };
  const folded = fold(value);
  // Folding normally keeps the length, so offsets line up with the source.
  // Decompositions that do change it (Hangul syllables, for example) need a map.
  if (folded.length === value.length) return { text: folded, source: value, offsets: null };
  const mapped = foldWithOffsets(value);
  return { text: mapped.text, source: value, offsets: mapped.offsets };
}

export function sourceIndex(haystack: Haystack, index: number): number {
  if (!haystack.offsets) return index;
  return index < haystack.offsets.length ? haystack.offsets[index] : haystack.source.length;
}

export function isWholeWord(text: string, start: number, length: number): boolean {
  // Two characters of context keep astral letters intact under the `/u` flag.
  const before = text.slice(Math.max(0, start - 2), start);
  const after = text.slice(start + length, start + length + 2);
  return !WORD_CHARACTER_AT_END.test(before) && !WORD_CHARACTER_AT_START.test(after);
}

function findMatches(text: string, needle: string, wholeWord: boolean): Matches {
  let first: MatchRange | null = null;
  let count = 0;
  if (!needle) return { first, count };
  let index = text.indexOf(needle);
  while (index !== -1) {
    if (!wholeWord || isWholeWord(text, index, needle.length)) {
      if (!first) first = { start: index, length: needle.length };
      count += 1;
    }
    index = text.indexOf(needle, index + Math.max(1, needle.length));
  }
  return { first, count };
}

function collapseWhitespace(value: string): string {
  return value.replace(WHITESPACE, " ").trim();
}

/** Cuts a window of source text around `[start, start + length)` and marks the cut ends. */
function buildSnippet(source: string, start: number, length: number): { snippet: string; matchStart: number } {
  let from = Math.max(0, start - SNIPPET_CONTEXT_BEFORE);
  let to = Math.min(source.length, Math.max(start + length, from + SNIPPET_LENGTH));
  // Near the end of the text, grow the window backwards instead of shortening it.
  if (to === source.length) from = Math.max(0, Math.min(from, source.length - SNIPPET_LENGTH));
  if (from > 0 && from < start && source[from] === " ") from += 1;
  if (to < source.length && source[to - 1] === " ") to -= 1;
  const prefix = from > 0 ? ELLIPSIS : "";
  const suffix = to < source.length ? ELLIPSIS : "";
  return {
    snippet: `${prefix}${source.slice(from, to)}${suffix}`,
    matchStart: prefix.length + (start - from)
  };
}

/**
 * Finds a literal query in the titles and plain text of scenes and wiki pages.
 *
 * Scenes are documents with a `chapterId`, wiki pages have `space: "Wiki"`;
 * everything else is skipped. Each hit carries a short snippet cut around the
 * first match and the offset of that match inside the snippet. `matches` counts
 * every occurrence in the title and the body. Results list title matches first,
 * then scenes in chapter order, then wiki pages.
 */
export function searchDocuments(
  documents: DocumentData[],
  chapters: SearchChapter[],
  query: string,
  options: SearchOptions = {}
): SearchHit[] {
  const needle = query.trim();
  if (!needle) return [];

  const { caseSensitive = false, wholeWord = false, includeTrashed = false } = options;
  const searchFor = caseSensitive ? needle : fold(needle);

  const chapterInfo = new Map<string, { index: number; title: string; trashed: boolean }>();
  chapters.forEach((chapter, index) => {
    if (!chapterInfo.has(chapter.id)) {
      chapterInfo.set(chapter.id, { index, title: chapter.title, trashed: Boolean(chapter.trashed) });
    }
  });

  const candidates: Candidate[] = [];

  documents.forEach((document, documentIndex) => {
    const kind: SearchHit["kind"] | null = document.chapterId
      ? "scene"
      : document.space === "Wiki" ? "wiki" : null;
    if (!kind) return;
    const chapter = document.chapterId ? chapterInfo.get(document.chapterId) : undefined;
    if (!includeTrashed && (document.trashed || chapter?.trashed)) return;

    const title = makeHaystack(collapseWhitespace(document.title), caseSensitive);
    const body = makeHaystack(collapseWhitespace(htmlToPlainText(document.content)), caseSensitive);
    const titleMatches = findMatches(title.text, searchFor, wholeWord);
    const bodyMatches = findMatches(body.text, searchFor, wholeWord);
    const matches = titleMatches.count + bodyMatches.count;
    if (matches === 0) return;

    const titleHit = titleMatches.first;
    const container = titleHit ? title : body;
    const range = titleHit ?? bodyMatches.first;
    if (!range) return;

    const start = sourceIndex(container, range.start);
    const end = sourceIndex(container, range.start + range.length);
    const { snippet, matchStart } = buildSnippet(container.source, start, end - start);

    candidates.push({
      hit: {
        documentId: document.id,
        title: document.title,
        kind,
        ...(kind === "scene" && chapter ? { chapterTitle: chapter.title } : {}),
        snippet,
        matchStart,
        matchLength: end - start,
        matches
      },
      titleMatch: Boolean(titleHit),
      kindRank: kind === "scene" ? 0 : 1,
      chapterIndex: chapter?.index ?? Number.MAX_SAFE_INTEGER,
      documentIndex
    });
  });

  candidates.sort((a, b) =>
    Number(b.titleMatch) - Number(a.titleMatch)
    || a.kindRank - b.kindRank
    || a.chapterIndex - b.chapterIndex
    || a.documentIndex - b.documentIndex
  );
  return candidates.slice(0, MAX_SEARCH_HITS).map((candidate) => candidate.hit);
}
