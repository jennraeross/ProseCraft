import { describe, expect, it } from "vitest";
import { createStoredProject, projectsHaveSameContent } from "./storage/schema";
import { MemoryFileSystem } from "./storage/sync/memory-fs";
import { readOpenProject, writeOpenProject } from "./storage/sync/open-layout";
import type { ProjectData } from "./storage/types";
import { commentText, offsetsFromRange, rangeFromOffsets } from "./comment-dom";
import {
  CONTEXT_LENGTH,
  buildAnchor,
  commentsForDocument,
  createComment,
  dropOrphanComments,
  locateAnchor,
  normalizeComments,
  removeComment,
  setCommentResolved
} from "./comments";

describe("comment anchors", () => {
  const text = "She said no. Then he said no, and left.";

  it("builds an anchor with context and refuses whitespace-only selections", () => {
    const anchor = buildAnchor(text, 13, 17);
    expect(anchor).toEqual({ quote: "Then", prefix: "She said no. ", suffix: " he said no, and left." });
    expect(buildAnchor(text, 3, 4)).toBeNull();
    expect(anchor!.prefix.length).toBeLessThanOrEqual(CONTEXT_LENGTH);
  });

  it("finds the passage after text was added before it", () => {
    const anchor = buildAnchor(text, 13, 17)!;
    const edited = "Earlier text. " + text;
    expect(locateAnchor(edited, anchor)).toEqual({ start: 27, end: 31 });
  });

  it("picks the occurrence whose surroundings match when the quote repeats", () => {
    const second = text.indexOf("no", 15);
    const anchor = buildAnchor(text, second, second + 2)!;
    expect(locateAnchor(text, anchor)).toEqual({ start: second, end: second + 2 });
    const first = buildAnchor(text, 9, 11)!;
    expect(locateAnchor(text, first)).toEqual({ start: 9, end: 11 });
  });

  it("returns null when the quote is gone", () => {
    const anchor = buildAnchor(text, 13, 17)!;
    expect(locateAnchor("Nothing left of it.", anchor)).toBeNull();
  });
});

describe("comment list helpers", () => {
  const anchor = { quote: "no", prefix: "said ", suffix: "." };
  const make = (id: string, documentId = "d1") =>
    createComment({ id, documentId, anchor, body: "  Why?  ", author: " ", now: 1 });

  it("normalises body and author when creating", () => {
    expect(make("c1")).toMatchObject({ body: "Why?", author: "Me", resolved: false });
  });

  it("resolves, removes and filters", () => {
    const list = [make("a"), make("b", "d2")];
    expect(setCommentResolved(list, "a", true)[0].resolved).toBe(true);
    expect(removeComment(list, "a").map((c) => c.id)).toEqual(["b"]);
    expect(commentsForDocument(list, "d2").map((c) => c.id)).toEqual(["b"]);
    expect(dropOrphanComments(list, new Set(["d1"])).map((c) => c.id)).toEqual(["a"]);
  });

  it("keeps only well-formed stored entries", () => {
    const good = make("g");
    expect(normalizeComments([good, { id: "x" }, null, { ...good, quote: "" }, { ...good }])).toEqual([good]);
    expect(normalizeComments(undefined)).toEqual([]);
  });
});

describe("text offsets in the editor DOM", () => {
  const root = () => {
    const element = document.createElement("div");
    element.innerHTML = "<p>Hello <strong>brave</strong> world</p><p>Second line</p><div contenteditable=\"false\">HIDDEN</div>";
    return element;
  };

  it("joins text nodes and skips non-editable widgets", () => {
    expect(commentText(root())).toBe("Hello brave worldSecond line");
  });

  it("round-trips a range that crosses an element boundary", () => {
    const element = root();
    document.body.append(element);
    const range = rangeFromOffsets(element, 6, 17)!;
    expect(range.toString()).toBe("brave world");
    expect(offsetsFromRange(element, range)).toEqual({ start: 6, end: 17 });
    element.remove();
  });

  it("returns null for ranges outside the root or beyond the text", () => {
    const element = root();
    expect(rangeFromOffsets(element, 100, 105)).toBeNull();
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    const range = document.createRange();
    range.selectNodeContents(outside);
    expect(offsetsFromRange(element, range)).toBeNull();
  });
});

describe("comments in storage", () => {
  const project = (comments: ProjectData["comments"]): ProjectData => ({
    id: "p1",
    name: "Novel",
    author: "A",
    activeDocumentId: "d1",
    projectGoal: 1000,
    chapterGoals: {},
    activity: {},
    chapters: [{ id: "c1", title: "One", expanded: true }],
    documents: [{ id: "d1", title: "Opening", content: "<p>Hello</p>", chapterId: "c1" }],
    comments
  });
  const comment = createComment({
    id: "c1",
    documentId: "d1",
    anchor: { quote: "Hello", prefix: "", suffix: "" },
    body: "Greeting?",
    author: "Proofreader",
    now: 5
  });

  it("counts as a change so backups and sync pick it up", () => {
    expect(projectsHaveSameContent(project([]), project([comment]))).toBe(false);
    expect(projectsHaveSameContent(project([comment]), project([comment]))).toBe(true);
  });

  it("survives a round trip through the open folder layout", async () => {
    const fs = new MemoryFileSystem();
    await writeOpenProject(fs, createStoredProject(project([comment]), "device", 10));
    const entries = await fs.listDir("projects");
    const back = await readOpenProject(fs, entries[0].name, 20);
    expect(back.project.comments).toEqual([comment]);
  });
});
