/**
 * Inline citation marker (`span.cite-ref`) model, strict `data-cites` validation,
 * Pandoc citation serialization/parsing, and DOM label rendering.
 */

import { MAX_CITATION_ID_LENGTH, type CslItem } from "./csl";
import { computeDisambiguation, formatCitation, type CitationItemInput } from "./format";
import { getStyleMeta, type CitationLocale, type CitationStyleId } from "./styles";

export const CITE_REF_CLASS = "cite-ref";
export const CITE_REF_SELECTOR = `span.${CITE_REF_CLASS}[data-cites]`;

export const MAX_CITE_ITEMS = 32;
export const MAX_CITE_ATTR_LENGTH = 8192;
export const MAX_CITE_LOCATOR_LENGTH = 64;
export const MAX_CITE_AFFIX_LENGTH = 200;

export type CiteLocatorLabel = "page" | "chapter" | "section";

export type CiteRefItem = {
  id: string;
  locator?: string;
  label?: CiteLocatorLabel;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
};

const ALLOWED_CITE_KEYS = new Set([
  "id",
  "locator",
  "label",
  "prefix",
  "suffix",
  "suppressAuthor"
]);

const ALLOWED_LOCATOR_LABELS = new Set<CiteLocatorLabel>(["page", "chapter", "section"]);
const CITE_ID_RE = /^[A-Za-z0-9_](?:[A-Za-z0-9_.:/-]{0,126}[A-Za-z0-9_])?$/;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Returns true when `id` is a valid, bounded citation key. */
export function isValidCiteId(id: string): boolean {
  return id.length <= MAX_CITATION_ID_LENGTH && CITE_ID_RE.test(id);
}

function validateAndNormalizeItem(raw: unknown): CiteRefItem | null {
  if (!isPlainObject(raw)) return null;

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_CITE_KEYS.has(key)) return null;
  }

  if (typeof raw.id !== "string" || !isValidCiteId(raw.id)) {
    return null;
  }

  let locator: string | undefined;
  if (raw.locator !== undefined) {
    if (
      typeof raw.locator !== "string"
      || raw.locator.length > MAX_CITE_LOCATOR_LENGTH
      || CONTROL_CHARS_RE.test(raw.locator)
    ) {
      return null;
    }
    const trimmed = raw.locator.trim();
    if (trimmed) locator = trimmed;
  }

  let label: CiteLocatorLabel | undefined;
  if (raw.label !== undefined) {
    if (
      typeof raw.label !== "string"
      || !ALLOWED_LOCATOR_LABELS.has(raw.label as CiteLocatorLabel)
    ) {
      return null;
    }
    if (locator) {
      label = raw.label as CiteLocatorLabel;
    }
  }

  let prefix: string | undefined;
  if (raw.prefix !== undefined) {
    if (
      typeof raw.prefix !== "string"
      || raw.prefix.length > MAX_CITE_AFFIX_LENGTH
      || CONTROL_CHARS_RE.test(raw.prefix)
    ) {
      return null;
    }
    if (raw.prefix.trim().length > 0) {
      prefix = raw.prefix.replace(/^\s+/, "");
    }
  }

  let suffix: string | undefined;
  if (raw.suffix !== undefined) {
    if (
      typeof raw.suffix !== "string"
      || raw.suffix.length > MAX_CITE_AFFIX_LENGTH
      || CONTROL_CHARS_RE.test(raw.suffix)
    ) {
      return null;
    }
    const trimmed = raw.suffix.trim();
    if (trimmed) suffix = trimmed;
  }

  let suppressAuthor = false;
  if (raw.suppressAuthor !== undefined) {
    if (typeof raw.suppressAuthor !== "boolean") {
      return null;
    }
    suppressAuthor = raw.suppressAuthor;
  }

  const normalized: CiteRefItem = { id: raw.id };
  if (locator) normalized.locator = locator;
  if (label) normalized.label = label;
  if (prefix) normalized.prefix = prefix;
  if (suffix) normalized.suffix = suffix;
  if (suppressAuthor) normalized.suppressAuthor = true;
  return normalized;
}

/**
 * Strictly parses and validates a `data-cites` JSON attribute string.
 * Returns `null` for any malformed, empty, oversized, or hostile value.
 */
export function parseCiteData(raw: string | null | undefined): CiteRefItem[] | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CITE_ATTR_LENGTH) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_CITE_ITEMS) {
    return null;
  }

  const normalized: CiteRefItem[] = [];
  for (const entry of parsed) {
    const clean = validateAndNormalizeItem(entry);
    if (!clean) return null;
    normalized.push(clean);
  }
  return normalized;
}

/**
 * Validates and serializes an array of citation items into a canonical
 * `data-cites` JSON string. Throws if invalid or exceeding size caps.
 */
export function buildCiteData(items: readonly CiteRefItem[]): string {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_CITE_ITEMS) {
    throw new Error(`Citation marker must contain 1..${MAX_CITE_ITEMS} items.`);
  }
  const normalized: CiteRefItem[] = [];
  for (const item of items) {
    const clean = validateAndNormalizeItem(item);
    if (!clean) {
      throw new Error("Invalid citation marker entry.");
    }
    normalized.push(clean);
  }
  const json = JSON.stringify(normalized);
  if (json.length > MAX_CITE_ATTR_LENGTH) {
    throw new Error(`Serialized citation marker exceeds ${MAX_CITE_ATTR_LENGTH} bytes.`);
  }
  return json;
}

/**
 * Validates and re-serializes a raw `data-cites` attribute value into its
 * canonical JSON representation, or returns `null` if invalid.
 */
export function normalizeCiteDataAttr(raw: string | null | undefined): string | null {
  const parsed = parseCiteData(raw);
  if (!parsed) return null;
  const json = JSON.stringify(parsed);
  return json.length <= MAX_CITE_ATTR_LENGTH ? json : null;
}

/** Builds the canonical empty, non-editable `<span class="cite-ref">` markup. */
export function citeMarkerHtml(items: readonly CiteRefItem[]): string {
  const json = buildCiteData(items);
  return `<span class="${CITE_REF_CLASS}" data-cites="${escapeHtmlAttribute(json)}" contenteditable="false"></span>`;
}

/** Returns unique citation ids referenced in `html` in order of first appearance. */
export function citationIdsInHtml(html: string): string[] {
  if (!html || !html.includes(CITE_REF_CLASS)) return [];
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const element of parsed.body.querySelectorAll(CITE_REF_SELECTOR)) {
    const cites = parseCiteData(element.getAttribute("data-cites"));
    if (!cites) continue;
    for (const cite of cites) {
      if (!seen.has(cite.id)) {
        seen.add(cite.id);
        ids.push(cite.id);
      }
    }
  }
  return ids;
}

function escapePandocText(text: string): string {
  return text.replace(/([\\[\];])/g, "\\$1");
}

function unescapePandocText(text: string): string {
  return text.replace(/\\([\\[\];])/g, "$1");
}

function formatPandocLocatorLabel(label: CiteLocatorLabel | undefined): string {
  if (label === "chapter") return "ch.";
  if (label === "section") return "sec.";
  return "p.";
}

/** Serializes a validated citation cluster into Pandoc syntax (`[see @key, p. 42]`). */
export function formatPandocCitations(items: readonly CiteRefItem[]): string {
  const parts = items.map((entry) => {
    const prefix = entry.prefix ? escapePandocText(entry.prefix) : "";
    const prefixPart = prefix ? (/\s$/.test(prefix) ? prefix : `${prefix} `) : "";
    const keyPart = `${entry.suppressAuthor ? "-" : ""}@${entry.id}`;

    let tail = "";
    if (entry.locator) {
      tail = `, ${formatPandocLocatorLabel(entry.label)} ${escapePandocText(entry.locator)}`;
      if (entry.suffix) {
        const escapedSuffix = escapePandocText(entry.suffix.trim());
        if (escapedSuffix) {
          tail += /^[.,;:!?\])]/.test(escapedSuffix) ? escapedSuffix : ` ${escapedSuffix}`;
        }
      }
    } else if (entry.suffix) {
      const escapedSuffix = escapePandocText(entry.suffix.trim());
      if (escapedSuffix) {
        tail = /^[.,;:!?\])]/.test(escapedSuffix) ? escapedSuffix : ` ${escapedSuffix}`;
      }
    }

    return `${prefixPart}${keyPart}${tail}`;
  });
  return `[${parts.join("; ")}]`;
}

function splitPandocSegments(rawInner: string): string[] {
  const segments: string[] = [];
  let current = "";
  let escaped = false;
  for (let i = 0; i < rawInner.length; i += 1) {
    const ch = rawInner[i];
    if (escaped) {
      current += `\\${ch}`;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === ";") {
      segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (escaped) current += "\\";
  segments.push(current);
  return segments;
}

const PANDOC_SEGMENT_RE =
  /^((?:[\s\S]*?\s)?)(-?)@([A-Za-z0-9_](?:[A-Za-z0-9_.:/-]{0,126}[A-Za-z0-9_])?)(?=$|[\s,;.)\]!?])([\s\S]*)$/;

const EXPLICIT_LOCATOR_RE =
  /^(pp?\.|pages?|ch\.|chap\.|chapters?|sec\.|sect\.|sections?|§|S\.|Kap\.|Abschn\.)\s*(.+)$/i;

const LOCATOR_VALUE_RE =
  /^([0-9]+(?:[.:][0-9]+)*(?:[A-Za-z]{1,2})?(?:\s*[-–—]\s*[0-9]+(?:[.:][0-9]+)*(?:[A-Za-z]{1,2})?)*(?:,\s*[0-9]+(?:[.:][0-9]+)*(?:[A-Za-z]{1,2})?(?:\s*[-–—]\s*[0-9]+(?:[.:][0-9]+)*(?:[A-Za-z]{1,2})?)*)*|[ivxlcdm]+(?:\s*[-–—]\s*[ivxlcdm]+)*)(?=$|[\s,;.\-–—])([\s\S]*)$/i;

const BARE_NUMERIC_LOCATOR_RE =
  /^([0-9]+(?:\s*[-–—]\s*[0-9]+)?)(?=$|[\s,;.)\]!?])([\s\S]*)$/;

function mapLocatorPrefix(prefix: string): CiteLocatorLabel {
  const lower = prefix.toLowerCase();
  if (lower.startsWith("ch") || lower.startsWith("kap")) return "chapter";
  if (lower.startsWith("sec") || lower === "§" || lower.startsWith("abschn")) return "section";
  return "page";
}

function parsePandocAfter(
  rawAfter: string
): { locator?: string; label?: CiteLocatorLabel; suffix?: string } {
  if (!rawAfter.trim()) return {};

  if (rawAfter.trimStart().startsWith(",")) {
    const afterComma = rawAfter.replace(/^\s*,\s*/, "");
    const explicit = EXPLICIT_LOCATOR_RE.exec(afterComma);
    if (explicit) {
      const label = mapLocatorPrefix(explicit[1]);
      const locBody = explicit[2].trim();
      const locSplit = LOCATOR_VALUE_RE.exec(locBody);
      if (locSplit) {
        const locator = unescapePandocText(locSplit[1].trim());
        const suffix = unescapePandocText(locSplit[2]).trim();
        return {
          locator,
          label,
          ...(suffix ? { suffix } : {})
        };
      }
      const commaIdx = locBody.indexOf(",");
      if (commaIdx > 0) {
        return {
          locator: unescapePandocText(locBody.slice(0, commaIdx).trim()),
          label,
          suffix: unescapePandocText(locBody.slice(commaIdx)).trim()
        };
      }
      return {
        locator: unescapePandocText(locBody),
        label
      };
    }

    const bare = BARE_NUMERIC_LOCATOR_RE.exec(afterComma);
    if (bare) {
      const suffix = unescapePandocText(bare[2]).trim();
      return {
        locator: unescapePandocText(bare[1].trim()),
        label: "page",
        ...(suffix ? { suffix } : {})
      };
    }

    const suffix = unescapePandocText(rawAfter).trim();
    return suffix ? { suffix } : {};
  }

  const suffix = unescapePandocText(rawAfter).trim();
  return suffix ? { suffix } : {};
}

function parsePandocSegment(segment: string): CiteRefItem | null {
  const trimmedLeft = segment.replace(/^\s+/, "");
  const match = PANDOC_SEGMENT_RE.exec(trimmedLeft);
  if (!match) return null;

  const prefix = unescapePandocText(match[1]);
  const suppressAuthor = match[2] === "-";
  const id = match[3];
  const after = parsePandocAfter(match[4]);

  const candidate: CiteRefItem = {
    id,
    ...(after.locator ? { locator: after.locator } : {}),
    ...(after.label ? { label: after.label } : {}),
    ...(prefix.trim() ? { prefix } : {}),
    ...(after.suffix ? { suffix: after.suffix } : {}),
    ...(suppressAuthor ? { suppressAuthor: true } : {})
  };

  return validateAndNormalizeItem(candidate);
}

/**
 * Parses the inner text of a Pandoc citation cluster (`see @key, p. 42`)
 * into validated `CiteRefItem[]`, or returns `null` if not a valid cluster.
 */
export function parsePandocCitationCluster(rawInner: string): CiteRefItem[] | null {
  if (!rawInner || !rawInner.includes("@") || rawInner.length > MAX_CITE_ATTR_LENGTH) {
    return null;
  }
  const segments = splitPandocSegments(rawInner);
  if (segments.length === 0 || segments.length > MAX_CITE_ITEMS) {
    return null;
  }

  const items: CiteRefItem[] = [];
  for (const segment of segments) {
    const parsed = parsePandocSegment(segment);
    if (!parsed) return null;
    items.push(parsed);
  }
  return items;
}

function buildLibraryLookup(items: readonly CslItem[]): {
  byId: Map<string, CslItem>;
  byCiteKey: Map<string, CslItem>;
} {
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

function resolveLibraryItem(
  id: string,
  lookup: { byId: Map<string, CslItem>; byCiteKey: Map<string, CslItem> }
): CslItem | undefined {
  return lookup.byId.get(id) ?? lookup.byCiteKey.get(id);
}

function buildNumericIndices(
  markers: readonly HTMLElement[],
  lookup: { byId: Map<string, CslItem>; byCiteKey: Map<string, CslItem> }
): Record<string, number> {
  // No prototype, so an item id such as "constructor" finds nothing inherited.
  const indices: Record<string, number> = Object.create(null);
  let nextIndex = 1;
  for (const element of markers) {
    const cites = parseCiteData(element.getAttribute("data-cites"));
    if (!cites) continue;
    for (const cite of cites) {
      const resolved = resolveLibraryItem(cite.id, lookup);
      if (resolved && indices[resolved.id] === undefined) {
        indices[resolved.id] = nextIndex;
        nextIndex += 1;
      }
    }
  }
  return indices;
}

/**
 * Light DOM pass that computes each `span.cite-ref` marker's visible label and
 * writes it to `data-label` for CSS `::after { content: attr(data-label); }`,
 * keeping every marker empty and non-editable so `commentText()` offsets stay intact.
 */
export function renderCitationLabels(
  root: ParentNode,
  items: readonly CslItem[],
  style: CitationStyleId = "apa7",
  locale: CitationLocale = "en"
): void {
  const markers = Array.from(root.querySelectorAll<HTMLElement>(`span.${CITE_REF_CLASS}`));
  if (markers.length === 0) return;

  const lookup = buildLibraryLookup(items);
  const styleKind = getStyleMeta(style).kind;
  const numericIndices = styleKind === "numeric" ? buildNumericIndices(markers, lookup) : undefined;
  const yearSuffixes = computeDisambiguation(style, items, locale);

  for (const element of markers) {
    const cites = parseCiteData(element.getAttribute("data-cites"));
    if (!cites) {
      element.removeAttribute("data-label");
      continue;
    }

    if (element.getAttribute("contenteditable") !== "false") {
      element.setAttribute("contenteditable", "false");
    }
    if (element.childNodes.length > 0) {
      element.replaceChildren();
    }

    const inputs: CitationItemInput[] = [];
    const unresolvedIds: string[] = [];

    for (const cite of cites) {
      const resolved = resolveLibraryItem(cite.id, lookup);
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

    let label: string;
    if (inputs.length === 0) {
      label = `[${cites.map((cite) => `@${cite.id}`).join("; ")}]`;
    } else if (unresolvedIds.length === 0) {
      label = formatCitation(style, inputs, {
        locale,
        indices: numericIndices,
        yearSuffixes
      }).text;
    } else {
      const resolvedText = formatCitation(style, inputs, {
        locale,
        indices: numericIndices,
        yearSuffixes
      }).text;
      const missingText = unresolvedIds.map((id) => `@${id}`).join("; ");
      label = `${resolvedText} [${missingText}]`;
    }

    if (element.getAttribute("data-label") !== label) {
      element.setAttribute("data-label", label);
    }
  }
}
