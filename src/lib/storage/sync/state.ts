import type { SyncMode, SyncStamp } from "./types";

export const SYNC_STATE_KEY = "prosecraft-sync-state";

export type SyncProviderType = "folder" | "googledrive";

export type GoogleDriveClientKind = "web" | "desktop";

export type PersistedSyncState = {
  provider: SyncProviderType;
  folder: string;
  mode: SyncMode;
  googleDriveAccessToken: string;
  googleDriveRefreshToken: string;
  googleDriveTokenExpiry: number;
  googleDriveEmail: string;
  /** Which OAuth client issued the tokens — refresh must use the same one. */
  googleDriveClientKind: GoogleDriveClientKind;
  lastSynced: Record<string, SyncStamp>;
};

const SYNC_MODES: SyncMode[] = ["encrypted-file", "open-folder", "encrypted-folder"];

function isSyncMode(value: unknown): value is SyncMode {
  return typeof value === "string" && (SYNC_MODES as string[]).includes(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Device-local sync configuration. Contains no project content or keys. */
export function loadSyncState(): PersistedSyncState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSyncState>;

    // State written before sync providers existed always used a local folder.
    const provider: SyncProviderType = parsed.provider === "googledrive" ? "googledrive" : "folder";
    const folder = readString(parsed.folder);
    const googleDriveAccessToken = readString(parsed.googleDriveAccessToken);
    const googleDriveRefreshToken = readString(parsed.googleDriveRefreshToken);
    const googleDriveTokenExpiry = readNumber(parsed.googleDriveTokenExpiry);
    const googleDriveEmail = readString(parsed.googleDriveEmail);
    // Refresh tokens are bound to the client that issued them. State written
    // before the web flow existed only ever used the desktop client.
    const googleDriveClientKind: GoogleDriveClientKind =
      parsed.googleDriveClientKind === "web" ? "web" : "desktop";

    if (provider === "folder" && !folder) return null;
    // A connection without either token cannot be used, so treat it as
    // "not configured" instead of showing a broken sync setup.
    if (provider === "googledrive" && !googleDriveAccessToken && !googleDriveRefreshToken) {
      return null;
    }

    // State written before sync modes existed always used the encrypted folder
    // layout, so keep those installs working without a migration step. Google
    // Drive is new, so its sensible default is the single encrypted file.
    const mode: SyncMode = isSyncMode(parsed.mode)
      ? parsed.mode
      : provider === "googledrive"
        ? "encrypted-file"
        : "encrypted-folder";

    const lastSynced: Record<string, SyncStamp> = {};
    if (typeof parsed.lastSynced === "object" && parsed.lastSynced !== null) {
      for (const [id, stamp] of Object.entries(parsed.lastSynced)) {
        if (typeof stamp === "object" && stamp !== null
          && typeof (stamp as SyncStamp).updatedAt === "number"
          && typeof (stamp as SyncStamp).revision === "number") {
          lastSynced[id] = {
            updatedAt: (stamp as SyncStamp).updatedAt,
            revision: (stamp as SyncStamp).revision
          };
        }
      }
    }

    return {
      provider,
      folder,
      mode,
      googleDriveAccessToken,
      googleDriveRefreshToken,
      googleDriveTokenExpiry,
      googleDriveEmail,
      googleDriveClientKind,
      lastSynced
    };
  } catch {
    return null;
  }
}

export function saveSyncState(state: PersistedSyncState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

export function clearSyncState(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SYNC_STATE_KEY);
}
