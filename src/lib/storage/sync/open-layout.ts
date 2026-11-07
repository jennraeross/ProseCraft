import { sha256 } from "@noble/hashes/sha2.js";
import { htmlToMarkdown, markdownToHtml } from "$lib/publish/markdown";
import { sanitizeHtml } from "$lib/sanitize";
import type { ChapterData, DocumentData } from "$lib/publish/types";
import {
  isEntityMeta,
  isEntityMetaMap,
  isLegacyProjectData,
  stableStringify
} from "../schema";
import {
  ENTITY_KINDS,
  SCHEMA_VERSION,
  type EntityMeta,
  type EntityMetaMap,
  type ProjectData,
  type StoredEntityKind,
  type StoredProject
} from "../types";
import { OPEN_MARKER_FILE } from "./files";
import { PROJECTS_DIR, projectDirName, safeName } from "./layout";
import { compareStrings } from "./merge";
import type { SyncFileSystem } from "./types";

export const OPEN_FORMAT = "prosecraft.open";
export const OPEN_VERSION = 1;
const PROJECT_FORMAT = "prosecraft.project";
const PROJECT_VERSION = 1;

const PROJECT_FILE = "project.json";
const CHAPTERS_DIR = "chapters";
const DOCUMENTS_DIR = "documents";
const STORYBOARD_DIR = "storyboard";
const ROWS_FILE = "rows.json";
const CARDS_FILE = "cards.json";

const encoder = new TextEncoder();

export type OpenMarker = {
  format: string;
  version: number;
  createdAt: number;
};

type ProjectFilePayload = {
  format: string;
  version: number;
  schemaVersion: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  updatedBy: string;
  deletedAt: number | null;
  project: ProjectData;
  entities: Record<StoredEntityKind, EntityMetaMap>;
  order: Record<StoredEntityKind, string[]>;
};

type DecodedEntity<T> = {
  record: T;
  meta: EntityMeta;
  external: boolean;
  changedAt: number;
};

type ReadEntities<T> = {
  records: T[];
  metas: EntityMetaMap;
  order: string[];
  external: boolean;
  changedAt: number;
};

function sha256Hex(text: string): string {
  const digest = sha256(encoder.encode(text));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hashJson(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
}

/** Makes a document match the Markdown round trip used by the open layout. */
export function normalizeDocument(document: DocumentData): DocumentData {
  const body = normalizeBody(document.markdownSource ?? htmlToMarkdown(document.content));
  return {
    ...document,
    content: sanitizeHtml(markdownToHtml(body)),
    markdownSource: body
  };
}

function formatYamlValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

function parseYamlValue(raw: string): unknown {
  if (raw === "") return "";
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("\"") || raw.startsWith("{") || raw.startsWith("[")) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("invalid value");
    }
  }
  return raw;
}

/**
 * Writes one Markdown document with YAML frontmatter. Values are JSON-encoded
 * where needed, which is valid YAML flow syntax and keeps the parser small.
 */
function serializeMarkdown(
  fields: Record<string, unknown>,
  body: string
): string {
  const hash = hashJson({ fields: documentPayload(fields), body });
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
  entries.push(`hash: ${JSON.stringify(hash)}`);
  const normalized = normalizeBody(body);
  return `---\n${entries.join("\n")}\n---\n\n${normalized}\n`;
}

function parseMarkdown(text: string): { fields: Record<string, unknown>; body: string } {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("missing frontmatter");
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("unterminated frontmatter");
  const header = normalized.slice(4, end);
  let body = normalized.slice(end + 5);
  if (body.startsWith("\n")) body = body.slice(1);
  body = normalizeBody(body);

  const fields: Record<string, unknown> = {};
  for (const line of header.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) throw new Error("invalid frontmatter line");
    const key = line.slice(0, colon).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error("invalid frontmatter key");
    fields[key] = parseYamlValue(line.slice(colon + 1).trim());
  }
  return { fields, body };
}

function documentPayload(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    id: fields.id,
    title: fields.title,
    chapterId: fields.chapterId,
    space: fields.space,
    folderId: fields.folderId,
    trashed: fields.trashed,
    trashedWithChapterId: fields.trashedWithChapterId,
    labelId: fields.labelId,
    updatedAt: fields.updatedAt,
    revision: fields.revision,
    updatedBy: fields.updatedBy,
    deletedAt: fields.deletedAt,
    character: fields.character,
    place: fields.place
  };
}

function documentFields(document: DocumentData, meta: EntityMeta): Record<string, unknown> {
  return {
    id: document.id,
    title: document.title,
    chapterId: document.chapterId,
    space: document.space,
    folderId: document.folderId,
    trashed: document.trashed,
    trashedWithChapterId: document.trashedWithChapterId,
    labelId: document.labelId,
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    updatedBy: meta.updatedBy,
    deletedAt: meta.deletedAt,
    character: document.character,
    place: document.place
  };
}

function bumpMeta(meta: EntityMeta, now: number): EntityMeta {
  return {
    ...meta,
    updatedAt: Math.max(now, meta.updatedAt + 1),
    revision: meta.revision + 1,
    updatedBy: "external"
  };
}

function fallbackMeta(): EntityMeta {
  return { updatedAt: 0, revision: 0, updatedBy: "external", deletedAt: null };
}

function readMeta(fields: Record<string, unknown>, fallback: EntityMeta): EntityMeta {
  const updatedAt = typeof fields.updatedAt === "number" ? fields.updatedAt : fallback.updatedAt;
  const revision = typeof fields.revision === "number" ? fields.revision : fallback.revision;
  const updatedBy = typeof fields.updatedBy === "string" && fields.updatedBy
    ? fields.updatedBy
    : fallback.updatedBy;
  const deletedAt = fields.deletedAt === null || typeof fields.deletedAt === "number"
    ? fields.deletedAt
    : fallback.deletedAt;
  return { updatedAt, revision, updatedBy, deletedAt };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeDocument(
  path: string,
  text: string,
  knownMeta: EntityMeta | undefined,
  now: number
): DecodedEntity<DocumentData> {
  let parsed: { fields: Record<string, unknown>; body: string };
  try {
    parsed = parseMarkdown(text);
  } catch {
    throw new Error(`The document file ${path} has invalid frontmatter.`);
  }
  const fields = parsed.fields;
  if (typeof fields.id !== "string" || !fields.id) {
    throw new Error(`The document file ${path} is missing an id.`);
  }
  const meta = readMeta(fields, knownMeta ?? fallbackMeta());
  const storedHash = typeof fields.hash === "string" ? fields.hash : "";
  const expectedHash = hashJson({ fields: documentPayload(fields), body: parsed.body });
  const external = storedHash !== expectedHash;
  const finalMeta = external ? bumpMeta(meta, now) : meta;

  const record: DocumentData = {
    id: fields.id,
    title: typeof fields.title === "string" ? fields.title : "",
    content: sanitizeHtml(markdownToHtml(parsed.body)),
    markdownSource: parsed.body
  };
  if (typeof fields.chapterId === "string") record.chapterId = fields.chapterId;
  else if (fields.chapterId === null) delete record.chapterId;
  if (typeof fields.space === "string") record.space = fields.space as DocumentData["space"];
  if (typeof fields.folderId === "string") record.folderId = fields.folderId;
  if (fields.trashed === true) record.trashed = true;
  if (typeof fields.trashedWithChapterId === "string") {
    record.trashedWithChapterId = fields.trashedWithChapterId;
  }
  if (typeof fields.labelId === "string") record.labelId = fields.labelId;
  if (isObject(fields.character)) record.character = fields.character as DocumentData["character"];
  if (isObject(fields.place)) record.place = fields.place as DocumentData["place"];

  return {
    record,
    meta: finalMeta,
    external,
    changedAt: finalMeta.updatedAt
  };
}

function decodeChapter(
  path: string,
  text: string,
  knownMeta: EntityMeta | undefined,
  now: number
): DecodedEntity<ChapterData> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`The chapter file ${path} could not be read.`);
  }
  if (!isObject(raw) || !isObject(raw.record) || !isEntityMeta(raw.meta)) {
    throw new Error(`The chapter file ${path} is not a valid ProseCraft record.`);
  }
  const record = raw.record as unknown as ChapterData;
  if (typeof record.id !== "string" || !record.id || typeof record.title !== "string") {
    throw new Error(`The chapter file ${path} is not a valid ProseCraft record.`);
  }
  const storedHash = typeof raw.hash === "string" ? raw.hash : "";
  const expectedHash = hashJson({ record, meta: raw.meta });
  const external = storedHash !== expectedHash;
  const finalMeta = external ? bumpMeta(raw.meta, now) : raw.meta;

  return {
    record: {
      id: record.id,
      title: record.title,
      expanded: record.expanded === true,
      ...(typeof record.summary === "string" ? { summary: record.summary } : {}),
      ...(record.trashed === true ? { trashed: true } : {}),
      ...(typeof record.labelId === "string" ? { labelId: record.labelId } : {})
    },
    meta: finalMeta,
    external,
    changedAt: finalMeta.updatedAt
  };
}

function decodeStoryboard<T>(
  path: string,
  text: string,
  now: number
): { entries: DecodedEntity<T>[]; external: boolean; changedAt: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`The storyboard file ${path} could not be read.`);
  }
  if (!isObject(raw) || !Array.isArray(raw.records)) {
    throw new Error(`The storyboard file ${path} is not a valid ProseCraft record.`);
  }
  const entries: DecodedEntity<T>[] = [];
  for (const item of raw.records) {
    if (!isObject(item) || !isObject(item.record) || !isEntityMeta(item.meta)) {
      throw new Error(`The storyboard file ${path} is not a valid ProseCraft record.`);
    }
    const record = item.record as unknown as T & { id?: unknown };
    if (typeof record.id !== "string" || !record.id) {
      throw new Error(`The storyboard file ${path} contains a record without an id.`);
    }
    entries.push({
      record,
      meta: item.meta,
      external: false,
      changedAt: item.meta.updatedAt
    });
  }
  const storedHash = typeof raw.hash === "string" ? raw.hash : "";
  const expectedHash = hashJson(raw.records);
  const external = storedHash !== expectedHash;
  let changedAt = 0;
  if (external) {
    for (const entry of entries) {
      entry.meta = bumpMeta(entry.meta, now);
      entry.external = true;
      entry.changedAt = entry.meta.updatedAt;
      changedAt = Math.max(changedAt, entry.changedAt);
    }
  }
  return { entries, external, changedAt };
}

function readOrder(order: unknown, kind: StoredEntityKind): string[] {
  if (!isObject(order) || !Array.isArray(order[kind])) return [];
  return (order[kind] as unknown[]).filter((id): id is string => typeof id === "string");
}

function requireMetaMap(value: unknown, path: string): EntityMetaMap {
  if (!isEntityMetaMap(value)) {
    throw new Error(`The project file ${path} has invalid entity metadata.`);
  }
  return value;
}

async function readDocuments(
  fs: SyncFileSystem,
  dir: string,
  knownMetas: EntityMetaMap,
  order: string[],
  now: number
): Promise<ReadEntities<DocumentData>> {
  const base = `${dir}/${DOCUMENTS_DIR}`;
  const decoded = new Map<string, DecodedEntity<DocumentData>>();
  for (const entry of await fs.listDir(base)) {
    if (entry.isDirectory || !entry.name.endsWith(".md")) continue;
    const path = `${base}/${entry.name}`;
    const document = decodeDocument(path, await fs.readText(path), undefined, now);
    if (decoded.has(document.record.id)) {
      throw new Error(`Two document files claim the id ${document.record.id}.`);
    }
    decoded.set(document.record.id, document);
  }

  const metas: EntityMetaMap = { ...knownMetas };
  const records = new Map<string, DocumentData>();
  const liveIds: string[] = [];
  let external = false;
  let changedAt = 0;

  for (const [id, meta] of Object.entries(knownMetas)) {
    if (meta.deletedAt !== null) continue;
    const document = decoded.get(id);
    if (!document) {
      throw new Error(`The document file for ${id} is missing from the open sync folder.`);
    }
    const finalMeta = document.meta;
    metas[id] = finalMeta;
    external ||= document.external;
    changedAt = Math.max(changedAt, finalMeta.updatedAt);
    if (finalMeta.deletedAt === null) {
      records.set(id, document.record);
      liveIds.push(id);
    }
  }

  const extras = [...decoded.keys()]
    .filter((id) => !knownMetas[id])
    .sort(compareStrings);
  for (const id of extras) {
    const document = decoded.get(id)!;
    metas[id] = document.meta;
    external ||= document.external;
    changedAt = Math.max(changedAt, document.meta.updatedAt);
    if (document.meta.deletedAt === null) {
      records.set(id, document.record);
      liveIds.push(id);
    }
  }

  const live = new Set(liveIds);
  const ordered = order.filter((id) => live.has(id));
  for (const id of liveIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  return {
    records: ordered.map((id) => records.get(id)!),
    metas,
    order: ordered,
    external,
    changedAt
  };
}

async function readChapters(
  fs: SyncFileSystem,
  dir: string,
  knownMetas: EntityMetaMap,
  order: string[],
  now: number
): Promise<ReadEntities<ChapterData>> {
  const base = `${dir}/${CHAPTERS_DIR}`;
  const decoded = new Map<string, DecodedEntity<ChapterData>>();
  for (const entry of await fs.listDir(base)) {
    if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
    const path = `${base}/${entry.name}`;
    const chapter = decodeChapter(path, await fs.readText(path), undefined, now);
    if (decoded.has(chapter.record.id)) {
      throw new Error(`Two chapter files claim the id ${chapter.record.id}.`);
    }
    decoded.set(chapter.record.id, chapter);
  }

  const metas: EntityMetaMap = { ...knownMetas };
  const records = new Map<string, ChapterData>();
  const liveIds: string[] = [];
  let external = false;
  let changedAt = 0;

  for (const [id, meta] of Object.entries(knownMetas)) {
    if (meta.deletedAt !== null) continue;
    const chapter = decoded.get(id);
    if (!chapter) {
      throw new Error(`The chapter file for ${id} is missing from the open sync folder.`);
    }
    const finalMeta = chapter.meta;
    metas[id] = finalMeta;
    external ||= chapter.external;
    changedAt = Math.max(changedAt, finalMeta.updatedAt);
    if (finalMeta.deletedAt === null) {
      records.set(id, chapter.record);
      liveIds.push(id);
    }
  }

  const extras = [...decoded.keys()]
    .filter((id) => !knownMetas[id])
    .sort(compareStrings);
  for (const id of extras) {
    const chapter = decoded.get(id)!;
    metas[id] = chapter.meta;
    external ||= chapter.external;
    changedAt = Math.max(changedAt, chapter.meta.updatedAt);
    if (chapter.meta.deletedAt === null) {
      records.set(id, chapter.record);
      liveIds.push(id);
    }
  }

  const live = new Set(liveIds);
  const ordered = order.filter((id) => live.has(id));
  for (const id of liveIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  return {
    records: ordered.map((id) => records.get(id)!),
    metas,
    order: ordered,
    external,
    changedAt
  };
}

async function readStoryboard<T extends { id: string }>(
  fs: SyncFileSystem,
  path: string,
  knownMetas: EntityMetaMap,
  now: number
): Promise<ReadEntities<T>> {
  const exists = await fs.exists(path);
  const decoded = exists
    ? decodeStoryboard<T>(path, await fs.readText(path), now)
    : { entries: [] as DecodedEntity<T>[], external: false, changedAt: 0 };

  const byId = new Map<string, DecodedEntity<T>>();
  for (const entry of decoded.entries) {
    if (byId.has(entry.record.id)) {
      throw new Error(`Two storyboard records in ${path} claim the id ${entry.record.id}.`);
    }
    byId.set(entry.record.id, entry);
  }

  const metas: EntityMetaMap = { ...knownMetas };
  const records: T[] = [];
  const order: string[] = [];
  let external = decoded.external;
  let changedAt = decoded.changedAt;

  for (const [id, meta] of Object.entries(knownMetas)) {
    if (meta.deletedAt !== null) continue;
    if (!byId.has(id)) {
      throw new Error(`The storyboard record ${id} is missing from the open sync folder.`);
    }
  }

  // The array order in the file is the storyboard order, so honor it instead
  // of the entity map's insertion order.
  for (const entry of decoded.entries) {
    const id = entry.record.id;
    const known = knownMetas[id];
    if (known && known.deletedAt !== null) continue;
    metas[id] = entry.meta;
    external ||= entry.external;
    changedAt = Math.max(changedAt, entry.meta.updatedAt);
    if (entry.meta.deletedAt === null) {
      records.push(entry.record);
      order.push(id);
    }
  }

  return { records, metas, order, external, changedAt };
}

function isOpenMarker(value: unknown): value is OpenMarker {
  if (!isObject(value)) return false;
  return value.format === OPEN_FORMAT
    && value.version === OPEN_VERSION
    && typeof value.createdAt === "number";
}

/** Reads the layout marker, or null when the folder is not an open layout. */
export async function readOpenMarker(fs: SyncFileSystem): Promise<OpenMarker | null> {
  if (!(await fs.exists(OPEN_MARKER_FILE))) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readText(OPEN_MARKER_FILE));
  } catch {
    throw new Error("The open sync folder marker could not be read.");
  }
  if (!isOpenMarker(raw)) throw new Error("The open sync folder marker is not valid.");
  return raw;
}

export function openMarkerText(createdAt: number): string {
  const marker: OpenMarker = { format: OPEN_FORMAT, version: OPEN_VERSION, createdAt };
  return `${JSON.stringify(marker, null, 2)}\n`;
}

/** Reads one project directory. A missing header is corruption, not deletion. */
export async function readOpenProject(
  fs: SyncFileSystem,
  dirName: string,
  now: number
): Promise<StoredProject> {
  const dir = `${PROJECTS_DIR}/${dirName}`;
  const projectPath = `${dir}/${PROJECT_FILE}`;
  if (!(await fs.exists(projectPath))) {
    // Treat a project directory without its header as corruption rather than a
    // deletion. A real delete removes the directory, so propagating this as a
    // removal could destroy a project during a partial cloud sync.
    throw new Error(`The project folder ${dirName} is missing its project.json file.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readText(projectPath));
  } catch {
    throw new Error(`The project file in ${dirName} could not be read.`);
  }
  if (!isObject(raw)) {
    throw new Error(`The project file in ${dirName} is not a valid ProseCraft record.`);
  }
  if (raw.format !== PROJECT_FORMAT || raw.version !== PROJECT_VERSION) {
    throw new Error(`The project file in ${dirName} has an unsupported format.`);
  }
  const { hash: storedHash, ...payloadValue } = raw;
  const payload = payloadValue as unknown as ProjectFilePayload;
  if (typeof payload.id !== "string"
    || payload.id === ""
    || typeof payload.createdAt !== "number"
    || typeof payload.updatedAt !== "number"
    || typeof payload.revision !== "number"
    || typeof payload.updatedBy !== "string"
    || !(payload.deletedAt === null || typeof payload.deletedAt === "number")
    || !isLegacyProjectData(payload.project)
    || payload.project.id !== payload.id
    || !isObject(payload.entities)
    || !isObject(payload.order)) {
    throw new Error(`The project file in ${dirName} is not a valid ProseCraft record.`);
  }
  if (safeName(payload.id) !== dirName) {
    throw new Error(`The project file in ${dirName} has inconsistent identity metadata.`);
  }

  const entities = {
    documents: requireMetaMap(payload.entities.documents, projectPath),
    chapters: requireMetaMap(payload.entities.chapters, projectPath),
    storyboardRows: requireMetaMap(payload.entities.storyboardRows, projectPath),
    storyboardCards: requireMetaMap(payload.entities.storyboardCards, projectPath)
  };

  const projectHash = typeof storedHash === "string" ? storedHash : "";
  const projectExternal = projectHash !== hashJson(payloadValue);

  const [documents, chapters, storyboardRows, storyboardCards] = await Promise.all([
    readDocuments(fs, dir, entities.documents, readOrder(payload.order, "documents"), now),
    readChapters(fs, dir, entities.chapters, readOrder(payload.order, "chapters"), now),
    readStoryboard<NonNullable<ProjectData["storyboardRows"]>[number]>(
      fs,
      `${dir}/${STORYBOARD_DIR}/${ROWS_FILE}`,
      entities.storyboardRows,
      now
    ),
    readStoryboard<NonNullable<ProjectData["storyboardCards"]>[number]>(
      fs,
      `${dir}/${STORYBOARD_DIR}/${CARDS_FILE}`,
      entities.storyboardCards,
      now
    )
  ]);

  const external = projectExternal
    || documents.external
    || chapters.external
    || storyboardRows.external
    || storyboardCards.external;
  const changedAt = Math.max(
    now,
    payload.updatedAt + 1,
    documents.changedAt,
    chapters.changedAt,
    storyboardRows.changedAt,
    storyboardCards.changedAt
  );

  return {
    schemaVersion: typeof payload.schemaVersion === "number" ? payload.schemaVersion : SCHEMA_VERSION,
    id: payload.id,
    createdAt: payload.createdAt,
    updatedAt: external ? changedAt : payload.updatedAt,
    revision: external ? payload.revision + 1 : payload.revision,
    updatedBy: external ? "external" : payload.updatedBy,
    deletedAt: payload.deletedAt,
    project: {
      ...payload.project,
      id: payload.id,
      documents: documents.records,
      chapters: chapters.records,
      storyboardRows: storyboardRows.records,
      storyboardCards: storyboardCards.records
    },
    entities: {
      documents: documents.metas,
      chapters: chapters.metas,
      storyboardRows: storyboardRows.metas,
      storyboardCards: storyboardCards.metas
    }
  };
}

/** Lists and reads every project in the open sync folder. */
export async function readOpenProjects(
  fs: SyncFileSystem,
  now: number
): Promise<StoredProject[]> {
  const projects: StoredProject[] = [];
  for (const entry of await fs.listDir(PROJECTS_DIR)) {
    if (!entry.isDirectory) continue;
    projects.push(await readOpenProject(fs, entry.name, now));
  }
  return projects.sort((a, b) => compareStrings(a.id, b.id));
}

async function writeIfChanged(
  fs: SyncFileSystem,
  path: string,
  content: string
): Promise<void> {
  if (await fs.exists(path)) {
    try {
      if (await fs.readText(path) === content) return;
    } catch {
      // Unreadable existing files are replaced below.
    }
  }
  await fs.writeText(path, content);
}

function projectPayload(project: StoredProject): ProjectFilePayload {
  const { documents, chapters, storyboardRows, storyboardCards, ...rest } = project.project;
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    schemaVersion: project.schemaVersion,
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    revision: project.revision,
    updatedBy: project.updatedBy,
    deletedAt: project.deletedAt,
    project: {
      ...rest,
      documents: [],
      chapters: [],
      storyboardRows: [],
      storyboardCards: []
    },
    entities: project.entities,
    order: {
      documents: documents.map((entry) => entry.id),
      chapters: chapters.map((entry) => entry.id),
      storyboardRows: (storyboardRows ?? []).map((entry) => entry.id),
      storyboardCards: (storyboardCards ?? []).map((entry) => entry.id)
    }
  };
}

/** Writes one project directory in the open Markdown + JSON layout. */
export async function writeOpenProject(
  fs: SyncFileSystem,
  project: StoredProject
): Promise<void> {
  const dir = projectDirName(project.id);
  await fs.createDir(`${dir}/${DOCUMENTS_DIR}`);
  await fs.createDir(`${dir}/${CHAPTERS_DIR}`);
  await fs.createDir(`${dir}/${STORYBOARD_DIR}`);

  const documentPaths = new Set<string>();
  for (const document of project.project.documents) {
    const meta = project.entities.documents[document.id];
    if (!meta || meta.deletedAt !== null) continue;
    const body = normalizeBody(document.markdownSource ?? htmlToMarkdown(document.content));
    const path = `${dir}/${DOCUMENTS_DIR}/${safeName(document.id)}.md`;
    await writeIfChanged(fs, path, serializeMarkdown(documentFields(document, meta), body));
    documentPaths.add(path);
  }

  const chapterPaths = new Set<string>();
  for (const chapter of project.project.chapters) {
    const meta = project.entities.chapters[chapter.id];
    if (!meta || meta.deletedAt !== null) continue;
    const path = `${dir}/${CHAPTERS_DIR}/${safeName(chapter.id)}.json`;
    const record = {
      id: chapter.id,
      title: chapter.title,
      expanded: chapter.expanded,
      ...(typeof chapter.summary === "string" ? { summary: chapter.summary } : {}),
      ...(chapter.trashed ? { trashed: true } : {}),
      ...(chapter.labelId ? { labelId: chapter.labelId } : {})
    };
    const content = `${JSON.stringify({ record, meta, hash: hashJson({ record, meta }) }, null, 2)}\n`;
    await writeIfChanged(fs, path, content);
    chapterPaths.add(path);
  }

  for (const kind of ENTITY_KINDS) {
    if (kind === "documents" || kind === "chapters") continue;
    const path = kind === "storyboardRows"
      ? `${dir}/${STORYBOARD_DIR}/${ROWS_FILE}`
      : `${dir}/${STORYBOARD_DIR}/${CARDS_FILE}`;
    const source = kind === "storyboardRows"
      ? (project.project.storyboardRows ?? [])
      : (project.project.storyboardCards ?? []);
    const metas = project.entities[kind];
    const records = source
      .map((record) => ({ record, meta: metas[record.id] }))
      .filter((entry): entry is { record: typeof entry.record; meta: EntityMeta } =>
        Boolean(entry.meta && entry.meta.deletedAt === null)
      );
    await writeIfChanged(
      fs,
      path,
      `${JSON.stringify({ records, hash: hashJson(records) }, null, 2)}\n`
    );
  }

  const payload = projectPayload(project);
  const content = `${JSON.stringify({ ...payload, hash: hashJson(payload) }, null, 2)}\n`;
  // Write the project header last so an interrupted upload does not advertise
  // entity files that have not been written yet.
  await writeIfChanged(fs, `${dir}/${PROJECT_FILE}`, content);

  await pruneEntityDir(fs, `${dir}/${DOCUMENTS_DIR}`, documentPaths, ".md");
  await pruneEntityDir(fs, `${dir}/${CHAPTERS_DIR}`, chapterPaths, ".json");
}

async function pruneEntityDir(
  fs: SyncFileSystem,
  dir: string,
  keep: Set<string>,
  extension: string
): Promise<void> {
  for (const entry of await fs.listDir(dir)) {
    if (entry.isDirectory || !entry.name.endsWith(extension)) continue;
    const path = `${dir}/${entry.name}`;
    if (!keep.has(path)) await fs.remove(path);
  }
}
