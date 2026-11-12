import type { ChapterData, DocumentData, ResearchFolder } from "./publish/types";
import {
  appearances,
  pageKind,
  relationActiveAt,
  relationsOf,
  reverseView,
  type AppearanceMode,
  type SourcedRelation
} from "./relations";
import type { PageKind } from "./story-meta";

/** A page drawn in the scene graph tile, with how it is known to be in the scene. */
export type GraphTileCharacter = {
  id: string;
  label: string;
  kind: PageKind;
  mode: AppearanceMode;
};

/** A page the tile draws, including relation partners that are not in the scene. */
export type GraphTilePage = {
  id: string;
  title: string;
  kind: PageKind;
};

export type GraphTileModel = {
  /** Scene the tile follows, or `null` for a page tile. */
  sceneId: string | null;
  /** Chapter of the scene, which bounds the active relations. */
  chapterId: string | null;
  /** Characters present in the scene: confirmed first, then detected. */
  characters: GraphTileCharacter[];
  /** Detected characters the author has not confirmed yet. */
  suggestions: GraphTileCharacter[];
  /** Relations that hold at the scene's chapter and touch a present character. */
  relations: SourcedRelation[];
  /** Pages to draw: the present characters, then the other ends of their relations. */
  pages: GraphTilePage[];
};

export type GraphTileInput = {
  documents: readonly DocumentData[];
  chapters: readonly ChapterData[];
  folders: readonly ResearchFolder[];
  sceneId?: string | null;
  /** Page-centred tile (a character sheet opened beside the text); wins over `sceneId`. */
  pageId?: string | null;
};

function baseRelationId(id: string): string {
  return id.startsWith("reverse:") ? id.slice("reverse:".length) : id;
}

export function graphTileModel(input: GraphTileInput): GraphTileModel {
  const { documents, chapters, folders } = input;
  const wikiPages = documents.filter((doc) => doc.space === "Wiki" && !doc.trashed);
  const pageById = new Map(wikiPages.map((doc) => [doc.id, doc]));

  const entryOf = (doc: DocumentData, mode: AppearanceMode): GraphTileCharacter => ({
    id: doc.id,
    label: doc.title,
    kind: pageKind(doc, folders),
    mode
  });

  const relationsFor = (characterIds: ReadonlySet<string>, chapterId: string | null): SourcedRelation[] => {
    const stored = relationsOf(documents);
    const seen = new Set<string>();
    const result: SourcedRelation[] = [];
    for (const entry of [...stored, ...reverseView(stored)]) {
      const base = baseRelationId(entry.relation.id);
      if (seen.has(base)) continue;
      if (!pageById.has(entry.source) || !pageById.has(entry.relation.to)) continue;
      if (!characterIds.has(entry.source) && !characterIds.has(entry.relation.to)) continue;
      if (chapterId && !relationActiveAt(entry.relation, chapterId, chapters)) continue;
      seen.add(base);
      result.push(entry);
    }
    return result;
  };

  const pagesOf = (characters: readonly GraphTileCharacter[], relations: readonly SourcedRelation[]): GraphTilePage[] => {
    const pages: GraphTilePage[] = [];
    const seen = new Set<string>();
    for (const character of characters) {
      pages.push({ id: character.id, title: character.label, kind: character.kind });
      seen.add(character.id);
    }
    for (const entry of relations) {
      for (const id of [entry.source, entry.relation.to]) {
        if (seen.has(id)) continue;
        const doc = pageById.get(id);
        if (!doc) continue;
        seen.add(id);
        pages.push({ id: doc.id, title: doc.title, kind: pageKind(doc, folders) });
      }
    }
    return pages;
  };

  const centredPage = input.pageId ? pageById.get(input.pageId) : undefined;
  if (centredPage) {
    const characters = [entryOf(centredPage, "confirmed")];
    const relations = relationsFor(new Set([centredPage.id]), null).map((entry) =>
      entry.source === centredPage.id
        ? entry
        : {
          source: centredPage.id,
          relation: { ...entry.relation, id: `reverse:${baseRelationId(entry.relation.id)}`, to: entry.source }
        }
    );
    return {
      sceneId: null,
      chapterId: null,
      characters,
      suggestions: [],
      relations,
      pages: pagesOf(characters, relations)
    };
  }

  const empty: GraphTileModel = { sceneId: null, chapterId: null, characters: [], suggestions: [], relations: [], pages: [] };
  const scene = input.sceneId ? documents.find((doc) => doc.id === input.sceneId && !doc.trashed) : undefined;
  if (!scene || scene.space === "Wiki") return empty;

  const chapterId = scene.chapterId ?? null;
  const confirmedIds = scene.meta?.characters ?? [];
  const confirmed: GraphTileCharacter[] = [];
  for (const id of confirmedIds) {
    const doc = pageById.get(id);
    if (doc && pageKind(doc, folders) === "character") confirmed.push(entryOf(doc, "confirmed"));
  }
  const confirmedSet = new Set(confirmed.map((entry) => entry.id));
  const detected: GraphTileCharacter[] = [];
  for (const appearance of appearances(documents, chapters, folders).values()) {
    if (appearance.kind !== "character" || confirmedSet.has(appearance.pageId)) continue;
    const doc = pageById.get(appearance.pageId);
    const inScene = appearance.scenes.some((item) => item.sceneId === scene.id);
    if (doc && inScene) detected.push(entryOf(doc, "auto"));
  }

  const characters = [...confirmed, ...detected];
  const relations = relationsFor(new Set(characters.map((entry) => entry.id)), chapterId);
  return {
    sceneId: scene.id,
    chapterId,
    characters,
    suggestions: detected,
    relations,
    pages: pagesOf(characters, relations)
  };
}
