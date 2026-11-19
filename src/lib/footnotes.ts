import type { FootnoteDef } from "./publish/types";
import { CITE_REF_CLASS, FOOTNOTE_REF_CLASS, isValidFootnoteId, sanitizeInlineHtml } from "./sanitize";

export const FOOTNOTE_REF_SELECTOR = `sup.${FOOTNOTE_REF_CLASS}[data-footnote-id]`;

export type FootnoteIdFactory = () => string;

export type NumberedFootnote = {
  id: string;
  number: number;
  html: string;
  missingDefinition: boolean;
};

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Generates a short, valid footnote identifier such as `fn-k3x9a2`. */
export function createFootnoteId(random: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(Math.max(0, Math.min(0.999999999, random())) * ID_ALPHABET.length);
    suffix += ID_ALPHABET[index];
  }
  return `fn-${suffix}`;
}

/** Builds the canonical empty, non-editable marker HTML for a footnote id. */
export function footnoteMarkerHtml(id: string): string {
  if (!isValidFootnoteId(id)) {
    throw new Error(`Invalid footnote id: ${id}`);
  }
  return `<sup class="${FOOTNOTE_REF_CLASS}" data-footnote-id="${id}" contenteditable="false"></sup>`;
}

/** Returns all valid footnote ids referenced in `html` in document order. */
export function extractFootnoteIds(html: string): string[] {
  if (!html || !html.includes(FOOTNOTE_REF_CLASS)) return [];
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const ids: string[] = [];
  for (const element of parsed.body.querySelectorAll(FOOTNOTE_REF_SELECTOR)) {
    const id = element.getAttribute("data-footnote-id") ?? "";
    if (isValidFootnoteId(id)) ids.push(id);
  }
  return ids;
}

/** Maps each referenced footnote id to its 1-based number in document order. */
export function footnoteNumbers(html: string): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const id of extractFootnoteIds(html)) {
    if (!numbers.has(id)) {
      numbers.set(id, numbers.size + 1);
    }
  }
  return numbers;
}

/** Returns referenced footnotes in document order paired with their definitions. */
export function numberedFootnotes(
  html: string,
  footnotes: readonly FootnoteDef[] = []
): NumberedFootnote[] {
  const defs = new Map(footnotes.map((fn) => [fn.id, fn]));
  const result: NumberedFootnote[] = [];
  for (const [id, number] of footnoteNumbers(html)) {
    const def = defs.get(id);
    result.push({
      id,
      number,
      html: def ? def.html : "",
      missingDefinition: !def
    });
  }
  return result;
}

/** Returns definitions in `footnotes` that have no marker in `html`. */
export function findOrphanFootnotes(
  html: string,
  footnotes: readonly FootnoteDef[] = []
): FootnoteDef[] {
  const referenced = footnoteNumbers(html);
  return footnotes.filter((fn) => !referenced.has(fn.id));
}

/** Returns a new list keeping only definitions referenced in `html`. */
export function pruneOrphanFootnotes(
  html: string,
  footnotes: readonly FootnoteDef[] = []
): FootnoteDef[] {
  const referenced = footnoteNumbers(html);
  return footnotes.filter((fn) => referenced.has(fn.id));
}

/** Returns unique referenced footnote ids in `html` that lack a definition. */
export function findDanglingFootnoteRefs(
  html: string,
  footnotes: readonly FootnoteDef[] = []
): string[] {
  const defined = new Set(footnotes.map((fn) => fn.id));
  const dangling: string[] = [];
  for (const id of footnoteNumbers(html).keys()) {
    if (!defined.has(id)) dangling.push(id);
  }
  return dangling;
}

/**
 * Validates and sanitizes an unknown footnote array while preserving `undefined`
 * when no footnote list is present on a document.
 */
export function normalizeFootnotes(value: unknown): FootnoteDef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const result: FootnoteDef[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Partial<FootnoteDef>;
    if (
      typeof item.id !== "string"
      || !isValidFootnoteId(item.id)
      || seen.has(item.id)
      || typeof item.html !== "string"
    ) {
      continue;
    }
    seen.add(item.id);
    result.push({
      id: item.id,
      html: sanitizeInlineHtml(item.html)
    });
  }
  return result;
}

function nextUniqueId(
  existing: readonly FootnoteDef[],
  idFactory: FootnoteIdFactory
): string {
  const used = new Set(existing.map((fn) => fn.id));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = idFactory();
    if (!isValidFootnoteId(candidate)) {
      throw new Error(`Invalid footnote id from factory: ${candidate}`);
    }
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Footnote id factory failed to produce a unique id.");
}

/** Immutably appends a new sanitized footnote definition using `idFactory`. */
export function addFootnote(
  footnotes: readonly FootnoteDef[] | undefined,
  html = "",
  idFactory: FootnoteIdFactory = createFootnoteId
): { footnotes: FootnoteDef[]; footnote: FootnoteDef; markerHtml: string } {
  const list = footnotes ?? [];
  const id = nextUniqueId(list, idFactory);
  const footnote: FootnoteDef = {
    id,
    html: sanitizeInlineHtml(html)
  };
  return {
    footnotes: [...list, footnote],
    footnote,
    markerHtml: footnoteMarkerHtml(id)
  };
}

/** Immutably updates the sanitized HTML of an existing footnote by id. */
export function updateFootnote(
  footnotes: readonly FootnoteDef[] | undefined,
  id: string,
  html: string
): FootnoteDef[] {
  const clean = sanitizeInlineHtml(html);
  return (footnotes ?? []).map((fn) => (fn.id === id ? { ...fn, html: clean } : fn));
}

/**
 * Immutably gives a document a new footnote list (none when empty). A stored
 * `markdownSource` holds the footnote definitions too, and the open sync folder
 * writes and reads that source, so it is dropped when the list changes;
 * otherwise the next sync would bring the old definitions back.
 */
export function withFootnotes<T extends { footnotes?: FootnoteDef[]; markdownSource?: string }>(
  doc: T,
  footnotes: readonly FootnoteDef[] | undefined
): T {
  const next = footnotes ?? [];
  const current = doc.footnotes ?? [];
  const same = next.length === current.length
    && next.every((fn, index) => fn.id === current[index].id && fn.html === current[index].html);
  if (same) return doc;
  const { footnotes: _old, markdownSource: _source, ...rest } = doc;
  return (next.length > 0 ? { ...rest, footnotes: [...next] } : rest) as T;
}

/** Immutably removes a footnote definition by id. */
export function removeFootnote(
  footnotes: readonly FootnoteDef[] | undefined,
  id: string
): FootnoteDef[] {
  return (footnotes ?? []).filter((fn) => fn.id !== id);
}

/** Immutably removes all markers for `id` from `html`. */
export function removeFootnoteRefFromHtml(html: string, id: string): string {
  if (!html || !isValidFootnoteId(id) || !html.includes(id)) return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  for (const element of parsed.body.querySelectorAll(FOOTNOTE_REF_SELECTOR)) {
    if (element.getAttribute("data-footnote-id") === id) {
      element.remove();
      changed = true;
    }
  }
  return changed ? parsed.body.innerHTML : html;
}

/**
 * Light DOM pass that assigns `data-num="1..N"` to each `sup.footnote-ref`
 * marker in document order while keeping every marker empty and non-editable.
 */
export function renumberFootnoteMarkers(root: ParentNode): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const element of root.querySelectorAll<HTMLElement>(FOOTNOTE_REF_SELECTOR)) {
    const id = element.getAttribute("data-footnote-id") ?? "";
    if (!isValidFootnoteId(id)) {
      element.removeAttribute("data-num");
      continue;
    }
    let num = numbers.get(id);
    if (num === undefined) {
      num = numbers.size + 1;
      numbers.set(id, num);
    }
    const nextNum = String(num);
    if (element.getAttribute("data-num") !== nextNum) {
      element.setAttribute("data-num", nextNum);
    }
    if (element.getAttribute("contenteditable") !== "false") {
      element.setAttribute("contenteditable", "false");
    }
    if (element.childNodes.length > 0) {
      element.replaceChildren();
    }
  }
  return numbers;
}

export type UndoFootnoteScopeEntry = {
  docId: string;
  footnotes?: readonly FootnoteDef[];
};

const UNDO_FOOTNOTES_SUFFIX_RE = /\n<!--prosecraft-footnotes:(\[[\s\S]*\])-->$/;

/**
 * Encodes editor HTML together with active document footnotes into one string so
 * `UndoManager` diffs, undoes, and redoes markers and definitions atomically.
 */
export function encodeBodyUndoValue(
  html: string,
  entries: readonly UndoFootnoteScopeEntry[]
): string {
  const compact: Array<{ docId: string; footnotes: FootnoteDef[] }> = [];
  for (const entry of entries) {
    if (!entry.docId || !entry.footnotes || entry.footnotes.length === 0) continue;
    const normalized = normalizeFootnotes(entry.footnotes);
    if (normalized && normalized.length > 0) {
      compact.push({ docId: entry.docId, footnotes: normalized });
    }
  }
  if (compact.length === 0) return html;
  return `${html}\n<!--prosecraft-footnotes:${JSON.stringify(compact)}-->`;
}

/** Decodes an editor undo value back into sanitized HTML and per-document footnotes. */
export function decodeBodyUndoValue(
  value: string
): { html: string; footnotes: Map<string, FootnoteDef[]> } {
  const footnotes = new Map<string, FootnoteDef[]>();
  const match = UNDO_FOOTNOTES_SUFFIX_RE.exec(value);
  if (!match) return { html: value, footnotes };
  const html = value.slice(0, match.index);
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item !== "object" || item === null) continue;
        const record = item as { docId?: unknown; footnotes?: unknown };
        if (typeof record.docId !== "string" || !record.docId) continue;
        const normalized = normalizeFootnotes(record.footnotes);
        if (normalized && normalized.length > 0) {
          footnotes.set(record.docId, normalized);
        }
      }
    }
  } catch {
    return { html: value, footnotes };
  }
  return { html, footnotes };
}

export type PastedFootnoteSources = {
  /** Ids with a marker in the editor right now. */
  inEditor: ReadonlySet<string>;
  /** Ids defined on a scene open in the editor. */
  definedHere: ReadonlySet<string>;
  /** A footnote cut from the editor, which a paste moves back. */
  cutNote: (id: string) => FootnoteDef | undefined;
  /** A footnote defined on any document of the project. */
  note: (id: string) => FootnoteDef | undefined;
  /** Every footnote id in use in the project, so a copy gets a fresh one. */
  takenIds: ReadonlySet<string>;
  idFactory?: FootnoteIdFactory;
};

/**
 * Prepares pasted editor HTML so each footnote marker has a note of its own.
 * A cut footnote that no document defines any more is moved back: it keeps
 * its id and note, and is listed in `moved`. A footnote still defined
 * somewhere is copied, as a copied footnote is in a word processor: the
 * marker gets a new id and its own copy of the note. A marker with no note
 * anywhere (copied from another project) is dropped.
 */
export function adoptPastedFootnotes(
  html: string,
  sources: PastedFootnoteSources
): { html: string; added: FootnoteDef[]; moved: string[] } {
  if (!html.includes(FOOTNOTE_REF_CLASS)) return { html, added: [], moved: [] };
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const added: FootnoteDef[] = [];
  const moved: string[] = [];
  const taken = [...sources.takenIds].map((id) => ({ id, html: "" }));
  const resolved = new Map<string, string | null>();
  const copy = (source: FootnoteDef | undefined): string => {
    const id = nextUniqueId([...taken, ...added], sources.idFactory ?? createFootnoteId);
    added.push({ id, html: source?.html ?? "" });
    return id;
  };
  const resolve = (id: string): string | null => {
    if (sources.inEditor.has(id)) return copy(sources.note(id));
    if (sources.definedHere.has(id)) return id;
    const defined = sources.note(id);
    const cut = sources.cutNote(id);
    if (cut && !defined) {
      added.push({ id, html: cut.html });
      moved.push(id);
      return id;
    }
    return defined || cut ? copy(defined ?? cut) : null;
  };
  for (const marker of Array.from(parsed.body.querySelectorAll<HTMLElement>(FOOTNOTE_REF_SELECTOR))) {
    const id = marker.getAttribute("data-footnote-id") ?? "";
    if (!resolved.has(id)) resolved.set(id, resolve(id));
    const next = resolved.get(id);
    if (next) marker.setAttribute("data-footnote-id", next);
    else marker.remove();
  }
  return { html: parsed.body.innerHTML, added, moved };
}

/**
 * Pasted footnote markers and citations without `contenteditable="false"`.
 * Chromium lifts non-editable elements out of the paragraph when it inserts
 * HTML; the editor makes the markers non-editable again once they are in.
 */
export function editableMarkersHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const marker of Array.from(parsed.body.querySelectorAll(`sup.${FOOTNOTE_REF_CLASS}, span.${CITE_REF_CLASS}`))) {
    marker.removeAttribute("contenteditable");
  }
  return parsed.body.innerHTML;
}

/** Removes every footnote marker from `html`. */
export function stripFootnoteMarkers(html: string): string {
  if (!html.includes(FOOTNOTE_REF_CLASS)) return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const marker of Array.from(parsed.body.querySelectorAll(`sup.${FOOTNOTE_REF_CLASS}`))) marker.remove();
  return parsed.body.innerHTML;
}
