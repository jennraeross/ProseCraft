import type { ChapterData } from "./types";

export function isAutomaticallyNumberedChapter(chapter: ChapterData): boolean {
  return /^Chapter \d+$/.test(chapter.title);
}

export function chapterLabel(chapter: ChapterData, chapters: ChapterData[]): string {
  if (!isAutomaticallyNumberedChapter(chapter)) return chapter.title;
  const index = chapters.findIndex((item) => item.id === chapter.id);
  const number = chapters
    .slice(0, index + 1)
    .filter(isAutomaticallyNumberedChapter)
    .length;
  return `Chapter ${number}`;
}
