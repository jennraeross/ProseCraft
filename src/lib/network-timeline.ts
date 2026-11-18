import type { ChapterData } from "./publish/types";
import { relationActiveAt, type SourcedRelation } from "./relations";

/**
 * Chapter indexes where the set of active relations changes. The network
 * chapter slider uses them as markers, so the author can see where a relation
 * starts or ends without opening the detail panel.
 */
export function relationBoundaryIndexes(
  relations: readonly SourcedRelation[],
  chapters: readonly ChapterData[]
): number[] {
  if (relations.length === 0) return [];
  const boundaries: number[] = [];
  let previous = "";
  chapters.forEach((chapter, index) => {
    const signature = relations
      .filter(({ relation }) => relationActiveAt(relation, chapter.id, chapters))
      .map(({ relation }) => relation.id)
      .sort()
      .join("\u0000");
    if (signature !== previous) boundaries.push(index);
    previous = signature;
  });
  return boundaries;
}
