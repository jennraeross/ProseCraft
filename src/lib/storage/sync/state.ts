import type { SyncStamp } from "./types";

export const SYNC_STATE_KEY = "prosecraft-sync-state";

export type PersistedSyncState = {
  folder: string;
  lastSynced: Record<string, SyncStamp>;
};

/** Device-local sync configuration. Contains no project content or keys. */
export function loadSyncState(): PersistedSyncState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSyncState>;
    if (typeof parsed.folder !== "string" || !parsed.folder) return null;
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
    return { folder: parsed.folder, lastSynced };
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
