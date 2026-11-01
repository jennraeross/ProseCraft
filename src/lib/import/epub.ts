import { strFromU8, unzipSync } from "fflate";
import { hasVisibleText, htmlToPlainText } from "$lib/publish/content";
import {
  defaultPublishOptions,
  type ChapterData,
  type DocumentData
} from "$lib/publish/types";
import { MAX_EMBEDDED_IMAGE_BYTES, sanitizeHtml } from "$lib/sanitize";
import type { ProjectData } from "$lib/storage/types";

/**
 * EPUB import.
 *
 * The parser deliberately uses only `fflate` (already a dependency for the
 * exporter) plus the platform `DOMParser`. It never trusts archive paths, never
 * decompresses more than a fixed budget, and runs every imported scene through
 * the editor's sanitizer before returning it.
 */

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_SPINE_ITEMS = 2000;
const MAX_CHAPTER_TITLE_LENGTH = 200;

const CONTAINER_FILE = "META-INF/container.xml";
const ENCRYPTION_FILE = "META-INF/encryption.xml";
const RIGHTS_FILE = "META-INF/rights.xml";
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

/** Guide references that point at page furniture rather than book content. */
const SKIPPED_GUIDE_TYPES = new Set([
  "cover",
  "title-page",
  "titlepage",
  "copyright-page",
  "copyright",
  "toc",
  "contents",
  "license",
  "colophon"
]);

/** File stems that are almost always page furniture. */
const SKIPPED_FILE_STEMS = /^(?:cover|title[-_ ]?page|half[-_ ]?title|copyright|toc|contents|nav|colophon|licen[cs]e|pg[-_ ]?(?:header|footer))$/i;

/** TOC labels that name page furniture rather than story prose. */
const SKIPPED_TOC_LABELS = /^(?:cover|title[- ]?page|half[- ]?title|copyright(?:[- ]page)?|table of contents|contents|toc|nav(?:igation)?|colophon|about this ebook|gutenberg licen[cs]e|(?:the )?(?:full )?project gutenberg(?:™|\(tm\))?(?: ebook)? licen[cs]e)$/i;

const HTML_MEDIA_TYPES = new Set(["application/xhtml+xml", "text/html", "application/html"]);

export type EpubScene = {
  title: string;
  /** Sanitized editor HTML. */
  content: string;
};

export type EpubChapter = {
  title: string;
  scenes: EpubScene[];
};

export type EpubManuscript = {
  title: string;
  author: string;
  chapters: EpubChapter[];
  /** Embedded data URL for the book cover, or empty when none is usable. */
  coverImage: string;
  /** Images that could not be embedded (unsupported format, too large, missing). */
  skippedImages: number;
};

export type ParseEpubOptions = {
  /** Used when the package document has no title (typically the file name). */
  fallbackTitle?: string;
  onProgress?: (message: string) => void;
};

export type BuildEpubProjectOptions = {
  createId?: () => string;
};

type ManifestItem = {
  id: string;
  href: string;
  path: string;
  mediaType: string;
  properties: string;
};

type SpineReference = {
  id: string;
  linear: boolean;
};

type TocEntry = {
  label: string;
  path: string;
  fragment: string;
};

type Archive = Map<string, Uint8Array>;

type ParsedPackage = {
  title: string;
  author: string;
  manifest: ManifestItem[];
  spine: SpineReference[];
  navPath: string;
  ncxPath: string;
  coverPath: string;
  guidePaths: Set<string>;
};

type ContentDocument = {
  item: ManifestItem;
  doc: Document;
  /** Top-level content blocks, with structural wrappers flattened. */
  blocks: Element[];
};

type GlobalBlock = {
  block: Element;
  documentIndex: number;
};

type ElementRange = {
  label: string;
  blocks: GlobalBlock[];
};

type ImageStats = {
  skipped: number;
};

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Normalizes an archive path and rejects anything that escapes the archive. */
function normalizeArchivePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (result.length === 0) throw new Error("The EPUB contains an unsafe file path.");
      result.pop();
      continue;
    }
    result.push(part);
  }
  return result.join("/");
}

function dirName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? path : path.slice(slash + 1);
}

/** Resolves an href relative to a directory inside the archive. */
function resolveHref(baseDir: string, href: string): { path: string; fragment: string } | null {
  const trimmed = href.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) return null;
  const hash = trimmed.indexOf("#");
  const fragment = hash >= 0 ? decodePart(trimmed.slice(hash + 1)) : "";
  const rawPath = hash >= 0 ? trimmed.slice(0, hash) : trimmed;
  const query = rawPath.indexOf("?");
  const cleanPath = (query >= 0 ? rawPath.slice(0, query) : rawPath).trim();
  if (!cleanPath) return null;
  const decoded = cleanPath.split("/").map(decodePart).join("/");
  try {
    return {
      path: normalizeArchivePath(baseDir ? `${baseDir}/${decoded}` : decoded),
      fragment
    };
  } catch {
    // A reference that escapes the archive is treated as missing.
    return null;
  }
}

function readArchive(
  data: Uint8Array,
  wanted: (path: string) => boolean,
  budget: { remaining: number }
): Archive {
  let tooLarge = false;
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(data, {
      filter: (file) => {
        let path: string;
        try {
          path = normalizeArchivePath(file.name);
        } catch {
          // Unsafe entries are never needed: everything we read is resolved
          // through the package document, and those paths are normalized too.
          return false;
        }
        if (!wanted(path)) return false;
        if (file.originalSize > budget.remaining) {
          tooLarge = true;
          return false;
        }
        budget.remaining -= file.originalSize;
        return true;
      }
    });
  } catch {
    throw new Error("That file is not a valid EPUB archive.");
  }
  if (tooLarge) throw new Error("This EPUB is too large to import (200 MB extracted limit).");
  const archive: Archive = new Map();
  for (const [name, bytes] of Object.entries(extracted)) {
    archive.set(normalizeArchivePath(name), bytes);
  }
  return archive;
}

function parseXml(text: string, what: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`The EPUB's ${what} is not valid XML.`);
  }
  return doc;
}

/**
 * Parses a content document. XHTML is valid XML, and the XML parser handles
 * self-closing tags like `<a id="x"/>` correctly; the HTML fallback keeps
 * books with slightly malformed markup readable.
 */
function parseContentDocument(text: string): Document {
  const xml = new DOMParser().parseFromString(text, "application/xhtml+xml");
  if (!xml.querySelector("parsererror") && xml.body) return xml;
  return new DOMParser().parseFromString(text, "text/html");
}

/** Namespace-agnostic descendant lookup (`dc:title`, `item`, `navPoint`, …). */
function elements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagName("*"))
    .filter((element) => element.localName === name);
}

function childElements(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((element) => element.localName === name);
}

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function metadataValue(doc: Document, name: string): string {
  const element = elements(doc, name).find((candidate) => collapse(candidate.textContent));
  return collapse(element?.textContent);
}

function isImageItem(item: ManifestItem): boolean {
  return item.mediaType.startsWith("image/") || IMAGE_EXTENSIONS.test(item.path);
}

/**
 * Locates the cover image: first the EPUB3 `cover-image` property, then the
 * EPUB2 `<meta name="cover">` id reference, then a conservative file-name hint.
 */
function findCoverPath(opfDoc: Document, manifest: ManifestItem[]): string {
  const byProperty = manifest.find((item) =>
    item.properties.split(/\s+/).includes("cover-image") && isImageItem(item)
  );
  if (byProperty) return byProperty.path;

  const coverMeta = elements(opfDoc, "meta").find(
    (element) => (element.getAttribute("name") ?? "").toLowerCase() === "cover"
  );
  const coverId = coverMeta?.getAttribute("content") ?? "";
  if (coverId) {
    const byId = manifest.find((item) => item.id === coverId && isImageItem(item));
    if (byId) return byId.path;
  }

  const byName = manifest.find((item) =>
    isImageItem(item)
    && /(?:^|[-_\s])cover(?:[-_\s]|$)/i.test(baseName(item.path).replace(/\.[^.]+$/, ""))
  );
  return byName?.path ?? "";
}

function readPackage(opfDoc: Document, opfPath: string): ParsedPackage {
  const opfDir = dirName(opfPath);
  const manifest: ManifestItem[] = [];
  for (const item of elements(opfDoc, "item")) {
    const href = item.getAttribute("href") ?? "";
    const resolved = resolveHref(opfDir, href);
    if (!resolved) continue;
    manifest.push({
      id: item.getAttribute("id") ?? "",
      href,
      path: resolved.path,
      mediaType: (item.getAttribute("media-type") ?? "").toLowerCase(),
      properties: (item.getAttribute("properties") ?? "").toLowerCase()
    });
  }

  const spineElement = elements(opfDoc, "spine")[0];
  const spine: SpineReference[] = spineElement
    ? childElements(spineElement, "itemref").map((itemref) => ({
      id: itemref.getAttribute("idref") ?? "",
      linear: (itemref.getAttribute("linear") ?? "yes").toLowerCase() !== "no"
    }))
    : [];

  const navItem = manifest.find((item) => item.properties.split(/\s+/).includes("nav"));
  const tocId = spineElement?.getAttribute("toc") ?? "";
  const ncxItem = manifest.find((item) => item.id === tocId)
    ?? manifest.find((item) => item.mediaType === "application/x-dtbncx+xml");

  const guideElement = elements(opfDoc, "guide")[0];
  const guidePaths = new Set<string>();
  if (guideElement) {
    for (const reference of childElements(guideElement, "reference")) {
      const type = (reference.getAttribute("type") ?? "").toLowerCase();
      if (!SKIPPED_GUIDE_TYPES.has(type)) continue;
      const resolved = resolveHref(opfDir, reference.getAttribute("href") ?? "");
      if (resolved) guidePaths.add(resolved.path);
    }
  }

  return {
    title: metadataValue(opfDoc, "title"),
    author: elements(opfDoc, "creator")
      .map((creator) => collapse(creator.textContent))
      .filter(Boolean)
      .join(", "),
    manifest,
    spine,
    navPath: navItem?.path ?? "",
    ncxPath: ncxItem?.path ?? "",
    coverPath: findCoverPath(opfDoc, manifest),
    guidePaths
  };
}

function looksEncrypted(archive: Archive): boolean {
  if (archive.has(RIGHTS_FILE)) return true;
  const encryption = archive.get(ENCRYPTION_FILE);
  if (!encryption) return false;
  try {
    const doc = parseXml(strFromU8(encryption), "encryption file");
    for (const encrypted of elements(doc, "EncryptedData")) {
      const reference = elements(encrypted, "CipherReference")[0];
      const uri = reference?.getAttribute("URI") ?? "";
      // Font obfuscation also uses EncryptedData; only reject content docs.
      if (/\.(xhtml?|html?|opf|ncx)$/i.test(uri)) return true;
    }
  } catch {
    // A malformed encryption file should not block an otherwise readable book.
  }
  return false;
}

function shouldSkipDocument(
  item: ManifestItem,
  packageInfo: ParsedPackage
): boolean {
  if (!HTML_MEDIA_TYPES.has(item.mediaType) && !/\.(xhtml?|html?)$/i.test(item.path)) {
    return true;
  }
  if (item.properties.split(/\s+/).includes("cover-image")) return true;
  if (item.path === packageInfo.navPath || item.path === packageInfo.ncxPath) return true;
  if (packageInfo.guidePaths.has(item.path)) return true;
  const stem = baseName(item.path).replace(/\.[^.]+$/, "");
  return SKIPPED_FILE_STEMS.test(stem);
}

/** Descends through single structural wrappers so blocks are real content. */
function contentContainer(doc: Document): Element {
  let container: Element = doc.body ?? doc.documentElement;
  for (;;) {
    const children = Array.from(container.children);
    if (children.length !== 1) return container;
    const only = children[0];
    if (!["div", "section", "article", "main"].includes(only.localName)) return container;
    container = only;
  }
}

function collectBlocks(doc: Document): Element[] {
  const container = contentContainer(doc);
  const blocks: Element[] = [];

  const visit = (parent: Element) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        if (!text.trim()) continue;
        const paragraph = doc.createElement("p");
        paragraph.textContent = text;
        blocks.push(paragraph);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const element = node as Element;
      // Structural wrappers (typically one `div.chapter` per chapter) are
      // flattened so their headings and paragraphs become real blocks. A
      // wrapper that is itself a scene break is kept intact.
      if (["div", "section", "article", "main"].includes(element.localName)
        && !isSceneBreak(element)) {
        visit(element);
        continue;
      }
      blocks.push(element);
    }
  };

  visit(container);
  return blocks;
}

/**
 * Finds the top-level block a fragment anchor points at. The anchor may be on
 * the block itself, somewhere inside it, or on a wrapper that holds several
 * blocks (some EPUBs put the id on the chapter's containing `div`).
 */
function blockIndexForTarget(target: Element, blocks: Element[]): number {
  const containing = blocks.findIndex((block) => block === target || block.contains(target));
  if (containing >= 0) return containing;
  const wrapped = blocks.findIndex((block) => target.contains(block));
  if (wrapped >= 0) return wrapped;
  return blocks.findIndex((block) =>
    Boolean(target.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
}

function readNavEntries(doc: Document, navPath: string): TocEntry[] {
  const navs = Array.from(doc.querySelectorAll("nav"));
  const nav = navs.find((candidate) => {
    const type = candidate.getAttribute("epub:type") ?? candidate.getAttribute("type") ?? "";
    return type.split(/\s+/).includes("toc");
  }) ?? navs[0] ?? doc.body;
  const entries: TocEntry[] = [];
  if (!nav) return entries;
  for (const anchor of Array.from(nav.querySelectorAll("a[href]"))) {
    const resolved = resolveHref(dirName(navPath), anchor.getAttribute("href") ?? "");
    if (!resolved) continue;
    entries.push({
      label: collapse(anchor.textContent),
      path: resolved.path,
      fragment: resolved.fragment
    });
  }
  return entries;
}

function readNcxEntries(text: string, ncxPath: string): TocEntry[] {
  let doc: Document;
  try {
    doc = parseXml(text, "table of contents");
  } catch {
    return [];
  }
  const entries: TocEntry[] = [];
  for (const point of elements(doc, "navPoint")) {
    const label = collapse(elements(point, "text")[0]?.textContent);
    const content = childElements(point, "content")[0];
    const resolved = resolveHref(dirName(ncxPath), content?.getAttribute("src") ?? "");
    if (!resolved) continue;
    entries.push({ label, path: resolved.path, fragment: resolved.fragment });
  }
  return entries;
}

function isSceneBreak(block: Element): boolean {
  if (block.localName === "hr") return true;
  const className = block.getAttribute("class") ?? "";
  if (/(?:^|\s)(?:scene|section|chapter)[-_ ]?(?:break|separator|divider|ornament)(?:\s|$)/i.test(className)
    || /(?:^|\s)(?:separator|divider|ornament|asterism)(?:\s|$)/i.test(className)) {
    return true;
  }
  if (block.querySelector("img, svg")) return false;
  const text = collapse(block.textContent);
  if (!text) return false;
  return /^(?:\*[\s*]*){3,}$/.test(text)
    || /^(?:#[\s#]*){3,}$/.test(text)
    || /^(?:\s*[•·◆◇❖⁂—–]\s*){1,8}$/.test(text)
    || /^(?:[-_][\s-_]*){3,}$/.test(text);
}

function isMeaningful(html: string): boolean {
  if (hasVisibleText(htmlToPlainText(html))) return true;
  return /<img\b[^>]*src=["']data:image\//i.test(html);
}

/** True when a block carries prose or an illustration rather than a heading. */
function isNarrativeBlock(block: Element): boolean {
  if (/^h[1-6]$/i.test(block.localName) || block.localName === "hr") return false;
  if (block.localName === "img" || block.localName === "svg") return true;
  if (block.querySelector("img, svg")) return true;
  return collapse(block.textContent).length > 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

type EmbeddedImageType = "image/png" | "image/jpeg" | "image/webp";

function imageMediaType(path: string): EmbeddedImageType | "" {
  const extension = /\.([^.]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "";
}

function embeddedImageDataUrl(bytes: Uint8Array | undefined, path: string): string {
  const mediaType = imageMediaType(path);
  if (!mediaType || !bytes || bytes.byteLength === 0
    || bytes.byteLength > MAX_EMBEDDED_IMAGE_BYTES) {
    return "";
  }
  return `data:${mediaType};base64,${bytesToBase64(bytes)}`;
}

function imageDataUrl(
  src: string,
  documentPath: string,
  archive: Archive
): string | null {
  if (!src || src.startsWith("data:")) return null;
  const resolved = resolveHref(dirName(documentPath), src);
  if (!resolved) return null;
  return embeddedImageDataUrl(archive.get(resolved.path), resolved.path) || null;
}

function rewriteImages(block: Element, documentPath: string, archive: Archive, stats: ImageStats): void {
  const ownerDocument = block.ownerDocument;
  const svgElements = block.localName === "svg"
    ? [block]
    : Array.from(block.querySelectorAll("svg"));
  for (const svg of svgElements) {
    const image = svg.querySelector("image");
    const href = image?.getAttribute("href")
      ?? image?.getAttribute("xlink:href")
      ?? "";
    const dataUrl = href ? imageDataUrl(href, documentPath, archive) : null;
    if (dataUrl) {
      const img = ownerDocument.createElement("img");
      img.setAttribute("src", dataUrl);
      img.setAttribute("alt", image?.getAttribute("alt") ?? "");
      svg.replaceWith(img);
    } else {
      svg.remove();
      if (href) stats.skipped += 1;
    }
  }

  const imgElements = block.localName === "img"
    ? [block]
    : Array.from(block.querySelectorAll("img"));
  for (const img of imgElements) {
    const src = img.getAttribute("src") ?? "";
    if (src.startsWith("data:")) {
      // The sanitizer drops anything that is not a supported inline image.
      if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(src)) {
        img.remove();
        stats.skipped += 1;
      }
      continue;
    }
    const dataUrl = imageDataUrl(src, documentPath, archive);
    if (dataUrl) {
      img.setAttribute("src", dataUrl);
    } else {
      img.remove();
      stats.skipped += 1;
    }
  }
}

function cleanTitle(value: string): string {
  return collapse(value).slice(0, MAX_CHAPTER_TITLE_LENGTH);
}

function labelFromPath(path: string): string {
  const stem = baseName(path).replace(/\.[^.]+$/, "");
  if (/^(?:chapter|ch|part|section|sec|scene)[-_ ]?\d+$/i.test(stem)) return "";
  const cleaned = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "";
}

function normalizeHeadingText(value: string): string {
  // XHTML headings often contain `<br/>` where the TOC has a space, so compare
  // with all whitespace removed.
  return collapse(value).toLowerCase().replace(/\s+/g, "");
}

function dropChapterHeading(blocks: GlobalBlock[], label: string): GlobalBlock[] {
  const first = blocks[0]?.block;
  if (!first || !/^h[1-6]$/i.test(first.localName)) return blocks;
  const text = collapse(first.textContent);
  if (!text) return blocks.slice(1);
  return normalizeHeadingText(text) === normalizeHeadingText(label) ? blocks.slice(1) : blocks;
}

function isHeading(block: Element): boolean {
  return /^h[1-6]$/i.test(block.localName) && collapse(block.textContent).length > 0;
}

function buildScenes(
  blocks: GlobalBlock[],
  label: string,
  documents: ContentDocument[],
  archive: Archive,
  stats: ImageStats
): EpubScene[] {
  const groups: GlobalBlock[][] = [];
  let current: GlobalBlock[] = [];
  for (const entry of blocks) {
    if (isSceneBreak(entry.block)) {
      if (current.length > 0) groups.push(current);
      current = [];
      continue;
    }
    current.push(entry);
  }
  if (current.length > 0) groups.push(current);

  const scenes: EpubScene[] = [];
  for (const group of groups) {
    // A title page often appears as a heading plus a byline and no prose.
    if (!group.some((entry) => isNarrativeBlock(entry.block))) continue;
    for (const entry of group) {
      rewriteImages(entry.block, documents[entry.documentIndex].item.path, archive, stats);
    }
    const html = sanitizeHtml(group.map((entry) => entry.block.outerHTML).join("\n")).trim();
    if (!isMeaningful(html)) continue;
    scenes.push({
      title: scenes.length === 0 ? (label || "Scene 1") : `Scene ${scenes.length + 1}`,
      content: html
    });
  }
  return scenes;
}

function chaptersFromToc(
  entries: TocEntry[],
  documents: ContentDocument[],
  globalBlocks: GlobalBlock[],
  documentStart: number[]
): ElementRange[] {
  // A nested TOC often repeats the same anchor for a part and its first chapter;
  // the later (child) entry carries the more useful label, so it overwrites.
  const starts = new Map<number, string>();
  for (const entry of entries) {
    const documentIndex = documents.findIndex((candidate) => candidate.item.path === entry.path);
    if (documentIndex < 0) continue;
    const document = documents[documentIndex];
    if (document.blocks.length === 0) continue;

    let blockIndex = 0;
    if (entry.fragment) {
      const target = document.doc.getElementById(entry.fragment);
      if (!target) continue;
      const found = blockIndexForTarget(target, document.blocks);
      if (found < 0) continue;
      blockIndex = found;
    }

    starts.set(documentStart[documentIndex] + blockIndex, entry.label);
  }

  const ordered = [...starts.entries()].sort(([a], [b]) => a - b);
  if (ordered.length === 0) return [];

  const chapters: ElementRange[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const [from, label] = ordered[index];
    const to = index + 1 < ordered.length ? ordered[index + 1][0] : globalBlocks.length;
    if (to <= from) continue;
    // Page furniture gets a TOC entry of its own in many books; drop its whole
    // range instead of letting it merge into the neighbouring chapter.
    if (SKIPPED_TOC_LABELS.test(collapse(label))) continue;
    chapters.push({ label, blocks: globalBlocks.slice(from, to) });
  }
  return chapters;
}

function chaptersFromSpine(
  documents: ContentDocument[],
  globalBlocks: GlobalBlock[],
  documentStart: number[]
): ElementRange[] {
  const chapters: ElementRange[] = [];
  documents.forEach((document, documentIndex) => {
    if (document.blocks.length === 0) return;
    const start = documentStart[documentIndex];
    const blocks = globalBlocks.slice(start, start + document.blocks.length);
    const headingIndex = blocks.findIndex((entry, index) => index < 3 && isHeading(entry.block));
    let label = "";
    if (headingIndex >= 0) {
      label = collapse(blocks[headingIndex].block.textContent);
      blocks.splice(headingIndex, 1);
    }
    if (!label) label = labelFromPath(document.item.path);
    if (blocks.length === 0) return;
    chapters.push({ label, blocks });
  });
  return chapters;
}

/**
 * Reads an EPUB into plain chapters and scenes. Throws a descriptive error for
 * unreadable files, DRM, and archives with no usable content.
 */
export async function parseEpub(
  data: Uint8Array,
  options: ParseEpubOptions = {}
): Promise<EpubManuscript> {
  if (data.byteLength === 0) throw new Error("That file is empty.");
  if (data.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("That EPUB is too large to import (100 MB limit).");
  }
  options.onProgress?.("Reading EPUB…");

  const budget = { remaining: MAX_EXTRACTED_BYTES };
  const containerFiles = readArchive(
    data,
    (path) => path === CONTAINER_FILE || path === ENCRYPTION_FILE || path === RIGHTS_FILE,
    budget
  );
  const containerBytes = containerFiles.get(CONTAINER_FILE);
  if (!containerBytes) throw new Error("The EPUB is missing its container file.");
  if (looksEncrypted(containerFiles)) {
    throw new Error("This EPUB is DRM-protected and can't be imported.");
  }

  const containerDoc = parseXml(strFromU8(containerBytes), "container file");
  const opfPath = elements(containerDoc, "rootfile")
    .map((element) => element.getAttribute("full-path") ?? "")
    .filter(Boolean)
    .map((path) => {
      try {
        return normalizeArchivePath(path);
      } catch {
        return "";
      }
    })
    .find((path) => path.toLowerCase().endsWith(".opf"));
  if (!opfPath) throw new Error("The EPUB is missing its package document.");

  const packageFiles = readArchive(data, (path) => path === opfPath, budget);
  const opfBytes = packageFiles.get(opfPath);
  if (!opfBytes) throw new Error("The EPUB is missing its package document.");
  const opfDoc = parseXml(strFromU8(opfBytes), "package document");
  const packageInfo = readPackage(opfDoc, opfPath);

  const spineItems: ManifestItem[] = [];
  const seen = new Set<string>();
  for (const reference of packageInfo.spine) {
    if (!reference.linear) continue;
    const item = packageInfo.manifest.find((candidate) => candidate.id === reference.id);
    if (!item || seen.has(item.path)) continue;
    seen.add(item.path);
    spineItems.push(item);
  }
  if (spineItems.length === 0) throw new Error("This EPUB doesn't contain any readable chapters.");
  if (spineItems.length > MAX_SPINE_ITEMS) {
    throw new Error("This EPUB has too many documents to import.");
  }

  const wanted = new Set(spineItems.map((item) => item.path));
  if (packageInfo.navPath) wanted.add(packageInfo.navPath);
  if (packageInfo.ncxPath) wanted.add(packageInfo.ncxPath);
  const imagePaths = packageInfo.manifest
    .filter((item) => item.mediaType.startsWith("image/"))
    .map((item) => item.path);
  const contentFiles = readArchive(
    data,
    (path) => wanted.has(path) || imagePaths.includes(path) || IMAGE_EXTENSIONS.test(path),
    budget
  );
  const coverImage = embeddedImageDataUrl(
    packageInfo.coverPath ? contentFiles.get(packageInfo.coverPath) : undefined,
    packageInfo.coverPath
  );

  options.onProgress?.("Reading chapters…");
  const documents: ContentDocument[] = [];
  for (const item of spineItems) {
    if (shouldSkipDocument(item, packageInfo)) continue;
    const bytes = contentFiles.get(item.path);
    if (!bytes) continue;
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw new Error(`The chapter file ${baseName(item.path)} is too large to import.`);
    }
    const doc = parseContentDocument(strFromU8(bytes));
    const blocks = collectBlocks(doc);
    if (blocks.length === 0) continue;
    documents.push({ item, doc, blocks });
    if (documents.length % 8 === 0) {
      // Let the settings panel paint its progress for long books.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  if (documents.length === 0) {
    throw new Error("This EPUB doesn't contain any readable chapters.");
  }

  let toc: TocEntry[] = [];
  const navBytes = packageInfo.navPath ? contentFiles.get(packageInfo.navPath) : undefined;
  if (navBytes) {
    toc = readNavEntries(
      parseContentDocument(strFromU8(navBytes)),
      packageInfo.navPath
    );
  }
  if (toc.length === 0 && packageInfo.ncxPath) {
    const ncxBytes = contentFiles.get(packageInfo.ncxPath);
    if (ncxBytes) toc = readNcxEntries(strFromU8(ncxBytes), packageInfo.ncxPath);
  }

  const globalBlocks: GlobalBlock[] = [];
  const documentStart: number[] = [];
  documents.forEach((document, documentIndex) => {
    documentStart[documentIndex] = globalBlocks.length;
    for (const block of document.blocks) {
      globalBlocks.push({ block, documentIndex });
    }
  });

  options.onProgress?.("Preparing scenes…");
  let ranges = chaptersFromToc(toc, documents, globalBlocks, documentStart);
  if (ranges.length === 0) {
    ranges = chaptersFromSpine(documents, globalBlocks, documentStart);
  }

  const stats: ImageStats = { skipped: 0 };
  const chapters: EpubChapter[] = [];
  let chapterNumber = 0;
  for (const range of ranges) {
    const label = cleanTitle(range.label);
    const blocks = label ? dropChapterHeading(range.blocks, label) : range.blocks;
    const scenes = buildScenes(blocks, label, documents, contentFiles, stats);
    if (scenes.length === 0) continue;
    chapterNumber += 1;
    chapters.push({
      title: label || `Chapter ${chapterNumber}`,
      scenes
    });
  }
  if (chapters.length === 0) {
    throw new Error("This EPUB doesn't contain any readable chapters.");
  }

  const fallbackTitle = options.fallbackTitle
    ? baseName(options.fallbackTitle).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
    : "";

  return {
    title: collapse(packageInfo.title) || fallbackTitle || "Imported EPUB",
    author: collapse(packageInfo.author),
    chapters,
    coverImage,
    skippedImages: stats.skipped
  };
}

function defaultId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Turns a parsed manuscript into a normal project record. */
export function buildEpubProject(
  manuscript: EpubManuscript,
  options: BuildEpubProjectOptions = {}
): ProjectData {
  const createId = options.createId ?? defaultId;
  const chapters: ChapterData[] = [];
  const documents: DocumentData[] = [];

  for (const chapter of manuscript.chapters) {
    const chapterId = createId();
    chapters.push({ id: chapterId, title: chapter.title, expanded: true, summary: "" });
    for (const scene of chapter.scenes) {
      documents.push({
        id: createId(),
        title: scene.title,
        content: scene.content,
        chapterId
      });
    }
  }

  const publishOptions = defaultPublishOptions();
  if (manuscript.coverImage) {
    publishOptions.cover = {
      ...publishOptions.cover,
      mode: "image",
      image: manuscript.coverImage
    };
  }

  return {
    id: createId(),
    name: collapse(manuscript.title) || "Imported EPUB",
    author: collapse(manuscript.author),
    documents,
    chapters,
    activeDocumentId: documents[0]?.id ?? "",
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    storyboardCards: [],
    storyboardRows: [{ id: createId(), title: "Timeline" }],
    timelineNodes: [],
    noteFolders: [],
    researchFolderName: "",
    researchFolders: [],
    researchItems: [],
    publishOptions
  };
}
