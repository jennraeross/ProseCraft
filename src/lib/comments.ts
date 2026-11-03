import type { TextComment } from "$lib/storage/types";

/** How many characters before and after the quote are kept to tell repeated phrases apart. */
export const CONTEXT_LENGTH = 24;
const MAX_QUOTE_LENGTH = 2000;
const MAX_BODY_LENGTH = 4000;
const MAX_AUTHOR_LENGTH = 60;

export type CommentAnchor = Pick<TextComment, "quote" | "prefix" | "suffix">;

/** Builds an anchor for `text.slice(start, end)`; null when nothing but whitespace is selected. */
export function buildAnchor(text: string, start: number, end: number): CommentAnchor | null {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  const quote = text.slice(from, to);
  if (!quote.trim()) return null;
  return {
    quote: quote.slice(0, MAX_QUOTE_LENGTH),
    prefix: text.slice(Math.max(0, from - CONTEXT_LENGTH), from),
    suffix: text.slice(to, to + CONTEXT_LENGTH)
  };
}

function commonSuffixLength(a: string, b: string): number {
  let count = 0;
  while (count < a.length && count < b.length && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1;
  return count;
}

function commonPrefixLength(a: string, b: string): number {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
  return count;
}

/**
 * Finds the passage again after the text has been edited. With several
 * occurrences of the quote, the one whose surroundings match best wins.
 * Returns null when the quote is gone.
 */
export function locateAnchor(text: string, anchor: CommentAnchor): { start: number; end: number } | null {
  if (!anchor.quote) return null;
  let best: { start: number; score: number } | null = null;
  let index = text.indexOf(anchor.quote);
  while (index !== -1) {
    const before = text.slice(Math.max(0, index - CONTEXT_LENGTH), index);
    const after = text.slice(index + anchor.quote.length, index + anchor.quote.length + CONTEXT_LENGTH);
    const score = commonSuffixLength(before, anchor.prefix) + commonPrefixLength(after, anchor.suffix);
    if (!best || score > best.score) best = { start: index, score };
    index = text.indexOf(anchor.quote, index + 1);
  }
  return best ? { start: best.start, end: best.start + anchor.quote.length } : null;
}

export function createComment(options: {
  id: string;
  documentId: string;
  anchor: CommentAnchor;
  body: string;
  author: string;
  now: number;
}): TextComment {
  return {
    id: options.id,
    documentId: options.documentId,
    quote: options.anchor.quote,
    prefix: options.anchor.prefix,
    suffix: options.anchor.suffix,
    body: options.body.trim().slice(0, MAX_BODY_LENGTH),
    author: options.author.trim().slice(0, MAX_AUTHOR_LENGTH) || "Me",
    createdAt: options.now,
    resolved: false
  };
}

export function commentsForDocument(comments: readonly TextComment[], documentId: string): TextComment[] {
  return comments.filter((comment) => comment.documentId === documentId);
}

export function setCommentResolved(
  comments: readonly TextComment[],
  id: string,
  resolved: boolean
): TextComment[] {
  return comments.map((comment) => (comment.id === id ? { ...comment, resolved } : comment));
}

export function removeComment(comments: readonly TextComment[], id: string): TextComment[] {
  return comments.filter((comment) => comment.id !== id);
}

/** Drops comments whose document no longer exists (for example after emptying the trash). */
export function dropOrphanComments(
  comments: readonly TextComment[],
  documentIds: ReadonlySet<string>
): TextComment[] {
  return comments.filter((comment) => documentIds.has(comment.documentId));
}

/** Accepts stored data of unknown shape and keeps only well-formed comments. */
export function normalizeComments(value: unknown): TextComment[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: TextComment[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Partial<TextComment>;
    if (typeof item.id !== "string" || !item.id || seen.has(item.id)
      || typeof item.documentId !== "string" || typeof item.quote !== "string" || !item.quote
      || typeof item.prefix !== "string" || typeof item.suffix !== "string"
      || typeof item.body !== "string" || typeof item.author !== "string"
      || typeof item.createdAt !== "number") continue;
    seen.add(item.id);
    result.push({
      id: item.id,
      documentId: item.documentId,
      quote: item.quote.slice(0, MAX_QUOTE_LENGTH),
      prefix: item.prefix.slice(-CONTEXT_LENGTH),
      suffix: item.suffix.slice(0, CONTEXT_LENGTH),
      body: item.body.slice(0, MAX_BODY_LENGTH),
      author: item.author.slice(0, MAX_AUTHOR_LENGTH),
      createdAt: item.createdAt,
      resolved: item.resolved === true
    });
  }
  return result;
}
