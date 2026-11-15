import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { searchDocuments as searchInApp } from "$lib/search";
import { createStoredProject } from "$lib/storage/schema";
import { OPEN_MARKER_FILE } from "$lib/storage/sync/files";
import { MemoryFileSystem } from "$lib/storage/sync/memory-fs";
import { normalizeDocument, openMarkerText, writeOpenProject } from "$lib/storage/sync/open-layout";
import type { ProjectData, StoredProject } from "$lib/storage/types";
import { listChapters, listScenes } from "./openStore";
import { searchDocuments } from "./searchTools";

const NOW = 1_700_000_000_000;
const tempRoots: string[] = [];

const LONG_BODY =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut " +
  "labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco " +
  "laboris nisi ut aliquip ex ea commodo consequat.";

function projectFixture(): ProjectData {
  return {
    id: "project-1",
    name: "Search Novel",
    author: "Ada Writer",
    activeDocumentId: "doc-1",
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    labels: [
      { id: "label-1", name: "Plot", color: "red" },
      { id: "label-2", name: "Character", color: "blue" }
    ],
    researchFolders: [{ id: "folder-1", title: "Characters", parentId: null }],
    documents: [
      {
        id: "doc-1",
        title: "Opening Scene",
        content: "<h1>Docks</h1><p>It was dark in the <strong>harbor</strong> and the Käpten waited.</p>",
        markdownSource: "# Docks\n\nIt was dark in the **harbor** and the Käpten waited.",
        chapterId: "chapter-1",
        labelId: "label-1"
      },
      {
        id: "doc-2",
        title: "Käpten's Log",
        content: "<p>The captain logs the tide.</p>",
        chapterId: "chapter-2",
        labelId: "label-2"
      },
      {
        id: "doc-3",
        title: "Mara",
        content: "<p>Mara is a cartographer and a harbor pilot.</p>",
        space: "Wiki",
        folderId: "folder-1",
        labelId: "label-2"
      },
      {
        id: "doc-4",
        title: "Cut Scene",
        content: "<p>Harbor words in the trash.</p>",
        chapterId: "chapter-1",
        labelId: "label-1",
        trashed: true
      },
      {
        id: "doc-5",
        title: "Old Chapter",
        content: "<p>Harbor in a trashed chapter.</p>",
        chapterId: "chapter-3",
        labelId: "label-1"
      },
      {
        id: "doc-6",
        title: "Loose Page",
        content: "<p>Harbor in a loose page and harbors beyond it.</p>",
        space: "Wiki"
      },
      {
        id: "doc-7",
        title: "Hidden Draft",
        content: "<p>Harbor without a chapter or space.</p>"
      },
      {
        id: "doc-8",
        title: "Long Read",
        content: `<p>${LONG_BODY}</p>`,
        chapterId: "chapter-2",
        labelId: "label-1"
      },
      {
        id: "doc-9",
        title: "Harbor Notes",
        content: "<p>The harbor at night.</p>",
        chapterId: "chapter-2",
        labelId: "label-1"
      }
    ],
    chapters: [
      { id: "chapter-1", title: "Chapter One", expanded: true, labelId: "label-2" },
      { id: "chapter-2", title: "Chapter Two", expanded: false, labelId: "label-1" },
      { id: "chapter-3", title: "Old Chapter", expanded: false, labelId: "label-2", trashed: true }
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
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "prosecraft-mcp-search-"));
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

describe("searchDocuments", () => {
  it("folds diacritics when the search ignores case", async () => {
    const folder = await makeRoot(storedFixture());
    const hits = await searchDocuments(folder, "project-1", "kapten");
    expect(hits.map((hit) => hit.id)).toEqual(["doc-2", "doc-1"]);
    expect(hits.map((hit) => hit.matches)).toEqual([1, 1]);
  });

  it("matches case and diacritics exactly when caseSensitive is set", async () => {
    const folder = await makeRoot(storedFixture());
    expect(await searchDocuments(folder, "project-1", "kapten", { caseSensitive: true })).toEqual([]);
    const exact = await searchDocuments(folder, "project-1", "Käpten", { caseSensitive: true });
    expect(exact.map((hit) => hit.id)).toEqual(["doc-2", "doc-1"]);
  });

  it("skips words that only contain the query when wholeWord is set", async () => {
    const folder = await makeRoot(storedFixture());
    const loose = await searchDocuments(folder, "project-1", "harbor", { space: "wiki" });
    expect(loose.map((hit) => hit.id)).toEqual(["doc-3", "doc-6"]);
    expect(loose.find((hit) => hit.id === "doc-6")?.matches).toBe(2);

    const whole = await searchDocuments(folder, "project-1", "harbor", { space: "wiki", wholeWord: true });
    expect(whole.map((hit) => hit.id)).toEqual(["doc-3", "doc-6"]);
    expect(whole.find((hit) => hit.id === "doc-6")?.matches).toBe(1);
  });

  it("filters by space, chapter, folder and label", async () => {
    const folder = await makeRoot(storedFixture());
    const search = (options: Parameters<typeof searchDocuments>[3]) =>
      searchDocuments(folder, "project-1", "harbor", options);

    expect((await search({ space: "wiki" })).map((hit) => hit.id)).toEqual(["doc-3", "doc-6"]);
    expect((await search({ chapterId: "chapter-2" })).map((hit) => hit.id)).toEqual(["doc-9"]);
    expect((await search({ folderId: "folder-1" })).map((hit) => hit.id)).toEqual(["doc-3"]);
    expect((await search({ labelId: "label-1" })).map((hit) => hit.id)).toEqual(["doc-9", "doc-1"]);
  });

  it("hides trashed documents and trashed chapters unless includeTrashed is set", async () => {
    const folder = await makeRoot(storedFixture());
    const live = await searchDocuments(folder, "project-1", "harbor");
    expect(live.map((hit) => hit.id)).toEqual(["doc-9", "doc-1", "doc-3", "doc-6"]);

    const all = await searchDocuments(folder, "project-1", "harbor", { includeTrashed: true });
    expect(all.map((hit) => hit.id)).toEqual(["doc-9", "doc-1", "doc-4", "doc-5", "doc-3", "doc-6"]);
  });

  it("returns a plain-text snippet around the first match with chapter and label", async () => {
    const folder = await makeRoot(storedFixture());
    const [hit] = await searchDocuments(folder, "project-1", "harbor", { chapterId: "chapter-1" });
    expect(hit).toEqual({
      id: "doc-1",
      title: "Opening Scene",
      space: "scene",
      chapterTitle: "Chapter One",
      labelId: "label-1",
      matches: 1,
      snippet: "Docks It was dark in the harbor and the Käpten waited."
    });

    const [wiki] = await searchDocuments(folder, "project-1", "cartographer");
    expect(wiki).toMatchObject({ id: "doc-3", space: "wiki", chapterTitle: null, labelId: "label-2" });
  });

  it("cuts long bodies to a short snippet with ellipses", async () => {
    const folder = await makeRoot(storedFixture());
    const [hit] = await searchDocuments(folder, "project-1", "veniam");
    expect(hit.id).toBe("doc-8");
    expect(hit.snippet).toContain("veniam");
    expect(hit.snippet.startsWith("…")).toBe(true);
    expect(hit.snippet.endsWith("…")).toBe(true);
    expect(hit.snippet.replace(/^…|…$/g, "").length).toBeLessThanOrEqual(80);
  });

  it("caps the number of results and ignores blank queries", async () => {
    const folder = await makeRoot(storedFixture());
    expect((await searchDocuments(folder, "project-1", "harbor", { limit: 2 })).map((hit) => hit.id)).toEqual([
      "doc-9",
      "doc-1"
    ]);
    expect(await searchDocuments(folder, "project-1", "harbor", { limit: 0 })).toHaveLength(1);
    expect(await searchDocuments(folder, "project-1", "   ")).toEqual([]);
  });

  it("matches the app search on the same inputs", async () => {
    const project = projectFixture();
    const folder = await makeRoot(createStoredProject(project, "device-a", NOW));
    const documents = project.documents.map(normalizeDocument);
    const variants = [{}, { caseSensitive: true }, { wholeWord: true }, { includeTrashed: true }];

    for (const query of ["harbor", "Käpten", "kapten", "harbors", "veniam"]) {
      for (const options of variants) {
        const expected = searchInApp(documents, project.chapters, query, options).map((hit) => ({
          id: hit.documentId,
          title: hit.title,
          space: hit.kind,
          chapterTitle: hit.chapterTitle ?? null,
          matches: hit.matches,
          snippet: hit.snippet
        }));
        const actual = (await searchDocuments(folder, project.id, query, { ...options, limit: 100 })).map((hit) => ({
          id: hit.id,
          title: hit.title,
          space: hit.space,
          chapterTitle: hit.chapterTitle,
          matches: hit.matches,
          snippet: hit.snippet
        }));
        expect(actual, `${query} ${JSON.stringify(options)}`).toEqual(expected);
      }
    }
  });
});

describe("list filters", () => {
  it("exposes space, folder and label on scenes and filters them", async () => {
    const folder = await makeRoot(storedFixture());
    const scenes = await listScenes(folder, "project-1");
    const byId = new Map(scenes.map((scene) => [scene.id, scene]));

    expect(byId.get("doc-1")).toMatchObject({ space: "scene", chapterId: "chapter-1", folderId: null, labelId: "label-1" });
    expect(byId.get("doc-3")).toMatchObject({ space: "wiki", folderId: "folder-1", labelId: "label-2" });
    expect(byId.get("doc-3")?.chapterId).toBeUndefined();
    expect(byId.get("doc-7")).toMatchObject({ space: "scene", labelId: null });
    expect(byId.get("doc-7")?.chapterId).toBeUndefined();
  });

  it("lists trashed scenes only when asked", async () => {
    const folder = await makeRoot(storedFixture());
    expect((await listScenes(folder, "project-1")).map((scene) => scene.id)).not.toContain("doc-4");
    expect((await listScenes(folder, "project-1", { trashed: true })).map((scene) => scene.id)).toEqual(["doc-4"]);
    expect((await listScenes(folder, "project-1", { labelId: "label-2" })).map((scene) => scene.id)).toEqual([
      "doc-2",
      "doc-3"
    ]);
  });

  it("filters chapters by label and trashed state", async () => {
    const folder = await makeRoot(storedFixture());
    expect((await listChapters(folder, "project-1")).map((chapter) => chapter.id)).toEqual([
      "chapter-1",
      "chapter-2"
    ]);
    expect((await listChapters(folder, "project-1", { trashed: true })).map((chapter) => chapter.id)).toEqual([
      "chapter-3"
    ]);
    expect((await listChapters(folder, "project-1", { labelId: "label-1" })).map((chapter) => chapter.id)).toEqual([
      "chapter-2"
    ]);
    expect((await listChapters(folder, "project-1"))[0]).toMatchObject({ labelId: "label-2", trashed: false });
  });
});
