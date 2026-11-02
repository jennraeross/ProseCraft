import {
  normalizeCharacterSheet,
  normalizePlaceSheet,
  type BinderFolder,
  type DocumentData
} from "$lib/publish/types";
import { CHARACTER_SECTIONS, PLACE_SECTIONS, sheetToHtml } from "$lib/publish/sheets";
import type { ProjectData, StoryboardCard } from "$lib/storage/types";

const LEGACY_SPACE_NAMES = new Set(["Characters", "Places", "Research", "Notes"]);

function normalizeFolders(value: unknown): BinderFolder[] {
  if (!Array.isArray(value)) return [];
  const folders: BinderFolder[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const folder = entry as Partial<BinderFolder>;
    if (typeof folder.id !== "string" || !folder.id || seen.has(folder.id)
      || typeof folder.title !== "string"
      || !(folder.parentId === null || typeof folder.parentId === "string")) continue;
    seen.add(folder.id);
    folders.push({
      id: folder.id,
      title: folder.title.trim().slice(0, 60) || "Untitled folder",
      parentId: folder.parentId
    });
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folder of folders) {
    if (!folder.parentId || !byId.has(folder.parentId) || folder.parentId === folder.id) {
      folder.parentId = null;
      continue;
    }
    const path = new Set<string>();
    let current: BinderFolder | undefined = folder;
    while (current?.parentId) {
      if (path.has(current.id)) {
        folder.parentId = null;
        break;
      }
      path.add(current.id);
      current = byId.get(current.parentId);
    }
  }
  return folders;
}

function hasMeaningfulContent(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 || /<(?:img|table|hr|math|mermaid)\b/i.test(html);
}

function mergeProfileContent(document: DocumentData): string {
  const additions: string[] = [];
  if (document.character) {
    const profile = sheetToHtml(
      CHARACTER_SECTIONS,
      normalizeCharacterSheet(document.character),
      "Character profile"
    );
    if (profile) additions.push(profile);
  }
  if (document.place) {
    const profile = sheetToHtml(
      PLACE_SECTIONS,
      normalizePlaceSheet(document.place),
      "Place profile"
    );
    if (profile) additions.push(profile);
  }
  if (additions.length === 0) return document.content;
  const existing = document.content?.trim() ?? "";
  if (!existing || !hasMeaningfulContent(existing)) return additions.join("\n<hr>\n");
  return [...additions, existing].join("\n<hr>\n");
}

export function migrateLegacyDocument(document: DocumentData): DocumentData {
  return migrateDocument(document, new Map());
}

function migrateDocument(
  document: DocumentData,
  noteFolderIds: Map<string, string>
): DocumentData {
  const originalSpace = document.space as string | undefined;
  const legacySpace = originalSpace !== undefined && originalSpace !== "Wiki";
  const hasProfile = document.character !== undefined || document.place !== undefined;
  if (!legacySpace && !hasProfile) return document;

  const next: DocumentData = {
    ...document,
    space: "Wiki",
    content: mergeProfileContent(document)
  };
  const folderId = document.folderId
    ? (originalSpace === "Notes"
      ? noteFolderIds.get(document.folderId) ?? document.folderId
      : document.folderId)
    : undefined;
  if (folderId) next.folderId = folderId;
  else delete next.folderId;
  delete next.character;
  delete next.place;
  return next;
}

function migrateStoryboardCard(card: StoryboardCard): StoryboardCard {
  const kind = (card as { kind: string }).kind;
  if (!LEGACY_SPACE_NAMES.has(kind)) return card;
  return { ...card, kind: "Wiki" };
}

/**
 * Folds the four former Story Spaces into a single Wiki. Existing Notes folders
 * are merged into the Research/Wiki folder list, character and place profiles
 * become readable page content, and storyboard cards are retargeted at Wiki.
 *
 * The migration is idempotent: once a project has no legacy spaces, note
 * folders, or storyboard kinds, the original object is returned untouched.
 */
export function migrateProjectToWiki(project: ProjectData): ProjectData {
  const researchFolders = normalizeFolders(project.researchFolders);
  const noteFolders = normalizeFolders(project.noteFolders);
  const hasLegacyDocument = project.documents.some((document) =>
    (typeof document.space === "string" && document.space !== "Wiki")
    || document.character !== undefined
    || document.place !== undefined
  );
  const hasLegacyCard = (project.storyboardCards ?? []).some((card) =>
    typeof card === "object" && card !== null
    && typeof (card as { kind?: unknown }).kind === "string"
    && LEGACY_SPACE_NAMES.has((card as { kind: string }).kind)
  );
  if (!hasLegacyDocument && !hasLegacyCard && noteFolders.length === 0) return project;

  const usedIds = new Set(researchFolders.map((folder) => folder.id));
  const noteFolderIds = new Map<string, string>();
  for (const folder of noteFolders) {
    let id = folder.id;
    if (usedIds.has(id)) {
      let suffix = 1;
      while (usedIds.has(`${folder.id}-note-${suffix}`)) suffix += 1;
      id = `${folder.id}-note-${suffix}`;
    }
    usedIds.add(id);
    noteFolderIds.set(folder.id, id);
  }

  const mergedNoteFolders = noteFolders.map((folder) => ({
    id: noteFolderIds.get(folder.id) ?? folder.id,
    title: folder.title,
    parentId: folder.parentId ? noteFolderIds.get(folder.parentId) ?? folder.parentId : null
  }));

  const migrated: ProjectData = {
    ...project,
    documents: project.documents.map((document) => migrateDocument(document, noteFolderIds)),
    researchFolders: [...researchFolders, ...mergedNoteFolders],
    storyboardCards: project.storyboardCards?.map(migrateStoryboardCard)
  };
  delete migrated.noteFolders;
  return migrated;
}
