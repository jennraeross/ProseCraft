import { describe, expect, it } from "vitest";
import { STARTERS, buildStarter, type StarterId } from "./starters";

const STARTER_IDS: StarterId[] = [
  "blank",
  "fantasy",
  "scifi",
  "crime",
  "historical",
  "romance",
  "nonfiction",
  "thriller"
];

function countingIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
}

describe("starters", () => {
  it("lists every starter once", () => {
    expect(STARTERS.map((starter) => starter.id)).toEqual(STARTER_IDS);
    for (const starter of STARTERS) {
      expect(starter.label).not.toBe("");
      expect(starter.description).not.toBe("");
    }
  });

  it("builds folders and pages for every starter", () => {
    for (const id of STARTER_IDS) {
      const { folders, documents } = buildStarter(id, countingIds());
      if (id === "blank") {
        expect(folders).toEqual([]);
        expect(documents).toEqual([]);
        continue;
      }
      expect(folders.length).toBeGreaterThan(0);
      expect(documents.length).toBeGreaterThanOrEqual(folders.length);
      for (const folder of folders) {
        const pages = documents.filter((document) => document.folderId === folder.id);
        expect(pages.length).toBeGreaterThanOrEqual(1);
        expect(pages.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("keeps ids unique and links every page to an existing folder", () => {
    for (const id of STARTER_IDS) {
      const { folders, documents } = buildStarter(id, countingIds());
      const folderIds = folders.map((folder) => folder.id);
      const ids = [...folderIds, ...documents.map((document) => document.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const folder of folders) {
        expect(folder.parentId === null || folderIds.includes(folder.parentId)).toBe(true);
        expect(folder.parentId).not.toBe(folder.id);
      }
      for (const document of documents) {
        expect(document.space).toBe("Wiki");
        expect(document.folderId).toBeDefined();
        expect(folderIds).toContain(document.folderId);
      }
    }
  });

  it("gives every page a title and HTML content", () => {
    for (const id of STARTER_IDS) {
      const { documents } = buildStarter(id, countingIds());
      for (const document of documents) {
        expect(document.title.trim()).not.toBe("");
        expect(document.content.trim()).not.toBe("");
        expect(document.content).toContain("<h2>");
        expect(document.content).toContain("<p>");
      }
    }
  });

  it("leaves the blank starter empty", () => {
    expect(buildStarter("blank", countingIds())).toEqual({ folders: [], documents: [] });
  });

  it("builds the same structure from a fresh id generator", () => {
    for (const id of STARTER_IDS) {
      expect(buildStarter(id, countingIds())).toEqual(buildStarter(id, countingIds()));
    }
  });

  it("uses the shared character and place sections in their templates", () => {
    const { folders, documents } = buildStarter("fantasy", countingIds());
    const characterFolder = folders.find((folder) => folder.title === "Characters");
    const placeFolder = folders.find((folder) => folder.title === "Places");
    const characterPage = documents.find((document) => document.folderId === characterFolder?.id);
    const placePage = documents.find((document) => document.folderId === placeFolder?.id);
    expect(characterPage?.title).toBe("Character template");
    expect(characterPage?.content).toContain("<h2>Basics</h2>");
    expect(characterPage?.content).toContain("<strong>Role:</strong>");
    expect(placePage?.title).toBe("Place template");
    expect(placePage?.content).toContain("<h2>Overview</h2>");
    expect(placePage?.content).toContain("<strong>Type:</strong>");
  });
});
