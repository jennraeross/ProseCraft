import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertExpectedRevision,
  bumpMeta,
  findProjectDir,
  hashJson,
  normalizeBody,
  parseMarkdown,
  safeName,
  serializeMarkdown,
  withWriteLock,
  writeFileAtomic,
  writeProjectHeader,
  type EntityMeta,
  type ProjectHeader,
  type SceneRecord,
  type WriteSceneInput
} from "./openStore.js";

/** Oldest snapshots of a document are dropped once it has more than this many. */
export const MAX_SNAPSHOTS_PER_DOCUMENT = 10;
const SNAPSHOT_NOTE = "Before MCP write";
const CONTEXT_LENGTH = 24;
const MAX_QUOTE_LENGTH = 2000;
const MAX_COMMENT_BODY_LENGTH = 4000;
const MAX_COMMENT_AUTHOR_LENGTH = 60;

/** Same shape as the app's `DocumentSnapshot` in src/lib/storage/types.ts. */
export type DocumentSnapshot = {
  id: string;
  documentId: string;
  createdAt: number;
  title: string;
  content: string;
  reason: "manual" | "before-restore";
  note?: string;
};

/** Same shape as the app's `TextComment` in src/lib/storage/types.ts. */
export type TextComment = {
  id: string;
  documentId: string;
  quote: string;
  prefix: string;
  suffix: string;
  body: string;
  author: string;
  createdAt: number;
  resolved: boolean;
};

export type SafeSceneRecord = SceneRecord & { snapshotId: string | null };

export type WriteSceneSafeInput = WriteSceneInput & {
  /** Pass false to overwrite without snapshotting the previous text. */
  snapshot?: boolean;
};

export type WikiPageInput = {
  title: string;
  folderId?: string;
  content?: string;
  labelId?: string;
};

export type WikiPageUpdate = {
  pageId: string;
  title?: string;
  content?: string;
  folderId?: string;
  labelId?: string;
  expectedRevision?: number;
};

export type WikiPageRecord = {
  id: string;
  title: string;
  markdown: string;
  meta: EntityMeta;
  fields: Record<string, unknown>;
  snapshotId: string | null;
};

export type LabelResult = {
  documentId?: string;
  chapterId?: string;
  labelId: string | null;
  revision: number;
};

export type ResolveCommentResult = { id: string; documentId: string; resolved: true };

function projectData(header: ProjectHeader): Record<string, unknown> {
  return header.project as unknown as Record<string, unknown>;
}

function isSnapshot(value: unknown): value is DocumentSnapshot {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DocumentSnapshot>;
  return (
    typeof entry.id === "string" &&
    typeof entry.documentId === "string" &&
    typeof entry.title === "string" &&
    typeof entry.content === "string" &&
    typeof entry.createdAt === "number" &&
    (entry.reason === "manual" || entry.reason === "before-restore")
  );
}

function isComment(value: unknown): value is TextComment {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<TextComment>;
  return (
    typeof entry.id === "string" &&
    typeof entry.documentId === "string" &&
    typeof entry.quote === "string" &&
    typeof entry.body === "string" &&
    typeof entry.createdAt === "number" &&
    typeof entry.resolved === "boolean"
  );
}

function readSnapshots(header: ProjectHeader): DocumentSnapshot[] {
  const value = projectData(header).snapshots;
  return Array.isArray(value) ? value.filter(isSnapshot) : [];
}

function readComments(header: ProjectHeader): TextComment[] {
  const value = projectData(header).comments;
  return Array.isArray(value) ? value.filter(isComment) : [];
}

/** Mirrors `addSnapshot` in src/lib/snapshots.ts, including the per-document cap. */
function addSnapshot(snapshots: readonly DocumentSnapshot[], snapshot: DocumentSnapshot): DocumentSnapshot[] {
  const own = [...snapshots.filter((entry) => entry.documentId === snapshot.documentId), snapshot].sort(
    (a, b) => a.createdAt - b.createdAt
  );
  const keep = new Set(own.slice(Math.max(0, own.length - MAX_SNAPSHOTS_PER_DOCUMENT)).map((entry) => entry.id));
  return [...snapshots, snapshot].filter((entry) => entry.documentId !== snapshot.documentId || keep.has(entry.id));
}

/** Mirrors `buildAnchor` in src/lib/comments.ts for a passage known to start at `start`. */
function buildAnchor(text: string, start: number, end: number): { quote: string; prefix: string; suffix: string } {
  return {
    quote: text.slice(start, end).slice(0, MAX_QUOTE_LENGTH),
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + CONTEXT_LENGTH)
  };
}

function assertLabel(header: ProjectHeader, labelId: string): void {
  const labels = projectData(header).labels;
  const known = Array.isArray(labels) ? labels.some((label) => isObject(label) && label.id === labelId) : false;
  if (!known) throw new Error(`Label not found: ${labelId}. Use list_labels to see the project labels.`);
}

function assertFolder(header: ProjectHeader, folderId: string): void {
  const folders = projectData(header).researchFolders;
  const known = Array.isArray(folders) ? folders.some((folder) => isObject(folder) && folder.id === folderId) : false;
  if (!known) throw new Error(`Wiki folder not found: ${folderId}. Use list_wiki_folders to see the folder tree.`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readDocument(
  dir: string,
  documentId: string
): Promise<{ fields: Record<string, unknown>; body: string }> {
  return parseMarkdown(await fs.readFile(path.join(dir, "documents", `${safeName(documentId)}.md`), "utf8"));
}

function bumpProjectHeader(header: ProjectHeader, now: number): void {
  header.updatedAt = Math.max(now, header.updatedAt + 1);
  header.revision += 1;
  header.updatedBy = "mcp";
}

/** Applies the owned fields and the bumped meta, exactly like the app's document writer. */
function applyMeta(fields: Record<string, unknown>, meta: EntityMeta): void {
  delete fields.hash;
  fields.updatedAt = meta.updatedAt;
  fields.revision = meta.revision;
  fields.updatedBy = meta.updatedBy;
  fields.deletedAt = meta.deletedAt;
}

export async function writeScene(
  root: string,
  projectId: string,
  input: WriteSceneSafeInput
): Promise<SafeSceneRecord> {
  return withWriteLock(root, () => writeSceneLocked(root, projectId, input));
}

async function writeSceneLocked(
  root: string,
  projectId: string,
  input: WriteSceneSafeInput
): Promise<SafeSceneRecord> {
  const { dir, header } = await findProjectDir(root, projectId);
  const now = Date.now();
  const id = input.sceneId ?? randomUUID();
  const existing = header.entities.documents?.[id];
  if (input.sceneId && !existing && input.create !== true) {
    throw new Error(`Scene not found: ${input.sceneId}. Pass create: true to create a new scene with that id.`);
  }
  assertExpectedRevision(`Scene ${id}`, input.expectedRevision, existing?.revision);
  const prev = existing ? await readDocument(dir, id) : { fields: {}, body: "" };
  const prevFields = prev.fields;
  const chapterId = input.chapterId ?? (typeof prevFields.chapterId === "string" ? prevFields.chapterId : undefined);
  if (chapterId) {
    const chapters = header.entities.chapters ?? {};
    if (!chapters[chapterId] || chapters[chapterId].deletedAt !== null) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }
  }
  const meta = bumpMeta(existing ?? { updatedAt: 0, revision: 0, updatedBy: "mcp", deletedAt: null }, now);
  // Start from the stored frontmatter so fields this tool does not own (space,
  // folderId, labelId, trashed, character/place profiles and future keys)
  // survive the round trip; only the fields below are overwritten.
  const fields: Record<string, unknown> = { ...prevFields };
  fields.id = id;
  fields.title = input.title ?? (typeof prevFields.title === "string" ? prevFields.title : "");
  if (chapterId) fields.chapterId = chapterId;
  applyMeta(fields, meta);
  fields.deletedAt = null;

  let snapshotId: string | null = null;
  if (existing && input.snapshot !== false) {
    const snapshot: DocumentSnapshot = {
      id: randomUUID(),
      documentId: id,
      createdAt: now,
      title: typeof prevFields.title === "string" ? prevFields.title : "",
      content: prev.body,
      reason: "manual",
      note: SNAPSHOT_NOTE
    };
    snapshotId = snapshot.id;
    projectData(header).snapshots = addSnapshot(readSnapshots(header), snapshot);
  }

  await fs.mkdir(path.join(dir, "documents"), { recursive: true });
  await writeFileAtomic(path.join(dir, "documents", `${safeName(id)}.md`), serializeMarkdown(fields, input.markdown));

  header.entities.documents = { ...(header.entities.documents ?? {}), [id]: meta };
  const order = header.order.documents ?? [];
  if (!order.includes(id)) order.push(id);
  header.order.documents = order;
  bumpProjectHeader(header, now);
  await writeProjectHeader(dir, header);
  return {
    id,
    title: String(fields.title ?? ""),
    ...(chapterId ? { chapterId } : {}),
    markdown: normalizeBody(input.markdown),
    meta,
    fields,
    snapshotId
  };
}

export async function createWikiPage(root: string, projectId: string, input: WikiPageInput): Promise<WikiPageRecord> {
  return withWriteLock(root, () => createWikiPageLocked(root, projectId, input));
}

async function createWikiPageLocked(
  root: string,
  projectId: string,
  input: WikiPageInput
): Promise<WikiPageRecord> {
  const { dir, header } = await findProjectDir(root, projectId);
  if (input.folderId !== undefined) assertFolder(header, input.folderId);
  if (input.labelId !== undefined) assertLabel(header, input.labelId);
  const now = Date.now();
  const id = randomUUID();
  const meta = bumpMeta({ updatedAt: 0, revision: 0, updatedBy: "mcp", deletedAt: null }, now);
  // Only the fields this tool owns, like a new scene; the rest defaults in the app.
  const fields: Record<string, unknown> = {
    id,
    title: input.title,
    space: "Wiki",
    ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    ...(input.labelId !== undefined ? { labelId: input.labelId } : {}),
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    updatedBy: meta.updatedBy,
    deletedAt: meta.deletedAt
  };
  await fs.mkdir(path.join(dir, "documents"), { recursive: true });
  await writeFileAtomic(path.join(dir, "documents", `${safeName(id)}.md`), serializeMarkdown(fields, input.content ?? ""));

  header.entities.documents = { ...(header.entities.documents ?? {}), [id]: meta };
  const order = header.order.documents ?? [];
  order.push(id);
  header.order.documents = order;
  bumpProjectHeader(header, now);
  await writeProjectHeader(dir, header);
  return { id, title: input.title, markdown: normalizeBody(input.content ?? ""), meta, fields, snapshotId: null };
}

export async function updateWikiPage(root: string, projectId: string, input: WikiPageUpdate): Promise<WikiPageRecord> {
  return withWriteLock(root, () => updateWikiPageLocked(root, projectId, input));
}

async function updateWikiPageLocked(
  root: string,
  projectId: string,
  input: WikiPageUpdate
): Promise<WikiPageRecord> {
  const { dir, header } = await findProjectDir(root, projectId);
  const existing = header.entities.documents?.[input.pageId];
  if (!existing || existing.deletedAt !== null) throw new Error(`Wiki page not found: ${input.pageId}`);
  assertExpectedRevision(`Wiki page ${input.pageId}`, input.expectedRevision, existing.revision);
  if (input.folderId !== undefined) assertFolder(header, input.folderId);
  if (input.labelId !== undefined) assertLabel(header, input.labelId);
  const prev = await readDocument(dir, input.pageId);
  const prevFields = prev.fields;
  if (prevFields.space !== "Wiki") throw new Error(`Document is not a Wiki page: ${input.pageId}`);
  if (prevFields.trashed === true) throw new Error(`Wiki page is in the trash: ${input.pageId}`);

  const now = Date.now();
  const meta = bumpMeta(existing, now);
  // Start from the stored frontmatter so profiles and future keys survive the round trip.
  const fields: Record<string, unknown> = { ...prevFields };
  applyMeta(fields, meta);
  if (input.title !== undefined) fields.title = input.title;
  if (input.folderId !== undefined) fields.folderId = input.folderId;
  if (input.labelId !== undefined) fields.labelId = input.labelId;
  const markdown = input.content ?? prev.body;

  const snapshot: DocumentSnapshot = {
    id: randomUUID(),
    documentId: input.pageId,
    createdAt: now,
    title: typeof prevFields.title === "string" ? prevFields.title : "",
    content: prev.body,
    reason: "manual",
    note: SNAPSHOT_NOTE
  };
  projectData(header).snapshots = addSnapshot(readSnapshots(header), snapshot);

  await writeFileAtomic(
    path.join(dir, "documents", `${safeName(input.pageId)}.md`),
    serializeMarkdown(fields, markdown)
  );
  header.entities.documents = { ...(header.entities.documents ?? {}), [input.pageId]: meta };
  bumpProjectHeader(header, now);
  await writeProjectHeader(dir, header);
  return {
    id: input.pageId,
    title: String(fields.title ?? ""),
    markdown: normalizeBody(markdown),
    meta,
    fields,
    snapshotId: snapshot.id
  };
}

export async function setLabel(
  root: string,
  projectId: string,
  input: { documentId?: string; chapterId?: string; labelId: string | null }
): Promise<LabelResult> {
  return withWriteLock(root, () => setLabelLocked(root, projectId, input));
}

async function setLabelLocked(
  root: string,
  projectId: string,
  input: { documentId?: string; chapterId?: string; labelId: string | null }
): Promise<LabelResult> {
  if ((input.documentId === undefined) === (input.chapterId === undefined)) {
    throw new Error("Pass exactly one of documentId or chapterId.");
  }
  const { dir, header } = await findProjectDir(root, projectId);
  if (input.labelId !== null) assertLabel(header, input.labelId);
  const now = Date.now();

  if (input.documentId !== undefined) {
    const documentId = input.documentId;
    const meta = header.entities.documents?.[documentId];
    if (!meta || meta.deletedAt !== null) throw new Error(`Document not found: ${documentId}`);
    const prev = await readDocument(dir, documentId);
    const fields: Record<string, unknown> = { ...prev.fields };
    if (input.labelId === null) {
      delete fields.labelId;
    } else {
      fields.labelId = input.labelId;
    }
    const nextMeta = bumpMeta(meta, now);
    applyMeta(fields, nextMeta);
    await writeFileAtomic(
      path.join(dir, "documents", `${safeName(documentId)}.md`),
      serializeMarkdown(fields, prev.body)
    );
    header.entities.documents = { ...(header.entities.documents ?? {}), [documentId]: nextMeta };
    bumpProjectHeader(header, now);
    await writeProjectHeader(dir, header);
    return { documentId, labelId: input.labelId, revision: nextMeta.revision };
  }

  const chapterId = input.chapterId!;
  const meta = header.entities.chapters?.[chapterId];
  if (!meta || meta.deletedAt !== null) throw new Error(`Chapter not found: ${chapterId}`);
  const file = path.join(dir, "chapters", `${safeName(chapterId)}.json`);
  // Chapter files are `{ record, meta, hash }` envelopes; only the record carries labelId.
  const raw: unknown = JSON.parse(await fs.readFile(file, "utf8"));
  if (!isObject(raw) || !isObject(raw.record)) {
    throw new Error(`Chapter ${chapterId} has an unexpected layout: ${file}`);
  }
  const record = raw.record;
  if (input.labelId === null) {
    delete record.labelId;
  } else {
    record.labelId = input.labelId;
  }
  const nextMeta = bumpMeta(meta, now);
  const content = `${JSON.stringify({ record, meta: nextMeta, hash: hashJson({ record, meta: nextMeta }) }, null, 2)}\n`;
  await writeFileAtomic(file, content);
  header.entities.chapters = { ...(header.entities.chapters ?? {}), [chapterId]: nextMeta };
  bumpProjectHeader(header, now);
  await writeProjectHeader(dir, header);
  return { chapterId, labelId: input.labelId, revision: nextMeta.revision };
}

export async function addComment(
  root: string,
  projectId: string,
  input: { documentId: string; quote: string; text: string; author?: string }
): Promise<TextComment> {
  return withWriteLock(root, () => addCommentLocked(root, projectId, input));
}

async function addCommentLocked(
  root: string,
  projectId: string,
  input: { documentId: string; quote: string; text: string; author?: string }
): Promise<TextComment> {
  if (!input.quote.trim()) throw new Error("Quote must not be empty.");
  const { dir, header } = await findProjectDir(root, projectId);
  const meta = header.entities.documents?.[input.documentId];
  if (!meta || meta.deletedAt !== null) throw new Error(`Document not found: ${input.documentId}`);
  const prev = await readDocument(dir, input.documentId);
  if (prev.fields.trashed === true) throw new Error(`Document is in the trash: ${input.documentId}`);
  const start = prev.body.indexOf(input.quote);
  if (start === -1) throw new Error(`Quote not found in document ${input.documentId}.`);
  if (prev.body.indexOf(input.quote, start + 1) !== -1) {
    throw new Error(`Quote occurs more than once in document ${input.documentId}; pick a longer, unique passage.`);
  }
  const end = start + input.quote.length;
  const anchor = buildAnchor(prev.body, start, end);
  const comment: TextComment = {
    id: randomUUID(),
    documentId: input.documentId,
    quote: anchor.quote,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    body: input.text.trim().slice(0, MAX_COMMENT_BODY_LENGTH),
    author: (input.author ?? "").trim().slice(0, MAX_COMMENT_AUTHOR_LENGTH) || "Me",
    createdAt: Date.now(),
    resolved: false
  };
  const comments = readComments(header);
  projectData(header).comments = [...comments, comment];
  bumpProjectHeader(header, comment.createdAt);
  await writeProjectHeader(dir, header);
  return comment;
}

export async function resolveComment(
  root: string,
  projectId: string,
  commentId: string
): Promise<ResolveCommentResult> {
  return withWriteLock(root, () => resolveCommentLocked(root, projectId, commentId));
}

async function resolveCommentLocked(
  root: string,
  projectId: string,
  commentId: string
): Promise<ResolveCommentResult> {
  const { dir, header } = await findProjectDir(root, projectId);
  const comments = readComments(header);
  const comment = comments.find((entry) => entry.id === commentId);
  if (!comment) throw new Error(`Comment not found: ${commentId}`);
  const now = Date.now();
  projectData(header).comments = comments.map((entry) =>
    entry.id === commentId ? { ...entry, resolved: true } : entry
  );
  bumpProjectHeader(header, now);
  await writeProjectHeader(dir, header);
  return { id: comment.id, documentId: comment.documentId, resolved: true };
}
