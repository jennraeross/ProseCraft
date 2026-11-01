import { createVault, isVaultHeader, unlockVault, type CreateVaultOptions } from "../crypto";
import { ENTITY_KINDS, type StoredProject } from "../types";
import { BUNDLE_FILE, OPEN_MARKER_FILE } from "./files";
import {
  PROJECTS_DIR,
  VAULT_FILE,
  encodeProjectFiles,
  entityDir,
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
        throw new Error("This folder is set up for single-file sync, not encrypted-folder sync.");
      }
      if (await this.fs.exists(OPEN_MARKER_FILE)) {
        throw new Error("This folder is set up for open-folder sync, not encrypted-folder sync.");
      }
      // Refuse to adopt a folder that already holds encrypted projects but no
      // header: creating a second vault would make those projects unreadable.
      for (const entry of await this.fs.listDir(PROJECTS_DIR)) {
        if (entry.isDirectory
          && (await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.enc`)
            || await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.json`))) {
          throw new Error("This folder contains project files but no vault file.");
        }
      }
      const { header, vaultKey } = await createVault(passphrase, this.vaultOptions);
      await this.fs.createDir(PROJECTS_DIR);
      await this.fs.writeText(VAULT_FILE, JSON.stringify(header, null, 2));
      return { header, vaultKey, projects: [], created: true };
    }
    const raw: unknown = JSON.parse(await this.fs.readText(VAULT_FILE));
    if (!isVaultHeader(raw)) {
      throw new Error("The sync folder's vault file is not valid.");
    }
    const vaultKey = await unlockVault(raw, passphrase);
    return { header: raw, vaultKey, projects: await this.pull(vaultKey), created: false };
  }

  async pull(vaultKey?: Uint8Array): Promise<StoredProject[]> {
    if (!vaultKey) throw new Error("The sync vault is locked.");
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
    if (!vaultKey) throw new Error("The sync vault is locked.");
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

  private async prune(dir: string, keep: Set<string>): Promise<void> {
    for (const kind of ENTITY_KINDS) {
      const sub = `${dir}/${entityDir(kind)}`;
      for (const entry of await this.fs.listDir(sub)) {
        if (entry.isDirectory) continue;
        const path = `${sub}/${entry.name}`;
        if (entry.name.endsWith(".enc") && !keep.has(path)) {
          await this.fs.remove(path);
        }
      }
    }
  }
}
