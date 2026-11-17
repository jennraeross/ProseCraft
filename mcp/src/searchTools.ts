import { findProjectDir } from "./openStore.js";
import { readStoredChapters, readStoredDocuments } from "./readTools.js";

export type SearchSpace = "scene" | "wiki";

export type SearchDocumentsOptions = {
  /** Only scenes or only Wiki pages. */
  space?: SearchSpace;
  chapterId?: string;
  folderId?: string;
  labelId?: string;
  /** Search the Trash too. */
  includeTrashed?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  /** Hits beyond this count are dropped; defaults to 30 and never exceeds 100. */
  limit?: number;
};

export type SearchDocumentHit = {
  id: string;
  title: string;
  space: SearchSpace;
  /** Title of the scene's chapter; null for Wiki pages. */
  chapterTitle: string | null;
  labelId: string | null;
  /** Occurrences of the query in the title and the body. */
  matches: number;
  /** About 80 characters of plain text around the first match. */
  snippet: string;
};

export const DEFAULT_SEARCH_LIMIT = 30;
export const MAX_SEARCH_LIMIT = 100;

// Matching rules mirror the app search in `src/lib/search.ts`. The mcp package
// compiles with its own rootDir, so it cannot import that module; the parity
// test in `searchTools.test.ts` runs both implementations over the same inputs.
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WHITESPACE = /\s+/g;
const WORD_CHARACTER_AT_END = /[\p{L}\p{N}_]$/u;
const WORD_CHARACTER_AT_START = /^[\p{L}\p{N}_]/u;

/** Roughly how much source text a snippet shows around its match. */
const SNIPPET_LENGTH = 80;
const SNIPPET_CONTEXT_BEFORE = 40;
const ELLIPSIS = "…";

type MatchRange = { start: number; length: number };
type Matches = { first: MatchRange | null; count: number };

type Haystack = {
  /** Text the query is compared against; folded when the search ignores case. */
  text: string;
  /** Original text that snippets are cut from. */
  source: string;
  /** Source index per folded character; `null` when folding kept every offset. */
  offsets: number[] | null;
};

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

function makeHaystack(value: string, caseSensitive: boolean): Haystack {
  if (caseSensitive) return { text: value, source: value, offsets: null };
  const folded = fold(value);
  // Folding normally keeps the length, so offsets line up with the source.
  if (folded.length === value.length) return { text: folded, source: value, offsets: null };
  const mapped = foldWithOffsets(value);
  return { text: mapped.text, source: value, offsets: mapped.offsets };
}

function sourceIndex(haystack: Haystack, index: number): number {
  if (!haystack.offsets) return index;
  return index < haystack.offsets.length ? haystack.offsets[index] : haystack.source.length;
}

function isWholeWord(text: string, start: number, length: number): boolean {
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
function buildSnippet(source: string, start: number, length: number): string {
  let from = Math.max(0, start - SNIPPET_CONTEXT_BEFORE);
  let to = Math.min(source.length, Math.max(start + length, from + SNIPPET_LENGTH));
  // Near the end of the text, grow the window backwards instead of shortening it.
  if (to === source.length) from = Math.max(0, Math.min(from, source.length - SNIPPET_LENGTH));
  if (from > 0 && from < start && source[from] === " ") from += 1;
  if (to < source.length && source[to - 1] === " ") to -= 1;
  const prefix = from > 0 ? ELLIPSIS : "";
  const suffix = to < source.length ? ELLIPSIS : "";
  return `${prefix}${source.slice(from, to)}${suffix}`;
}

/**
 * The open layout stores bodies as Markdown, while the app searches the plain
 * text of its HTML content. Dropping the common block and inline syntax keeps
 * snippets readable; every marker becomes a space, so words do not fuse.
 */
function markdownToPlainText(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, " ")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1");
  return collapseWhitespace(text);
}

type Candidate = {
  hit: SearchDocumentHit;
  titleMatch: boolean;
  kindRank: number;
  chapterIndex: number;
  documentIndex: number;
};

/**
 * Finds a literal query in the titles and bodies of scenes and Wiki pages,
 * with the matching rules of the app search (`src/lib/search.ts`): diacritics
 * are folded unless `caseSensitive`, and `wholeWord` skips partial words.
 * Title matches come first, then scenes in chapter order, then Wiki pages.
 */
export async function searchDocuments(
  root: string,
  projectId: string,
  query: string,
  options: SearchDocumentsOptions = {}
): Promise<SearchDocumentHit[]> {
  const needle = query.trim();
  if (!needle) return [];

  const { dir, header } = await findProjectDir(root, projectId);
  const documents = await readStoredDocuments(dir, header);
  const chapters = new Map((await readStoredChapters(dir, header)).map((chapter) => [chapter.id, chapter]));
  const chapterOrder = new Map((header.order.chapters ?? []).map((id, index) => [id, index]));

  const { caseSensitive = false, wholeWord = false, includeTrashed = false } = options;
  const searchFor = caseSensitive ? needle : fold(needle);
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);

  const candidates: Candidate[] = [];

  documents.forEach((document, documentIndex) => {
    const { fields } = document;
    const storedChapterId = typeof fields.chapterId === "string" && fields.chapterId ? fields.chapterId : null;
    const kind: SearchSpace | null = storedChapterId ? "scene" : fields.space === "Wiki" ? "wiki" : null;
    if (!kind) return;
    if (options.space !== undefined && options.space !== kind) return;
    const chapter = storedChapterId ? chapters.get(storedChapterId) : undefined;
    if (!includeTrashed && (fields.trashed === true || chapter?.trashed === true)) return;
    if (options.chapterId !== undefined && storedChapterId !== options.chapterId) return;
    if (options.folderId !== undefined && fields.folderId !== options.folderId) return;
    if (options.labelId !== undefined && fields.labelId !== options.labelId) return;

    const title = typeof fields.title === "string" ? fields.title : "";
    const titleHaystack = makeHaystack(collapseWhitespace(title), caseSensitive);
    const bodyHaystack = makeHaystack(markdownToPlainText(document.body), caseSensitive);
    const titleMatches = findMatches(titleHaystack.text, searchFor, wholeWord);
    const bodyMatches = findMatches(bodyHaystack.text, searchFor, wholeWord);
    const matches = titleMatches.count + bodyMatches.count;
    if (matches === 0) return;

    const titleHit = titleMatches.first;
    const container = titleHit ? titleHaystack : bodyHaystack;
    const range = titleHit ?? bodyMatches.first;
    if (!range) return;
    const start = sourceIndex(container, range.start);
    const end = sourceIndex(container, range.start + range.length);

    candidates.push({
      hit: {
        id: document.id,
        title,
        space: kind,
        chapterTitle: kind === "scene" && chapter ? chapter.title : null,
        labelId: typeof fields.labelId === "string" ? fields.labelId : null,
        matches,
        snippet: buildSnippet(container.source, start, end - start)
      },
      titleMatch: Boolean(titleHit),
      kindRank: kind === "scene" ? 0 : 1,
      chapterIndex: storedChapterId ? (chapterOrder.get(storedChapterId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      documentIndex
    });
  });

  candidates.sort((a, b) =>
    Number(b.titleMatch) - Number(a.titleMatch)
    || a.kindRank - b.kindRank
    || a.chapterIndex - b.chapterIndex
    || a.documentIndex - b.documentIndex
  );
  return candidates.slice(0, limit).map((candidate) => candidate.hit);
}
