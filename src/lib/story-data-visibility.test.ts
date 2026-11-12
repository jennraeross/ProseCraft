import { describe, expect, it } from "vitest";
import type { DocumentData } from "./publish/types";
import { shouldShowStoryData } from "./story-data-visibility";

function scene(overrides: Partial<DocumentData> = {}): DocumentData {
  return { id: "scene-1", title: "The archive room", content: "", chapterId: "chapter-12", ...overrides };
}

describe("shouldShowStoryData", () => {
  it("shows the panel for a scene", () => {
    expect(shouldShowStoryData(scene())).toBe(true);
  });

  it("hides the panel for a wiki page", () => {
    expect(shouldShowStoryData(scene({ space: "Wiki", chapterId: undefined }))).toBe(false);
  });

  it("hides the panel for a trashed scene", () => {
    expect(shouldShowStoryData(scene({ trashed: true }))).toBe(false);
  });

  it("hides the panel without an active document", () => {
    expect(shouldShowStoryData(undefined)).toBe(false);
    expect(shouldShowStoryData(null)).toBe(false);
  });

  it("hides the panel for a document outside a chapter", () => {
    expect(shouldShowStoryData(scene({ chapterId: undefined }))).toBe(false);
  });
});
