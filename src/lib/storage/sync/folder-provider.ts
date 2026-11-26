import { createVault, isVaultHeader, unlockVault, type CreateVaultOptions } from "../crypto";
import { ENTITY_KINDS, type StoredProject } from "../types";
import { BUNDLE_FILE, OPEN_MARKER_FILE } from "./files";
import { t } from "$lib/i18n/state.svelte";
import {
  PROJECTS_DIR,
  VAULT_FILE,
  encodeProjectFiles,
  entityDir,
  entityFileName,
  projectDirName,
  readProjectFiles
} from "./layout";
import { compareStrings } from "./merge";
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
 * Syncs the working set through a folder (e.g. a Nextcloud desktop-client
 * folder). The layout is discoverable from directory listings alone; there is
 * no global index file.
 */
export class FolderSyncProvider implements SyncProvider {
  readonly mode: SyncMode = "encrypted-folder";

  constructor(
    private readonly fs: SyncFileSystem,
    private readonly vaultOptions: CreateVaultOptions = {}
  ) {}

  async connect(passphrase: string): Promise<SyncConnection> {
    if (!(await this.fs.exists(VAULT_FILE))) {
      if (await this.fs.exists(BUNDLE_FILE)) {
        throw new Error(t("module.sync.fileForFolder"));
      }
      if (await this.fs.exists(OPEN_MARKER_FILE)) {
        throw new Error(t("module.sync.openForFolder"));
      }
      // Refuse to adopt a folder that already holds encrypted projects but no
      // header: creating a second vault would make those projects unreadable.
      for (const entry of await this.fs.listDir(PROJECTS_DIR)) {
        if (entry.isDirectory
          && (await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.enc`)
            || await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.json`))) {
          throw new Error(t("module.sync.noVault"));
        }
      }
      const { header, vaultKey } = await createVault(passphrase, this.vaultOptions);
      await this.fs.createDir(PROJECTS_DIR);
      await this.fs.writeText(VAULT_FILE, JSON.stringify(header, null, 2));
      return { header, vaultKey, projects: [], created: true };
    }
    const raw: unknown = JSON.parse(await this.fs.readText(VAULT_FILE));
    if (!isVaultHeader(raw)) {
      throw new Error(t("module.sync.invalidVault"));
    }
    const vaultKey = await unlockVault(raw, passphrase);
    return { header: raw, vaultKey, projects: await this.pull(vaultKey), created: false };
  }

  async pull(vaultKey?: Uint8Array): Promise<StoredProject[]> {
    if (!vaultKey) throw new Error(t("module.sync.vaultLocked"));
    const entries = await this.fs.listDir(PROJECTS_DIR);
    const projects: StoredProject[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      const project = await readProjectFiles(this.fs, entry.name, vaultKey);
      if (project) projects.push(project);
    }
    return projects.sort((a, b) => compareStrings(a.id, b.id));
  }

  async push(projects: StoredProject[], vaultKey?: Uint8Array): Promise<void> {
    if (!vaultKey) throw new Error(t("module.sync.vaultLocked"));
    await this.fs.createDir(PROJECTS_DIR);
    for (const project of projects) {
      const dir = projectDirName(project.id);
      await this.fs.createDir(dir);
      for (const kind of ENTITY_KINDS) {
        await this.fs.createDir(`${dir}/${entityDir(kind)}`);
      }
      const files = encodeProjectFiles(project, vaultKey);
      for (const file of files) {
        await this.fs.writeText(file.path, file.content);
      }
      await this.prune(dir, new Set(files.map((file) => file.path)));
    }
  }

  async remove(projectIds: string[]): Promise<void> {
    for (const id of projectIds) {
      await this.fs.remove(projectDirName(id));
    }
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

  /**
   * Removes the files this layout wrote for entities that are no longer live.
   * A file counts as ours only when its name is exactly the one this layout
   * gives the entity id in its envelope. Anything else is left alone: when the
   * folder is itself synced by another tool, it may hold that tool's conflict
   * copies (`doc-1 (conflict …).enc`, `doc-1.sync-conflict-….enc`), which repeat
   * the original's id under another name and can be the only copy of an edit.
   */
  private async prune(dir: string, keep: Set<string>): Promise<void> {
    for (const kind of ENTITY_KINDS) {
      const sub = `${dir}/${entityDir(kind)}`;
      for (const entry of await this.fs.listDir(sub)) {
        if (entry.isDirectory || !entry.name.endsWith(".enc")) continue;
        const path = `${sub}/${entry.name}`;
        if (keep.has(path)) continue;
        const id = await this.envelopeId(path);
        if (id !== null && entityFileName(id) === entry.name) await this.fs.remove(path);
      }
    }
  }

  /** The entity id in an encrypted file's (plain-text) envelope, if it can be read. */
  private async envelopeId(path: string): Promise<string | null> {
    try {
      const id = (JSON.parse(await this.fs.readText(path)) as { id?: unknown }).id;
      return typeof id === "string" && id ? id : null;
    } catch {
      return null;
    }
  }
}
