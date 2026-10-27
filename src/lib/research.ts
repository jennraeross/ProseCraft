import type { ResearchFile, ResearchItem, ResearchLink } from "$lib/publish/types";

export const MAX_RESEARCH_FILE_BYTES = 200 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  "7z": "application/x-7z-compressed",
  avif: "image/avif",
  bmp: "image/bmp",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip",
  gif: "image/gif",
  heic: "image/heic",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  md: "text/markdown",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  odt: "application/vnd.oasis.opendocument.text",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  webm: "video/webm",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip"
};

export function normalizeResearchUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function researchTitleFromUrl(raw: string): string {
  const normalized = normalizeResearchUrl(raw);
  if (!normalized) return raw.trim().slice(0, 200);
  try {
    const url = new URL(normalized);
    return (url.hostname.replace(/^www\./i, "") || url.href).slice(0, 200);
  } catch {
    return raw.trim().slice(0, 200);
  }
}

export function researchFileNameFromPath(path: string): string {
  const name = path.split(/[\\/]/).pop() || "file";
  return safeResearchFileName(name);
}

export function safeResearchFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return `research-file-${Date.now()}`;
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  const safeName = reserved.test(cleaned) ? `file-${cleaned}` : cleaned;
  if (safeName.length <= 160) return safeName;

  const dot = safeName.lastIndexOf(".");
  const extension = dot > 0 && safeName.length - dot <= 16 ? safeName.slice(dot) : "";
  return safeName.slice(0, 160 - extension.length) + extension;
}

export function researchMimeType(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function formatResearchFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function createResearchFolderName(projectName: string, projectId: string): string {
  const base = projectName
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 48) || "Untitled Project";
  const suffix = projectId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "project";
  return `${base} (${suffix})`;
}

export function normalizeResearchFolderName(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .slice(0, 80)
    .replace(/[. ]+$/, "");
  if (cleaned === "." || cleaned === "..") return "";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) return `folder-${cleaned}`;
  return cleaned;
}

function isSafeStorageKey(value: string): boolean {
  if (!/^research\/[A-Za-z0-9-]+\/[^/\\\u0000-\u001f]+$/.test(value)) return false;
  return value.split("/").every((part) => part !== "." && part !== ".." && part.length > 0);
}

export function normalizeResearchItems(
  value: unknown,
  folderIds: Set<string>
): ResearchItem[] {
  if (!Array.isArray(value)) return [];
  const items: ResearchItem[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Partial<ResearchItem>;
    if (typeof candidate.id !== "string" || !candidate.id || seen.has(candidate.id)) continue;
    if (candidate.kind !== "file" && candidate.kind !== "link") continue;
    const folderId = typeof candidate.folderId === "string" && folderIds.has(candidate.folderId)
      ? candidate.folderId
      : null;
    const title = typeof candidate.title === "string" ? candidate.title.trim().slice(0, 200) : "";
    const addedAt = typeof candidate.addedAt === "number" && Number.isFinite(candidate.addedAt)
      ? candidate.addedAt
      : 0;

    if (candidate.kind === "file") {
      const file = candidate as Partial<ResearchFile>;
      if (
        typeof file.fileName !== "string"
        || !file.fileName
        || typeof file.mimeType !== "string"
        || typeof file.storageKey !== "string"
        || !isSafeStorageKey(file.storageKey)
        || typeof file.size !== "number"
        || !Number.isFinite(file.size)
        || file.size < 0
      ) continue;
      seen.add(candidate.id);
      items.push({
        id: candidate.id,
        kind: "file",
        folderId,
        title: title || file.fileName,
        fileName: file.fileName.slice(0, 255),
        mimeType: file.mimeType.slice(0, 200) || "application/octet-stream",
        size: file.size,
        storageKey: file.storageKey,
        addedAt
      });
      continue;
    }

    const link = candidate as Partial<ResearchLink>;
    if (typeof link.url !== "string") continue;
    const url = normalizeResearchUrl(link.url);
    if (!url) continue;
    seen.add(candidate.id);
    items.push({
      id: candidate.id,
      kind: "link",
      folderId,
      title: title || researchTitleFromUrl(url),
      url,
      description: typeof link.description === "string" ? link.description.slice(0, 2000) : undefined,
      addedAt
    });
  }

  return items;
}
