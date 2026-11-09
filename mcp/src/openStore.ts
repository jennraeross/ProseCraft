import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type EntityMeta = {
  updatedAt: number;
  revision: number;
  updatedBy: string;
  deletedAt: number | null;
};

export type SceneRecord = {
  id: string;
  title: string;
  chapterId?: string;
  markdown: string;
  meta: EntityMeta;
};

export type ChapterRecord = {
  id: string;
  title: string;
  expanded: boolean;
  summary?: string;
  meta: EntityMeta;
};

export type WriteSceneInput = {
  sceneId?: string;
  chapterId?: string;
  title?: string;
  markdown: string;
  create?: boolean;
  expectedRevision?: number;
};

export type TrashResult = { id: string; revision: number };

const PROJECTS_DIR = "projects";
const MARKER_FILE = "prosecraft-folder.json";
const LOCK_FILE = ".prosecraft-mcp.lock";
const LOCK_STALE_MS = 30_000;

export function safeName(id: string): string {
  if (/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(id)) return id;
  const bytes = Buffer.from(id, "utf8");
  return `~${bytes.toString("base64url")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function hashJson(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
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
  if (raw.startsWith('"') || raw.startsWith("{") || raw.startsWith("[")) {
    return JSON.parse(raw);
  }
  return raw;
}

function parseMarkdown(text: string): { fields: Record<string, unknown>; body: string } {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("missing frontmatter");
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("unterminated frontmatter");
  const header = normalized.slice(4, end);
  let body = normalized.slice(end + 5);
  if (body.startsWith("\n")) body = body.slice(1);
  const fields: Record<string, unknown> = {};
  for (const line of header.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) throw new Error("invalid frontmatter line");
    const key = line.slice(0, colon).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error("invalid frontmatter key");
    fields[key] = parseYamlValue(line.slice(colon + 1).trim());
  }
  return { fields, body: normalizeBody(body) };
}

// Must hash exactly the same fields as `documentPayload` in
// `src/lib/storage/sync/open-layout.ts`; the app treats any hash mismatch as an
// external edit and bumps the revision again.
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

function serializeMarkdown(fields: Record<string, unknown>, body: string): string {
  const hash = hashJson({ fields: documentPayload(fields), body: normalizeBody(body) });
  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
  entries.push(`hash: ${JSON.stringify(hash)}`);
  return `---\n${entries.join("\n")}\n---\n\n${normalizeBody(body)}\n`;
}

function readMeta(fields: Record<string, unknown>): EntityMeta {
  return {
    updatedAt: typeof fields.updatedAt === "number" ? fields.updatedAt : 0,
    revision: typeof fields.revision === "number" ? fields.revision : 0,
    updatedBy: typeof fields.updatedBy === "string" && fields.updatedBy ? fields.updatedBy : "external",
    deletedAt: fields.deletedAt === null || typeof fields.deletedAt === "number" ? fields.deletedAt : null
  };
}

export function resolveRoot(): string {
  const root = process.env.PROSECRAFT_OPEN_DIR?.trim();
  if (!root) {
    throw new Error("Set PROSECRAFT_OPEN_DIR to your open-folder sync directory.");
  }
  return root;
}

export async function assertOpenRoot(root: string): Promise<void> {
  const marker = path.join(root, MARKER_FILE);
  try {
    const raw = JSON.parse(await fs.readFile(marker, "utf8"));
    if (raw?.format !== "prosecraft.open") throw new Error("bad marker");
  } catch {
    throw new Error(`Not a ProseCraft open folder: ${root}`);
  }
}

// Every write goes through a sibling temp file and a rename, so a crash or a
// full disk leaves the previous content in place instead of a half-written file.
async function writeFileAtomic(file: string, content: string): Promise<void> {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, content, "utf8");
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

type WriteLock = { path: string; token: string };

function lockBusy(lockPath: string): Error {
  return new Error(
    `Another ProseCraft MCP write is in progress (${lockPath}). Retry in a moment; ` +
      `a lock older than ${LOCK_STALE_MS / 1000}s is treated as stale.`
  );
}

// Advisory lock so two MCP calls cannot read-modify-write the header at once.
// MCP writes are short, so an older lock is left over from an interrupted run.
async function acquireWriteLock(root: string): Promise<WriteLock> {
  const lockPath = path.join(root, LOCK_FILE);
  const token = `${process.pid}:${randomUUID()}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.writeFile(lockPath, token, { encoding: "utf8", flag: "wx" });
      return { path: lockPath, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stats = await fs.stat(lockPath).catch(() => null);
    if (stats && Date.now() - stats.mtimeMs <= LOCK_STALE_MS) throw lockBusy(lockPath);
    await fs.rm(lockPath, { force: true });
  }
  throw lockBusy(lockPath);
}

async function releaseWriteLock(lock: WriteLock): Promise<void> {
  try {
    if ((await fs.readFile(lock.path, "utf8")) === lock.token) {
      await fs.rm(lock.path, { force: true });
    }
  } catch {
    // Already removed, or taken over as stale; nothing to release.
  }
}

async function withWriteLock<T>(root: string, run: () => Promise<T>): Promise<T> {
  const lock = await acquireWriteLock(root);
  try {
    return await run();
  } finally {
    await releaseWriteLock(lock);
  }
}

function assertExpectedRevision(label: string, expected: number | undefined, current: number | undefined): void {
  if (expected === undefined) return;
  if (current === undefined) {
    throw new Error(`${label} does not exist, so expectedRevision ${expected} cannot match; nothing was written.`);
  }
  if (current !== expected) {
    throw new Error(
      `${label} revision mismatch: expectedRevision ${expected}, current revision is ${current}; nothing was written.`
    );
  }
}

type ProjectHeader = {
  id: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  updatedBy: string;
  deletedAt: number | null;
  schemaVersion: number;
  project: { id: string; name: string; author?: string };
  entities: Record<"documents" | "chapters", Record<string, EntityMeta>>;
  order: Record<"documents" | "chapters", string[]>;
};

async function readProjectHeader(root: string, dirName: string): Promise<{ dir: string; header: ProjectHeader }> {
  const dir = path.join(root, PROJECTS_DIR, dirName);
  const raw = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8"));
  if (!raw || typeof raw.id !== "string" || safeName(raw.id) !== dirName) {
    throw new Error(`Project ${dirName} has inconsistent identity metadata.`);
  }
  return { dir, header: raw as ProjectHeader };
}

export async function listProjects(root: string): Promise<Array<{ id: string; name: string; dirName: string }>> {
  await assertOpenRoot(root);
  const base = path.join(root, PROJECTS_DIR);
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
  const out: Array<{ id: string; name: string; dirName: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const { header } = await readProjectHeader(root, entry.name);
      if (header.deletedAt !== null) continue;
      out.push({ id: header.id, name: header.project?.name ?? header.id, dirName: entry.name });
    } catch {
      // Skip incomplete/corrupt project dirs; surface errors on direct access.
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function assertLiveProject(
  projectId: string,
  found: { dir: string; header: ProjectHeader }
): { dir: string; header: ProjectHeader } {
  if (found.header.deletedAt !== null) throw new Error(`Project is deleted: ${projectId}`);
  return found;
}

async function findProjectDir(root: string, projectId: string): Promise<{ dir: string; header: ProjectHeader }> {
  // Fast path: dir name usually equals the id for UUIDs.
  let direct: { dir: string; header: ProjectHeader } | undefined;
  try {
    direct = await readProjectHeader(root, safeName(projectId));
  } catch {
    // Fall back to scanning for encoded dir names.
  }
  if (direct) return assertLiveProject(projectId, direct);
  for (const p of await listProjects(root)) {
    if (p.id === projectId) return assertLiveProject(projectId, await readProjectHeader(root, p.dirName));
  }
  throw new Error(`Project not found: ${projectId}`);
}

export async function listChapters(root: string, projectId: string): Promise<ChapterRecord[]> {
  const { dir, header } = await findProjectDir(root, projectId);
  const out: ChapterRecord[] = [];
  for (const [id, meta] of Object.entries(header.entities.chapters ?? {})) {
    if (meta.deletedAt !== null) continue;
    const raw = JSON.parse(await fs.readFile(path.join(dir, "chapters", `${safeName(id)}.json`), "utf8"));
    const record = raw?.record ?? {};
    out.push({
      id,
      title: typeof record.title === "string" ? record.title : "",
      expanded: record.expanded === true,
      ...(typeof record.summary === "string" ? { summary: record.summary } : {}),
      meta
    });
  }
  const order = header.order.chapters ?? [];
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export async function listScenes(
  root: string,
  projectId: string,
  chapterId?: string
): Promise<SceneRecord[]> {
  const { dir, header } = await findProjectDir(root, projectId);
  const out: SceneRecord[] = [];
  for (const [id, meta] of Object.entries(header.entities.documents ?? {})) {
    if (meta.deletedAt !== null) continue;
    let parsed: { fields: Record<string, unknown>; body: string };
    try {
      parsed = parseMarkdown(await fs.readFile(path.join(dir, "documents", `${safeName(id)}.md`), "utf8"));
    } catch {
      // Skip unreadable/malformed files like list_projects does; read_scene
      // reports the error for that id.
      continue;
    }
    const { fields, body } = parsed;
    if (typeof fields.chapterId === "string" && chapterId && fields.chapterId !== chapterId) continue;
    if (fields.trashed === true) continue;
    out.push({
      id,
      title: typeof fields.title === "string" ? fields.title : "",
      ...(typeof fields.chapterId === "string" ? { chapterId: fields.chapterId } : {}),
      markdown: body,
      meta
    });
  }
  const order = header.order.documents ?? [];
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export async function readScene(
  root: string,
  projectId: string,
  sceneId: string,
  options: { includeTrashed?: boolean } = {}
): Promise<SceneRecord> {
  const { dir, header } = await findProjectDir(root, projectId);
  const meta = header.entities.documents?.[sceneId];
  if (!meta || meta.deletedAt !== null) throw new Error(`Scene not found: ${sceneId}`);
  const file = path.join(dir, "documents", `${safeName(sceneId)}.md`);
  let parsed: { fields: Record<string, unknown>; body: string };
  try {
    parsed = parseMarkdown(await fs.readFile(file, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Scene ${sceneId} could not be read: ${reason} (${file})`);
  }
  const { fields, body } = parsed;
  if (fields.trashed === true && !options.includeTrashed) {
    throw new Error(`Scene is in the trash: ${sceneId} (pass includeTrashed to read it)`);
  }
  return {
    id: sceneId,
    title: typeof fields.title === "string" ? fields.title : "",
    ...(typeof fields.chapterId === "string" ? { chapterId: fields.chapterId } : {}),
    markdown: body,
    meta
  };
}

function bumpMeta(meta: EntityMeta, now: number): EntityMeta {
  return { ...meta, updatedAt: Math.max(now, meta.updatedAt + 1), revision: meta.revision + 1, updatedBy: "mcp" };
}

async function writeProjectHeader(dir: string, header: ProjectHeader): Promise<void> {
  const { hash: _ignored, ...payload } = header as unknown as Record<string, unknown>;
  void _ignored;
  const content = `${JSON.stringify({ ...payload, hash: hashJson(payload) }, null, 2)}\n`;
  await writeFileAtomic(path.join(dir, "project.json"), content);
}

export async function writeScene(root: string, projectId: string, input: WriteSceneInput): Promise<SceneRecord> {
  return withWriteLock(root, () => writeSceneLocked(root, projectId, input));
}

async function writeSceneLocked(root: string, projectId: string, input: WriteSceneInput): Promise<SceneRecord> {
  const { dir, header } = await findProjectDir(root, projectId);
  const now = Date.now();
  const id = input.sceneId ?? randomUUID();
  const existing = header.entities.documents?.[id];
  if (input.sceneId && !existing && input.create !== true) {
    throw new Error(`Scene not found: ${input.sceneId}. Pass create: true to create a new scene with that id.`);
  }
  assertExpectedRevision(`Scene ${id}`, input.expectedRevision, existing?.revision);
  const prevFields: Record<string, unknown> = existing
    ? parseMarkdown(await fs.readFile(path.join(dir, "documents", `${safeName(id)}.md`), "utf8")).fields
    : {};
  const chapterId = input.chapterId ?? (typeof prevFields.chapterId === "string" ? prevFields.chapterId : undefined);
  if (chapterId) {
    const chapters = header.entities.chapters ?? {};
    if (!chapters[chapterId] || chapters[chapterId].deletedAt !== null) {
      throw new Error(`Chapter not found: ${chapterId}`);
    }
  }
  const meta = bumpMeta(
    existing ?? { updatedAt: 0, revision: 0, updatedBy: "mcp", deletedAt: null },
    now
  );
  // Start from the stored frontmatter so fields this tool does not own (space,
  // folderId, labelId, trashed, character/place profiles and future keys)
  // survive the round trip; only the fields below are overwritten.
  const fields: Record<string, unknown> = { ...prevFields };
  delete fields.hash;
  fields.id = id;
  fields.title = input.title ?? (typeof prevFields.title === "string" ? prevFields.title : "");
  if (chapterId) fields.chapterId = chapterId;
  fields.updatedAt = meta.updatedAt;
  fields.revision = meta.revision;
  fields.updatedBy = meta.updatedBy;
  fields.deletedAt = null;
  await fs.mkdir(path.join(dir, "documents"), { recursive: true });
  await writeFileAtomic(path.join(dir, "documents", `${safeName(id)}.md`), serializeMarkdown(fields, input.markdown));

  header.entities.documents = { ...(header.entities.documents ?? {}), [id]: meta };
  const order = header.order.documents ?? [];
  if (!order.includes(id)) order.push(id);
  header.order.documents = order;
  header.updatedAt = Math.max(now, header.updatedAt + 1);
  header.revision += 1;
  header.updatedBy = "mcp";
  await writeProjectHeader(dir, header);
  return { id, title: String(fields.title ?? ""), ...(chapterId ? { chapterId } : {}), markdown: normalizeBody(input.markdown), meta };
}

export async function trashScene(
  root: string,
  projectId: string,
  sceneId: string,
  options: { expectedRevision?: number } = {}
): Promise<TrashResult> {
  return withWriteLock(root, () => trashSceneLocked(root, projectId, sceneId, options));
}

async function trashSceneLocked(
  root: string,
  projectId: string,
  sceneId: string,
  options: { expectedRevision?: number }
): Promise<TrashResult> {
  const { dir, header } = await findProjectDir(root, projectId);
  const meta = header.entities.documents?.[sceneId];
  if (!meta || meta.deletedAt !== null) throw new Error(`Scene not found: ${sceneId}`);
  assertExpectedRevision(`Scene ${sceneId}`, options.expectedRevision, meta.revision);
  const now = Date.now();
  const nextMeta = { ...meta, deletedAt: now, updatedAt: now, revision: meta.revision + 1, updatedBy: "mcp" };
  header.entities.documents[sceneId] = nextMeta;
  header.updatedAt = Math.max(now, header.updatedAt + 1);
  header.revision += 1;
  header.updatedBy = "mcp";
  // Tombstone the header before removing the file: the app's reader skips a
  // tombstoned id but throws for a live id whose file is missing, so this order
  // never leaves a live id without a file. The app's own writer prunes the same
  // way, and a leftover file of a tombstoned id is ignored by its reader.
  await writeProjectHeader(dir, header);
  await fs.rm(path.join(dir, "documents", `${safeName(sceneId)}.md`), { force: true });
  return { id: sceneId, revision: nextMeta.revision };
}

export async function createChapter(root: string, projectId: string, title: string, summary?: string): Promise<ChapterRecord> {
  return withWriteLock(root, () => createChapterLocked(root, projectId, title, summary));
}

async function createChapterLocked(root: string, projectId: string, title: string, summary?: string): Promise<ChapterRecord> {
  const { dir, header } = await findProjectDir(root, projectId);
  const now = Date.now();
  const id = randomUUID();
  const meta: EntityMeta = { updatedAt: now, revision: 1, updatedBy: "mcp", deletedAt: null };
  const record = { id, title, expanded: true, ...(summary ? { summary } : {}) };
  const content = `${JSON.stringify({ record, meta, hash: hashJson({ record, meta }) }, null, 2)}\n`;
  await fs.mkdir(path.join(dir, "chapters"), { recursive: true });
  await writeFileAtomic(path.join(dir, "chapters", `${safeName(id)}.json`), content);
  header.entities.chapters = { ...(header.entities.chapters ?? {}), [id]: meta };
  header.order.chapters = [...(header.order.chapters ?? []), id];
  header.updatedAt = Math.max(now, header.updatedAt + 1);
  header.revision += 1;
  header.updatedBy = "mcp";
  await writeProjectHeader(dir, header);
  return { ...record, meta };
}

export async function updateChapter(
  root: string,
  projectId: string,
  chapterId: string,
  patch: { title?: string; summary?: string; expectedRevision?: number }
): Promise<ChapterRecord> {
  return withWriteLock(root, () => updateChapterLocked(root, projectId, chapterId, patch));
}

async function updateChapterLocked(
  root: string,
  projectId: string,
  chapterId: string,
  patch: { title?: string; summary?: string; expectedRevision?: number }
): Promise<ChapterRecord> {
  const { dir, header } = await findProjectDir(root, projectId);
  const meta = header.entities.chapters?.[chapterId];
  if (!meta || meta.deletedAt !== null) throw new Error(`Chapter not found: ${chapterId}`);
  assertExpectedRevision(`Chapter ${chapterId}`, patch.expectedRevision, meta.revision);
  const raw = JSON.parse(await fs.readFile(path.join(dir, "chapters", `${safeName(chapterId)}.json`), "utf8"));
  const record = raw?.record ?? { id: chapterId, title: "", expanded: true };
  if (patch.title !== undefined) record.title = patch.title;
  if (patch.summary !== undefined) record.summary = patch.summary;
  const now = Date.now();
  const nextMeta = bumpMeta(meta, now);
  const content = `${JSON.stringify({ record, meta: nextMeta, hash: hashJson({ record, meta: nextMeta }) }, null, 2)}\n`;
  await writeFileAtomic(path.join(dir, "chapters", `${safeName(chapterId)}.json`), content);
  header.entities.chapters[chapterId] = nextMeta;
  header.updatedAt = Math.max(now, header.updatedAt + 1);
  header.revision += 1;
  header.updatedBy = "mcp";
  await writeProjectHeader(dir, header);
  return { id: chapterId, title: record.title, expanded: record.expanded === true, ...(typeof record.summary === "string" ? { summary: record.summary } : {}), meta: nextMeta };
}
