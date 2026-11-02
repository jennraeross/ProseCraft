import { describe, expect, it } from "vitest";
import type { DocumentData } from "$lib/publish/types";
import type { ProjectData, StoryboardKind } from "$lib/storage/types";
import { migrateProjectToWiki } from "./wiki-migration";

const legacySpace = (name: string) => name as unknown as DocumentData["space"];
const legacyKind = (name: string) => name as unknown as StoryboardKind;

function projectFixture(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: "project-1",
    name: "Test Novel",
    author: "Ada Writer",
    activeDocumentId: "char-1",
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    documents: [],
    chapters: [],
    ...overrides
  };
}

describe("migrateProjectToWiki", () => {
  it("folds legacy spaces, profiles, folders, links, and storyboard cards into Wiki", () => {
    const project = projectFixture({
      documents: [
        {
          id: "char-1",
          title: "Mara",
          content: "<p>Free-form notes.</p>",
          space: legacySpace("Characters"),
          character: {
            role: "Protagonist",
            age: "32",
            gender: "",
            pronouns: "she/her",
            ethnicity: "",
            occupation: "Cartographer",
            appearance: "Tall",
            voice: "",
            personality: "",
            background: "",
            motivations: "",
            flaws: "",
            hobbies: "",
            relationships: ""
          }
        },
        {
          id: "note-1",
          title: "Old note",
          content: "<p><br></p>",
          space: legacySpace("Notes"),
          folderId: "folder-1"
        },
        {
          id: "research-1",
          title: "Old research",
          content: "<p>Research text.</p>",
          space: legacySpace("Research"),
          folderId: "folder-1"
        }
      ],
      researchFolders: [{ id: "folder-1", title: "Research folder", parentId: null }],
      noteFolders: [{ id: "folder-1", title: "Notes folder", parentId: null }],
      researchItems: [
        {
          id: "link-1",
          kind: "link",
          folderId: "folder-1",
          title: "Reference",
          url: "https://example.com",
          addedAt: 1
        }
      ],
      storyboardCards: [
        {
          id: "card-1",
          sourceId: "char-1",
          rowId: "row-1",
          x: 10,
          y: 20,
          kind: legacyKind("Characters"),
          title: "Mara",
          note: ""
        }
      ]
    });

    const migrated = migrateProjectToWiki(project);

    expect(migrated.documents).toHaveLength(3);
    const character = migrated.documents.find((document) => document.id === "char-1");
    expect(character?.space).toBe("Wiki");
    expect(character?.content).toContain("Character profile");
    expect(character?.content).toContain("Role:");
    expect(character?.content).toContain("Protagonist");
    expect(character?.content).toContain("Free-form notes.");
    expect(character?.character).toBeUndefined();

    expect(migrated.noteFolders).toBeUndefined();
    expect(migrated.researchFolders?.map((folder) => folder.id)).toEqual([
      "folder-1",
      "folder-1-note-1"
    ]);
    const note = migrated.documents.find((document) => document.id === "note-1");
    expect(note?.folderId).toBe("folder-1-note-1");
    const research = migrated.documents.find((document) => document.id === "research-1");
    expect(research?.folderId).toBe("folder-1");
    expect(migrated.researchItems).toHaveLength(1);
    expect(migrated.storyboardCards?.[0].kind).toBe("Wiki");
  });

  it("returns the same project when there is nothing to migrate", () => {
    const project = projectFixture({
      documents: [{ id: "page-1", title: "Page", content: "<p>Text</p>", space: "Wiki" }]
    });

    expect(migrateProjectToWiki(project)).toBe(project);
    const migrated = migrateProjectToWiki(projectFixture({
      documents: [{ id: "page-1", title: "Page", content: "<p>Text</p>", space: legacySpace("Notes") }]
    }));
    expect(migrateProjectToWiki(migrated)).toBe(migrated);
  });
});
