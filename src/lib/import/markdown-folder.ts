import { defaultPublishOptions } from "$lib/publish/types";
import type { BinderFolder, ChapterData, DocumentData } from "$lib/publish/types";
import { markdownToHtml } from "$lib/publish/markdown";
import { sanitizeHtml } from "$lib/sanitize";
import type { ProjectData } from "$lib/storage/types";

/** A Markdown file read from a folder. `path` is relative to the picked folder and uses `/`. */
export type MarkdownFile = { path: string; text: string };

export type FolderRole = "manuscript" | "wiki" | "skip";
/** "folders": every folder is a chapter and every file a scene. "files": every file is a chapter. */
export type ChapterMode = "folders" | "files";

export type MarkdownImportPlan = {
  /** Role per folder path (`12_MS` or `12_MS/draft`); the most specific folder wins, unlisted folders are skipped. */
  roles: Record<string, FolderRole>;
  chapterMode: ChapterMode;
};

/** A folder offered in the import dialog: a top-level folder, or one of its subfolders when it has several. */
export type ImportFolder = { path: string; name: string; depth: number; files: number; suggested: FolderRole };

export type MarkdownImportReport = {
  chapters: number;
  scenes: number;
  wikiPages: number;
  wikiFolders: number;
  linksResolved: number;
  linksUnresolved: number;
};

export type MarkdownImportResult = { project: ProjectData; report: MarkdownImportReport };

export const MAX_MARKDOWN_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_MARKDOWN_FILES = 5000;
/** Files directly inside the picked folder are grouped under this name. */
export const ROOT_FOLDER = "(loose files)";

const MANUSCRIPT_NAME = /(manuscript|manuskript|draft|entwurf|chapters?|kapitel|text|book|buch|roman)/i;

/** True for `.md` / `.markdown` files outside hidden or archive-style folders (`.obsidian`, `_archiv`). */
export function isImportableMarkdownPath(path: string): boolean {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  if (!/\.(md|markdown)$/i.test(name)) return false;
  return !parts.some((part) => part.startsWith(".") || part.startsWith("_"));
}

function topFolderOf(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[0] : ROOT_FOLDER;
}

export function suggestRole(folderName: string): FolderRole {
  return MANUSCRIPT_NAME.test(folderName) ? "manuscript" : "wiki";
}

/** The role of a file: the role of its most specific folder that has one. Loose files use `ROOT_FOLDER`. */
export function roleOf(path: string, roles: Record<string, FolderRole>): FolderRole {
  const parts = path.split("/");
  if (parts.length === 1) return roles[ROOT_FOLDER] ?? "skip";
  for (let length = parts.length - 1; length >= 1; length -= 1) {
    const role = roles[parts.slice(0, length).join("/")];
    if (role) return role;
  }
  return "skip";
}

/**
 * The folders to ask about: every top-level folder, plus its direct subfolders
 * when there are several (a manuscript folder holding several drafts, say). Of
 * several drafts only the last one is suggested as the manuscript, and the loose
 * files next to them as wiki pages.
 */
export function listImportFolders(files: readonly MarkdownFile[]): ImportFolder[] {
  const top = new Map<string, Map<string, number>>();
  for (const file of files) {
    if (!isImportableMarkdownPath(file.path)) continue;
    const parts = file.path.split("/");
    const name = topFolderOf(file.path);
    const subs = top.get(name) ?? new Map<string, number>();
    const sub = parts.length > 2 ? parts[1] : "";
    subs.set(sub, (subs.get(sub) ?? 0) + 1);
    top.set(name, subs);
  }
  const folders: ImportFolder[] = [];
  let manuscriptSeen = false;
  for (const name of [...top.keys()].sort(naturalCompare)) {
    const subs = top.get(name)!;
    const total = [...subs.values()].reduce((sum, count) => sum + count, 0);
    let suggested = suggestRole(name);
    if (suggested === "manuscript") {
      if (manuscriptSeen) suggested = "wiki";
      manuscriptSeen = true;
    }
    const named = [...subs.keys()].filter(Boolean).sort(naturalCompare);
    const hasDrafts = name !== ROOT_FOLDER && named.length >= 2;
    // With several drafts, loose files next to them are usually an index or notes, not manuscript.
    folders.push({ path: name, name, depth: 0, files: total, suggested: hasDrafts && suggested === "manuscript" ? "wiki" : suggested });
    if (!hasDrafts) continue;
    named.forEach((sub, index) => {
      const last = index === named.length - 1;
      folders.push({
        path: `${name}/${sub}`,
        name: sub,
        depth: 1,
        files: subs.get(sub) ?? 0,
        suggested: suggested === "manuscript" && !last ? "skip" : suggested
      });
    });
  }
  return folders;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Reads the YAML header of a Markdown file. Only what notes apps commonly write
 * is understood: `key: value`, block lists (`- item`) and inline lists (`[a, b]`).
 */
export function parseFrontmatter(text: string): { data: Record<string, string | string[]>; body: string } {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized };
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: normalized };
  const header = normalized.slice(4, end);
  const rest = normalized.slice(end + 4);
  const body = rest.startsWith("\n") ? rest.slice(1) : rest;
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of header.split("\n")) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const current = data[listKey];
      data[listKey] = [...(Array.isArray(current) ? current : []), unquote(item[1])];
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value === "") {
      listKey = key;
      data[key] = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      listKey = null;
      data[key] = value.slice(1, -1).split(",").map(unquote).filter(Boolean);
    } else {
      listKey = null;
      data[key] = unquote(value);
    }
  }
  return { data, body };
}

/** "03_CHARACTERS" -> "Characters", "entwurf_v4_master" -> "Entwurf v4 master". */
export function humanizeName(name: string): string {
  const cleaned = name
    .replace(/\.(md|markdown)$/i, "")
    .replace(/^\d+[_\-.\s]+/, "")
    .replace(/[_]+/g, " ")
    .trim();
  if (!cleaned) return name;
  return cleaned === cleaned.toUpperCase() ? cleaned.charAt(0) + cleaned.slice(1).toLowerCase() : cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function stripExtension(name: string): string {
  return name.replace(/\.(md|markdown)$/i, "");
}

type Parsed = {
  file: MarkdownFile;
  title: string;
  body: string;
  position: number | null;
  stem: string;
};

function firstHeading(body: string): { title: string; rest: string } | null {
  const match = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(body);
  return match ? { title: match[1].trim(), rest: body.slice(match[0].length) } : null;
}

function parseFile(file: MarkdownFile): Parsed {
  const { data, body } = parseFrontmatter(file.text);
  const fileName = file.path.split("/").pop() ?? file.path;
  const heading = firstHeading(body);
  const frontTitle = typeof data.title === "string" ? data.title.trim() : "";
  const title = frontTitle || heading?.title || humanizeName(fileName);
  // A leading heading that repeats the title would show the title twice, because scenes have their own title field.
  const text = heading && heading.title === title ? heading.rest : body;
  const position = typeof data.position === "string" && data.position.trim() !== "" && Number.isFinite(Number(data.position))
    ? Number(data.position)
    : null;
  return { file, title, body: text, position, stem: stripExtension(fileName) };
}

function sortParsed(items: Parsed[]): Parsed[] {
  const allPositioned = items.length > 0 && items.every((item) => item.position !== null);
  return [...items].sort((a, b) => allPositioned
    ? (a.position as number) - (b.position as number) || naturalCompare(a.file.path, b.file.path)
    : naturalCompare(a.file.path, b.file.path));
}

type LinkStats = { resolved: number; unresolved: number };

/** `[[stem]]` and `[[stem|text]]` become plain text, using the target's title so wiki mentions can find it. */
function resolveWikilinks(markdown: string, titles: Map<string, string>, stats: LinkStats): string {
  return markdown.replace(/(!?)\[\[([^\]\n]+)\]\]/g, (whole, bang: string, inner: string) => {
    if (bang) return whole;
    const [targetPart, aliasPart] = inner.split("|");
    const target = targetPart.split("#")[0].trim();
    const known = titles.get(target.toLowerCase());
    if (known) stats.resolved += 1;
    else stats.unresolved += 1;
    return (aliasPart?.trim()) || known || target;
  });
}

function toHtml(markdown: string): string {
  const html = sanitizeHtml(markdownToHtml(markdown));
  return html.trim() ? html : "<p><br></p>";
}

/**
 * ProseCraft's localStorage fallback holds roughly four million characters in
 * total, and writes about three copies of the active project. This is the
 * estimated stored size above which an import is likely to fail there. It does
 * not apply to the IndexedDB backend, which has no comparable limit.
 */
export const STORAGE_WARN_CHARS = 3_000_000;

/** Rough stored size of the files that would be imported: three copies plus some HTML and bookkeeping overhead. */
export function estimateStoredChars(files: readonly MarkdownFile[], roles: Record<string, FolderRole>): number {
  let chars = 0;
  for (const file of files) {
    if (isImportableMarkdownPath(file.path) && roleOf(file.path, roles) !== "skip") chars += file.text.length;
  }
  return Math.round(chars * 3 * 1.2);
}

export type BuildMarkdownProjectOptions = { createId?: () => string; name?: string };

const defaultId = () => crypto.randomUUID();

/** Builds a project from Markdown files, following the plan chosen in the import dialog. */
export function buildMarkdownProject(
  files: readonly MarkdownFile[],
  plan: MarkdownImportPlan,
  options: BuildMarkdownProjectOptions = {}
): MarkdownImportResult {
  const createId = options.createId ?? defaultId;
  const usable = files
    .filter((file) => isImportableMarkdownPath(file.path))
    .filter((file) => roleOf(file.path, plan.roles) !== "skip");

  const parsed = usable.map(parseFile);
  const titles = new Map<string, string>();
  for (const item of parsed) titles.set(item.stem.toLowerCase(), item.title);
  const linkStats: LinkStats = { resolved: 0, unresolved: 0 };

  const chapters: ChapterData[] = [];
  const documents: DocumentData[] = [];
  const folders: BinderFolder[] = [];

  // Manuscript: group by chapter.
  const manuscript = parsed.filter((item) => roleOf(item.file.path, plan.roles) === "manuscript");
  if (plan.chapterMode === "files") {
    for (const item of sortParsed(manuscript)) {
      const chapterId = createId();
      chapters.push({ id: chapterId, title: item.title, expanded: true, summary: "" });
      documents.push({
        id: createId(),
        title: item.title,
        content: toHtml(resolveWikilinks(item.body, titles, linkStats)),
        chapterId
      });
    }
  } else {
    const groups = new Map<string, Parsed[]>();
    for (const item of manuscript) {
      const parts = item.file.path.split("/");
      const key = parts.length > 2 ? parts.slice(0, -1).join("/") : parts[0];
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const key of [...groups.keys()].sort(naturalCompare)) {
      const chapterId = createId();
      const last = key.split("/").pop() ?? key;
      chapters.push({ id: chapterId, title: humanizeName(last), expanded: true, summary: "" });
      for (const item of sortParsed(groups.get(key) ?? [])) {
        documents.push({
          id: createId(),
          title: item.title,
          content: toHtml(resolveWikilinks(item.body, titles, linkStats)),
          chapterId
        });
      }
    }
  }

  // Wiki: folders mirror the folder tree.
  const folderIds = new Map<string, string>();
  const folderFor = (path: string): string | null => {
    if (!path) return null;
    const existing = folderIds.get(path);
    if (existing) return existing;
    const parts = path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const folder: BinderFolder = {
      id: createId(),
      title: humanizeName(parts[parts.length - 1]).slice(0, 60),
      parentId: folderFor(parentPath)
    };
    folders.push(folder);
    folderIds.set(path, folder.id);
    return folder.id;
  };
  const wiki = parsed
    .filter((item) => roleOf(item.file.path, plan.roles) === "wiki")
    .sort((a, b) => naturalCompare(a.file.path, b.file.path));
  for (const item of wiki) {
    const parts = item.file.path.split("/");
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    documents.push({
      id: createId(),
      title: item.title,
      content: toHtml(resolveWikilinks(item.body, titles, linkStats)),
      space: "Wiki",
      ...(folderPath ? { folderId: folderFor(folderPath) ?? undefined } : {})
    });
  }

  if (chapters.length === 0) {
    const chapterId = createId();
    chapters.push({ id: chapterId, title: "Chapter 1", expanded: true, summary: "" });
    documents.unshift({ id: createId(), title: "Scene 1", content: "<p><br></p>", chapterId });
  }
  const firstScene = documents.find((doc) => doc.chapterId);

  const project: ProjectData = {
    id: createId(),
    name: (options.name ?? "").trim().slice(0, 100) || "Imported Markdown",
    author: "",
    documents,
    chapters,
    activeDocumentId: firstScene?.id ?? documents[0]?.id ?? "",
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    storyboardCards: [],
    storyboardRows: [{ id: createId(), title: "Timeline" }],
    timelineNodes: [],
    noteFolders: [],
    researchFolderName: "",
    researchFolders: folders,
    researchItems: [],
    publishOptions: defaultPublishOptions()
  };

  return {
    project,
    report: {
      chapters: chapters.length,
      scenes: documents.filter((doc) => doc.chapterId).length,
      wikiPages: documents.filter((doc) => doc.space === "Wiki").length,
      wikiFolders: folders.length,
      linksResolved: linkStats.resolved,
      linksUnresolved: linkStats.unresolved
    }
  };
}
