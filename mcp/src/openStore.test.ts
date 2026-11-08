import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStoredProject } from "$lib/storage/schema";
import { OPEN_MARKER_FILE } from "$lib/storage/sync/files";
import { MemoryFileSystem } from "$lib/storage/sync/memory-fs";
import {
  openMarkerText,
  readOpenProject,
  writeOpenProject
} from "$lib/storage/sync/open-layout";
import type { ProjectData, StoredProject } from "$lib/storage/types";
import { listChapters, listScenes, readScene, trashScene, updateChapter, writeScene } from "./openStore";

const NOW = 1_700_000_000_000;
const LOCK_FILE = ".prosecraft-mcp.lock";
const tempRoots: string[] = [];

function projectFixture(): ProjectData {
  return {
    id: "project-1",
    name: "Test Novel",
    author: "Ada Writer",
    activeDocumentId: "doc-1",
    projectGoal: 50_000,
    chapterGoals: { "chapter-1": 2_000 },
    activity: {},
    documents: [
      {
        id: "doc-1",
        title: "Opening Scene",
        content: "<p>It was dark.</p>",
        chapterId: "chapter-1"
      },
      {
        id: "doc-2",
        title: "Mara",
        content: "<p>Notes about Mara.</p>",
        space: "Wiki",
        folderId: "folder-1",
        labelId: "label-1",
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
        folderId: "folder-2",
        labelId: "label-2",
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
        trashed: true,
        trashedWithChapterId: "chapter-1"
      }
    ],
    chapters: [{ id: "chapter-1", title: "Chapter One", expanded: true, summary: "It begins." }]
  };
}

function storedFixture(): StoredProject {
  return createStoredProject(projectFixture(), "device-a", NOW);
}

function docPath(folder: string, id: string): string {
  return path.join(folder, "projects", "project-1", "documents", `${id}.md`);
}

/** Writes the fixture through the app's writer, then materializes it on disk. */
async function makeRoot(project: StoredProject): Promise<string> {
  const memory = new MemoryFileSystem();
  await writeOpenProject(memory, project);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "prosecraft-mcp-"));
  tempRoots.push(folder);
  for (const file of memory.paths()) {
    const target = path.join(folder, ...file.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, await memory.readText(file), "utf8");
  }
  await fs.writeFile(path.join(folder, OPEN_MARKER_FILE), openMarkerText(NOW), "utf8");
  return folder;
}

/** Loads the folder back into a MemoryFileSystem so the app can decode it. */
async function loadFolder(folder: string): Promise<MemoryFileSystem> {
  const memory = new MemoryFileSystem();
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const relative = path.relative(folder, full).split(path.sep).join("/");
      await memory.writeText(relative, await fs.readFile(full, "utf8"));
    }
  }
  await walk(folder);
  return memory;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

describe("writeScene", () => {
  it("keeps Wiki page fields and produces the app's hash", async () => {
    const folder = await makeRoot(storedFixture());

    const scene = await writeScene(folder, "project-1", {
      sceneId: "doc-2",
      markdown: "Mara is a *cartographer*."
    });

    const text = await fs.readFile(docPath(folder, "doc-2"), "utf8");
    expect(text).toContain('space: "Wiki"');
    expect(text).toContain('folderId: "folder-1"');
    expect(text).toContain('labelId: "label-1"');

    // Reading with the app must not flag the file as an external edit.
    const reread = await readOpenProject(await loadFolder(folder), "project-1", NOW + 1_000);
    const meta = reread.entities.documents["doc-2"];
    expect(meta.updatedBy).toBe("mcp");
    expect(meta.revision).toBe(scene.meta.revision);
    const document = reread.project.documents.find((entry) => entry.id === "doc-2");
    expect(document?.space).toBe("Wiki");
    expect(document?.folderId).toBe("folder-1");
    expect(document?.labelId).toBe("label-1");
    expect(document?.character?.occupation).toBe("Cartographer");
    expect(document?.markdownSource).toContain("cartographer");
  });

  it("keeps place profiles and trash markers", async () => {
    const folder = await makeRoot(storedFixture());

    await writeScene(folder, "project-1", { sceneId: "doc-3", markdown: "The harbor at dawn." });
    const placeText = await fs.readFile(docPath(folder, "doc-3"), "utf8");
    expect(placeText).toContain('space: "Wiki"');
    expect(placeText).toContain('folderId: "folder-2"');
    expect(placeText).toContain('labelId: "label-2"');
    expect(placeText).toContain('"type":"City"');

    const scene = await readScene(folder, "project-1", "doc-4", { includeTrashed: true });
    expect(scene.markdown).toBe("Cut.");
    await expect(readScene(folder, "project-1", "doc-4")).rejects.toThrow(/in the trash/);

    await writeScene(folder, "project-1", { sceneId: "doc-4", markdown: "Cut after all." });
    const trashedText = await fs.readFile(docPath(folder, "doc-4"), "utf8");
    expect(trashedText).toContain('trashed: true');
    expect(trashedText).toContain('trashedWithChapterId: "chapter-1"');
  });

  it("rejects an unknown sceneId unless create is set", async () => {
    const folder = await makeRoot(storedFixture());

    await expect(
      writeScene(folder, "project-1", { sceneId: "doc-9", markdown: "New scene." })
    ).rejects.toThrow(/Scene not found: doc-9.*create: true/);

    const created = await writeScene(folder, "project-1", {
      sceneId: "doc-9",
      chapterId: "chapter-1",
      title: "New Scene",
      markdown: "New scene.",
      create: true
    });
    expect(created.id).toBe("doc-9");

    // A new document gets only the fields this tool owns, not a copy of a sibling.
    const text = await fs.readFile(docPath(folder, "doc-9"), "utf8");
    expect(text).toMatch(
      /^---\nid: "doc-9"\ntitle: "New Scene"\nchapterId: "chapter-1"\nupdatedAt: \d+\nrevision: 1\nupdatedBy: "mcp"\ndeletedAt: null\nhash: "[0-9a-f]{64}"\n---\n/
    );
  });
});

describe("reading documents", () => {
  it("skips a malformed document in lists but reports it on direct read", async () => {
    const folder = await makeRoot(storedFixture());
    await fs.writeFile(docPath(folder, "doc-2"), "no frontmatter here\n", "utf8");

    const scenes = await listScenes(folder, "project-1");
    expect(scenes.map((scene) => scene.id)).toEqual(["doc-1", "doc-3"]);

    await expect(readScene(folder, "project-1", "doc-2")).rejects.toThrow(
      /Scene doc-2 could not be read: missing frontmatter/
    );
  });

  it("rejects projects that are in the trash", async () => {
    const stored = { ...storedFixture(), deletedAt: NOW + 5_000 };
    const folder = await makeRoot(stored);

    await expect(listScenes(folder, "project-1")).rejects.toThrow(/Project is deleted: project-1/);
    await expect(
      writeScene(folder, "project-1", { sceneId: "doc-1", markdown: "Nope." })
    ).rejects.toThrow(/Project is deleted: project-1/);
  });
});

describe("atomic writes", () => {
  it("cleans up the temp file and keeps the old state when the rename fails", async () => {
    const folder = await makeRoot(storedFixture());
    const target = docPath(folder, "doc-1");
    const headerPath = path.join(folder, "projects", "project-1", "project.json");
    const headerBefore = JSON.parse(await fs.readFile(headerPath, "utf8"));

    // A directory at the target path makes rename fail, like a crash mid-write.
    await fs.rm(target);
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "keep"), "x", "utf8");

    await expect(
      writeScene(folder, "project-1", { sceneId: "doc-1", markdown: "Broken." })
    ).rejects.toThrow();

    const names = await fs.readdir(path.dirname(target));
    expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(await fs.readFile(path.join(target, "keep"), "utf8")).toBe("x");
    expect(JSON.parse(await fs.readFile(headerPath, "utf8")).revision).toBe(headerBefore.revision);
  });
});

describe("trashScene", () => {
  it("tombstones the header before dropping the file and reads back with the app", async () => {
    const folder = await makeRoot(storedFixture());
    const before = (await readScene(folder, "project-1", "doc-1")).meta.revision;

    const result = await trashScene(folder, "project-1", "doc-1");

    expect(result).toEqual({ id: "doc-1", revision: before + 1 });
    await expect(fs.stat(docPath(folder, "doc-1"))).rejects.toThrow(/ENOENT/);

    const reread = await readOpenProject(await loadFolder(folder), "project-1", NOW + 1_000);
    expect(reread.entities.documents["doc-1"].deletedAt).toBeGreaterThan(0);
    expect(reread.entities.documents["doc-1"].revision).toBe(result.revision);
    expect(reread.project.documents.some((entry) => entry.id === "doc-1")).toBe(false);
  });

  it("treats a missing file as harmless only once the id is tombstoned", async () => {
    const folder = await makeRoot(storedFixture());

    await fs.rm(docPath(folder, "doc-1"));
    await expect(
      readOpenProject(await loadFolder(folder), "project-1", NOW + 1_000)
    ).rejects.toThrow(/missing from the open sync folder/);

    await trashScene(folder, "project-1", "doc-1");
    const reread = await readOpenProject(await loadFolder(folder), "project-1", NOW + 1_000);
    expect(reread.entities.documents["doc-1"].deletedAt).toBeGreaterThan(0);
  });
});

describe("expectedRevision", () => {
  it("writes when the revision matches and returns the new one", async () => {
    const folder = await makeRoot(storedFixture());
    const before = (await readScene(folder, "project-1", "doc-1")).meta.revision;

    const scene = await writeScene(folder, "project-1", {
      sceneId: "doc-1",
      markdown: "Revised.",
      expectedRevision: before
    });

    expect(scene.meta.revision).toBe(before + 1);
  });

  it("refuses a stale revision for write, trash and chapter update without writing", async () => {
    const folder = await makeRoot(storedFixture());
    const fileBefore = await fs.readFile(docPath(folder, "doc-1"), "utf8");
    const scene = await readScene(folder, "project-1", "doc-1");

    await expect(
      writeScene(folder, "project-1", {
        sceneId: "doc-1",
        markdown: "Stale.",
        expectedRevision: scene.meta.revision - 1
      })
    ).rejects.toThrow(new RegExp(`current revision is ${scene.meta.revision}`));
    expect(await fs.readFile(docPath(folder, "doc-1"), "utf8")).toBe(fileBefore);

    await expect(
      trashScene(folder, "project-1", "doc-1", { expectedRevision: scene.meta.revision + 1 })
    ).rejects.toThrow(new RegExp(`current revision is ${scene.meta.revision}`));
    expect((await readScene(folder, "project-1", "doc-1")).meta.revision).toBe(scene.meta.revision);

    const [chapter] = await listChapters(folder, "project-1");
    await expect(
      updateChapter(folder, "project-1", chapter.id, {
        title: "Nope",
        expectedRevision: chapter.meta.revision + 1
      })
    ).rejects.toThrow(new RegExp(`current revision is ${chapter.meta.revision}`));
    expect((await listChapters(folder, "project-1"))[0].title).toBe(chapter.title);

    const updated = await updateChapter(folder, "project-1", chapter.id, {
      title: "Renamed",
      expectedRevision: chapter.meta.revision
    });
    expect(updated.meta.revision).toBe(chapter.meta.revision + 1);
  });
});

describe("write lock", () => {
  it("fails clearly while another write holds a fresh lock", async () => {
    const folder = await makeRoot(storedFixture());
    const lockPath = path.join(folder, LOCK_FILE);
    await fs.writeFile(lockPath, "other", "utf8");

    await expect(
      writeScene(folder, "project-1", { sceneId: "doc-1", markdown: "Blocked." })
    ).rejects.toThrow(/Another ProseCraft MCP write is in progress/);

    expect((await readScene(folder, "project-1", "doc-1")).markdown).not.toContain("Blocked");
    await expect(fs.stat(lockPath)).resolves.toBeDefined();
  });

  it("takes over a lock older than 30s and removes it afterwards", async () => {
    const folder = await makeRoot(storedFixture());
    const lockPath = path.join(folder, LOCK_FILE);
    await fs.writeFile(lockPath, "stale", "utf8");
    const old = (Date.now() - 60_000) / 1_000;
    await fs.utimes(lockPath, old, old);

    const scene = await writeScene(folder, "project-1", { sceneId: "doc-1", markdown: "After stale." });
    expect(scene.markdown).toBe("After stale.");
    await expect(fs.stat(lockPath)).rejects.toThrow(/ENOENT/);
  });
});
