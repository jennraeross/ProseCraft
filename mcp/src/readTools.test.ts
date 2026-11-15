import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStoredProject } from "$lib/storage/schema";
import { OPEN_MARKER_FILE } from "$lib/storage/sync/files";
import { MemoryFileSystem } from "$lib/storage/sync/memory-fs";
import { openMarkerText, writeOpenProject } from "$lib/storage/sync/open-layout";
import type { ProjectData, StoredProject } from "$lib/storage/types";
import { readScene } from "./openStore";
import {
  listComments,
  listLabels,
  listSnapshots,
  listWikiFolders,
  listWikiPages,
  readSnapshot,
  readWikiPage
} from "./readTools";

const NOW = 1_700_000_000_000;
const tempRoots: string[] = [];

function projectFixture(): ProjectData {
  return {
    id: "project-1",
    name: "Wiki Novel",
    author: "Ada Writer",
    activeDocumentId: "doc-1",
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    labels: [
      { id: "label-1", name: "Plot", color: "red" },
      { id: "label-2", name: "Character", color: "blue" },
      { id: "label-3", name: "Unused", color: "grey" }
    ],
    researchFolders: [
      { id: "folder-1", title: "Characters", parentId: null },
      { id: "folder-2", title: "Places", parentId: null },
      { id: "folder-3", title: "Harbor", parentId: "folder-2" }
    ],
    documents: [
      {
        id: "doc-1",
        title: "Opening Scene",
        content: "<p>It was dark.</p>",
        chapterId: "chapter-1",
        labelId: "label-1"
      },
      {
        id: "doc-2",
        title: "Mara",
        content: "<p>Notes about Mara.</p>",
        space: "Wiki",
        folderId: "folder-1",
        labelId: "label-2",
        character: {
          role: "Protagonist",
          age: "32",
          gender: "",
          pronouns: "she/her",
          ethnicity: "",
          occupation: "Cartographer",
          appearance: "",
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
        id: "doc-3",
        title: "Harbor",
        content: "<p>A grey harbor.</p>",
        space: "Wiki",
        folderId: "folder-3",
        labelId: "label-1",
        place: {
          type: "City",
          region: "North",
          climate: "",
          population: "",
          government: "",
          economy: "",
          appearance: "",
          atmosphere: "",
          landmarks: "",
          history: "",
          culture: "",
          inhabitants: "",
          significance: "",
          dangers: ""
        }
      },
      {
        id: "doc-4",
        title: "Cut Scene",
        content: "<p>Cut.</p>",
        chapterId: "chapter-1",
        labelId: "label-1",
        trashed: true,
        trashedWithChapterId: "chapter-1"
      },
      {
        id: "doc-5",
        title: "Loose Page",
        content: "<p>Loose notes.</p>",
        space: "Wiki"
      }
    ],
    chapters: [
      { id: "chapter-1", title: "Chapter One", expanded: true, labelId: "label-2" },
      { id: "chapter-2", title: "Chapter Two", expanded: false, labelId: "label-1" }
    ],
    comments: [
      {
        id: "comment-1",
        documentId: "doc-1",
        quote: "dark",
        prefix: "It was ",
        suffix: ".",
        body: "Too vague?",
        author: "Patty",
        createdAt: NOW,
        resolved: false
      },
      {
        id: "comment-2",
        documentId: "doc-1",
        quote: "It",
        prefix: "",
        suffix: " was",
        body: "Weak opening.",
        author: "Patty",
        createdAt: NOW + 1_000,
        resolved: true
      },
      {
        id: "comment-3",
        documentId: "doc-2",
        quote: "Mara",
        prefix: "",
        suffix: " notes",
        body: "Add her age.",
        author: "Henry",
        createdAt: NOW + 2_000,
        resolved: false
      }
    ],
    snapshots: [
      {
        id: "snap-1",
        documentId: "doc-1",
        createdAt: NOW,
        title: "Opening Scene",
        content: "<p>It was dark.</p>",
        note: "first",
        reason: "manual"
      },
      {
        id: "snap-2",
        documentId: "doc-1",
        createdAt: NOW + 5_000,
        title: "Opening Scene",
        content: "<p>It was darker.</p>",
        reason: "before-restore"
      },
      {
        id: "snap-3",
        documentId: "doc-2",
        createdAt: NOW + 3_000,
        title: "Mara",
        content: "<p>Old Mara.</p>",
        reason: "manual"
      }
    ]
  };
}

function storedFixture(): StoredProject {
  return createStoredProject(projectFixture(), "device-a", NOW);
}

/** Writes the fixture through the app's writer, then materializes it on disk. */
async function makeRoot(project: StoredProject): Promise<string> {
  const memory = new MemoryFileSystem();
  await writeOpenProject(memory, project);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "prosecraft-mcp-read-"));
  tempRoots.push(folder);
  for (const file of memory.paths()) {
    const target = path.join(folder, ...file.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await memory.readText(file), "utf8");
  }
  await fs.writeFile(path.join(folder, OPEN_MARKER_FILE), openMarkerText(NOW), "utf8");
  return folder;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

describe("listWikiPages", () => {
  it("lists only Wiki pages with folder path and kind, without bodies", async () => {
    const folder = await makeRoot(storedFixture());

    const pages = await listWikiPages(folder, "project-1");

    expect(pages.map((page) => page.id)).toEqual(["doc-2", "doc-3", "doc-5"]);
    expect(pages[0]).toMatchObject({
      title: "Mara",
      folderId: "folder-1",
      folderPath: ["Characters"],
      kind: "character"
    });
    expect(pages[1]).toMatchObject({
      title: "Harbor",
      folderId: "folder-3",
      folderPath: ["Places", "Harbor"],
      kind: "place"
    });
    expect(pages[2]).toMatchObject({ folderId: null, folderPath: [], kind: "page" });
    expect(pages.every((page) => !("markdown" in page))).toBe(true);
  });

  it("filters by folder id", async () => {
    const folder = await makeRoot(storedFixture());

    const pages = await listWikiPages(folder, "project-1", "folder-3");

    expect(pages.map((page) => page.id)).toEqual(["doc-3"]);
  });
});

describe("readWikiPage", () => {
  it("returns the body and every frontmatter field", async () => {
    const folder = await makeRoot(storedFixture());

    const page = await readWikiPage(folder, "project-1", "doc-2");

    expect(page.markdown).toContain("Notes about Mara.");
    expect(page.fields).toMatchObject({ space: "Wiki", folderId: "folder-1", labelId: "label-2" });
    expect(page.fields.character).toMatchObject({ role: "Protagonist" });
    expect(page.folderPath).toEqual(["Characters"]);
    expect(page.kind).toBe("character");
  });

  it("rejects a document that is not a Wiki page", async () => {
    const folder = await makeRoot(storedFixture());

    await expect(readWikiPage(folder, "project-1", "doc-1")).rejects.toThrow("not a Wiki page");
  });
});

describe("listWikiFolders", () => {
  it("returns the folders as a tree", async () => {
    const folder = await makeRoot(storedFixture());

    const tree = await listWikiFolders(folder, "project-1");

    expect(tree.map((node) => [node.title, node.children.map((child) => child.title)])).toEqual([
      ["Characters", []],
      ["Places", ["Harbor"]]
    ]);
  });
});

describe("listLabels", () => {
  it("counts live documents and chapters per label", async () => {
    const folder = await makeRoot(storedFixture());

    const labels = await listLabels(folder, "project-1");

    expect(labels).toEqual([
      { id: "label-1", name: "Plot", color: "red", scenes: 2, chapters: 1 },
      { id: "label-2", name: "Character", color: "blue", scenes: 1, chapters: 1 },
      { id: "label-3", name: "Unused", color: "grey", scenes: 0, chapters: 0 }
    ]);
  });
});

describe("listComments", () => {
  it("hides resolved comments and filters by document", async () => {
    const folder = await makeRoot(storedFixture());

    const open = await listComments(folder, "project-1");
    const all = await listComments(folder, "project-1", { includeResolved: true });
    const forPage = await listComments(folder, "project-1", { documentId: "doc-2" });

    expect(open.map((comment) => comment.id)).toEqual(["comment-1", "comment-3"]);
    expect(all.map((comment) => comment.id)).toEqual(["comment-1", "comment-2", "comment-3"]);
    expect(forPage.map((comment) => comment.id)).toEqual(["comment-3"]);
    expect(all[0]).not.toHaveProperty("prefix");
  });
});

describe("listSnapshots", () => {
  it("lists metadata newest first, without the stored text", async () => {
    const folder = await makeRoot(storedFixture());

    const snapshots = await listSnapshots(folder, "project-1");
    const forScene = await listSnapshots(folder, "project-1", "doc-1");

    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(["snap-2", "snap-3", "snap-1"]);
    expect(snapshots[0]).toMatchObject({ documentId: "doc-1", reason: "before-restore" });
    expect(snapshots[0]).not.toHaveProperty("content");
    expect(snapshots[2].note).toBe("first");
    expect(forScene.map((snapshot) => snapshot.id)).toEqual(["snap-2", "snap-1"]);
  });
});

describe("readSnapshot", () => {
  it("returns the stored text", async () => {
    const folder = await makeRoot(storedFixture());

    const snapshot = await readSnapshot(folder, "project-1", "snap-1");

    expect(snapshot.title).toBe("Opening Scene");
    expect(snapshot.content).toContain("It was dark.");
    expect(snapshot.note).toBe("first");
  });

  it("fails for an unknown snapshot id", async () => {
    const folder = await makeRoot(storedFixture());

    await expect(readSnapshot(folder, "project-1", "missing")).rejects.toThrow("Snapshot not found");
  });
});

describe("readScene", () => {
  it("passes through frontmatter fields the server does not interpret", async () => {
    const folder = await makeRoot(storedFixture());
    const file = path.join(folder, "projects", "project-1", "documents", "doc-2.md");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace("\n---\n", '\nmeta: {"pov":"Mara"}\n---\n'), "utf8");

    const scene = await readScene(folder, "project-1", "doc-2");

    expect(scene.fields).toMatchObject({ space: "Wiki", labelId: "label-2", meta: { pov: "Mara" } });
    expect(scene.markdown).toContain("Notes about Mara.");
  });
});
