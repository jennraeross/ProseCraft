import type { DocumentData } from "$lib/publish/types";
import { isWholeWord, makeHaystack, type SearchOptions, sourceIndex } from "./search";

export type ReplaceOptions = SearchOptions & {
  /** Also replaces occurrences in the document titles. */
  includeTitles?: boolean;
};

export type ReplaceResult = {
  /** One entry per input document, in input order; only changed ones are new objects. */
  documents: DocumentData[];
  changed: { id: string; count: number }[];
  total: number;
};

type MatchRange = { start: number; length: number };

/** Non-overlapping ranges of an already folded needle, mirroring the search. */
function findRanges(text: string, needle: string, wholeWord: boolean): MatchRange[] {
  const ranges: MatchRange[] = [];
  if (!needle) return ranges;
  let index = text.indexOf(needle);
  while (index !== -1) {
    if (!wholeWord || isWholeWord(text, index, needle.length)) {
      ranges.push({ start: index, length: needle.length });
    }
    index = text.indexOf(needle, index + Math.max(1, needle.length));
  }
  return ranges;
}

/**
 * Replaces the matches of a folded needle in a plain string, which is either a
 * single text node or a title. Returns the input text when nothing changed.
 */
function replaceInText(
  source: string,
  needle: string,
  replacement: string,
  options: { caseSensitive: boolean; wholeWord: boolean }
): { text: string; count: number } {
  const haystack = makeHaystack(source, options.caseSensitive);
  const ranges = findRanges(haystack.text, needle, options.wholeWord);
  if (ranges.length === 0) return { text: source, count: 0 };

  let text = "";
  let cursor = 0;
  for (const range of ranges) {
    const start = sourceIndex(haystack, range.start);
    const end = sourceIndex(haystack, range.start + range.length);
    text += source.slice(cursor, start) + replacement;
    cursor = end;
  }
  text += source.slice(cursor);
  return text === source ? { text: source, count: 0 } : { text, count: ranges.length };
}

/** Parses the HTML and replaces inside its text nodes only. */
function replaceInHtml(
  html: string,
  needle: string,
  replacement: string,
  options: { caseSensitive: boolean; wholeWord: boolean }
): { html: string; count: number } {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  let count = 0;
  for (const node of nodes) {
    const result = replaceInText(node.data, needle, replacement, options);
    if (result.count === 0) continue;
    node.data = result.text;
    count += result.count;
  }
  // Untouched markup keeps its original string; serializing could rewrite entities.
  if (count === 0) return { html, count };
  return { html: parsed.body.innerHTML, count };
}

/**
 * Replaces a literal query in every text node of the scene and wiki page HTML.
 *
 * Matching follows `searchDocuments`: literal query, folded diacritics and case
 * unless `caseSensitive` is set, optional whole words. Markup and attribute
 * values stay as they are, and the replacement text is inserted literally.
 * The Markdown mirror is dropped on body edits, like the editor does, so the
 * open layout regenerates it from the new HTML instead of keeping stale text.
 */
export function replaceInDocuments(
  documents: DocumentData[],
  query: string,
  replacement: string,
  options: ReplaceOptions = {},
  onlyIds?: Set<string>
): ReplaceResult {
  const needle = query.trim();
  if (!needle) return { documents, changed: [], total: 0 };

  const { caseSensitive = false, wholeWord = false, includeTrashed = false, includeTitles = false } = options;
  // Folding the query the same way as the text keeps the two comparable.
  const searchFor = makeHaystack(needle, caseSensitive).text;
  const textOptions = { caseSensitive, wholeWord };
  const changed: ReplaceResult["changed"] = [];
  let total = 0;

  const next = documents.map((document) => {
    const kind: "scene" | "wiki" | null = document.chapterId
      ? "scene"
      : document.space === "Wiki" ? "wiki" : null;
    if (!kind) return document;
    if (!includeTrashed && document.trashed) return document;
    if (onlyIds && !onlyIds.has(document.id)) return document;

    const body = replaceInHtml(document.content, searchFor, replacement, textOptions);
    const title = includeTitles ? replaceInText(document.title, searchFor, replacement, textOptions) : null;
    const count = body.count + (title?.count ?? 0);
    if (count === 0) return document;

    const updated: DocumentData = {
      ...document,
      title: title ? title.text : document.title,
      content: body.html
    };
    if (body.count > 0) delete updated.markdownSource;
    changed.push({ id: document.id, count });
    total += count;
    return updated;
  });

  return { documents: next, changed, total };
}
