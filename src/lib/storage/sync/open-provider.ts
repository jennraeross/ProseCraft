import type { StoredProject } from "../types";
import { BUNDLE_FILE, OPEN_MARKER_FILE, PROJECTS_DIR, VAULT_FILE } from "./files";
import { projectDirName } from "./layout";
import { syncViaProvider } from "./orchestrate";
import {
  normalizeDocument,
  openMarkerText,
  readOpenMarker,
  readOpenProjects,
  writeOpenProject
} from "./open-layout";
import type {
  SyncConnection,
  SyncFileSystem,
  SyncMode,
  SyncProvider,
  SyncResult,
  SyncStamp
} from "./types";

/**
 * Plain Markdown + JSON layout for writers who want to inspect, edit, diff, or
 * version their project folder with external tools. Nothing in this layout is
 * encrypted.
 */
export class OpenFolderSyncProvider implements SyncProvider {
  readonly mode: SyncMode = "open-folder";

  constructor(private readonly fs: SyncFileSystem) {}

  async connect(_passphrase: string): Promise<SyncConnection> {
    const marker = await readOpenMarker(this.fs);
    if (marker) {
      return { projects: await this.pull(), created: false };
    }

    if (await this.fs.exists(VAULT_FILE)) {
      throw new Error("This folder is set up for encrypted-folder sync, not open-folder sync.");
    }
    if (await this.fs.exists(BUNDLE_FILE)) {
      throw new Error("This folder is set up for single-file sync, not open-folder sync.");
    }
    for (const entry of await this.fs.listDir(PROJECTS_DIR)) {
      if (!entry.isDirectory) continue;
      if (await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.enc`)) {
        throw new Error("This folder contains encrypted project files but no vault file.");
      }
      if (await this.fs.exists(`${PROJECTS_DIR}/${entry.name}/project.json`)) {
        throw new Error("This folder contains open-folder projects but no layout marker.");
      }
    }

    await this.fs.writeText(OPEN_MARKER_FILE, openMarkerText(Date.now()));
    return { projects: [], created: true };
  }

  async pull(): Promise<StoredProject[]> {
    return readOpenProjects(this.fs, Date.now());
  }

  async push(projects: StoredProject[]): Promise<void> {
    if (!(await this.fs.exists(OPEN_MARKER_FILE))) {
      await this.fs.writeText(OPEN_MARKER_FILE, openMarkerText(Date.now()));
    }
    await this.fs.createDir(PROJECTS_DIR);
    for (const project of projects) {
      await this.fs.createDir(projectDirName(project.id));
      await writeOpenProject(this.fs, project);
    }
  }

  async remove(projectIds: string[]): Promise<void> {
    for (const id of projectIds) {
      await this.fs.remove(projectDirName(id));
    }
  }

  /**
   * Markdown is the canonical body in this layout, so make the local records
   * match the Markdown round trip. Without this, the first sync would look like
   * a permanent local change and rewrite the folder on every run.
   */
  normalize(projects: StoredProject[]): StoredProject[] {
    return projects.map((project) => ({
      ...project,
      project: {
        ...project.project,
        documents: project.project.documents.map((document) => normalizeDocument(document))
      }
    }));
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
