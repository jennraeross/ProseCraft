import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStoredProject } from "$lib/storage/schema";
import { OPEN_MARKER_FILE } from "$lib/storage/sync/files";
import { MemoryFileSystem } from "$lib/storage/sync/memory-fs";
import { openMarkerText, readOpenProject, writeOpenProject } from "$lib/storage/sync/open-layout";
import type { DocumentSnapshot, ProjectData, StoredProject } from "$lib/storage/types";
import { addComment, createWikiPage, resolveComment, setLabel, updateWikiPage, writeScene } from "./safeWrites";

const NOW = 1_700_000_000_000;
const tempRoots: string[] = [];

function projectFixture(snapshots?: DocumentSnapshot[]): ProjectData {
  return {
    id: "project-1",
    name: "Test Novel",
    author: "Ada Writer",
    activeDocumentId: "doc-1",
    projectGoal: 50_000,
    chapterGoals: { "chapter-1": 2_000 },
    activity: {},
    labels: [
      { id: "label-1", name: "POV", color: "blue" },
      { id: "label-2", name: "Setting", color: "green" }
    ],
    researchFolders: [
      { id: "folder-1", title: "Characters", parentId: null },
      { id: "folder-2", title: "Places", parentId: null }
    ],
    snapshots,
    documents: [
      { id: "doc-1", title: "Opening Scene", content: "<p>It was dark.</p>", chapterId: "chapter-1" },
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
      { id: "doc-3", title: "Duplicate", content: "<p>The harbor was grey. The harbor was cold.</p>", chapterId: "chapter-1" }
    ],
    chapters: [{ id: "chapter-1", title: "Chapter One", expanded: true, summary: "It begins." }]
  };
}

function storedFixture(snapshots?: DocumentSnapshot[]): StoredProject {
  return createStoredProject(projectFixture(snapshots), "device-a", NOW);
}

function projectPath(folder: string): string {
  return path.join(folder, "projects", "project-1", "project.json");
}

function docPath(folder: string, id: string): string {
  return path.join(folder, "projects", "project-1", "documents", `${id}.md`);
}

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

async function readProjectJson(folder: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(projectPath(folder), "utf8")) as Record<string, unknown>;
}

/** The `project` section of project.json, where snapshots and comments live. */
async function readProjectSection(folder: string): Promise<Record<string, unknown>> {
  const json = await readProjectJson(folder);
  return (json.project ?? {}) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })));
});

describe("writeScene snapshots", () => {
  it("stores the previous text before overwriting and reports the snapshot id", async () => {
    const folder = await makeRoot(storedFixture());
    const before = await readProjectJson(folder);

    const scene = await writeScene(folder, "project-1", { sceneId: "doc-1", markdown: "It was bright." });

    expect(scene.snapshotId).toBeTruthy();
    const after = await readProjectJson(folder);
    const snapshots = (await readProjectSection(folder)).snapshots as DocumentSnapshot[];
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe(scene.snapshotId);
    expect(snapshots[0].documentId).toBe("doc-1");
    expect(snapshots[0].content).toBe("It was dark.");
    expect(snapshots[0].reason).toBe("manual");
    expect(snapshots[0].note).toBe("Before MCP write");
    expect(after.revision).toBe((before.revision as number) + 1);
  });

  it("skips the snapshot when snapshot is false and for new scenes", async () => {
    const folder = await makeRoot(storedFixture());

    const overwritten = await writeScene(folder, "project-1", {
      sceneId: "doc-1",
      markdown: "It was bright.",
      snapshot: false
    });
    expect(overwritten.snapshotId).toBeNull();

    const created = await writeScene(folder, "project-1", { title: "New", markdown: "Fresh." });
    expect(created.snapshotId).toBeNull();
    expect((await readProjectSection(folder)).snapshots ?? []).toEqual([]);
  });

  it("caps the snapshots of one document at ten, dropping the oldest", async () => {
    const seeded: DocumentSnapshot[] = Array.from({ length: 10 }, (_, index) => ({
      id: `snap-${index}`,
      documentId: "doc-1",
      createdAt: NOW - 10_000 + index,
      title: "Opening Scene",
      content: `old ${index}`,
      reason: "manual"
    }));
    const folder = await makeRoot(storedFixture(seeded));

    const scene = await writeScene(folder, "project-1", { sceneId: "doc-1", markdown: "It was bright." });

    const snapshots = (await readProjectSection(folder)).snapshots as DocumentSnapshot[];
    expect(snapshots).toHaveLength(10);
    expect(snapshots.map((entry) => entry.id)).not.toContain("snap-0");
    expect(snapshots.map((entry) => entry.id)).toContain(scene.snapshotId);
    expect(snapshots.find((entry) => entry.id === scene.snapshotId)?.content).toBe("It was dark.");
  });
});

describe("wiki pages", () => {
  it("creates a page in the Wiki space with folder and label", async () => {
    const folder = await makeRoot(storedFixture());

    const page = await createWikiPage(folder, "project-1", {
      title: "Old Town",
      folderId: "folder-2",
      content: "Cobblestones.",
      labelId: "label-2"
    });

    const text = await fs.readFile(docPath(folder, page.id), "utf8");
    expect(text).toContain('space: "Wiki"');
    expect(text).toContain('folderId: "folder-2"');
    expect(text).toContain('labelId: "label-2"');

    const reread = await readOpenProject(await loadFolder(folder), "project-1", NOW + 1_000);
    const document = reread.project.documents.find((entry) => entry.id === page.id);
    expect(document?.space).toBe("Wiki");
    expect(document?.markdownSource).toContain("Cobblestones");
  });

  it("rejects unknown folders and labels without writing", async () => {
    const folder = await makeRoot(storedFixture());
    const before = await fs.readFile(projectPath(folder), "utf8");

    await expect(
      createWikiPage(folder, "project-1", { title: "Lost", folderId: "folder-nope" })
    ).rejects.toThrow(/Wiki folder not found/);
    await expect(
      createWikiPage(folder, "project-1", { title: "Lost", labelId: "label-nope" })
    ).rejects.toThrow(/Label not found/);

    expect(await fs.readFile(projectPath(folder), "utf8")).toBe(before);
  });

  it("updates only the given fields, keeps the profile, and snapshots the old text", async () => {
    const folder = await makeRoot(storedFixture());

    const page = await updateWikiPage(folder, "project-1", { pageId: "doc-2", content: "Mara maps the coast." });

    expect(page.snapshotId).toBeTruthy();
    const text = await fs.readFile(docPath(folder, "doc-2"), "utf8");
    expect(text).toContain('title: "Mara"');
    expect(text).toContain('folderId: "folder-1"');
    expect(text).toContain('labelId: "label-1"');
    expect(text).toContain('"occupation":"Cartographer"');

    const reread = await readOpenProject(await loadFolder(folder), "project-1", NOW + 1_000);
    const document = reread.project.documents.find((entry) => entry.id === "doc-2");
    expect(document?.markdownSource).toContain("maps the coast");
    expect(document?.character?.occupation).toBe("Cartographer");
    expect(reread.entities.documents["doc-2"].updatedBy).toBe("mcp");

    const snapshots = (await readProjectSection(folder)).snapshots as DocumentSnapshot[];
    expect(snapshots.find((entry) => entry.id === page.snapshotId)?.content).toBe("Notes about Mara.");
  });

  it("fails on a stale expectedRevision and leaves the files untouched", async () => {
    const folder = await makeRoot(storedFixture());
    const pageBefore = await fs.readFile(docPath(folder, "doc-2"), "utf8");
    const projectBefore = await fs.readFile(projectPath(folder), "utf8");

    await expect(
      updateWikiPage(folder, "project-1", { pageId: "doc-2", title: "Nope", expectedRevision: 99 })
    ).rejects.toThrow(/expectedRevision|revision 99/);

    expect(await fs.readFile(docPath(folder, "doc-2"), "utf8")).toBe(pageBefore);
    expect(await fs.readFile(projectPath(folder), "utf8")).toBe(projectBefore);
  });

  it("refuses pages that are not in the Wiki space", async () => {
    const folder = await makeRoot(storedFixture());
    await expect(updateWikiPage(folder, "project-1", { pageId: "doc-1", title: "No" })).rejects.toThrow(
      /not a Wiki page/
    );
  });
});

describe("setLabel", () => {
  it("sets and clears a document label", async () => {
    const folder = await makeRoot(storedFixture());

    await setLabel(folder, "project-1", { documentId: "doc-1", labelId: "label-1" });
    expect(await fs.readFile(docPath(folder, "doc-1"), "utf8")).toContain('labelId: "label-1"');

    await setLabel(folder, "project-1", { documentId: "doc-1", labelId: null });
    expect(await fs.readFile(docPath(folder, "doc-1"), "utf8")).not.toContain("labelId:");
  });

  it("rejects unknown labels without writing", async () => {
    const folder = await makeRoot(storedFixture());
    const before = await fs.readFile(docPath(folder, "doc-1"), "utf8");

    await expect(setLabel(folder, "project-1", { documentId: "doc-1", labelId: "label-nope" })).rejects.toThrow(
      /Label not found/
    );
    expect(await fs.readFile(docPath(folder, "doc-1"), "utf8")).toBe(before);
  });

  it("labels a chapter", async () => {
    const folder = await makeRoot(storedFixture());

    const result = await setLabel(folder, "project-1", { chapterId: "chapter-1", labelId: "label-2" });

    expect(result.chapterId).toBe("chapter-1");
    const chapter = JSON.parse(
      await fs.readFile(path.join(folder, "projects", "project-1", "chapters", "chapter-1.json"), "utf8")
    ) as { record: { labelId?: string } };
    expect(chapter.record.labelId).toBe("label-2");
  });
});

describe("comments", () => {
  it("anchors a comment on the quote with its surrounding context", async () => {
    const folder = await makeRoot(storedFixture());

    const comment = await addComment(folder, "project-1", {
      documentId: "doc-3",
      quote: "was grey",
      text: "Nice image.",
      author: "Reader"
    });

    expect(comment.documentId).toBe("doc-3");
    expect(comment.quote).toBe("was grey");
    expect(comment.prefix).toBe("The harbor ");
    expect(comment.suffix).toBe(". The harbor was cold.");
    expect(comment.body).toBe("Nice image.");
    expect(comment.author).toBe("Reader");
    expect(comment.resolved).toBe(false);

    const stored = (await readProjectSection(folder)).comments as { id: string }[];
    expect(stored.map((entry) => entry.id)).toContain(comment.id);
  });

  it("fails when the quote is ambiguous or missing, leaving the project untouched", async () => {
    const folder = await makeRoot(storedFixture());
    const before = await fs.readFile(projectPath(folder), "utf8");

    await expect(
      addComment(folder, "project-1", { documentId: "doc-3", quote: "The harbor", text: "Which one?" })
    ).rejects.toThrow(/more than once/);
    await expect(
      addComment(folder, "project-1", { documentId: "doc-3", quote: "not there", text: "Hm" })
    ).rejects.toThrow(/not found/);
    expect(await fs.readFile(projectPath(folder), "utf8")).toBe(before);
  });

  it("resolves a comment", async () => {
    const folder = await makeRoot(storedFixture());
    const comment = await addComment(folder, "project-1", {
      documentId: "doc-3",
      quote: "was cold",
      text: "Agreed."
    });

    const result = await resolveComment(folder, "project-1", comment.id);

    expect(result.resolved).toBe(true);
    const stored = (await readProjectSection(folder)).comments as { id: string; resolved: boolean }[];
    expect(stored.find((entry) => entry.id === comment.id)?.resolved).toBe(true);
  });
});
