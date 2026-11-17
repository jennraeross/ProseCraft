import { markdownToDocument } from "$lib/publish/markdown";
import type { DocumentData } from "$lib/publish/types";
import type { DocumentSnapshot } from "$lib/storage/types";

/** Oldest snapshots of a document are dropped once it has more than this many. */
export const MAX_SNAPSHOTS_PER_DOCUMENT = 10;
const MAX_NOTE_LENGTH = 120;
/** The note the MCP server gives the snapshot it takes before overwriting a document. */
const MCP_SNAPSHOT_NOTE = "Before MCP write";

export function createSnapshot(
  document: Pick<DocumentData, "id" | "title" | "content">,
  options: { id: string; now: number; reason: DocumentSnapshot["reason"]; note?: string }
): DocumentSnapshot {
  const note = options.note?.trim().slice(0, MAX_NOTE_LENGTH);
  return {
    id: options.id,
    documentId: document.id,
    createdAt: options.now,
    title: document.title,
    content: document.content,
    reason: options.reason,
    ...(note ? { note } : {})
  };
}

/** Adds a snapshot and drops the oldest ones of the same document beyond the cap. */
export function addSnapshot(
  snapshots: readonly DocumentSnapshot[],
  snapshot: DocumentSnapshot,
  max = MAX_SNAPSHOTS_PER_DOCUMENT
): DocumentSnapshot[] {
  const own = [...snapshots.filter((entry) => entry.documentId === snapshot.documentId), snapshot]
    .sort((a, b) => a.createdAt - b.createdAt);
  const keep = new Set(own.slice(Math.max(0, own.length - max)).map((entry) => entry.id));
  return [...snapshots, snapshot].filter((entry) => entry.documentId !== snapshot.documentId || keep.has(entry.id));
}

/** Snapshots of one document, newest first. */
export function snapshotsForDocument(
  snapshots: readonly DocumentSnapshot[],
  documentId: string
): DocumentSnapshot[] {
  return snapshots
    .filter((entry) => entry.documentId === documentId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function removeSnapshot(snapshots: readonly DocumentSnapshot[], id: string): DocumentSnapshot[] {
  return snapshots.filter((entry) => entry.id !== id);
}

/** Drops snapshots whose document no longer exists (for example after emptying the trash). */
export function dropOrphanSnapshots(
  snapshots: readonly DocumentSnapshot[],
  documentIds: ReadonlySet<string>
): DocumentSnapshot[] {
  return snapshots.filter((entry) => documentIds.has(entry.documentId));
}

/** Accepts stored data of unknown shape and keeps only well-formed snapshots. */
export function normalizeSnapshots(value: unknown): DocumentSnapshot[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: DocumentSnapshot[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Partial<DocumentSnapshot>;
    if (typeof item.id !== "string" || !item.id || seen.has(item.id)
      || typeof item.documentId !== "string" || typeof item.title !== "string"
      || typeof item.content !== "string" || typeof item.createdAt !== "number"
      || (item.reason !== "manual" && item.reason !== "before-restore")) continue;
    seen.add(item.id);
    result.push({
      id: item.id,
      documentId: item.documentId,
      createdAt: item.createdAt,
      title: item.title,
      content: item.content,
      reason: item.reason,
      ...(item.contentFormat === "markdown" ? { contentFormat: "markdown" as const } : {}),
      ...(typeof item.note === "string" && item.note ? { note: item.note.slice(0, MAX_NOTE_LENGTH) } : {})
    });
  }
  return result;
}

/**
 * Whether a snapshot's content is Markdown. The MCP server stores the Markdown
 * body of the file it is about to overwrite. Its snapshots say so with
 * `contentFormat`; the ones written before that field existed are recognised by
 * the MCP server's fixed note.
 */
export function snapshotIsMarkdown(snapshot: DocumentSnapshot): boolean {
  return snapshot.contentFormat === "markdown"
    || (snapshot.contentFormat === undefined && snapshot.reason === "manual" && snapshot.note === MCP_SNAPSHOT_NOTE);
}

/** A snapshot's content as HTML, for previewing, counting and restoring it. */
export function snapshotHtml(snapshot: DocumentSnapshot): string {
  return snapshotIsMarkdown(snapshot) ? markdownToDocument(snapshot.content).html : snapshot.content;
}
