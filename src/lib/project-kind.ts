import type { ProjectData } from "./storage/types";

export type ProjectKind = NonNullable<ProjectData["kind"]>;

/** Returns `"novel"` or `"screenplay"` when valid, otherwise `undefined`. */
export function normalizeProjectKind(value: unknown): ProjectKind | undefined {
  if (value === "novel" || value === "screenplay") return value;
  return undefined;
}

/** Returns the effective kind of a project, defaulting legacy or missing values to `"novel"`. */
export function projectKindOf(project: Pick<ProjectData, "kind"> | null | undefined): ProjectKind {
  return normalizeProjectKind(project?.kind) ?? "novel";
}

/** True when the project is configured as a screenplay project. */
export function isScreenplayProject(project: Pick<ProjectData, "kind"> | null | undefined): boolean {
  return projectKindOf(project) === "screenplay";
}
