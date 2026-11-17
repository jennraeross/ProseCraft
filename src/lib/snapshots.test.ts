import { describe, expect, it } from "vitest";
import { createStoredProject, projectsHaveSameContent } from "./storage/schema";
import { MemoryFileSystem } from "./storage/sync/memory-fs";
import { readOpenProject, writeOpenProject } from "./storage/sync/open-layout";
import type { ProjectData } from "./storage/types";
import {
  MAX_SNAPSHOTS_PER_DOCUMENT,
  addSnapshot,
  createSnapshot,
  dropOrphanSnapshots,
  normalizeSnapshots,
  removeSnapshot,
  snapshotHtml,
  snapshotIsMarkdown,
  snapshotsForDocument
} from "./snapshots";
import type { DocumentSnapshot } from "./storage/types";

const doc = { id: "doc-1", title: "Opening", content: "<p>Hello</p>" };
const make = (id: string, now: number, documentId = "doc-1") =>
  createSnapshot({ ...doc, id: documentId }, { id, now, reason: "manual" });

describe("snapshots", () => {
  it("copies the text and trims the note", () => {
    const snapshot = createSnapshot(doc, { id: "s1", now: 5, reason: "manual", note: "  first draft  " });
    expect(snapshot).toMatchObject({ documentId: "doc-1", title: "Opening", content: "<p>Hello</p>", note: "first draft", createdAt: 5 });
    expect(createSnapshot(doc, { id: "s2", now: 6, reason: "manual", note: "   " })).not.toHaveProperty("note");
  });

  it("keeps only the newest snapshots of a document and leaves other documents alone", () => {
    let list = [make("other", 1, "doc-2")];
    for (let index = 0; index < MAX_SNAPSHOTS_PER_DOCUMENT + 3; index += 1) {
      list = addSnapshot(list, make(`s${index}`, 100 + index));
    }
    const own = snapshotsForDocument(list, "doc-1");
    expect(own).toHaveLength(MAX_SNAPSHOTS_PER_DOCUMENT);
    expect(own[0].id).toBe(`s${MAX_SNAPSHOTS_PER_DOCUMENT + 2}`);
    expect(own.some((entry) => entry.id === "s0")).toBe(false);
    expect(snapshotsForDocument(list, "doc-2")).toHaveLength(1);
  });

  it("removes one snapshot and drops those of deleted documents", () => {
    const list = [make("a", 1), make("b", 2, "doc-2")];
    expect(removeSnapshot(list, "a").map((entry) => entry.id)).toEqual(["b"]);
    expect(dropOrphanSnapshots(list, new Set(["doc-2"])).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("ignores malformed stored entries", () => {
    const good = make("good", 1);
    expect(normalizeSnapshots([good, { id: "x" }, null, { ...good, reason: "other" }, { ...good }]))
      .toEqual([good]);
    expect(normalizeSnapshots("nope")).toEqual([]);
  });
});

describe("snapshots in storage", () => {
  const project = (snapshots: ProjectData["snapshots"]): ProjectData => ({
    id: "p1",
    name: "Novel",
    author: "A",
    activeDocumentId: "doc-1",
    projectGoal: 1000,
    chapterGoals: {},
    activity: {},
    chapters: [{ id: "c1", title: "One", expanded: true }],
    documents: [{ ...doc, chapterId: "c1" }],
    snapshots
  });

  it("counts as a change so backups and sync pick it up", () => {
    expect(projectsHaveSameContent(project([]), project([make("s1", 1)]))).toBe(false);
    expect(projectsHaveSameContent(project([make("s1", 1)]), project([make("s1", 1)]))).toBe(true);
  });

  it("survives a round trip through the open folder layout", async () => {
    const fs = new MemoryFileSystem();
    const stored = createStoredProject(project([make("s1", 1)]), "device", 10);
    await writeOpenProject(fs, stored);
    const entries = await fs.listDir("projects");
    const back = await readOpenProject(fs, entries[0].name, 20);
    expect(back.project.snapshots).toEqual([make("s1", 1)]);
  });
});

describe("Markdown snapshots from the MCP server", () => {
  const mcpSnapshot = (extra: Partial<DocumentSnapshot> = {}): DocumentSnapshot => ({
    id: "s-1",
    documentId: "doc-1",
    createdAt: 1,
    title: "Opening",
    content: "It was *dark*.\n\nThen it was not.",
    reason: "manual",
    note: "Before MCP write",
    ...extra
  });

  it("restores them as HTML paragraphs instead of literal Markdown", () => {
    const html = snapshotHtml(mcpSnapshot({ contentFormat: "markdown" }));
    expect(html).toContain("<em>dark</em>");
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html).not.toContain("*");
  });

  it("recognises the ones written before contentFormat existed by the MCP note", () => {
    expect(snapshotIsMarkdown(mcpSnapshot())).toBe(true);
    expect(snapshotHtml(mcpSnapshot())).toContain("<em>dark</em>");
  });

  it("leaves the app's own HTML snapshots alone", () => {
    const own = make("s-2", 2);
    expect(snapshotIsMarkdown(own)).toBe(false);
    expect(snapshotHtml(own)).toBe("<p>Hello</p>");
  });

  it("keeps contentFormat when stored snapshots are normalized", () => {
    const [kept] = normalizeSnapshots([mcpSnapshot({ contentFormat: "markdown" })]);
    expect(kept.contentFormat).toBe("markdown");
    const [plain] = normalizeSnapshots([mcpSnapshot({ contentFormat: "html" as never })]);
    expect(plain.contentFormat).toBeUndefined();
  });
});
