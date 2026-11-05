import { unzipSync } from "fflate";

import { hasVisibleText, htmlToPlainText } from "$lib/publish/content";
import {
  defaultPublishOptions,
  type ChapterData,
  type DocumentData,
  type ResearchFolder
} from "$lib/publish/types";
import { sanitizeHtml } from "$lib/sanitize";
import type { ProjectData } from "$lib/storage/types";

import { rtfToHtml } from "./rtf";

/** Files of one Scrivener project, keyed by the relative paths they were picked with. */
export type ScrivenerFiles = Map<string, Uint8Array>;

export type ScrivenerFileEntry = { path: string; bytes: Uint8Array };

export type ScrivenerImportLayout = "docs" | "data";

export type ScrivenerImportReport = {
  chapters: number;
  scenes: number;
  wikiPages: number;
  wikiFolders: number;
  flattenedFolders: number;
  skippedFiles: number;
  itemsWithNotes: number;
  missingFiles: number;
  layout: ScrivenerImportLayout;
};

export type BuildScrivenerProjectOptions = {
  createId?: () => string;
  /** Name of the .scriv folder, used when the files do not carry a root folder. */
  projectName?: string;
};

export type BuildScrivenerProjectResult = {
  project: ProjectData;
  report: ScrivenerImportReport;
};

const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_SUMMARY_LENGTH = 4_000;
const MAX_FOLDER_TITLE_LENGTH = 60;
const EMPTY_CONTENT = "<p><br></p>";

type ChapterDraft = {
  chapter: ChapterData;
  scenes: DocumentData[];
};

type ProjectFiles = {
  files: ScrivenerFiles;
  rootName?: string;
};

function defaultId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value;
}

function errorMessage(message: string): Error {
  return new Error(`Scrivener import: ${message}`);
}

function normalizePath(rawPath: string): string {
  const path = rawPath.replace(/\\/g, "/");
  if (!path) return "";
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw errorMessage("the project contains an absolute path.");
  }

  const segments = path.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw errorMessage("the project contains an unsafe path.");
  }
  return segments.join("/");
}

function isIgnoredPath(path: string): boolean {
  return (
    !path ||
    path.startsWith("__MACOSX/") ||
    path === ".DS_Store" ||
    path.endsWith("/.DS_Store")
  );
}

function assembleProjectFiles(entries: ScrivenerFileEntry[]): ProjectFiles {
  const projectEntry = [...entries]
    .filter((entry) => entry.path === "project.scrivx" || entry.path.endsWith("/project.scrivx"))
    .sort((left, right) => left.path.length - right.path.length)[0];

  const root = projectEntry
    ? projectEntry.path.slice(0, projectEntry.path.length - "project.scrivx".length)
    : "";

  const files: ScrivenerFiles = new Map();
  for (const entry of entries) {
    let path = entry.path;
    if (root) {
      if (!path.startsWith(root)) continue;
      path = path.slice(root.length);
    }
    if (!path) continue;
    files.set(path, entry.bytes);
  }

  const rootName = root
    ? collapse(root.split("/").filter(Boolean).slice(-1)[0]?.replace(/\.scriv$/i, ""))
    : undefined;

  return { files, rootName: rootName || undefined };
}

/** Builds the file map for a folder picker, where every file carries a relative path. */
export function scrivenerFilesFromEntries(entries: ScrivenerFileEntry[]): ScrivenerFiles {
  if (entries.length > MAX_ENTRIES) {
    throw errorMessage("the project contains too many files.");
  }

  const prepared: ScrivenerFileEntry[] = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const path = normalizePath(entry.path);
    if (isIgnoredPath(path)) continue;
    totalBytes += entry.bytes.byteLength;
    if (totalBytes > MAX_UNPACKED_BYTES) {
      throw errorMessage("the project is larger than 200 MB.");
    }
    prepared.push({ path, bytes: entry.bytes });
  }

  return new Map(prepared.map((entry) => [entry.path, entry.bytes]));
}

/** Reads a zipped .scriv folder (or a Scrivener backup zip) into a file map. */
export function scrivenerFilesFromZip(bytes: Uint8Array): ScrivenerFiles {
  let entryCount = 0;
  let totalBytes = 0;
  let unzipped: Record<string, Uint8Array>;

  try {
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        const path = normalizePath(file.name);
        if (isIgnoredPath(path)) return false;

        entryCount += 1;
        if (entryCount > MAX_ENTRIES) {
          throw errorMessage("the project contains too many files.");
        }
        totalBytes += file.originalSize;
        if (totalBytes > MAX_UNPACKED_BYTES) {
          throw errorMessage("the project is larger than 200 MB.");
        }
        return true;
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Scrivener import:")) {
      throw error;
    }
    throw errorMessage("this file is not a readable zip archive.");
  }

  return scrivenerFilesFromEntries(
    Object.entries(unzipped).map(([path, fileBytes]) => ({ path, bytes: fileBytes }))
  );
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function parseProjectXml(files: ScrivenerFiles): Document {
  const bytes = files.get("project.scrivx");
  if (!bytes) {
    throw errorMessage("project.scrivx is missing.");
  }

  let document: Document;
  try {
    document = new DOMParser().parseFromString(decodeUtf8(bytes), "application/xml");
  } catch {
    throw errorMessage("project.scrivx is not valid XML.");
  }

  if (document.querySelector("parsererror") || !document.documentElement) {
    throw errorMessage("project.scrivx is not valid XML.");
  }
  return document;
}

function childElements(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === tagName);
}

function firstChild(parent: Element, tagName: string): Element | null {
  return childElements(parent, tagName)[0] ?? null;
}

function textOf(parent: Element, tagName: string): string {
  return collapse(firstChild(parent, tagName)?.textContent);
}

function binderItems(parent: Element): Element[] {
  return childElements(parent, "BinderItem");
}

function childItems(item: Element): Element[] {
  const children = firstChild(item, "Children");
  return children ? binderItems(children) : [];
}

function itemType(item: Element): string {
  return item.getAttribute("Type") ?? "";
}

function itemTitle(item: Element, fallback: string): string {
  return textOf(item, "Title") || fallback;
}

/** Scrivener only writes a content file for documents that were ever edited. */
function hasFileExtension(item: Element): boolean {
  const metadata = firstChild(item, "MetaData");
  return metadata !== null && firstChild(metadata, "FileExtension") !== null;
}

function findFirstItem(items: Element[], type: string): Element | null {
  for (const item of items) {
    if (itemType(item) === type) return item;
    const nested = findFirstItem(childItems(item), type);
    if (nested) return nested;
  }
  return null;
}

function hasDataFiles(files: ScrivenerFiles): boolean {
  for (const path of files.keys()) {
    if (path.startsWith("Files/Data/")) return true;
  }
  return false;
}

function isImportedRtf(path: string): boolean {
  if (/^Files\/Docs\/[^/]+_notes\.rtf$/i.test(path)) return false;
  return (
    /^Files\/Docs\/[^/]+\.rtf$/i.test(path) ||
    /^Files\/Data\/[^/]+\/content\.rtf$/i.test(path)
  );
}

/**
 * Estimates the characters ProseCraft will have to persist for this project.
 * ProseCraft keeps several copies of a project in localStorage, so this is the
 * converted text with the same 3x copy factor and a 20% safety margin used for
 * the import warning. Only relevant for the localStorage fallback; IndexedDB
 * does not have this limit.
 */
export function estimateScrivenerStoredChars(files: ScrivenerFiles): number {
  const entries = [...files.entries()].map(([path, bytes]) => ({ path, bytes }));
  const assembled = assembleProjectFiles(entries).files;
  let characters = 0;

  for (const [path, bytes] of assembled) {
    if (!isImportedRtf(path)) continue;
    characters += htmlToPlainText(rtfToHtml(bytes)).length;
  }

  return Math.ceil(characters * 3 * 1.2);
}

/**
 * Turns Scrivener's binder into a normal ProseCraft project. The importer is
 * intentionally forgiving: one unreadable document must not lose the rest of
 * the project. The file map may hold the contents of the .scriv folder itself
 * or a single wrapping folder that contains it.
 */
export function buildScrivenerProject(
  input: ScrivenerFiles,
  options: BuildScrivenerProjectOptions = {}
): BuildScrivenerProjectResult {
  const createId = options.createId ?? defaultId;
  const { files, rootName } = assembleProjectFiles(
    [...input.entries()].map(([path, bytes]) => ({ path, bytes }))
  );
  const document = parseProjectXml(files);
  const binder = firstChild(document.documentElement, "Binder");
  if (!binder) {
    throw errorMessage("project.scrivx has no Binder.");
  }

  const topLevelItems = binderItems(binder);
  const draft = findFirstItem(topLevelItems, "DraftFolder");
  const research = findFirstItem(topLevelItems, "ResearchFolder");

  const report: ScrivenerImportReport = {
    chapters: 0,
    scenes: 0,
    wikiPages: 0,
    wikiFolders: 0,
    flattenedFolders: 0,
    skippedFiles: 0,
    itemsWithNotes: 0,
    missingFiles: 0,
    layout: hasDataFiles(files) ? "data" : "docs"
  };

  function contentPaths(item: Element): string[] {
    const paths: string[] = [];
    const uuid = item.getAttribute("UUID");
    const id = item.getAttribute("ID");
    if (uuid) paths.push(`Files/Data/${uuid}/content.rtf`);
    if (id) paths.push(`Files/Docs/${id}.rtf`);
    return paths;
  }

  function optionalFile(path: string): Uint8Array | null {
    return files.get(path) ?? null;
  }

  function readContent(item: Element, required: boolean): string | null {
    const path = contentPaths(item).find((candidate) => files.has(candidate));
    if (!path) {
      if (required && hasFileExtension(item)) report.missingFiles += 1;
      return null;
    }

    const bytes = optionalFile(path);
    if (!bytes) {
      if (required) report.missingFiles += 1;
      return null;
    }

    try {
      return sanitizeHtml(rtfToHtml(bytes));
    } catch {
      if (required) report.missingFiles += 1;
      return null;
    }
  }

  function hasContent(html: string | null): html is string {
    return html !== null && hasVisibleText(htmlToPlainText(html));
  }

  function countNotes(item: Element): void {
    const uuid = item.getAttribute("UUID");
    const id = item.getAttribute("ID");
    if (uuid && files.has(`Files/Data/${uuid}/notes.rtf`)) {
      report.itemsWithNotes += 1;
      return;
    }
    if (id && files.has(`Files/Docs/${id}_notes.rtf`)) {
      report.itemsWithNotes += 1;
    }
  }

  function synopsisOf(item: Element): string {
    const uuid = item.getAttribute("UUID");
    const id = item.getAttribute("ID");
    const paths = [
      ...(uuid ? [`Files/Data/${uuid}/synopsis.txt`] : []),
      ...(id ? [`Files/Docs/${id}_synopsis.txt`] : [])
    ];
    for (const path of paths) {
      const bytes = files.get(path);
      if (bytes) return truncate(collapse(decodeUtf8(bytes)), MAX_SUMMARY_LENGTH);
    }
    return "";
  }

  const drafts: ChapterDraft[] = [];

  function createChapter(title: string, summary = ""): ChapterDraft {
    const draft: ChapterDraft = {
      chapter: {
        id: createId(),
        title: collapse(title) || "Untitled chapter",
        expanded: true,
        summary: truncate(collapse(summary), MAX_SUMMARY_LENGTH)
      },
      scenes: []
    };
    drafts.push(draft);
    return draft;
  }

  function addScene(draft: ChapterDraft, title: string, content: string): void {
    draft.scenes.push({
      id: createId(),
      title: collapse(title) || "Untitled scene",
      content,
      chapterId: draft.chapter.id
    });
  }

  const draftTitle = draft ? itemTitle(draft, "Draft") : "Draft";
  let defaultChapter: ChapterDraft | null = null;

  function getDefaultChapter(): ChapterDraft {
    if (!defaultChapter) {
      defaultChapter = createChapter(draftTitle, draft ? synopsisOf(draft) : "");
    }
    return defaultChapter;
  }

  if (draft) {
    countNotes(draft);
    const ownContent = readContent(draft, false);
    if (hasContent(ownContent)) {
      addScene(getDefaultChapter(), draftTitle, ownContent);
    }
    getDefaultChapter();

    function walkDraft(items: Element[], owner: ChapterDraft, direct: boolean): void {
      for (const item of items) {
        const type = itemType(item);
        if (type === "TrashFolder") continue;

        countNotes(item);

        if (type === "Folder") {
          if (!direct) report.flattenedFolders += 1;
          const title = itemTitle(item, "Untitled chapter");
          const chapter = createChapter(title, synopsisOf(item));
          const ownContent = readContent(item, false);
          if (hasContent(ownContent)) {
            addScene(chapter, title, ownContent);
          }
          walkDraft(childItems(item), chapter, false);
          continue;
        }

        if (type === "Text") {
          const title = itemTitle(item, "Untitled scene");
          const content = readContent(item, true) ?? EMPTY_CONTENT;
          addScene(owner, title, content);
          walkDraft(childItems(item), owner, false);
          continue;
        }

        report.skippedFiles += 1;
      }
    }

    walkDraft(childItems(draft), getDefaultChapter(), true);
  }

  const chapters = drafts.filter((draftEntry) => draftEntry.scenes.length > 0);
  const manuscriptDocuments = chapters.flatMap((draftEntry) => draftEntry.scenes);

  const researchFolders: ResearchFolder[] = [];
  const wikiDocuments: DocumentData[] = [];

  function walkWiki(items: Element[], parentId: string | null): void {
    for (const item of items) {
      const type = itemType(item);
      if (type === "TrashFolder") continue;

      countNotes(item);

      if (type === "Folder" || type === "ResearchFolder") {
        const folder: ResearchFolder = {
          id: createId(),
          title: truncate(itemTitle(item, "Untitled folder"), MAX_FOLDER_TITLE_LENGTH),
          parentId
        };
        researchFolders.push(folder);
        walkWiki(childItems(item), folder.id);
        continue;
      }

      if (type === "Text") {
        const page: DocumentData = {
          id: createId(),
          title: itemTitle(item, "Untitled page"),
          content: readContent(item, true) ?? EMPTY_CONTENT,
          space: "Wiki"
        };
        if (parentId) page.folderId = parentId;
        wikiDocuments.push(page);
        walkWiki(childItems(item), parentId);
        continue;
      }

      report.skippedFiles += 1;
    }
  }

  // Every top-level item outside the draft and the trash is wiki material. The
  // first research folder keeps its children at the root, later ones become
  // regular wiki folders.
  for (const item of topLevelItems) {
    const type = itemType(item);
    if (item === draft || type === "DraftFolder" || type === "TrashFolder") continue;

    if (item === research) {
      countNotes(item);
      walkWiki(childItems(item), null);
      continue;
    }

    walkWiki([item], null);
  }

  const fallbackChapter: ChapterData = {
    id: createId(),
    title: "Chapter 1",
    expanded: true,
    summary: ""
  };
  const fallbackScene: DocumentData = {
    id: createId(),
    title: "Scene 1",
    content: EMPTY_CONTENT,
    chapterId: fallbackChapter.id
  };

  const finalChapters = chapters.length > 0 ? chapters.map((entry) => entry.chapter) : [fallbackChapter];
  const finalManuscriptDocuments =
    manuscriptDocuments.length > 0 ? manuscriptDocuments : [fallbackScene];

  report.chapters = chapters.length;
  report.scenes = manuscriptDocuments.length;
  report.wikiPages = wikiDocuments.length;
  report.wikiFolders = researchFolders.length;

  const publishOptions = defaultPublishOptions();

  const project: ProjectData = {
    id: createId(),
    name:
      collapse(options.projectName).replace(/\.scriv$/i, "") ||
      rootName ||
      "Imported Scrivener project",
    author: "",
    documents: [...finalManuscriptDocuments, ...wikiDocuments],
    chapters: finalChapters,
    activeDocumentId: finalManuscriptDocuments[0]?.id ?? "",
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    storyboardCards: [],
    storyboardRows: [{ id: createId(), title: "Timeline" }],
    timelineNodes: [],
    noteFolders: [],
    researchFolderName: "",
    researchFolders,
    researchItems: [],
    publishOptions
  };

  return { project, report };
}
