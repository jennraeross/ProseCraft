/**
 * Optional story metadata stored on wiki documents, plus the template shape
 * used by the character sheet.
 *
 * Everything in this module is plain JSON so the values survive the open
 * folder layout, encrypted sync and the vault. Unknown keys are kept when they
 * are JSON-safe, so a newer version of the app can round-trip fields this one
 * does not understand yet.
 */

export const PAGE_KINDS = ["character", "place", "organisation", "item", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const RELATION_TYPES = [
  "family",
  "friend",
  "rival",
  "love",
  "mentor",
  "employer",
  "other"
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export type RelationTension = 1 | 2 | 3 | 4 | 5;

/**
 * A directed link from the page that stores it to another page. The reverse
 * direction is derived by the UI and never stored.
 */
export type Relation = {
  id: string;
  /** Page id of the target. */
  to: string;
  type: RelationType;
  label?: string;
  tension?: RelationTension;
  /** Chapter id from which the relation holds. */
  from?: string;
  /** Chapter id until which the relation holds, inclusive. */
  until?: string;
  note?: string;
};

export const SHEET_FIELD_TYPES = ["text", "longtext", "number", "choice", "link"] as const;
export type SheetFieldType = (typeof SHEET_FIELD_TYPES)[number];

export type SheetField = {
  id: string;
  label: string;
  type: SheetFieldType;
  options?: string[];
};

export type SheetTemplate = {
  id: string;
  name: string;
  fields: SheetField[];
};

export type DocumentMeta = {
  kind?: PageKind;
  aliases?: string[];
  /** Page ids confirmed for a scene. */
  characters?: string[];
  /** Page id or free text. */
  place?: string;
  storyDate?: string;
  tags?: string[];
  /** Template field id -> value. */
  sheet?: Record<string, string>;
  /** Id of the sheet template applied to this page. */
  sheetTemplate?: string;
  relations?: Relation[];
  [key: string]: unknown;
};

const MAX_RELATIONS = 200;
const MAX_ALIASES = 20;
const MAX_TAGS = 50;
const MAX_CHARACTERS = 200;
const MAX_SHEET_ENTRIES = 200;
const MAX_ID = 200;
const MAX_LABEL = 120;
const MAX_NOTE = 2000;
const MAX_ALIAS = 120;
const MAX_PLACE = 200;
const MAX_STORY_DATE = 40;
const MAX_TAG = 60;
const MAX_SHEET_VALUE = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id && id.length <= MAX_ID ? id : undefined;
}

/** Trims a string and clips it to `maxLength`; empty results are dropped. */
function readText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, maxLength);
  return text ? text : undefined;
}

function readStringList(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const text = readText(item, maxLength);
    if (text) result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function readTension(value: unknown): RelationTension | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(5, Math.max(1, Math.round(value))) as RelationTension;
}

function normalizeRelation(value: unknown): Relation | undefined {
  if (!isRecord(value)) return undefined;
  const id = readId(value.id);
  const to = readId(value.to);
  if (!id || !to) return undefined;
  if (!RELATION_TYPES.includes(value.type as RelationType)) return undefined;
  const relation: Relation = { id, to, type: value.type as RelationType };
  const label = readText(value.label, MAX_LABEL);
  if (label) relation.label = label;
  const tension = readTension(value.tension);
  if (tension !== undefined) relation.tension = tension;
  const from = readId(value.from);
  if (from) relation.from = from;
  const until = readId(value.until);
  if (until) relation.until = until;
  const note = readText(value.note, MAX_NOTE);
  if (note) relation.note = note;
  return relation;
}

function readRelations(value: unknown): Relation[] {
  if (!Array.isArray(value)) return [];
  const relations: Relation[] = [];
  for (const item of value) {
    const relation = normalizeRelation(item);
    if (relation) relations.push(relation);
    if (relations.length >= MAX_RELATIONS) break;
  }
  return relations;
}

function readSheet(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const sheet: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key) continue;
    if (typeof entry !== "string") continue;
    sheet[key] = entry.slice(0, MAX_SHEET_VALUE);
    if (Object.keys(sheet).length >= MAX_SHEET_ENTRIES) break;
  }
  return Object.keys(sheet).length > 0 ? sheet : undefined;
}

/** Returns a JSON-round-tripped copy, or `ok: false` when the value cannot be stored. */
function jsonSafeClone(value: unknown): { ok: true; value: unknown } | { ok: false } {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return { ok: false };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

const KNOWN_KEYS = new Set([
  "kind",
  "aliases",
  "characters",
  "place",
  "storyDate",
  "tags",
  "sheet",
  "sheetTemplate",
  "relations"
]);

/**
 * Validates persisted metadata. Invalid values are dropped instead of throwing,
 * array sizes are capped and unknown JSON-safe keys are preserved. Returns
 * `undefined` when nothing usable is left.
 */
export function normalizeMeta(value: unknown): DocumentMeta | undefined {
  if (!isRecord(value)) return undefined;
  const meta: DocumentMeta = {};

  if (PAGE_KINDS.includes(value.kind as PageKind)) meta.kind = value.kind as PageKind;
  const aliases = readStringList(value.aliases, MAX_ALIASES, MAX_ALIAS);
  if (aliases.length > 0) meta.aliases = aliases;
  const characters = readStringList(value.characters, MAX_CHARACTERS, MAX_ID);
  if (characters.length > 0) meta.characters = characters;
  const place = readText(value.place, MAX_PLACE);
  if (place) meta.place = place;
  const storyDate = readText(value.storyDate, MAX_STORY_DATE);
  if (storyDate) meta.storyDate = storyDate;
  const tags = readStringList(value.tags, MAX_TAGS, MAX_TAG);
  if (tags.length > 0) meta.tags = tags;
  const sheet = readSheet(value.sheet);
  if (sheet) meta.sheet = sheet;
  const sheetTemplate = readId(value.sheetTemplate);
  if (sheetTemplate) meta.sheetTemplate = sheetTemplate;
  const relations = readRelations(value.relations);
  if (relations.length > 0) meta.relations = relations;

  for (const [key, entry] of Object.entries(value)) {
    if (KNOWN_KEYS.has(key)) continue;
    const clone = jsonSafeClone(entry);
    if (clone.ok) meta[key] = clone.value;
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}
