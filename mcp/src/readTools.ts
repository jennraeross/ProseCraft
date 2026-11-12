import { promises as fs } from "node:fs";
import path from "node:path";
import {
  findProjectDir,
  parseMarkdown,
  safeName,
  type EntityMeta,
  type ProjectHeader
} from "./openStore.js";

export type WikiPageKind = "character" | "place" | "page";

export type WikiPageSummary = {
  id: string;
  title: string;
  folderId: string | null;
  /** Folder titles from the root down to the page's folder; empty when unfiled. */
  folderPath: string[];
  kind: WikiPageKind;
  updatedAt: number;
  revision: number;
};

export type WikiPage = WikiPageSummary & {
  markdown: string;
  /** Every frontmatter field as stored, including ones this server does not interpret. */
  fields: Record<string, unknown>;
  meta: EntityMeta;
};

export type WikiFolderNode = {
  id: string;
  title: string;
  parentId: string | null;
  children: WikiFolderNode[];
};

export type LabelSummary = {
  id: string;
  name: string;
  color: string;
  /** Live documents carrying the label. */
  scenes: number;
  chapters: number;
};

export type CommentSummary = {
  id: string;
  documentId: string;
  quote: string;
  body: string;
  author: string;
  createdAt: number;
  resolved: boolean;
};

export type SnapshotSummary = {
  id: string;
  documentId: string;
  reason: "manual" | "before-restore";
  createdAt: number;
  note?: string;
};

export type SnapshotDetail = SnapshotSummary & {
  title: string;
  content: string;
};

type StoredFolder = { id: string; title: string; parentId: string | null };
type StoredLabel = { id: string; name: string; color: string };
type StoredComment = CommentSummary & { prefix?: string; suffix?: string };
type StoredSnapshot = SnapshotSummary & { title: string; content: string };

export type StoredDocument = {
  id: string;
  fields: Record<string, unknown>;
  body: string;
  meta: EntityMeta;
};

export type StoredChapter = { id: string; title: string; labelId?: string; trashed: boolean };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFolder(value: unknown): value is StoredFolder {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && (value.parentId === null || typeof value.parentId === "string");
}

function isLabel(value: unknown): value is StoredLabel {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.color === "string";
}

function isComment(value: unknown): value is StoredComment {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.documentId === "string"
    && typeof value.quote === "string"
    && typeof value.body === "string"
    && typeof value.author === "string"
    && typeof value.createdAt === "number"
    && typeof value.resolved === "boolean";
}

function isSnapshot(value: unknown): value is StoredSnapshot {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.documentId === "string"
    && typeof value.title === "string"
    && typeof value.content === "string"
    && typeof value.createdAt === "number"
    && (value.reason === "manual" || value.reason === "before-restore")
    && (value.note === undefined || typeof value.note === "string");
}

/** The project payload of `project.json`; guarded because the file comes from disk. */
function projectRecord(header: ProjectHeader): Record<string, unknown> {
  const project: unknown = header.project;
  return isObject(project) ? project : {};
}

function readArray<T>(value: unknown, guard: (entry: unknown) => entry is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function sortByOrder<T extends { id: string }>(entries: T[], order: string[]): T[] {
  return entries.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Reads every live document file, skipping malformed ones like `list_scenes` does. */
export async function readStoredDocuments(dir: string, header: ProjectHeader): Promise<StoredDocument[]> {
  const out: StoredDocument[] = [];
  for (const [id, meta] of Object.entries(header.entities.documents ?? {})) {
    if (meta.deletedAt !== null) continue;
    try {
      const text = await fs.readFile(path.join(dir, "documents", `${safeName(id)}.md`), "utf8");
      out.push({ id, ...parseMarkdown(text), meta });
    } catch {
      // A malformed file must not hide the other documents.
    }
  }
  return sortByOrder(out, header.order.documents ?? []);
}

export async function readStoredChapters(dir: string, header: ProjectHeader): Promise<StoredChapter[]> {
  const out: StoredChapter[] = [];
  for (const [id, meta] of Object.entries(header.entities.chapters ?? {})) {
    if (meta.deletedAt !== null) continue;
    try {
      const raw: unknown = JSON.parse(await fs.readFile(path.join(dir, "chapters", `${safeName(id)}.json`), "utf8"));
      const record = isObject(raw) && isObject(raw.record) ? raw.record : {};
      out.push({
        id,
        title: typeof record.title === "string" ? record.title : "",
        ...(typeof record.labelId === "string" ? { labelId: record.labelId } : {}),
        trashed: record.trashed === true
      });
    } catch {
      // Same per-file tolerance as the document reader.
    }
  }
  return out;
}

function pageKind(fields: Record<string, unknown>): WikiPageKind {
  if (isObject(fields.character)) return "character";
  if (isObject(fields.place)) return "place";
  return "page";
}

function folderPath(folderId: string | null, folders: Map<string, StoredFolder>): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  let current = folderId;
  while (current !== null && !seen.has(current)) {
    const folder = folders.get(current);
    if (!folder) break;
    seen.add(current);
    titles.unshift(folder.title);
    current = folder.parentId;
  }
  return titles;
}

function folderMap(header: ProjectHeader): Map<string, StoredFolder> {
  return new Map(readArray(projectRecord(header).researchFolders, isFolder).map((folder) => [folder.id, folder]));
}

export async function listWikiPages(
  root: string,
  projectId: string,
  folderId?: string
): Promise<WikiPageSummary[]> {
  const { dir, header } = await findProjectDir(root, projectId);
  const folders = folderMap(header);
  const out: WikiPageSummary[] = [];
  for (const document of await readStoredDocuments(dir, header)) {
    const { fields } = document;
    if (fields.space !== "Wiki" || fields.trashed === true) continue;
    const pageFolderId = typeof fields.folderId === "string" ? fields.folderId : null;
    if (folderId !== undefined && pageFolderId !== folderId) continue;
    out.push({
      id: document.id,
      title: typeof fields.title === "string" ? fields.title : "",
      folderId: pageFolderId,
      folderPath: folderPath(pageFolderId, folders),
      kind: pageKind(fields),
      updatedAt: document.meta.updatedAt,
      revision: document.meta.revision
    });
  }
  return out;
}

export async function readWikiPage(root: string, projectId: string, pageId: string): Promise<WikiPage> {
  const { dir, header } = await findProjectDir(root, projectId);
  const meta = header.entities.documents?.[pageId];
  if (!meta || meta.deletedAt !== null) throw new Error(`Wiki page not found: ${pageId}`);
  const file = path.join(dir, "documents", `${safeName(pageId)}.md`);
  let parsed: { fields: Record<string, unknown>; body: string };
  try {
    parsed = parseMarkdown(await fs.readFile(file, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Wiki page ${pageId} could not be read: ${reason} (${file})`);
  }
  const { fields, body } = parsed;
  if (fields.space !== "Wiki") throw new Error(`Document is not a Wiki page: ${pageId}`);
  if (fields.trashed === true) throw new Error(`Wiki page is in the trash: ${pageId}`);
  const folderId = typeof fields.folderId === "string" ? fields.folderId : null;
  return {
    id: pageId,
    title: typeof fields.title === "string" ? fields.title : "",
    folderId,
    folderPath: folderPath(folderId, folderMap(header)),
    kind: pageKind(fields),
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    markdown: body,
    fields,
    meta
  };
}

export async function listWikiFolders(root: string, projectId: string): Promise<WikiFolderNode[]> {
  const { header } = await findProjectDir(root, projectId);
  const folders = readArray(projectRecord(header).researchFolders, isFolder);
  const nodes = new Map<string, WikiFolderNode>();
  for (const folder of folders) {
    nodes.set(folder.id, { id: folder.id, title: folder.title, parentId: folder.parentId, children: [] });
  }
  const roots: WikiFolderNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id)!;
    const parent = folder.parentId === null ? undefined : nodes.get(folder.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      // A folder whose parent is gone still belongs in the tree.
      roots.push(node);
    }
  }
  return roots;
}

export async function listLabels(root: string, projectId: string): Promise<LabelSummary[]> {
  const { dir, header } = await findProjectDir(root, projectId);
  const labels = readArray(projectRecord(header).labels, isLabel);
  const documents = (await readStoredDocuments(dir, header)).filter(
    (document) => document.fields.trashed !== true
  );
  const chapters = await readStoredChapters(dir, header);
  return labels.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
    scenes: documents.filter((document) => document.fields.labelId === label.id).length,
    chapters: chapters.filter((chapter) => chapter.labelId === label.id && !chapter.trashed).length
  }));
}

export async function listComments(
  root: string,
  projectId: string,
  options: { documentId?: string; includeResolved?: boolean } = {}
): Promise<CommentSummary[]> {
  const { header } = await findProjectDir(root, projectId);
  return readArray(projectRecord(header).comments, isComment)
    .filter((comment) => options.documentId === undefined || comment.documentId === options.documentId)
    .filter((comment) => options.includeResolved === true || !comment.resolved)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((comment) => ({
      id: comment.id,
      documentId: comment.documentId,
      quote: comment.quote,
      body: comment.body,
      author: comment.author,
      createdAt: comment.createdAt,
      resolved: comment.resolved
    }));
}

export async function listSnapshots(
  root: string,
  projectId: string,
  documentId?: string
): Promise<SnapshotSummary[]> {
  const { header } = await findProjectDir(root, projectId);
  return readArray(projectRecord(header).snapshots, isSnapshot)
    .filter((snapshot) => documentId === undefined || snapshot.documentId === documentId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((snapshot) => ({
      id: snapshot.id,
      documentId: snapshot.documentId,
      reason: snapshot.reason,
      createdAt: snapshot.createdAt,
      ...(snapshot.note !== undefined ? { note: snapshot.note } : {})
    }));
}

export async function readSnapshot(
  root: string,
  projectId: string,
  snapshotId: string
): Promise<SnapshotDetail> {
  const { header } = await findProjectDir(root, projectId);
  const snapshot = readArray(projectRecord(header).snapshots, isSnapshot).find(
    (entry) => entry.id === snapshotId
  );
  if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
  return {
    id: snapshot.id,
    documentId: snapshot.documentId,
    reason: snapshot.reason,
    createdAt: snapshot.createdAt,
    ...(snapshot.note !== undefined ? { note: snapshot.note } : {}),
    title: snapshot.title,
    content: snapshot.content
  };
}
