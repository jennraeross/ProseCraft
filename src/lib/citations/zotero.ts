import { normalizeCslItemsDetailed, sanitizeCitationId, type CslItem } from "./csl";
import type { CitationProvider } from "./provider";

export const ZOTERO_PING_PATH = "/connector/ping";
export const ZOTERO_BBT_CAYW_PATH = "/better-bibtex/cayw?format=json";
/** Better BibTeX answers `ready` to this path without opening the picker. */
export const ZOTERO_BBT_PROBE_PATH = "/better-bibtex/cayw?probe=1";
export const ZOTERO_SEARCH_LIMIT = 25;
/** CAYW stays open until the person has picked, so it needs minutes, not seconds. */
export const ZOTERO_PICK_TIMEOUT_MS = 5 * 60 * 1000;

export type ZoteroRequestOptions = {
  timeoutMs?: number;
  /** Names the request so `zotero_cancel` can stop it while it waits. */
  requestId?: string;
};

export type ZoteroTransport = (path: string, options?: ZoteroRequestOptions) => Promise<string>;

/** A fresh id per pick; only used to cancel that one request. */
function createPickRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pick-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ZoteroErrorCode =
  | "not-running"
  | "forbidden"
  | "timeout"
  | "not-desktop"
  | "invalid-response"
  | "unknown";

export type ZoteroErrorState = {
  code: ZoteroErrorCode;
  message: string;
  detail?: string;
};

export class ZoteroError extends Error {
  readonly code: ZoteroErrorCode;
  readonly detail?: string;

  constructor(code: ZoteroErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "ZoteroError";
    this.code = code;
    this.detail = detail;
  }
}

const ZOTERO_ITEM_URI_RE = /\/items\/([A-Za-z0-9]{4,32})(?:[/?#]|$)/i;

const ZOTERO_TYPE_MAP: Record<string, string> = {
  journalarticle: "article-journal",
  magazinearticle: "article-magazine",
  newspaperarticle: "article-newspaper",
  book: "book",
  editedbook: "book",
  booksection: "chapter",
  conferencepaper: "paper-conference",
  webpage: "webpage",
  blogpost: "post-weblog",
  forumpost: "post",
  thesis: "thesis",
  report: "report",
  encyclopediaarticle: "entry-encyclopedia",
  dictionaryentry: "entry-dictionary",
  manuscript: "manuscript",
  document: "document",
  patent: "patent",
  statute: "legislation",
  bill: "bill",
  case: "legal_case",
  presentation: "speech",
  interview: "interview",
  film: "motion_picture",
  videorecording: "motion_picture",
  audiorecording: "song",
  podcast: "song",
  artwork: "graphic",
  dataset: "dataset",
  computerprogram: "software",
  preprint: "article"
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Builds the Zotero 7 local API search path for CSL-JSON items. */
export function buildZoteroSearchPath(query: string, limit = ZOTERO_SEARCH_LIMIT): string {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : ZOTERO_SEARCH_LIMIT;
  const encodedQuery = encodeURIComponent(query.trim());
  return `/api/users/0/items?q=${encodedQuery}&format=csljson&limit=${safeLimit}`;
}

/** Maps an HTTP status code and response body from Zotero to a user-facing error state. */
export function classifyZoteroHttpError(status: number, body = ""): ZoteroErrorState {
  const detail = body.trim() || undefined;
  if (status === 403) {
    return {
      code: "forbidden",
      message:
        'Zotero blocked local API access (HTTP 403). Enable "Allow other applications on this computer to communicate with Zotero" in Zotero Settings → Advanced → Files and Folders.',
      ...(detail ? { detail } : {})
    };
  }
  if (status === 408 || status === 504) {
    return {
      code: "timeout",
      message: "Zotero timed out before answering. Check that Zotero is responsive and try again.",
      ...(detail ? { detail } : {})
    };
  }
  return {
    code: "unknown",
    message: `Zotero returned HTTP ${status}.`,
    ...(detail ? { detail } : {})
  };
}

/** Classifies a transport error or raw error string from `zotero_request` into a structured state. */
export function classifyZoteroError(error: unknown): ZoteroErrorState {
  if (error instanceof ZoteroError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.detail ? { detail: error.detail } : {})
    };
  }

  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");
  const trimmed = raw.trim();

  const httpMatch = trimmed.match(/^HTTP\s+(\d{3})(?:\s*:\s*([\s\S]*))?$/i);
  if (httpMatch) {
    return classifyZoteroHttpError(Number.parseInt(httpMatch[1], 10), httpMatch[2] ?? "");
  }

  if (
    /local api is not enabled|allow other applications on this computer to communicate with zotero|\b403\b.*forbidden/i.test(
      trimmed
    )
  ) {
    return classifyZoteroHttpError(403, trimmed);
  }

  if (/timed?\s*out|timeout|wouldblock|etimedout/i.test(trimmed)) {
    return {
      code: "timeout",
      message: "Zotero request timed out. Make sure Zotero is responsive and try again.",
      ...(trimmed ? { detail: trimmed } : {})
    };
  }

  if (
    /not running|connection refused|econnrefused|actively refused|connect.*failed|os error 111|os error 10061/i.test(
      trimmed
    )
  ) {
    return {
      code: "not-running",
      message: "Zotero is not running. Start Zotero on this computer and try again.",
      ...(trimmed ? { detail: trimmed } : {})
    };
  }

  if (/only available in the desktop/i.test(trimmed)) {
    return {
      code: "not-desktop",
      message: "Zotero integration is only available in the ProseCraft desktop app.",
      ...(trimmed ? { detail: trimmed } : {})
    };
  }

  return {
    code: "unknown",
    message: trimmed || "Could not communicate with Zotero.",
    ...(trimmed ? { detail: trimmed } : {})
  };
}

/**
 * True only when Zotero itself answered that the requested endpoint does not
 * exist, which is how a missing Better BibTeX shows up. Timeouts and other
 * failures leave the endpoint unknown rather than silently absent.
 */
export function isZoteroEndpointMissing(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const trimmed = raw.trim();
  return /^HTTP\s+404\b/i.test(trimmed) || /\bno endpoint found\b/i.test(trimmed);
}

/** Extracts the Zotero item key from a Zotero URI (`.../items/ABCD1234`) or raw id/key field. */
export function extractZoteroKey(rawId: unknown, rawKey?: unknown): string | undefined {
  if (typeof rawKey === "string" && rawKey.trim()) {
    const cleaned = sanitizeCitationId(rawKey);
    if (cleaned) return cleaned;
  }
  if (typeof rawId === "string") {
    const uriMatch = rawId.match(ZOTERO_ITEM_URI_RE);
    if (uriMatch) {
      const cleaned = sanitizeCitationId(uriMatch[1]);
      if (cleaned) return cleaned;
    }
    const trimmed = rawId.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      const cleaned = sanitizeCitationId(trimmed);
      if (cleaned) return cleaned;
    }
  }
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    return sanitizeCitationId(String(rawId));
  }
  return undefined;
}

function resolveZoteroCslType(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.type === "string" && raw.type.trim()) {
    return raw.type.trim();
  }
  if (typeof raw.itemType === "string" && raw.itemType.trim()) {
    const normalized = raw.itemType.trim().toLowerCase();
    return Object.hasOwn(ZOTERO_TYPE_MAP, normalized) ? ZOTERO_TYPE_MAP[normalized] : "document";
  }
  return undefined;
}

function readCiteKey(obj: Record<string, unknown>): string | undefined {
  const candidates = [obj.citeKey, obj.citationKey, obj["citation-key"], obj.citekey];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function normalizeRawZoteroEntry(entry: unknown): Record<string, unknown> | null {
  if (!isPlainObject(entry)) return null;

  const wrapperCiteKey = readCiteKey(entry);
  const rawItem = isPlainObject(entry.item) ? entry.item : entry;
  const rawItemType = typeof rawItem.itemType === "string" ? rawItem.itemType.trim().toLowerCase() : "";
  if (rawItemType === "attachment" || rawItemType === "note" || rawItemType === "annotation") {
    return null;
  }

  const citeKey = readCiteKey(rawItem) ?? wrapperCiteKey;
  const zoteroKey = extractZoteroKey(rawItem.id, rawItem.key) ?? extractZoteroKey(entry.id, entry.key);
  const resolvedId = zoteroKey ?? (citeKey ? sanitizeCitationId(citeKey) : undefined);
  const resolvedType = resolveZoteroCslType(rawItem) ?? (rawItem.title || rawItem.author ? "document" : undefined);

  const normalized: Record<string, unknown> = {
    ...rawItem,
    ...(resolvedId ? { id: resolvedId } : {}),
    ...(resolvedType ? { type: resolvedType } : {}),
    ...(citeKey ? { citeKey } : {}),
    ...(rawItem.URL === undefined && typeof rawItem.url === "string" ? { URL: rawItem.url } : {}),
    ...(rawItem.DOI === undefined && typeof rawItem.doi === "string" ? { DOI: rawItem.doi } : {}),
    ...(rawItem.ISBN === undefined && typeof rawItem.isbn === "string" ? { ISBN: rawItem.isbn } : {}),
    provider: "zotero"
  };

  return normalized;
}

/** Maps a parsed Zotero CSL-JSON or Better BibTeX CAYW payload into validated `CslItem[]`. */
export function mapZoteroItems(rawValue: unknown): CslItem[] {
  let rawEntries: unknown[];
  if (Array.isArray(rawValue)) {
    rawEntries = rawValue;
  } else if (isPlainObject(rawValue) && Array.isArray(rawValue.items)) {
    rawEntries = rawValue.items;
  } else if (isPlainObject(rawValue)) {
    rawEntries = [rawValue];
  } else {
    return [];
  }

  const prepared: Record<string, unknown>[] = [];
  for (const entry of rawEntries) {
    const mapped = normalizeRawZoteroEntry(entry);
    if (mapped) prepared.push(mapped);
  }
  return normalizeCslItemsDetailed(prepared).items;
}

/** Parses a raw JSON string returned by Zotero's local API or BBT CAYW into `CslItem[]`. */
export function mapZoteroCslJson(rawText: string): CslItem[] {
  const cleaned = rawText.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new ZoteroError("invalid-response", "Zotero returned an invalid JSON response.", detail);
  }

  return mapZoteroItems(parsed);
}

async function tauriZoteroTransport(
  path: string,
  options?: ZoteroRequestOptions
): Promise<string> {
  const { invoke, isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) {
    throw new ZoteroError(
      "not-desktop",
      "Zotero integration is only available in the ProseCraft desktop app."
    );
  }
  return invoke<string>("zotero_request", {
    path,
    timeoutMs: options?.timeoutMs,
    requestId: options?.requestId
  });
}

/** Stops an in-flight `zotero_request` the dialog no longer wants. */
async function tauriZoteroCancel(requestId: string): Promise<boolean> {
  const { invoke, isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) return false;
  return invoke<boolean>("zotero_cancel", { requestId });
}

/**
 * Desktop-only citation provider talking to Zotero 7's local HTTP server on 127.0.0.1:23119
 * via the `zotero_request` Tauri command.
 */
export class ZoteroLocal implements CitationProvider {
  readonly id = "zotero";
  readonly label = "Zotero";
  private readonly transport: ZoteroTransport;
  private readonly cancelRequest: (requestId: string) => Promise<boolean>;
  /** Id of the pick that is waiting right now, so the dialog can stop it. */
  private pickRequestId: string | null = null;

  constructor(transport: ZoteroTransport = tauriZoteroTransport, cancelRequest = tauriZoteroCancel) {
    this.transport = transport;
    this.cancelRequest = cancelRequest;
  }

  async checkStatus(): Promise<{ available: boolean; error?: ZoteroErrorState }> {
    try {
      await this.transport(ZOTERO_PING_PATH);
      return { available: true };
    } catch (error) {
      return { available: false, error: classifyZoteroError(error) };
    }
  }

  async available(): Promise<boolean> {
    const status = await this.checkStatus();
    return status.available;
  }

  async search(query: string): Promise<CslItem[]> {
    try {
      const response = await this.transport(buildZoteroSearchPath(query));
      return mapZoteroCslJson(response);
    } catch (error) {
      const state = classifyZoteroError(error);
      throw new ZoteroError(state.code, state.message, state.detail);
    }
  }

  /**
   * Reports whether Better BibTeX's Cite-As-You-Write picker is installed.
   * Only a definitive "no such endpoint" answer from Zotero hides the picker;
   * a timeout or other failure leaves it available so the person can retry.
   */
  async hasBetterBibtexPicker(): Promise<boolean> {
    try {
      await this.transport(ZOTERO_BBT_PROBE_PATH);
      return true;
    } catch (error) {
      return !isZoteroEndpointMissing(error);
    }
  }

  /**
   * Invokes Better BibTeX's Cite-As-You-Write picker when installed, falling
   * back silently (`supported: false`) when Better BibTeX is not present.
   *
   * The picker request stays open until the person has chosen, so it gets a
   * minutes-long deadline instead of the 5 s used for the other endpoints.
   * Failures other than a missing Better BibTeX are rethrown so the caller can
   * show them instead of hiding the button.
   */
  async tryPick(): Promise<{ supported: boolean; items: CslItem[] }> {
    const requestId = createPickRequestId();
    this.pickRequestId = requestId;
    try {
      const response = await this.transport(ZOTERO_BBT_CAYW_PATH, {
        timeoutMs: ZOTERO_PICK_TIMEOUT_MS,
        requestId
      });
      if (!response.trim()) {
        return { supported: true, items: [] };
      }
      return { supported: true, items: mapZoteroCslJson(response) };
    } catch (error) {
      if (isZoteroEndpointMissing(error)) {
        return { supported: false, items: [] };
      }
      if (error instanceof ZoteroError) throw error;
      const state = classifyZoteroError(error);
      throw new ZoteroError(state.code, state.message, state.detail);
    } finally {
      if (this.pickRequestId === requestId) this.pickRequestId = null;
    }
  }

  /**
   * Stops the pick that is waiting, if any. The request ends with "cancelled"
   * and the caller drops it; returns false when it had already finished.
   */
  async cancelPick(): Promise<boolean> {
    const requestId = this.pickRequestId;
    if (!requestId) return false;
    this.pickRequestId = null;
    return this.cancelRequest(requestId);
  }

  async pick(): Promise<CslItem[]> {
    const result = await this.tryPick();
    return result.items;
  }
}
