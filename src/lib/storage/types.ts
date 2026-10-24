import type { ChapterData, DocumentData, PublishOptions, SpaceName } from "../publish/types";

export type ActivityRecord = { edits: number; wordsAdded: number };
export type StoryboardKind = "chapter" | "scene" | "blank" | SpaceName;
export type StoryboardRow = { id: string; title: string };
export type StoryboardCard = {
  id: string;
  sourceId: string;
  rowId: string;
  kind: StoryboardKind;
  title: string;
  note: string;
};

/**
 * The in-memory shape the editor works with. This is also the shape legacy
 * installs persisted, so it doubles as the migration source.
 */
export type ProjectData = {
  id: string;
  name: string;
  author: string;
  documents: DocumentData[];
  chapters: ChapterData[];
  activeDocumentId: string;
  projectGoal: number;
  chapterGoals: Record<string, number>;
  activity: Record<string, ActivityRecord>;
  storyboardCards?: StoryboardCard[];
  storyboardRows?: StoryboardRow[];
  publishOptions?: PublishOptions;
};

/** Bumped whenever the persisted envelope changes shape. */
export const SCHEMA_VERSION = 2;

/**
 * Sync metadata attached to every record. `revision` increments on each local
 * change, `updatedBy` records the originating device, and `deletedAt` turns a
 * missing record into a tombstone instead of a silent disappearance.
 */
export type EntityMeta = {
  updatedAt: number;
  revision: number;
  updatedBy: string;
  deletedAt: number | null;
};

export type EntityMetaMap = Record<string, EntityMeta>;

export const ENTITY_KINDS = [
  "documents",
  "chapters",
  "storyboardRows",
  "storyboardCards"
] as const;

export type StoredEntityKind = (typeof ENTITY_KINDS)[number];

export type StoredProject = {
  schemaVersion: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  updatedBy: string;
  deletedAt: number | null;
  project: ProjectData;
  entities: Record<StoredEntityKind, EntityMetaMap>;
};

export type StoredVault = {
  schemaVersion: number;
  deviceId: string;
  activeProjectId: string;
  updatedAt: number;
  projects: StoredProject[];
};
