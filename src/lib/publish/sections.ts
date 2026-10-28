import { matterPageLabel } from "./matter";
import type { CompiledBook, PublishOptions } from "./types";

export type ManuscriptSectionGroup = "front" | "chapters" | "back";

export type ManuscriptSectionKind =
  | "cover"
  | "title-page"
  | "copyright-page"
  | "dedication"
  | "contents"
  | "front-matter"
  | "chapter"
  | "back-matter";

export type ManuscriptSection = {
  id: string;
  group: ManuscriptSectionGroup;
  kind: ManuscriptSectionKind;
  label: string;
  chapterId?: string;
  matterId?: string;
};

/**
 * Lists the previewable parts of a compiled book in reading order. This is the
 * single source of truth for both the navigator and the section HTML builder.
 */
export function listManuscriptSections(
  book: CompiledBook,
  options: PublishOptions
): ManuscriptSection[] {
  const sections: ManuscriptSection[] = [];

  if (options.cover.mode !== "none" && book.cover) {
    sections.push({
      id: "front-cover",
      group: "front",
      kind: "cover",
      label: "Cover"
    });
  }
  if (options.includeTitlePage) {
    sections.push({
      id: "front-title-page",
      group: "front",
      kind: "title-page",
      label: "Title Page"
    });
  }
  if (options.includeCopyrightPage && book.copyright) {
    sections.push({
      id: "front-copyright",
      group: "front",
      kind: "copyright-page",
      label: "Copyright"
    });
  }
  if (book.dedication) {
    sections.push({
      id: "front-dedication",
      group: "front",
      kind: "dedication",
      label: "Dedication"
    });
  }
  if (options.includeTableOfContents && book.chapters.length > 0) {
    sections.push({
      id: "front-contents",
      group: "front",
      kind: "contents",
      label: "Contents"
    });
  }
  for (const page of book.frontMatter) {
    sections.push({
      id: `front-matter-${page.id}`,
      group: "front",
      kind: "front-matter",
      label: matterPageLabel(page),
      matterId: page.id
    });
  }
  for (const chapter of book.chapters) {
    sections.push({
      id: `chapter-${chapter.id}`,
      group: "chapters",
      kind: "chapter",
      label: chapter.label,
      chapterId: chapter.id
    });
  }
  for (const page of book.backMatter) {
    sections.push({
      id: `back-matter-${page.id}`,
      group: "back",
      kind: "back-matter",
      label: matterPageLabel(page),
      matterId: page.id
    });
  }

  return sections;
}
