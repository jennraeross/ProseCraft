import type { ChapterData, DocumentData } from "./publish/types";
import type { PageAppearances } from "./relations";

/** One chapter column of the appearance strip. */
export type AppearanceBar = {
  chapterId: string;
  /** Scenes of the chapter the page appears in. */
  total: number;
  confirmed: number;
  auto: number;
  /** Scene titles in story order, for the tooltip. */
  sceneTitles: string[];
  /** First scene of the chapter, or `null` when the chapter has none. */
  firstSceneId: string | null;
  /** Whether this chapter holds the first/last appearance of the page. */
  first: boolean;
  last: boolean;
};

function isScene(doc: DocumentData): boolean {
  return doc.space !== "Wiki" && !doc.trashed && Boolean(doc.chapterId);
}

/**
 * Turns the appearances of one page into one bar per chapter, in project
 * order. Scenes are only read for scene titles and the jump target, so a
 * deleted scene drops out of both while the counts stay consistent.
 */
export function chapterBars(
  entry: PageAppearances | undefined,
  chapters: readonly ChapterData[],
  scenes: readonly DocumentData[]
): AppearanceBar[] {
  const sceneById = new Map(scenes.filter(isScene).map((scene) => [scene.id, scene]));
  const perChapter = new Map<string, { confirmed: number; auto: number; sceneTitles: string[] }>();
  for (const appearance of entry?.scenes ?? []) {
    const scene = sceneById.get(appearance.sceneId);
    if (!scene?.chapterId) continue;
    const bar = perChapter.get(scene.chapterId) ?? { confirmed: 0, auto: 0, sceneTitles: [] };
    if (appearance.mode === "confirmed") bar.confirmed += 1;
    else bar.auto += 1;
    bar.sceneTitles.push(scene.title);
    perChapter.set(scene.chapterId, bar);
  }

  const firstScene = new Map<string, string>();
  for (const scene of sceneById.values()) {
    if (scene.chapterId && !firstScene.has(scene.chapterId)) firstScene.set(scene.chapterId, scene.id);
  }

  return chapters.map((chapter) => {
    const counts = perChapter.get(chapter.id);
    const confirmed = counts?.confirmed ?? 0;
    const auto = counts?.auto ?? 0;
    return {
      chapterId: chapter.id,
      total: confirmed + auto,
      confirmed,
      auto,
      sceneTitles: counts?.sceneTitles ?? [],
      firstSceneId: firstScene.get(chapter.id) ?? null,
      first: chapter.id === entry?.firstChapterId,
      last: chapter.id === entry?.lastChapterId
    };
  });
}
