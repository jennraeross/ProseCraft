import type { VaultHeader } from "../crypto";
import type { StoredProject } from "../types";

export type SyncDirEntry = {
  name: string;
  isDirectory: boolean;
};

/**
 * Minimal filesystem surface the sync providers need. Paths are relative to
 * the chosen sync folder and always use `/` separators; each implementation
 * resolves them against its own root.
 */
export interface SyncFileSystem {
  listDir(path: string): Promise<SyncDirEntry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  createDir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Moves/renames a file. Used to replace a single sync file atomically. */
  rename(from: string, to: string): Promise<void>;
}

/** Last-synced version stamp used to detect changes on each side. */
export type SyncStamp = {
  updatedAt: number;
  revision: number;
};

/** How a sync folder is laid out on disk. */
export type SyncMode = "encrypted-file" | "open-folder" | "encrypted-folder";

export type SyncConnection = {
  /** Encrypted layouts return their vault header/key; the open layout does not. */
  header?: VaultHeader;
  vaultKey?: Uint8Array;
  projects: StoredProject[];
  created: boolean;
};

export type SyncResult = {
  projects: StoredProject[];
  created: boolean;
  imported: number;
  exported: number;
  removed: number;
  conflicts: number;
  lastSynced: Record<string, SyncStamp>;
};

export interface SyncProvider {
  connect(passphrase: string): Promise<SyncConnection>;
  pull(vaultKey?: Uint8Array): Promise<StoredProject[]>;
  push(projects: StoredProject[], vaultKey?: Uint8Array): Promise<void>;
  remove(projectIds: string[]): Promise<void>;
  sync(
    passphrase: string,
    local: StoredProject[],
    lastSynced: Record<string, SyncStamp>,
    now: number,
    deviceId: string
  ): Promise<SyncResult>;
  /**
   * Optional post-merge normalization. Open-folder sync uses this to make the
   * locally stored representation match what a Markdown round trip produces,
   * so subsequent syncs do not see phantom changes.
   */
  normalize?(projects: StoredProject[]): StoredProject[];
}
