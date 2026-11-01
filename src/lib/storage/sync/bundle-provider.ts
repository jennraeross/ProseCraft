import { createVault, unlockVault, type VaultHeader } from "../crypto";
import {
  decryptBundleProjects,
  parseEncryptedBundle,
  serializeEncryptedBundle
} from "../encrypted-bundle";
import type { StoredProject } from "../types";
import { BUNDLE_FILE, OPEN_MARKER_FILE, PROJECTS_DIR, VAULT_FILE } from "./files";
import { syncViaProvider } from "./orchestrate";
import type {
  SyncConnection,
  SyncFileSystem,
  SyncMode,
  SyncProvider,
  SyncResult,
  SyncStamp
} from "./types";

/**
 * All projects packaged into one encrypted file at the root of the sync folder.
 * This is the simplest layout for cloud drives and WebDAV: one download and one
 * upload per sync instead of hundreds of small files.
 */
export class EncryptedFileSyncProvider implements SyncProvider {
  readonly mode: SyncMode = "encrypted-file";
  private header: VaultHeader | undefined;
  private createdAt = 0;
  private hint: string | undefined;

  constructor(private readonly fs: SyncFileSystem) {}

  async connect(passphrase: string): Promise<SyncConnection> {
    if (await this.fs.exists(BUNDLE_FILE)) {
      const parsed = parseEncryptedBundle(await this.fs.readText(BUNDLE_FILE));
      const vaultKey = await unlockVault(parsed.header, passphrase);
      this.header = parsed.header;
      this.createdAt = parsed.createdAt;
      this.hint = parsed.hint;
      return {
        header: parsed.header,
        vaultKey,
        projects: decryptBundleProjects(parsed, vaultKey),
        created: false
      };
    }

    if (await this.fs.exists(VAULT_FILE)) {
      throw new Error("This folder is set up for encrypted-folder sync, not single-file sync.");
    }
    if (await this.fs.exists(OPEN_MARKER_FILE)) {
      throw new Error("This folder is set up for open-folder sync, not single-file sync.");
    }
    // Refuse to adopt a folder that already holds encrypted-folder projects but
    // no bundle/header: creating a second vault would orphan those projects.
    for (const entry of await this.fs.listDir(PROJECTS_DIR)) {
      if (entry.isDirectory
        && (await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.enc`)
          || await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.json`))) {
        throw new Error("This folder contains project files but no sync vault file.");
      }
    }

    const { header, vaultKey } = await createVault(passphrase);
    this.header = header;
    this.createdAt = Date.now();
    this.hint = undefined;
    return { header, vaultKey, projects: [], created: true };
  }

  async pull(vaultKey?: Uint8Array): Promise<StoredProject[]> {
    if (!vaultKey) throw new Error("The sync file is locked.");
    if (!(await this.fs.exists(BUNDLE_FILE))) return [];
    const parsed = parseEncryptedBundle(await this.fs.readText(BUNDLE_FILE));
    return decryptBundleProjects(parsed, vaultKey);
  }

  async push(projects: StoredProject[], vaultKey?: Uint8Array): Promise<void> {
    if (!vaultKey || !this.header) throw new Error("The sync file is locked.");
    const content = serializeEncryptedBundle(
      projects,
      this.header,
      vaultKey,
      "sync",
      this.createdAt || Date.now(),
      this.hint
    );
    const temporary = `${BUNDLE_FILE}.tmp`;
    try {
      await this.fs.writeText(temporary, content);
      await this.fs.rename(temporary, BUNDLE_FILE);
    } catch (error) {
      // Best effort cleanup so a failed sync does not leave a stray file (or a
      // partially written replacement) behind in the user's folder.
      try {
        if (await this.fs.exists(temporary)) await this.fs.remove(temporary);
      } catch {
        // The original error is more useful than a cleanup failure.
      }
      throw error;
    }
  }

  async remove(_projectIds: string[]): Promise<void> {
    // Deleted projects simply disappear from the next bundle write.
  }

  async sync(
    passphrase: string,
    local: StoredProject[],
    lastSynced: Record<string, SyncStamp>,
    now: number,
    deviceId: string
  ): Promise<SyncResult> {
    return syncViaProvider(this, passphrase, local, lastSynced, now, deviceId);
  }
}
