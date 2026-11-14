import { describe, expect, it } from "vitest";
import { isScreenplayProject, normalizeProjectKind, projectKindOf } from "./project-kind";
import { projectContentKey, projectsHaveSameContent } from "./storage/schema";
import type { ProjectData } from "./storage/types";

function baseProject(kind?: ProjectData["kind"]): ProjectData {
  return {
    id: "p1",
    name: "Sample",
    ...(kind !== undefined ? { kind } : {}),
    author: "Author",
    documents: [],
    chapters: [],
    activeDocumentId: "",
    projectGoal: 50000,
    chapterGoals: {},
    activity: {}
  };
}

describe("project-kind", () => {
  it("normalizes valid project kinds and rejects unknown values", () => {
    expect(normalizeProjectKind("novel")).toBe("novel");
    expect(normalizeProjectKind("screenplay")).toBe("screenplay");
    expect(normalizeProjectKind(undefined)).toBeUndefined();
    expect(normalizeProjectKind(null)).toBeUndefined();
    expect(normalizeProjectKind("poetry")).toBeUndefined();
    expect(normalizeProjectKind(42)).toBeUndefined();
  });

  it("defaults projectKindOf to novel", () => {
    expect(projectKindOf(undefined)).toBe("novel");
    expect(projectKindOf(null)).toBe("novel");
    expect(projectKindOf({})).toBe("novel");
    expect(projectKindOf({ kind: undefined })).toBe("novel");
    expect(projectKindOf({ kind: "novel" })).toBe("novel");
    expect(projectKindOf({ kind: "screenplay" })).toBe("screenplay");
  });

  it("identifies screenplay projects via isScreenplayProject", () => {
    expect(isScreenplayProject(undefined)).toBe(false);
    expect(isScreenplayProject(null)).toBe(false);
    expect(isScreenplayProject({})).toBe(false);
    expect(isScreenplayProject({ kind: "novel" })).toBe(false);
    expect(isScreenplayProject({ kind: "screenplay" })).toBe(true);
  });

  it("includes project kind in projectContentKey", () => {
    const omitted = baseProject();
    const novel = baseProject("novel");
    const screenplay = baseProject("screenplay");

    expect(projectContentKey(omitted)).toBe(projectContentKey(novel));
    expect(projectsHaveSameContent(omitted, novel)).toBe(true);
    expect(projectContentKey(screenplay)).not.toBe(projectContentKey(novel));
    expect(projectsHaveSameContent(screenplay, novel)).toBe(false);
  });
});
