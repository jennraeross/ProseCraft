import { createVault, isVaultHeader, unlockVault, type CreateVaultOptions } from "../crypto";
import { createStoredProject, projectsHaveSameContent } from "../schema";
import { ENTITY_KINDS, type StoredProject } from "../types";
import {
  PROJECTS_DIR,
  VAULT_FILE,
  encodeProjectFiles,
  entityDir,
  projectDirName,
  readProjectFiles
} from "./layout";
import type {
  SyncConnection,
  SyncFileSystem,
  SyncProvider,
  SyncResult,
  SyncStamp
} from "./types";

/**
 * Code-unit string ordering. This deliberately avoids `localeCompare`: last-
 * write-wins must pick the same winner on every device, regardless of locale or
 * ICU version.
 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function newerThan(project: StoredProject, stamp: SyncStamp): boolean {
  return project.updatedAt > stamp.updatedAt
    || (project.updatedAt === stamp.updatedAt && project.revision > stamp.revision);
}

function compareRecords(a: StoredProject, b: StoredProject): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  if (a.revision !== b.revision) return a.revision - b.revision;
  return compareStrings(a.updatedBy, b.updatedBy);
}

/** Clones a losing project under a new id so no edits are silently discarded. */
export function createConflictCopy(loser: StoredProject, now: number, deviceId: string): StoredProject {
  const suffix = Math.random().toString(36).slice(2, 7);
  const id = `${loser.id}-conflict-${now.toString(36)}-${suffix}`;
  return createStoredProject({
    ...loser.project,
    id,
    name: `${loser.project.name} (conflicted copy)`
  }, deviceId, now);
}

export type MergeOutcome = {
  projects: StoredProject[];
  lastSynced: Record<string, SyncStamp>;
  imported: number;
  exported: number;
  conflicts: number;
  /** Project ids that should be deleted from the remote folder. */
  removedIds: string[];
};

/**
 * Reconciles local and remote project sets. Change detection is anchored to the
 * last synced stamp per project:
 *
 * - only one side changed → take it
 * - both changed → last-write-wins, and the loser is preserved as a conflicted
 *   copy so nothing is lost
 * - present on one side only and never synced → new project
 * - present on one side only and previously synced → deletion (a delete that
 *   races a local edit keeps the edited side as a conflicted copy)
 */
export function mergeProjects(
  local: StoredProject[],
  remote: StoredProject[],
  lastSynced: Record<string, SyncStamp>,
  now: number,
  deviceId: string
): MergeOutcome {
  const localById = new Map(local.map((project) => [project.id, project]));
  const remoteById = new Map(remote.map((project) => [project.id, project]));
  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...Object.keys(lastSynced)]);
  const projects: StoredProject[] = [];
  const removedIds: string[] = [];
  let imported = 0;
  let exported = 0;
  let conflicts = 0;

  for (const id of ids) {
    const localProject = localById.get(id);
    const remoteProject = remoteById.get(id);
    const base = lastSynced[id];

    if (localProject && remoteProject) {
      const sameContent = projectsHaveSameContent(localProject.project, remoteProject.project);
      if (sameContent) {
        projects.push(compareRecords(localProject, remoteProject) >= 0 ? localProject : remoteProject);
        continue;
      }
      const localChanged = !base || newerThan(localProject, base);
      const remoteChanged = !base || newerThan(remoteProject, base);
      if (localChanged && remoteChanged) {
        const localWins = compareRecords(localProject, remoteProject) >= 0;
        projects.push(localWins ? localProject : remoteProject);
        projects.push(createConflictCopy(localWins ? remoteProject : localProject, now, deviceId));
        conflicts += 1;
      } else if (remoteChanged) {
        projects.push(remoteProject);
        imported += 1;
      } else {
        projects.push(localProject);
        exported += 1;
      }
      continue;
    }

    if (localProject) {
      if (base && !remoteProject) {
        // Deleted on the remote side. Preserve a local edit made after the
        // last sync instead of destroying it.
        if (newerThan(localProject, base)) {
          projects.push(createConflictCopy(localProject, now, deviceId));
          conflicts += 1;
        }
      } else {
        projects.push(localProject);
        exported += 1;
      }
      continue;
    }

    if (remoteProject) {
      if (base) {
        // Deleted locally. If the remote changed after the last sync, keep its
        // content as a conflicted copy before removing the original.
        if (newerThan(remoteProject, base)) {
          projects.push(createConflictCopy(remoteProject, now, deviceId));
          conflicts += 1;
        }
        removedIds.push(id);
      } else {
        projects.push(remoteProject);
        imported += 1;
      }
    }
  }

  const nextSynced: Record<string, SyncStamp> = {};
  for (const project of projects) {
    nextSynced[project.id] = { updatedAt: project.updatedAt, revision: project.revision };
  }
  return { projects, lastSynced: nextSynced, imported, exported, conflicts, removedIds };
}

/**
 * Syncs the working set through a folder (e.g. a Nextcloud desktop-client
 * folder). The layout is discoverable from directory listings alone; there is
 * no global index file.
 */
export class FolderSyncProvider implements SyncProvider {
  constructor(
    private readonly fs: SyncFileSystem,
    private readonly vaultOptions: CreateVaultOptions = {}
  ) {}

  async connect(passphrase: string): Promise<SyncConnection> {
    if (!(await this.fs.exists(VAULT_FILE))) {
      // Refuse to adopt a folder that already holds encrypted projects but no
      // header: creating a second vault would make those projects unreadable.
      for (const entry of await this.fs.listDir(PROJECTS_DIR)) {
        if (entry.isDirectory
          && await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.enc`)) {
          throw new Error("This folder contains encrypted projects but no vault file.");
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

  async pull(vaultKey: Uint8Array): Promise<StoredProject[]> {
    const entries = await this.fs.listDir(PROJECTS_DIR);
    const projects: StoredProject[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      const project = await readProjectFiles(this.fs, entry.name, vaultKey);
      if (project) projects.push(project);
    }
    return projects.sort((a, b) => compareStrings(a.id, b.id));
  }

  async push(projects: StoredProject[], vaultKey: Uint8Array): Promise<void> {
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
    const connection = await this.connect(passphrase);
    const merged = mergeProjects(local, connection.projects, lastSynced, now, deviceId);
    await this.push(merged.projects, connection.vaultKey);
    if (merged.removedIds.length > 0) await this.remove(merged.removedIds);
    return {
      projects: merged.projects,
      created: connection.created,
      imported: merged.imported,
      exported: merged.exported,
      removed: merged.removedIds.length,
      conflicts: merged.conflicts,
      lastSynced: merged.lastSynced
    };
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
