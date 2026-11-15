/**
 * Collects cited sources in manuscript compile order, resolves inline citation
 * markers across body and footnote HTML, and formats the bibliography.
 *
 * Style-kind behaviour at export:
 * - `"author-date"` (`apa7`, `chicago-author-date`, `mla9`, `harvard`, `din1505`):
 *   Replaces each `span.cite-ref` marker inline with the formatted author-year
 *   or author-page text/HTML, computing year disambiguation suffixes over the
 *   cited works.
 * - `"numeric"` (`ieee`, `vancouver`):
 *   Numbers cited sources `1..N` by first appearance in compile order (across
 *   body prose and footnotes) and replaces each `span.cite-ref` inline with its
 *   bracketed/formatted number.
 * - `"note"` (`chicago-notes`):
 *   Converts each `span.cite-ref` in body prose into an automatic export
 *   footnote (`sup.footnote-ref` + `CompiledFootnote`) interleaved in reading
 *   order with any manual footnotes. Citations already placed inside a manual
 *   footnote remain inline inside that footnote (never nested).
 */

import { htmlToPlainText } from "../publish/content";
import type {
  CompiledBook,
  CompiledChapter,
  CompiledFootnote,
  CompiledScene,
  PublishOptions
} from "../publish/types";
import { FOOTNOTE_REF_CLASS } from "../sanitize";
import { CITE_REF_CLASS, CITE_REF_SELECTOR, parseCiteData, type CiteRefItem } from "./cite-marker";
import type { CslItem } from "./csl";
import {
  computeDisambiguation,
  formatBibliography,
  formatCitation,
  type CitationItemInput,
  type FormattedBibliographyEntry
} from "./format";
import { getStyleMeta, type CitationLocale, type CitationStyleId } from "./styles";

export type BookBibliography = {
  heading: string;
  style: CitationStyleId;
  locale: CitationLocale;
  entries: FormattedBibliographyEntry[];
};

export type ResolvedBookCitations = {
  book: CompiledBook;
  bibliography: BookBibliography | null;
  citedIds: string[];
};

type LibraryLookup = {
  byId: Map<string, CslItem>;
  byCiteKey: Map<string, CslItem>;
};

/** Localized heading for the exported bibliography section. */
export function bibliographyHeading(locale: CitationLocale = "en"): string {
  return locale === "de" ? "Literaturverzeichnis" : "Bibliography";
}

function buildLibraryLookup(items: readonly CslItem[]): LibraryLookup {
  const byId = new Map<string, CslItem>();
  const byCiteKey = new Map<string, CslItem>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
    if (item.citeKey && !byCiteKey.has(item.citeKey)) {
      byCiteKey.set(item.citeKey, item);
    }
  }
  return { byId, byCiteKey };
}

function resolveItem(id: string, lookup: LibraryLookup): CslItem | undefined {
  return lookup.byId.get(id) ?? lookup.byCiteKey.get(id);
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sceneHasCiteRef(scene: CompiledScene): boolean {
  if (scene.html.includes(CITE_REF_CLASS)) return true;
  return Boolean(scene.footnotes?.some((fn) => fn.html.includes(CITE_REF_CLASS)));
}

function bookHasCiteRef(chapters: readonly CompiledChapter[]): boolean {
  return chapters.some((chapter) => chapter.scenes.some(sceneHasCiteRef));
}

function parseBodyDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function htmlToFragment(doc: Document, html: string): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  if (!html) return fragment;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const child of Array.from(parsed.body.childNodes)) {
    fragment.append(doc.importNode(child, true));
  }
  return fragment;
}

function collectCitedFromHtml(
  html: string,
  lookup: LibraryLookup,
  seen: Set<string>,
  collected: CslItem[]
): void {
  if (!html.includes(CITE_REF_CLASS)) return;
  const parsed = parseBodyDocument(html);
  for (const element of parsed.body.querySelectorAll(CITE_REF_SELECTOR)) {
    const cites = parseCiteData(element.getAttribute("data-cites"));
    if (!cites) continue;
    for (const cite of cites) {
      const item = resolveItem(cite.id, lookup);
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        collected.push(item);
      }
    }
  }
}

/**
 * Collects unique cited `CslItem`s in manuscript compile order, walking each
 * scene's body HTML and following referenced footnotes in document order.
 */
export function collectCitedSources(
  chapters: readonly CompiledChapter[],
  library: readonly CslItem[]
): CslItem[] {
  if (library.length === 0 || !bookHasCiteRef(chapters)) return [];
  const lookup = buildLibraryLookup(library);
  const seen = new Set<string>();
  const collected: CslItem[] = [];

  const recordCites = (cites: readonly CiteRefItem[]) => {
    for (const cite of cites) {
      const item = resolveItem(cite.id, lookup);
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        collected.push(item);
      }
    }
  };

  for (const chapter of chapters) {
    for (const scene of chapter.scenes) {
      if (!sceneHasCiteRef(scene)) continue;
      const fnById = new Map((scene.footnotes ?? []).map((fn) => [fn.id, fn]));
      const visitedFnIds = new Set<string>();

      if (scene.html.includes(CITE_REF_CLASS) || scene.html.includes(FOOTNOTE_REF_CLASS)) {
        const parsed = parseBodyDocument(scene.html);
        const selector = `${CITE_REF_SELECTOR}, sup.${FOOTNOTE_REF_CLASS}[data-footnote-id]`;
        for (const element of parsed.body.querySelectorAll(selector)) {
          if (element.classList.contains(CITE_REF_CLASS)) {
            const cites = parseCiteData(element.getAttribute("data-cites"));
            if (cites) recordCites(cites);
          } else {
            const fnId = element.getAttribute("data-footnote-id") ?? "";
            const fn = fnById.get(fnId);
            if (fn && !visitedFnIds.has(fnId)) {
              visitedFnIds.add(fnId);
              collectCitedFromHtml(fn.html, lookup, seen, collected);
            }
          }
        }
      }

      for (const fn of scene.footnotes ?? []) {
        if (!visitedFnIds.has(fn.id)) {
          collectCitedFromHtml(fn.html, lookup, seen, collected);
        }
      }
    }
  }

  return collected;
}

/**
 * Builds the formatted bibliography for all cited sources in `chapters`, or
 * returns `null` when no cited sources are resolved.
 */
export function buildBookBibliography(
  chapters: readonly CompiledChapter[],
  library: readonly CslItem[],
  style: CitationStyleId = "apa7",
  locale: CitationLocale = "en"
): BookBibliography | null {
  const cited = collectCitedSources(chapters, library);
  if (cited.length === 0) return null;
  return {
    heading: bibliographyHeading(locale),
    style,
    locale,
    entries: formatBibliography(style, cited, locale)
  };
}

/**
 * Returns true when the compiled book has at least one bibliography entry to
 * render for the given publish options.
 */
export function hasBookBibliography(
  book: CompiledBook,
  options?: Pick<PublishOptions, "citationStyle" | "citationLocale" | "includeBibliography">
): boolean {
  if (options?.includeBibliography === false) return false;
  const library = book.citations ?? [];
  if (library.length > 0 && bookHasCiteRef(book.chapters)) {
    return collectCitedSources(book.chapters, library).length > 0;
  }
  return Boolean(book.bibliography && book.bibliography.entries.length > 0);
}

function formatMarkerCluster(
  cites: readonly CiteRefItem[],
  lookup: LibraryLookup,
  style: CitationStyleId,
  locale: CitationLocale,
  numericIndices: Record<string, number> | undefined,
  yearSuffixes: Record<string, string>
): { text: string; html: string } {
  const inputs: CitationItemInput[] = [];
  const unresolvedIds: string[] = [];

  for (const cite of cites) {
    const resolved = resolveItem(cite.id, lookup);
    if (!resolved) {
      unresolvedIds.push(cite.id);
      continue;
    }
    inputs.push({
      item: resolved,
      ...(cite.locator ? { locator: cite.locator } : {}),
      ...(cite.label ? { label: cite.label } : {}),
      ...(cite.prefix ? { prefix: cite.prefix } : {}),
      ...(cite.suffix ? { suffix: cite.suffix } : {}),
      ...(cite.suppressAuthor ? { suppressAuthor: true } : {})
    });
  }

  if (inputs.length === 0) {
    const fallback = `[${cites.map((cite) => `@${cite.id}`).join("; ")}]`;
    return { text: fallback, html: escapeHtmlText(fallback) };
  }

  const formatted = formatCitation(style, inputs, {
    locale,
    indices: numericIndices,
    yearSuffixes
  });

  if (unresolvedIds.length === 0) {
    return formatted;
  }

  const missingText = `[${unresolvedIds.map((id) => `@${id}`).join("; ")}]`;
  return {
    text: `${formatted.text} ${missingText}`,
    html: `${formatted.html} ${escapeHtmlText(missingText)}`
  };
}

function resolveInlineCitationsInHtml(
  html: string,
  formatCluster: (cites: readonly CiteRefItem[]) => { text: string; html: string }
): string {
  if (!html.includes(CITE_REF_CLASS)) return html;
  const parsed = parseBodyDocument(html);
  let changed = false;
  for (const element of Array.from(parsed.body.querySelectorAll<HTMLElement>(`span.${CITE_REF_CLASS}`))) {
    const cites = parseCiteData(element.getAttribute("data-cites"));
    if (!cites) {
      element.remove();
      changed = true;
      continue;
    }
    const formatted = formatCluster(cites);
    element.replaceWith(htmlToFragment(parsed, formatted.html));
    changed = true;
  }
  return changed ? parsed.body.innerHTML : html;
}

/**
 * Resolves every `span.cite-ref` marker across a compiled book's scenes and
 * footnotes for the selected citation style and locale, and returns the
 * export-ready book alongside its formatted bibliography (when enabled and
 * citations exist).
 */
export function resolveBookCitations(
  book: CompiledBook,
  options?: Pick<PublishOptions, "citationStyle" | "citationLocale" | "includeBibliography">
): ResolvedBookCitations {
  const style: CitationStyleId = options?.citationStyle ?? "apa7";
  const locale: CitationLocale = options?.citationLocale ?? "en";
  const includeBibliography = options?.includeBibliography ?? true;
  const library = book.citations ?? [];

  if (!bookHasCiteRef(book.chapters)) {
    const fallbackBibliography =
      includeBibliography && book.bibliography && book.bibliography.entries.length > 0
        ? book.bibliography
        : null;
    return {
      book,
      bibliography: fallbackBibliography,
      citedIds: fallbackBibliography ? fallbackBibliography.entries.map((entry) => entry.id) : []
    };
  }

  const lookup = buildLibraryLookup(library);
  const citedItems = collectCitedSources(book.chapters, library);
  const styleKind = getStyleMeta(style).kind;
  const numericIndices = styleKind === "numeric"
    ? Object.fromEntries(citedItems.map((item, idx) => [item.id, idx + 1]))
    : undefined;
  const yearSuffixes = computeDisambiguation(style, citedItems, locale);

  const formatCluster = (cites: readonly CiteRefItem[]) =>
    formatMarkerCluster(cites, lookup, style, locale, numericIndices, yearSuffixes);

  let nextGlobalFootnote = 0;

  const chapters: CompiledChapter[] = book.chapters.map((chapter) => {
    const scenes: CompiledScene[] = chapter.scenes.map((scene) => {
      const existingFootnotes = (scene.footnotes ?? []).map((fn) => ({
        ...fn,
        html: resolveInlineCitationsInHtml(fn.html, formatCluster)
      }));

      if (!scene.html.includes(CITE_REF_CLASS)) {
        const footnotesChanged = existingFootnotes.some(
          (fn, index) => fn.html !== scene.footnotes?.[index]?.html
        );
        if (!footnotesChanged) {
          nextGlobalFootnote += existingFootnotes.length;
          return scene;
        }
        nextGlobalFootnote += existingFootnotes.length;
        return {
          ...scene,
          footnotes: existingFootnotes
        };
      }

      if (styleKind !== "note") {
        const resolvedHtml = resolveInlineCitationsInHtml(scene.html, formatCluster);
        const footnoteNumbers = existingFootnotes.length > 0
          ? new Map(existingFootnotes.map((fn) => [fn.id, fn.number]))
          : undefined;
        nextGlobalFootnote += existingFootnotes.length;
        return {
          ...scene,
          html: resolvedHtml,
          text: htmlToPlainText(resolvedHtml, footnoteNumbers ? { footnoteNumbers } : {}),
          ...(existingFootnotes.length > 0 ? { footnotes: existingFootnotes } : {})
        };
      }

      // Note style: convert body cite-ref markers into automatic footnotes in reading order.
      const parsed = parseBodyDocument(scene.html);
      const fnById = new Map(existingFootnotes.map((fn) => [fn.id, fn]));
      const usedFnIds = new Set(existingFootnotes.map((fn) => fn.id));
      let autoCounter = 0;
      const nextAutoId = (): string => {
        let candidate = "";
        do {
          autoCounter += 1;
          candidate = `cite-fn-${autoCounter}`;
        } while (usedFnIds.has(candidate));
        usedFnIds.add(candidate);
        return candidate;
      };

      const orderedFootnotes: CompiledFootnote[] = [];
      const seenManualIds = new Set<string>();
      const selector = `span.${CITE_REF_CLASS}, sup.${FOOTNOTE_REF_CLASS}[data-footnote-id]`;

      for (const element of Array.from(parsed.body.querySelectorAll<HTMLElement>(selector))) {
        if (element.classList.contains(CITE_REF_CLASS)) {
          const cites = parseCiteData(element.getAttribute("data-cites"));
          if (!cites) {
            element.remove();
            continue;
          }
          const formatted = formatCluster(cites);
          const autoId = nextAutoId();
          const sup = parsed.createElement("sup");
          sup.className = FOOTNOTE_REF_CLASS;
          sup.setAttribute("data-footnote-id", autoId);
          sup.setAttribute("contenteditable", "false");
          element.replaceWith(sup);
          orderedFootnotes.push({
            id: autoId,
            html: formatted.html,
            number: ++nextGlobalFootnote
          });
        } else {
          const fnId = element.getAttribute("data-footnote-id") ?? "";
          const manual = fnById.get(fnId);
          if (manual && !seenManualIds.has(fnId)) {
            seenManualIds.add(fnId);
            orderedFootnotes.push({
              ...manual,
              number: ++nextGlobalFootnote
            });
          }
        }
      }

      for (const fn of existingFootnotes) {
        if (!seenManualIds.has(fn.id)) {
          orderedFootnotes.push({
            ...fn,
            number: ++nextGlobalFootnote
          });
        }
      }

      const resolvedHtml = parsed.body.innerHTML;
      const footnoteNumbers = orderedFootnotes.length > 0
        ? new Map(orderedFootnotes.map((fn) => [fn.id, fn.number]))
        : undefined;

      return {
        ...scene,
        html: resolvedHtml,
        text: htmlToPlainText(resolvedHtml, footnoteNumbers ? { footnoteNumbers } : {}),
        ...(orderedFootnotes.length > 0 ? { footnotes: orderedFootnotes } : {})
      };
    });

    return {
      ...chapter,
      scenes
    };
  });

  const bibliography: BookBibliography | null =
    includeBibliography && citedItems.length > 0
      ? {
          heading: bibliographyHeading(locale),
          style,
          locale,
          entries: formatBibliography(style, citedItems, locale)
        }
      : null;

  return {
    book: {
      ...book,
      chapters,
      ...(bibliography ? { bibliography } : { bibliography: undefined })
    },
    bibliography,
    citedIds: citedItems.map((item) => item.id)
  };
}
