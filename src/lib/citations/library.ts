/**
 * Pure helper utilities for managing the project citation library UI.
 */

import type { DocumentData } from "$lib/publish/types";
import { citationIdsInHtml } from "./cite-marker";
import {
  MAX_CITATION_ID_LENGTH,
  MAX_CITATION_ITEMS,
  parsePersonName,
  sanitizeCitationId,
  type CslItem,
  type CslName
} from "./csl";

export type ManualSourceKind = "book" | "article" | "chapter" | "website";

export type ManualSourceDraft = {
  kind: ManualSourceKind;
  customType?: string;
  title: string;
  authors: string;
  editors: string;
  year: string;
  containerTitle: string;
  publisher: string;
  publisherPlace: string;
  edition: string;
  volume: string;
  issue: string;
  page: string;
  isbn: string;
  doi: string;
  url: string;
};

/** Maps a manual form source kind to its canonical CSL item type. */
export function manualKindToCslType(kind: ManualSourceKind): string {
  switch (kind) {
    case "book":
      return "book";
    case "article":
      return "article-journal";
    case "chapter":
      return "chapter";
    case "website":
      return "webpage";
  }
}

/** Maps a CSL item type to one of the four manual form kinds when applicable. */
export function cslTypeToManualKind(type: string): ManualSourceKind | null {
  const lower = type.toLowerCase();
  if (lower === "book") return "book";
  if (lower === "article-journal" || lower === "article" || lower === "article-magazine" || lower === "article-newspaper") {
    return "article";
  }
  if (lower === "chapter" || lower === "paper-conference") return "chapter";
  if (lower === "webpage" || lower === "post-weblog" || lower === "post") return "website";
  return null;
}

/** Human-readable label for a CSL item type. */
import type { MessageKey } from "$lib/i18n/catalog";

export function sourceTypeLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "book":
      return "Book";
    case "article-journal":
    case "article":
    case "article-magazine":
    case "article-newspaper":
      return "Article";
    case "chapter":
      return "Chapter";
    case "paper-conference":
      return "Conference paper";
    case "webpage":
    case "post-weblog":
    case "post":
      return "Website";
    case "thesis":
      return "Thesis";
    case "report":
      return "Report";
    default:
      return type ? type.charAt(0).toUpperCase() + type.slice(1) : "Source";
  }
}

/** Translation key for a source type, if it has one. */
export function sourceTypeKey(type: string): MessageKey | undefined {
  switch (type.toLowerCase()) {
    case "book":
      return "citation.type.book";
    case "article-journal":
    case "article":
    case "article-magazine":
    case "article-newspaper":
      return "citation.type.article";
    case "chapter":
      return "citation.type.chapter";
    case "paper-conference":
      return "citation.type.conference";
    case "webpage":
    case "post-weblog":
    case "post":
      return "citation.type.website";
    case "thesis":
      return "citation.type.thesis";
    case "report":
      return "citation.type.report";
    default:
      return type ? undefined : "citation.type.source";
  }
}

/** Formats a CSL name array into a semicolon-separated editable string. */
export function formatAuthorList(names?: readonly CslName[]): string {
  if (!names || names.length === 0) return "";
  return names
    .map((name) => {
      if (name.literal) return name.literal;
      const family = [name["non-dropping-particle"], name.family].filter(Boolean).join(" ");
      const given = [name.given, name["dropping-particle"]].filter(Boolean).join(" ");
      if (family && given) return name.suffix ? `${family}, ${name.suffix}, ${given}` : `${family}, ${given}`;
      return family || given || "";
    })
    .filter(Boolean)
    .join("; ");
}

/** Formats a concise author/editor summary line for list rows. */
export function formatItemContributors(item: CslItem): string {
  const list = item.author && item.author.length > 0 ? item.author : item.editor;
  if (!list || list.length === 0) return "";
  return list
    .map((name) => {
      if (name.literal) return name.literal;
      const family = [name["non-dropping-particle"], name.family].filter(Boolean).join(" ");
      if (family && name.given) return `${family}, ${name.given}`;
      return family || name.given || "";
    })
    .filter(Boolean)
    .join("; ");
}

/** Parses semicolon- or newline-separated author/editor entries into `CslName[]`. */
export function parseAuthorList(raw: string): CslName[] | undefined {
  const parts = raw
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const names: CslName[] = [];
  for (const part of parts) {
    const parsed = parsePersonName(part);
    if (parsed) names.push(parsed);
  }
  return names.length > 0 ? names : undefined;
}

/** Extracts a displayable publication year from a `CslItem`. */
export function itemYearText(item: CslItem): string {
  const firstPart = item.issued?.["date-parts"]?.[0]?.[0];
  if (firstPart !== undefined) return String(firstPart);
  return item.issued?.literal ?? item.issued?.raw ?? "";
}

function transliterateForKey(value: string): string {
  return value
    .replace(/ä/g, "ae")
    .replace(/Ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/Ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Generates a readable unique citation key such as `mueller2020` from the first
 * author/editor surname (or title) and publication year.
 */
export function generateCitationKey(
  params: {
    author?: readonly CslName[];
    editor?: readonly CslName[];
    title?: string;
    year?: string;
  },
  existingItems: readonly CslItem[],
  excludeId?: string
): string {
  const lead = params.author?.[0] ?? params.editor?.[0];
  const rawName = lead?.family ?? lead?.literal ?? params.title?.trim().split(/\s+/)[0] ?? "";
  const nameSlug = transliterateForKey(rawName).slice(0, 24) || "ref";
  const yearDigits = (params.year ?? "").replace(/[^0-9]/g, "").slice(0, 4);
  const baseRaw = sanitizeCitationId(`${nameSlug}${yearDigits}`) || "ref";
  const base = baseRaw.slice(0, MAX_CITATION_ID_LENGTH);

  const used = new Set<string>();
  for (const item of existingItems) {
    if (excludeId && item.id === excludeId) continue;
    used.add(item.id);
    if (item.citeKey) used.add(item.citeKey);
  }

  if (!used.has(base)) return base;
  let counter = 2;
  while (counter < MAX_CITATION_ITEMS + 10) {
    const suffix = `-${counter}`;
    const candidate = `${base.slice(0, MAX_CITATION_ID_LENGTH - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
    counter += 1;
  }
  return `ref-${existingItems.length + 1}`;
}

/** Merges newly imported items into an existing library, resolving any ID collisions. */
export function mergeImportedCitations(
  existing: readonly CslItem[],
  imported: readonly CslItem[]
): { items: CslItem[]; addedCount: number; warnings: string[] } {
  const result = [...existing];
  const seenIds = new Set(existing.map((item) => item.id));
  const warnings: string[] = [];
  let addedCount = 0;

  for (const entry of imported) {
    if (result.length >= MAX_CITATION_ITEMS) {
      warnings.push(`Citation library capped at ${MAX_CITATION_ITEMS} items; remaining entries were skipped.`);
      break;
    }
    let id = entry.id;
    if (seenIds.has(id)) {
      let counter = 2;
      let candidate = id;
      while (seenIds.has(candidate)) {
        const suffix = `-${counter}`;
        candidate = `${id.slice(0, MAX_CITATION_ID_LENGTH - suffix.length)}${suffix}`;
        counter += 1;
      }
      warnings.push(`Duplicate citation id "${id}" renamed to "${candidate}".`);
      id = candidate;
    }
    seenIds.add(id);
    result.push(id === entry.id ? entry : { ...entry, id });
    addedCount += 1;
  }

  return { items: result, addedCount, warnings };
}

/** Counts how many documents cite `item` (in body prose or footnote text) via `citationIdsInHtml`. */
export function countSourceCitations(
  item: Pick<CslItem, "id" | "citeKey">,
  documents: readonly DocumentData[]
): { documentCount: number; docIds: string[] } {
  const matchIds = new Set([item.id]);
  if (item.citeKey) matchIds.add(item.citeKey);

  const docIds: string[] = [];
  for (const doc of documents) {
    const bodyIds = citationIdsInHtml(doc.content);
    let cited = bodyIds.some((id) => matchIds.has(id));
    if (!cited && doc.footnotes) {
      for (const fn of doc.footnotes) {
        if (citationIdsInHtml(fn.html).some((id) => matchIds.has(id))) {
          cited = true;
          break;
        }
      }
    }
    if (cited) docIds.push(doc.id);
  }
  return { documentCount: docIds.length, docIds };
}

/** Returns true when `item` matches a free-text search query. */
export function matchesLibraryQuery(item: CslItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    item.title,
    formatItemContributors(item),
    formatAuthorList(item.editor),
    itemYearText(item),
    sourceTypeLabel(item.type),
    item.type,
    item["container-title"],
    item.publisher,
    item.id,
    item.citeKey,
    item.DOI
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
