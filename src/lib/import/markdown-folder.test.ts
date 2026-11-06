import { describe, expect, it } from "vitest";
import {
  STORAGE_WARN_CHARS,
  buildMarkdownProject,
  estimateStoredChars,
  humanizeName,
  isImportableMarkdownPath,
  listImportFolders,
  roleOf,
  parseFrontmatter,
  type MarkdownFile
} from "./markdown-folder";

let counter = 0;
const createId = () => `id-${++counter}`;
const file = (path: string, text: string): MarkdownFile => ({ path, text });

describe("parseFrontmatter", () => {
  it("reads scalars, block lists and inline lists", () => {
    const { data, body } = parseFrontmatter(
      "---\nid: A-1\ntitle: \"C02 · Die Treppe\"\nposition: 3\ntags:\n  - figur\n  - arthur\naliases: [Art, 'Arthur van A']\n---\n\n# Heading\n\nText"
    );
    expect(data).toEqual({
      id: "A-1",
      title: "C02 · Die Treppe",
      position: "3",
      tags: ["figur", "arthur"],
      aliases: ["Art", "Arthur van A"]
    });
    expect(body).toBe("\n# Heading\n\nText");
  });

  it("returns the whole text when there is no header or it is not closed", () => {
    expect(parseFrontmatter("# Just text").data).toEqual({});
    expect(parseFrontmatter("---\ntitle: open").body).toBe("---\ntitle: open");
  });

  it("copes with Windows line endings and a BOM", () => {
    expect(parseFrontmatter("﻿---\r\ntitle: X\r\n---\r\nBody").data.title).toBe("X");
  });
});

describe("paths and names", () => {
  it("skips hidden and archive folders and other file types", () => {
    expect(isImportableMarkdownPath("a/b.md")).toBe(true);
    expect(isImportableMarkdownPath("a/.obsidian/x.md")).toBe(false);
    expect(isImportableMarkdownPath("a/_archiv/x.md")).toBe(false);
    expect(isImportableMarkdownPath("a/b.md~")).toBe(false);
    expect(isImportableMarkdownPath("a/b.json")).toBe(false);
  });

  it("makes readable names", () => {
    expect(humanizeName("03_CHARACTERS")).toBe("Characters");
    expect(humanizeName("entwurf_v4_master")).toBe("Entwurf v4 master");
    expect(humanizeName("03_C02_die_treppe.md")).toBe("C02 die treppe");
  });

  it("suggests one manuscript folder and wiki for the rest", () => {
    const folders = listImportFolders([
      file("02_WORLD/a.md", ""),
      file("12_MANUSKRIPT/b.md", ""),
      file("13_ENTWURF/c.md", ""),
      file("README.md", "")
    ]);
    const roles = Object.fromEntries(folders.map((folder) => [folder.path, folder.suggested]));
    expect(roles).toEqual({
      "02_WORLD": "wiki",
      "12_MANUSKRIPT": "manuscript",
      "13_ENTWURF": "wiki",
      "(loose files)": "wiki"
    });
  });

  it("offers the subfolders of a manuscript folder and suggests only the last draft", () => {
    const folders = listImportFolders([
      file("MANUSCRIPT/draft_v1/a.md", ""),
      file("MANUSCRIPT/draft_v2/a.md", ""),
      file("MANUSCRIPT/draft_v10_master/a.md", ""),
      file("WORLD/x/a.md", ""),
      file("WORLD/x/b.md", ""),
      file("WORLD/y/c.md", "")
    ]);
    expect(folders.map((folder) => `${folder.depth}:${folder.path}=${folder.suggested}`)).toEqual([
      "0:MANUSCRIPT=wiki",
      "1:MANUSCRIPT/draft_v1=skip",
      "1:MANUSCRIPT/draft_v2=skip",
      "1:MANUSCRIPT/draft_v10_master=manuscript",
      "0:WORLD=wiki",
      "1:WORLD/x=wiki",
      "1:WORLD/y=wiki"
    ]);
  });

  it("lets the most specific folder decide a file's role", () => {
    const roles = { MS: "manuscript", "MS/old": "skip", "(loose files)": "wiki" } as const;
    expect(roleOf("MS/new/a.md", roles)).toBe("manuscript");
    expect(roleOf("MS/old/a.md", roles)).toBe("skip");
    expect(roleOf("MS/old/deeper/a.md", roles)).toBe("skip");
    expect(roleOf("README.md", roles)).toBe("wiki");
    expect(roleOf("OTHER/a.md", roles)).toBe("skip");
  });
});

describe("estimateStoredChars", () => {
  it("counts only the files that would be imported", () => {
    const files = [
      file("A/a.md", "x".repeat(1000)),
      file("B/b.md", "y".repeat(500)),
      file("A/_old/c.md", "z".repeat(9999)),
      file("A/d.json", "q".repeat(9999))
    ];
    expect(estimateStoredChars(files, { A: "wiki", B: "skip" })).toBe(Math.round(1000 * 3 * 1.2));
    expect(estimateStoredChars(files, { A: "wiki", B: "wiki" })).toBe(Math.round(1500 * 3 * 1.2));
    expect(STORAGE_WARN_CHARS).toBeGreaterThan(0);
  });
});

describe("buildMarkdownProject", () => {
  const files = [
    file("12_MS/v1/02_b.md", "---\ntitle: Second\nposition: 2\n---\n# Second\n\nBeta text [[CHR_a]]."),
    file("12_MS/v1/01_a.md", "---\ntitle: First\nposition: 1\n---\n# First\n\nAlpha text."),
    file("12_MS/v2/x.md", "# Other draft\n\nOther."),
    file("03_CHARS/CHR_a.md", "---\ntitle: Anna\naliases:\n  - A\n---\nAnna is [[nobody|someone]] and [[missing]]."),
    file("03_CHARS/sub/CHR_b.md", "No heading here."),
    file("03_CHARS/_old/hidden.md", "hidden"),
    file("notes.json", "{}")
  ];
  const plan = (chapterMode: "folders" | "files") => ({
    roles: { "12_MS": "manuscript" as const, "03_CHARS": "wiki" as const },
    chapterMode
  });

  it("turns folders into chapters and files into scenes, ordered by position", () => {
    counter = 0;
    const { project, report } = buildMarkdownProject(files, plan("folders"), { createId, name: "My Book" });
    expect(project.name).toBe("My Book");
    expect(project.chapters.map((chapter) => chapter.title)).toEqual(["V1", "V2"]);
    const scenes = project.documents.filter((doc) => doc.chapterId);
    expect(scenes.map((doc) => doc.title)).toEqual(["First", "Second", "Other draft"]);
    expect(report).toMatchObject({ chapters: 2, scenes: 3, wikiPages: 2 });
    expect(project.activeDocumentId).toBe(scenes[0].id);
  });

  it("drops a leading heading that repeats the title", () => {
    counter = 0;
    const { project } = buildMarkdownProject(files, plan("folders"), { createId });
    const first = project.documents.find((doc) => doc.title === "First")!;
    expect(first.content).toContain("Alpha text.");
    expect(first.content).not.toContain("<h1");
  });

  it("can make every file a chapter instead", () => {
    counter = 0;
    const { project, report } = buildMarkdownProject(files, plan("files"), { createId });
    expect(project.chapters.map((chapter) => chapter.title)).toEqual(["First", "Second", "Other draft"]);
    expect(report.scenes).toBe(3);
  });

  it("builds wiki pages and a folder tree and skips hidden folders", () => {
    counter = 0;
    const { project } = buildMarkdownProject(files, plan("folders"), { createId });
    const wiki = project.documents.filter((doc) => doc.space === "Wiki");
    expect(wiki.map((doc) => doc.title)).toEqual(["Anna", "CHR b"]);
    expect(project.researchFolders!.map((folder) => folder.title)).toEqual(["Chars", "Sub"]);
    expect(project.researchFolders![1].parentId).toBe(project.researchFolders![0].id);
    expect(wiki[1].folderId).toBe(project.researchFolders![1].id);
    expect(project.documents.some((doc) => doc.title.toLowerCase().includes("hidden"))).toBe(false);
  });

  it("turns wikilinks into the target's title or the alias and counts them", () => {
    counter = 0;
    const { project, report } = buildMarkdownProject(files, plan("folders"), { createId });
    const second = project.documents.find((doc) => doc.title === "Second")!;
    expect(second.content).toContain("Anna");
    expect(second.content).not.toContain("[[");
    const anna = project.documents.find((doc) => doc.title === "Anna")!;
    expect(anna.content).toContain("someone");
    expect(anna.content).toContain("missing");
    expect(report.linksResolved).toBe(1);
    expect(report.linksUnresolved).toBe(2);
  });

  it("sanitises HTML coming from the Markdown", () => {
    counter = 0;
    const { project } = buildMarkdownProject(
      [file("MS/a.md", "# T\n\n<script>alert(1)</script><img src=x onerror=alert(1)>text")],
      { roles: { MS: "manuscript" }, chapterMode: "files" },
      { createId }
    );
    expect(project.documents[0].content).not.toMatch(/<script|onerror/i);
  });

  it("always yields a usable project, even with nothing to import", () => {
    counter = 0;
    const { project } = buildMarkdownProject([], { roles: {}, chapterMode: "folders" }, { createId });
    expect(project.chapters).toHaveLength(1);
    expect(project.documents).toHaveLength(1);
  });
});
