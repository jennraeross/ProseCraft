import { describe, expect, it } from "vitest";
import type { ChapterData, DocumentData } from "./publish/types";
import type { PageAppearances, SceneAppearance } from "./relations";
import { chapterBars } from "./appearance-strip";

const chapters: ChapterData[] = [
  { id: "chapter-1", title: "One", expanded: true },
  { id: "chapter-2", title: "Two", expanded: true },
  { id: "chapter-3", title: "Three", expanded: true }
];

function scene(id: string, chapterId: string, overrides: Partial<DocumentData> = {}): DocumentData {
  return { id, title: id, content: "", chapterId, ...overrides };
}

function pageAppearances(
  scenes: SceneAppearance[],
  firstChapterId: string | null,
  lastChapterId: string | null
): PageAppearances {
  return {
    pageId: "page-1",
    kind: "character",
    scenes,
    sceneCount: scenes.length,
    confirmedCount: scenes.filter((entry) => entry.mode === "confirmed").length,
    autoCount: scenes.filter((entry) => entry.mode === "auto").length,
    firstChapterId,
    lastChapterId,
    firstChapterIndex: chapters.findIndex((chapter) => chapter.id === firstChapterId),
    lastChapterIndex: chapters.findIndex((chapter) => chapter.id === lastChapterId)
  };
}

describe("chapterBars", () => {
  it("returns one bar per chapter in project order", () => {
    const bars = chapterBars(undefined, chapters, []);
    expect(bars.map((bar) => bar.chapterId)).toEqual(["chapter-1", "chapter-2", "chapter-3"]);
  });

  it("counts confirmed and detected appearances per chapter", () => {
    const scenes = [
      scene("scene-1", "chapter-1"),
      scene("scene-2", "chapter-1"),
      scene("scene-3", "chapter-3")
    ];
    const entry = pageAppearances(
      [
        { sceneId: "scene-1", mode: "confirmed" },
        { sceneId: "scene-2", mode: "auto" },
        { sceneId: "scene-3", mode: "auto" }
      ],
      "chapter-1",
      "chapter-3"
    );

    const bars = chapterBars(entry, chapters, scenes);
    expect(bars.map((bar) => bar.total)).toEqual([2, 0, 1]);
    expect(bars.map((bar) => bar.confirmed)).toEqual([1, 0, 0]);
    expect(bars.map((bar) => bar.auto)).toEqual([1, 0, 1]);
  });

  it("collects scene titles in story order", () => {
    const scenes = [scene("scene-1", "chapter-1", { title: "Arrival" })];
    const entry = pageAppearances([{ sceneId: "scene-1", mode: "confirmed" }], "chapter-1", "chapter-1");

    const bars = chapterBars(entry, chapters, scenes);
    expect(bars[0].sceneTitles).toEqual(["Arrival"]);
  });

  it("marks the first and last appearance", () => {
    const scenes = [scene("scene-1", "chapter-1"), scene("scene-2", "chapter-2")];
    const entry = pageAppearances(
      [
        { sceneId: "scene-1", mode: "confirmed" },
        { sceneId: "scene-2", mode: "confirmed" }
      ],
      "chapter-1",
      "chapter-2"
    );

    const bars = chapterBars(entry, chapters, scenes);
    expect(bars.map((bar) => bar.first)).toEqual([true, false, false]);
    expect(bars.map((bar) => bar.last)).toEqual([false, true, false]);
  });

  it("resolves the first scene of every chapter and skips trashed scenes", () => {
    const scenes = [
      scene("scene-1", "chapter-1", { trashed: true }),
      scene("scene-2", "chapter-1"),
      scene("scene-3", "chapter-1"),
      scene("scene-4", "chapter-3")
    ];

    const bars = chapterBars(undefined, chapters, scenes);
    expect(bars.map((bar) => bar.firstSceneId)).toEqual(["scene-2", null, "scene-4"]);
  });

  it("ignores appearances of scenes that are gone", () => {
    const entry = pageAppearances([{ sceneId: "scene-gone", mode: "confirmed" }], "chapter-1", "chapter-1");

    const bars = chapterBars(entry, chapters, []);
    expect(bars.every((bar) => bar.total === 0)).toBe(true);
    expect(bars.map((bar) => bar.firstSceneId)).toEqual([null, null, null]);
  });
});
