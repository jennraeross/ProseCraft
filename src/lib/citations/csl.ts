/**
 * CSL-JSON (1.0.2) library types and strict normalization/validation utilities.
 */

export type CslName = {
  family?: string;
  given?: string;
  literal?: string;
  "non-dropping-particle"?: string;
  "dropping-particle"?: string;
  suffix?: string;
};

export type CslDate = {
  "date-parts"?: Array<Array<number | string>>;
  literal?: string;
  raw?: string;
  season?: number | string;
  circa?: boolean;
};

export type CslItem = {
  id: string;
  type: string;
  title?: string;
  author?: CslName[];
  editor?: CslName[];
  issued?: CslDate;
  "container-title"?: string;
  publisher?: string;
  "publisher-place"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  ISBN?: string;
  edition?: string;
  language?: string;
  "abstract-free"?: string;
  citeKey?: string;
  provider?: string;
};

export type CslNormalizationResult = {
  items: CslItem[];
  warnings: string[];
};

export const MAX_CITATION_ITEMS = 5000;
export const MAX_CITATION_ID_LENGTH = 128;
export const MAX_CITATION_TYPE_LENGTH = 64;
export const MAX_CITATION_TITLE_LENGTH = 2000;
export const MAX_CITATION_FIELD_LENGTH = 1000;
export const MAX_CITATION_SHORT_FIELD_LENGTH = 128;
export const MAX_CITATION_URL_LENGTH = 2000;
export const MAX_CITATION_ABSTRACT_LENGTH = 20000;
export const MAX_CITATION_NAME_PART_LENGTH = 300;
export const MAX_CITATION_CONTRIBUTORS = 200;

const CSL_TYPE_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:", "ftp:"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanSingleLine(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(CONTROL_CHARS_RE, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

function cleanMultiLine(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(CONTROL_CHARS_RE, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

function cleanStringOrNumber(value: unknown, maxLength: number): string | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return String(value).slice(0, maxLength);
  }
  return cleanSingleLine(value, maxLength);
}

function cleanUrl(value: unknown): string | undefined {
  const raw = cleanSingleLine(value, MAX_CITATION_URL_LENGTH);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

/** Sanitizes a citation identifier into a safe, bounded token. */
export function sanitizeCitationId(raw: string): string {
  const cleaned = raw
    .replace(CONTROL_CHARS_RE, "")
    .trim()
    .replace(/[^A-Za-z0-9_.:/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-./]+|[-./]+$/g, "");
  if (!cleaned) return "";
  return cleaned.slice(0, MAX_CITATION_ID_LENGTH);
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, "0");
}

function slugPart(text: string | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

function buildStableFallbackId(item: Omit<CslItem, "id">): string {
  const firstAuthor = item.author?.[0] ?? item.editor?.[0];
  const authorSlug = slugPart(firstAuthor?.family ?? firstAuthor?.literal);
  const firstYear = item.issued?.["date-parts"]?.[0]?.[0];
  const yearSlug = firstYear !== undefined ? slugPart(String(firstYear)) : "";
  const titleSlug = slugPart(item.title?.split(/\s+/)[0]);
  const fingerprint = fnv1aHex(
    JSON.stringify([
      item.type,
      item.title ?? "",
      item.author ?? [],
      item.editor ?? [],
      item.issued ?? null,
      item["container-title"] ?? "",
      item.DOI ?? "",
      item.URL ?? "",
      item.ISBN ?? ""
    ])
  );
  const prefix = [authorSlug || titleSlug || "ref", yearSlug].filter(Boolean).join("-");
  return `${prefix}-${fingerprint}`.slice(0, MAX_CITATION_ID_LENGTH);
}

function normalizeName(value: unknown): CslName | undefined {
  if (!isPlainObject(value)) return undefined;
  const family = cleanSingleLine(value.family, MAX_CITATION_NAME_PART_LENGTH);
  const given = cleanSingleLine(value.given, MAX_CITATION_NAME_PART_LENGTH);
  const literal = cleanSingleLine(value.literal, MAX_CITATION_NAME_PART_LENGTH);
  const nonDropping = cleanSingleLine(
    value["non-dropping-particle"],
    MAX_CITATION_NAME_PART_LENGTH
  );
  const dropping = cleanSingleLine(
    value["dropping-particle"],
    MAX_CITATION_NAME_PART_LENGTH
  );
  const suffix = cleanSingleLine(value.suffix, MAX_CITATION_NAME_PART_LENGTH);

  if (!family && !given && !literal) return undefined;

  const result: CslName = {};
  if (family) result.family = family;
  if (given) result.given = given;
  if (literal) result.literal = literal;
  if (nonDropping) result["non-dropping-particle"] = nonDropping;
  if (dropping) result["dropping-particle"] = dropping;
  if (suffix) result.suffix = suffix;
  return result;
}

function normalizeNameList(value: unknown): CslName[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: CslName[] = [];
  for (const entry of value) {
    if (result.length >= MAX_CITATION_CONTRIBUTORS) break;
    const normalized = normalizeName(entry);
    if (normalized) result.push(normalized);
  }
  return result.length > 0 ? result : undefined;
}

function normalizeDateParts(value: unknown): Array<Array<number | string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts: Array<Array<number | string>> = [];
  for (const group of value.slice(0, 2)) {
    if (!Array.isArray(group)) continue;
    const cleanedGroup: Array<number | string> = [];
    for (const part of group.slice(0, 3)) {
      if (typeof part === "number" && Number.isInteger(part) && Number.isFinite(part)) {
        cleanedGroup.push(part);
      } else if (typeof part === "string") {
        const trimmed = cleanSingleLine(part, 16);
        if (trimmed) cleanedGroup.push(trimmed);
      }
    }
    if (cleanedGroup.length > 0) parts.push(cleanedGroup);
  }
  return parts.length > 0 ? parts : undefined;
}

function normalizeDate(value: unknown): CslDate | undefined {
  if (!isPlainObject(value)) return undefined;
  const dateParts = normalizeDateParts(value["date-parts"]);
  const literal = cleanSingleLine(value.literal, MAX_CITATION_SHORT_FIELD_LENGTH);
  const raw = cleanSingleLine(value.raw, MAX_CITATION_SHORT_FIELD_LENGTH);

  if (!dateParts && !literal && !raw) return undefined;

  const result: CslDate = {};
  if (dateParts) result["date-parts"] = dateParts;
  if (literal) result.literal = literal;
  if (raw) result.raw = raw;

  if (typeof value.season === "number" && Number.isInteger(value.season)) {
    result.season = value.season;
  } else {
    const season = cleanSingleLine(value.season, 32);
    if (season) result.season = season;
  }
  if (typeof value.circa === "boolean") {
    result.circa = value.circa;
  }
  return result;
}

function allocateUniqueId(baseId: string, seen: Set<string>): { id: string; renamed: boolean } {
  if (!seen.has(baseId)) {
    seen.add(baseId);
    return { id: baseId, renamed: false };
  }
  let counter = 2;
  while (counter < MAX_CITATION_ITEMS + 10) {
    const suffix = `-${counter}`;
    const truncatedBase = baseId.slice(0, MAX_CITATION_ID_LENGTH - suffix.length);
    const candidate = `${truncatedBase}${suffix}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return { id: candidate, renamed: true };
    }
    counter += 1;
  }
  const fallback = `ref-${seen.size + 1}`;
  seen.add(fallback);
  return { id: fallback, renamed: true };
}

function normalizeSingleItem(
  value: unknown
): { item: Omit<CslItem, "id">; rawId?: string } | { error: string } {
  if (!isPlainObject(value)) {
    return { error: "Citation entry is not an object." };
  }
  const rawType = cleanSingleLine(value.type, MAX_CITATION_TYPE_LENGTH);
  if (!rawType || !CSL_TYPE_RE.test(rawType)) {
    return { error: "Citation entry is missing a valid CSL type." };
  }
  const type = rawType.toLowerCase();

  const title = cleanSingleLine(value.title, MAX_CITATION_TITLE_LENGTH);
  const author = normalizeNameList(value.author);
  const editor = normalizeNameList(value.editor);
  const issued = normalizeDate(value.issued);
  const containerTitle = cleanSingleLine(value["container-title"], MAX_CITATION_TITLE_LENGTH);
  const publisher = cleanSingleLine(value.publisher, MAX_CITATION_FIELD_LENGTH);
  const publisherPlace = cleanSingleLine(value["publisher-place"], MAX_CITATION_FIELD_LENGTH);
  const volume = cleanStringOrNumber(value.volume, MAX_CITATION_SHORT_FIELD_LENGTH);
  const issue = cleanStringOrNumber(value.issue, MAX_CITATION_SHORT_FIELD_LENGTH);
  const page = cleanSingleLine(value.page, MAX_CITATION_SHORT_FIELD_LENGTH);
  const doi = cleanSingleLine(value.DOI, 500);
  const url = cleanUrl(value.URL);
  const isbn = cleanSingleLine(value.ISBN, 64);
  const edition = cleanStringOrNumber(value.edition, MAX_CITATION_SHORT_FIELD_LENGTH);
  const language = cleanSingleLine(value.language, 64);
  const abstractFree =
    cleanMultiLine(value["abstract-free"], MAX_CITATION_ABSTRACT_LENGTH)
    ?? cleanMultiLine(value.abstract, MAX_CITATION_ABSTRACT_LENGTH);
  const citeKey = cleanSingleLine(value.citeKey, MAX_CITATION_ID_LENGTH);
  const provider = cleanSingleLine(value.provider, 64);

  const hasContent = Boolean(
    title
    || author
    || editor
    || containerTitle
    || publisher
    || doi
    || url
    || isbn
    || issued
    || abstractFree
  );
  if (!hasContent) {
    return { error: "Citation entry has no bibliographic content." };
  }

  const item: Omit<CslItem, "id"> = { type };
  if (title) item.title = title;
  if (author) item.author = author;
  if (editor) item.editor = editor;
  if (issued) item.issued = issued;
  if (containerTitle) item["container-title"] = containerTitle;
  if (publisher) item.publisher = publisher;
  if (publisherPlace) item["publisher-place"] = publisherPlace;
  if (volume) item.volume = volume;
  if (issue) item.issue = issue;
  if (page) item.page = page;
  if (doi) item.DOI = doi;
  if (url) item.URL = url;
  if (isbn) item.ISBN = isbn;
  if (edition) item.edition = edition;
  if (language) item.language = language;
  if (abstractFree) item["abstract-free"] = abstractFree;
  if (citeKey) item.citeKey = citeKey;
  if (provider) item.provider = provider;

  const rawId = cleanStringOrNumber(value.id, MAX_CITATION_ID_LENGTH);
  return { item, rawId };
}

/**
 * Validates and normalizes an unknown array of CSL-JSON records, enforcing
 * item/string length caps and assigning stable unique identifiers.
 */
export function normalizeCslItemsDetailed(value: unknown): CslNormalizationResult {
  if (!Array.isArray(value)) {
    return { items: [], warnings: ["Expected an array of citation items."] };
  }

  const items: CslItem[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    if (items.length >= MAX_CITATION_ITEMS) {
      warnings.push(
        `Citation library capped at ${MAX_CITATION_ITEMS} items; remaining entries were skipped.`
      );
      break;
    }
    const normalized = normalizeSingleItem(value[index]);
    if ("error" in normalized) {
      warnings.push(`Entry ${index + 1}: ${normalized.error}`);
      continue;
    }
    const sanitizedRawId = normalized.rawId ? sanitizeCitationId(normalized.rawId) : "";
    const baseId = sanitizedRawId || buildStableFallbackId(normalized.item);
    const { id, renamed } = allocateUniqueId(baseId, seenIds);
    if (renamed) {
      warnings.push(`Duplicate citation id "${baseId}" renamed to "${id}".`);
    }
    items.push({ id, ...normalized.item });
  }

  return { items, warnings };
}

/**
 * Strictly validates and normalizes an unknown value into a bounded list of
 * `CslItem` records with stable unique identifiers.
 */
export function normalizeCslItems(value: unknown): CslItem[] {
  return normalizeCslItemsDetailed(value).items;
}

const NAME_PARTICLES = new Set([
  "al", "d", "da", "de", "del", "della", "den", "der", "di", "dos", "du",
  "el", "la", "le", "van", "von", "zu", "zum", "zur"
]);

/**
 * Parses a single personal name string ("Last, First", "Last, Jr., First", or
 * "First Last") into a `CslName`.
 */
export function parsePersonName(raw: string): CslName | undefined {
  const trimmed = cleanSingleLine(raw, MAX_CITATION_NAME_PART_LENGTH * 2);
  if (!trimmed) return undefined;

  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((part) => part.trim());
    if (parts.length >= 3) {
      const family = cleanSingleLine(parts[0], MAX_CITATION_NAME_PART_LENGTH);
      const suffix = cleanSingleLine(parts[1], MAX_CITATION_NAME_PART_LENGTH);
      const given = cleanSingleLine(parts.slice(2).join(", "), MAX_CITATION_NAME_PART_LENGTH);
      if (!family && !given) return undefined;
      const result: CslName = {};
      if (family) result.family = family;
      if (given) result.given = given;
      if (suffix) result.suffix = suffix;
      return result;
    }
    const family = cleanSingleLine(parts[0], MAX_CITATION_NAME_PART_LENGTH);
    const given = cleanSingleLine(parts[1], MAX_CITATION_NAME_PART_LENGTH);
    if (!family && !given) return undefined;
    const result: CslName = {};
    if (family) result.family = family;
    if (given) result.given = given;
    return result;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const family = cleanSingleLine(words[0], MAX_CITATION_NAME_PART_LENGTH);
    return family ? { family } : undefined;
  }

  let familyStart = words.length - 1;
  while (familyStart > 1 && NAME_PARTICLES.has(words[familyStart - 1].toLowerCase())) {
    familyStart -= 1;
  }
  const given = cleanSingleLine(words.slice(0, familyStart).join(" "), MAX_CITATION_NAME_PART_LENGTH);
  const family = cleanSingleLine(words.slice(familyStart).join(" "), MAX_CITATION_NAME_PART_LENGTH);
  if (!family && !given) return undefined;
  const result: CslName = {};
  if (family) result.family = family;
  if (given) result.given = given;
  return result;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, januar: 1,
  feb: 2, february: 2, februar: 2,
  mar: 3, march: 3, maerz: 3, "märz": 3,
  apr: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12, dezember: 12
};

/** Parses a month number (1..12) from numeric or English/German month names. */
export function parseMonthNumber(raw: string): number | undefined {
  const cleaned = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!cleaned) return undefined;
  if (/^\d{1,2}$/.test(cleaned)) {
    const num = Number.parseInt(cleaned, 10);
    return num >= 1 && num <= 12 ? num : undefined;
  }
  return MONTH_NAMES[cleaned];
}

