import {
  ENTITY_KINDS,
  SCHEMA_VERSION,
  type EntityMeta,
  type EntityMetaMap,
  type ProjectData,
  type StoredEntityKind,
  type StoredProject
} from "./types";

/** Deterministic serialization used for change detection. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

export function entitiesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function isEntityMeta(value: unknown): value is EntityMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Partial<EntityMeta>;
  return typeof meta.updatedAt === "number" && Number.isFinite(meta.updatedAt)
    && typeof meta.revision === "number" && Number.isFinite(meta.revision)
    && typeof meta.updatedBy === "string"
    && (meta.deletedAt === null || typeof meta.deletedAt === "number");
}

export function isEntityMetaMap(value: unknown): value is EntityMetaMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(isEntityMeta);
}

export function isStoredProject(value: unknown): value is StoredProject {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Partial<StoredProject>;
  if (
    typeof project.schemaVersion !== "number"
    || typeof project.id !== "string"
    || typeof project.createdAt !== "number"
    || typeof project.updatedAt !== "number"
    || typeof project.revision !== "number"
    || typeof project.updatedBy !== "string"
    || !(project.deletedAt === null || typeof project.deletedAt === "number")
    || !isLegacyProjectData(project.project)
    || typeof project.entities !== "object"
    || project.entities === null
  ) {
    return false;
  }
  return ENTITY_KINDS.every((kind) => isEntityMetaMap(project.entities![kind]));
}

/** The unversioned `ProjectData` shape written by earlier releases. */
export function isLegacyProjectData(value: unknown): value is ProjectData {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Partial<ProjectData>;
  return typeof project.id === "string"
    && typeof project.name === "string"
    && typeof project.author === "string"
    && Array.isArray(project.documents)
    && Array.isArray(project.chapters)
    && typeof project.activeDocumentId === "string"
    && typeof project.projectGoal === "number"
    && typeof project.chapterGoals === "object"
    && project.chapterGoals !== null
    && typeof project.activity === "object"
    && project.activity !== null;
}

export function emptyEntityMaps(): Record<StoredEntityKind, EntityMetaMap> {
  return {
    documents: {},
    chapters: {},
    storyboardRows: {},
    storyboardCards: {}
  };
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

/**
 * Stable key for the fields that participate in cross-device sync. Device-local
 * state such as `activeDocumentId` is deliberately excluded so opening a scene
 * does not create sync churn or a false content conflict.
 */
export function projectContentKey(project: ProjectData): string {
  return stableStringify({
    id: project.id,
    name: project.name,
    author: project.author,
    documents: project.documents,
    chapters: project.chapters,
    projectGoal: project.projectGoal,
    chapterGoals: project.chapterGoals,
    activity: project.activity,
    storyboardCards: project.storyboardCards ?? [],
    storyboardRows: project.storyboardRows ?? [],
    timelineNodes: project.timelineNodes ?? [],
    noteFolders: project.noteFolders ?? [],
    researchFolderName: project.researchFolderName ?? "",
    researchFolders: project.researchFolders ?? [],
    researchItems: project.researchItems ?? [],
    publishOptions: project.publishOptions ?? null
  });
}

/** True when two projects have the same sync-visible content. */
export function projectsHaveSameContent(a: ProjectData, b: ProjectData): boolean {
  return projectContentKey(a) === projectContentKey(b);
}

function createEntityMaps(
  project: ProjectData,
  deviceId: string,
  now: number
): Record<StoredEntityKind, EntityMetaMap> {
  const maps = emptyEntityMaps();
  for (const kind of ENTITY_KINDS) {
    for (const entity of entityList(kind, project)) {
      maps[kind][entity.id] = { updatedAt: now, revision: 1, updatedBy: deviceId, deletedAt: null };
    }
  }
  return maps;
}

function stampEntities(
  previous: StoredProject | undefined,
  project: ProjectData,
  deviceId: string,
  now: number
): Record<StoredEntityKind, EntityMetaMap> {
  const result = emptyEntityMaps();
  for (const kind of ENTITY_KINDS) {
    const previousMap = previous?.entities[kind] ?? {};
    const previousById = new Map(
      (previous ? entityList(kind, previous.project) : []).map((entity) => [entity.id, entity])
    );
    const seen = new Set<string>();
    for (const entity of entityList(kind, project)) {
      seen.add(entity.id);
      const prevMeta = previousMap[entity.id];
      const prevEntity = previousById.get(entity.id);
      if (prevMeta && prevEntity && entitiesEqual(prevEntity, entity)) {
        result[kind][entity.id] = {
          updatedAt: prevMeta.updatedAt,
          revision: prevMeta.revision,
          updatedBy: prevMeta.updatedBy,
          deletedAt: null
        };
      } else {
        result[kind][entity.id] = {
          updatedAt: now,
          revision: (prevMeta?.revision ?? 0) + 1,
          updatedBy: deviceId,
          deletedAt: null
        };
      }
    }
    // Records that disappeared locally become tombstones so deletes can sync.
    // An existing tombstone is kept as-is: re-stamping it on every save would
    // churn sync metadata forever without carrying new information.
    for (const [id, prevMeta] of Object.entries(previousMap)) {
      if (seen.has(id)) continue;
      result[kind][id] = prevMeta.deletedAt !== null
        ? prevMeta
        : {
          updatedAt: now,
          revision: prevMeta.revision + 1,
          updatedBy: deviceId,
          deletedAt: now
        };
    }
  }
  return result;
}

export function createStoredProject(
  project: ProjectData,
  deviceId: string,
  now: number
): StoredProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: project.id,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    updatedBy: deviceId,
    deletedAt: null,
    project,
    entities: createEntityMaps(project, deviceId, now)
  };
}

/**
 * Re-stamps a project against its previous stored version. Unchanged records
 * keep their prior `updatedAt`/`revision`; changed or new records are bumped;
 * removed records become tombstones.
 */
export function stampProject(
  previous: StoredProject | undefined,
  project: ProjectData,
  deviceId: string,
  now: number
): StoredProject {
  const changed = !previous || !projectsHaveSameContent(previous.project, project);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: project.id,
    createdAt: previous?.createdAt ?? now,
    updatedAt: changed ? now : (previous?.updatedAt ?? now),
    revision: changed ? (previous?.revision ?? 0) + 1 : (previous?.revision ?? 1),
    updatedBy: changed ? deviceId : (previous?.updatedBy ?? deviceId),
    deletedAt: previous?.deletedAt ?? null,
    project,
    entities: stampEntities(previous, project, deviceId, now)
  };
}

export function migrateProjects(
  projects: ProjectData[],
  deviceId: string,
  now: number
): StoredProject[] {
  return projects.map((project) => createStoredProject(project, deviceId, now));
}
