import type {
  ChapterData,
  DocumentData,
  NoteFolder,
  PublishOptions,
  ResearchFolder,
  ResearchItem,
  SpaceName,
  LabelDef
} from "../publish/types";

export type ActivityRecord = { edits: number; wordsAdded: number };

/**
 * A note attached to a passage of a document. The passage is found again by its
 * quoted words plus a little text before and after, so nothing is written into
 * the document HTML.
 */
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
/** A saved copy of one document's text. `before-restore` ones are made automatically so a restore can be undone. */
export type DocumentSnapshot = {
  id: string;
  documentId: string;
  createdAt: number;
  title: string;
  content: string;
  note?: string;
  reason: "manual" | "before-restore";
};
export type StoryboardKind = "chapter" | "scene" | "blank" | SpaceName;
export type StoryboardRow = { id: string; title: string };
export type StoryboardCard = {
  id: string;
  sourceId: string;
  rowId: string;
  x: number;
  y: number;
  kind: StoryboardKind;
  title: string;
  note: string;
};
export type StoryboardDrawing =
  | {
      id: string;
      type: "line";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
  | {
      id: string;
      type: "arrow";
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
  | {
      id: string;
      type: "box";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: number;
    };
export type TimelineNode = {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
};

/**
 * The in-memory shape the editor works with. This is also the shape legacy
 * installs persisted, so it doubles as the migration source.
 */
export type ProjectData = {
  id: string;
  name: string;
  trashed?: boolean;
  author: string;
  documents: DocumentData[];
  chapters: ChapterData[];
  activeDocumentId: string;
  projectGoal: number;
  chapterGoals: Record<string, number>;
  activity: Record<string, ActivityRecord>;
  storyboardCards?: StoryboardCard[];
  storyboardRows?: StoryboardRow[];
  storyboardDrawings?: StoryboardDrawing[];
  timelineNodes?: TimelineNode[];
  /** Legacy Notes folders; migrated into `researchFolders` by the Wiki migration. */
  noteFolders?: NoteFolder[];
  /** Folder name used for imported Wiki files on this device. */
  researchFolderName?: string;
  /** Folders backing the Wiki. The `research*` names are kept for storage compatibility. */
  researchFolders?: ResearchFolder[];
  researchItems?: ResearchItem[];
  publishOptions?: PublishOptions;
  /** Notes on passages of text, for example from a co-author, a proofreader or an agent. */
  comments?: TextComment[];
  /** Saved earlier versions of document text, newest per document capped by `MAX_SNAPSHOTS_PER_DOCUMENT`. */
  snapshots?: DocumentSnapshot[];
  /** User-definable labels for scenes and chapters. */
  labels?: LabelDef[];
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
