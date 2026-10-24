import {
  decryptEntity,
  encryptEntity,
  isEntityEnvelope,
  type EntityEnvelope
} from "../crypto";
import { isEntityMetaMap, isLegacyProjectData } from "../schema";
import {
  ENTITY_KINDS,
  SCHEMA_VERSION,
  type EntityMetaMap,
  type ProjectData,
  type StoredEntityKind,
  type StoredProject
} from "../types";
import type { SyncFileSystem } from "./types";

export const VAULT_FILE = "vault.json";
export const PROJECTS_DIR = "projects";

export type EncodedFile = {
  path: string;
  content: string;
};

/** Cleartext-in-envelope, encrypted-in-body project header. */
export type ProjectFilePayload = {
  createdAt: number;
  deletedAt: number | null;
  entities: Record<StoredEntityKind, EntityMetaMap>;
  order: Record<StoredEntityKind, string[]>;
  project: ProjectData;
};

export function projectDirName(id: string): string {
  return `${PROJECTS_DIR}/${safeName(id)}`;
}

export function entityDir(kind: StoredEntityKind): string {
  switch (kind) {
    case "documents":
      return "documents";
    case "chapters":
      return "chapters";
    case "storyboardRows":
      return "storyboard/rows";
    case "storyboardCards":
      return "storyboard/cards";
  }
}

/**
 * Maps an arbitrary record id to one filesystem-safe path segment.
 *
 * The mapping must be injective: two ids sharing a path would silently
 * overwrite each other in the sync folder. Existing safe ids (UUIDs and test
 * fixtures) are kept verbatim so folders created by older builds keep working.
 * Anything else is UTF-8/base64url encoded behind `~`, a character safe ids
 * cannot contain.
 *
 * This also guarantees the result is never `.` or `..`, so a crafted project id
 * cannot escape the sync folder during a later delete or prune.
 */
function safeName(id: string): string {
  if (/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(id)) return id;
  const bytes = new TextEncoder().encode(id);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `~${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

export function entityFileName(id: string): string {
  return `${safeName(id)}.enc`;
}

function entityKindName(kind: StoredEntityKind): string {
  switch (kind) {
    case "documents":
      return "document";
    case "chapters":
      return "chapter";
    case "storyboardRows":
      return "storyboard-row";
    case "storyboardCards":
      return "storyboard-card";
  }
}

function entityList(kind: StoredEntityKind, project: ProjectData): Array<{ id: string }> {
  switch (kind) {
    case "documents":
      return project.documents;
    case "chapters":
      return project.chapters;
    case "storyboardRows":
      return project.storyboardRows ?? [];
    case "storyboardCards":
      return project.storyboardCards ?? [];
  }
}

function envelopeFile(
  vaultKey: Uint8Array,
  meta: Omit<EntityEnvelope, "version" | "nonce" | "body">,
  payload: unknown
): string {
  return JSON.stringify(encryptEntity(vaultKey, meta, payload), null, 2);
}

/**
 * Splits a project into the on-disk layout:
 *
 *   projects/<id>/project.enc                 project fields + entity metadata/order
 *   projects/<id>/chapters/<chapterId>.enc
 *   projects/<id>/documents/<documentId>.enc
 *   projects/<id>/storyboard/rows/<rowId>.enc
 *   projects/<id>/storyboard/cards/<cardId>.enc
 *
 * Tombstoned entities are represented only in `project.enc` metadata, so a
 * delete does not need a separate content file.
 */
export function encodeProjectFiles(project: StoredProject, vaultKey: Uint8Array): EncodedFile[] {
  const dir = projectDirName(project.id);
  const { documents, chapters, storyboardRows, storyboardCards, ...rest } = project.project;
  const payload: ProjectFilePayload = {
    createdAt: project.createdAt,
    deletedAt: project.deletedAt,
    entities: project.entities,
    order: {
      documents: documents.map((entry) => entry.id),
      chapters: chapters.map((entry) => entry.id),
      storyboardRows: (storyboardRows ?? []).map((entry) => entry.id),
      storyboardCards: (storyboardCards ?? []).map((entry) => entry.id)
    },
    project: {
      ...rest,
      documents: [],
      chapters: [],
      storyboardRows: [],
      storyboardCards: []
    }
  };

  const files: EncodedFile[] = [{
    path: `${dir}/project.enc`,
    content: envelopeFile(vaultKey, {
      kind: "project",
      id: project.id,
      projectId: project.id,
      deviceId: project.updatedBy,
      updatedAt: project.updatedAt,
      revision: project.revision
    }, payload)
  }];

  for (const kind of ENTITY_KINDS) {
    for (const entity of entityList(kind, project.project)) {
      const meta = project.entities[kind][entity.id];
      if (!meta || meta.deletedAt !== null) continue;
      files.push({
        path: `${dir}/${entityDir(kind)}/${entityFileName(entity.id)}`,
        content: envelopeFile(vaultKey, {
          kind: entityKindName(kind),
          id: entity.id,
          projectId: project.id,
          deviceId: meta.updatedBy,
          updatedAt: meta.updatedAt,
          revision: meta.revision
        }, entity)
      });
    }
  }

  return files;
}

function isProjectFilePayload(value: unknown): value is ProjectFilePayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<ProjectFilePayload>;
  if (
    typeof payload.createdAt !== "number"
    || !(payload.deletedAt === null || typeof payload.deletedAt === "number")
    || !isLegacyProjectData(payload.project)
    || typeof payload.entities !== "object"
    || payload.entities === null
    || typeof payload.order !== "object"
    || payload.order === null
  ) {
    return false;
  }
  const entities = payload.entities as Record<string, unknown>;
  const order = payload.order as Record<string, unknown>;
  return ENTITY_KINDS.every((kind) =>
    isEntityMetaMap(entities[kind])
    && Array.isArray(order[kind])
    && (order[kind] as unknown[]).every((id) => typeof id === "string")
  );
}

async function readEntities<T>(
  fs: SyncFileSystem,
  dir: string,
  kind: StoredEntityKind,
  payload: ProjectFilePayload,
  vaultKey: Uint8Array,
  projectId: string
): Promise<T[]> {
  const ordered = payload.order[kind] ?? [];
  const known = Object.keys(payload.entities[kind] ?? {});
  const ids = [...new Set([...ordered, ...known])];
  const result: T[] = [];
  for (const id of ids) {
    const meta = payload.entities[kind][id];
    if (!meta || meta.deletedAt !== null) continue;
    const path = `${dir}/${entityDir(kind)}/${entityFileName(id)}`;
    // A live entity referenced by the header but missing on disk means an
    // interrupted upload or external deletion. Treat it as corruption rather
    // than silently dropping the record (and later syncing that loss back).
    if (!(await fs.exists(path))) {
      throw new Error(`The entity file ${path} is missing.`);
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(await fs.readText(path));
    } catch {
      throw new Error(`The entity file ${path} could not be read.`);
    }
    // The header is authenticated, but its routing fields are still checked
    // against the expected location so a valid record copied from another
    // project cannot be injected here without the vault key.
    if (!isEntityEnvelope(envelope)
      || envelope.id !== id
      || envelope.kind !== entityKindName(kind)
      || envelope.projectId !== projectId) {
      throw new Error(`The entity file ${path} is not a valid ProseCraft record for this project.`);
    }
    const entity = decryptEntity(vaultKey, envelope);
    if (typeof entity !== "object" || entity === null) {
      throw new Error(`The entity file ${path} has an unsupported format.`);
    }
    result.push(entity as T);
  }
  return result;
}

/** Reads and decrypts one project directory. Returns null for unknown dirs. */
export async function readProjectFiles(
  fs: SyncFileSystem,
  dirName: string,
  vaultKey: Uint8Array
): Promise<StoredProject | null> {
  const dir = `${PROJECTS_DIR}/${dirName}`;
  const headerPath = `${dir}/project.enc`;
  // A directory without a header is an incomplete upload; skip it. A header
  // that exists but cannot be read is corruption, and must not be mistaken for
  // a deletion (which would propagate to the other device).
  if (!(await fs.exists(headerPath))) return null;
  let envelope: unknown;
  try {
    envelope = JSON.parse(await fs.readText(headerPath));
  } catch {
    throw new Error(`The project file in ${dirName} could not be read.`);
  }
  if (!isEntityEnvelope(envelope) || envelope.kind !== "project") {
    throw new Error(`The project file in ${dirName} is not a valid ProseCraft record.`);
  }
  if (envelope.projectId !== envelope.id) {
    throw new Error(`The project file in ${dirName} has inconsistent routing metadata.`);
  }
  const projectId = envelope.id;
  const payload = decryptEntity(vaultKey, envelope);
  if (!isProjectFilePayload(payload)) {
    throw new Error(`The project in ${dirName} has an unsupported format.`);
  }
  if (payload.project.id !== projectId) {
    throw new Error(`The project in ${dirName} has inconsistent identity metadata.`);
  }

  const [documents, chapters, storyboardRows, storyboardCards] = await Promise.all([
    readEntities<ProjectData["documents"][number]>(fs, dir, "documents", payload, vaultKey, projectId),
    readEntities<ProjectData["chapters"][number]>(fs, dir, "chapters", payload, vaultKey, projectId),
    readEntities<NonNullable<ProjectData["storyboardRows"]>[number]>(fs, dir, "storyboardRows", payload, vaultKey, projectId),
    readEntities<NonNullable<ProjectData["storyboardCards"]>[number]>(fs, dir, "storyboardCards", payload, vaultKey, projectId)
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: envelope.id,
    createdAt: payload.createdAt,
    updatedAt: envelope.updatedAt,
    revision: envelope.revision,
    updatedBy: envelope.deviceId,
    deletedAt: payload.deletedAt,
    project: {
      ...payload.project,
      id: envelope.id,
      documents,
      chapters,
      storyboardRows,
      storyboardCards
    },
    entities: payload.entities
  };
}
