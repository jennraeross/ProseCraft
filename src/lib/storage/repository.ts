import { getDeviceId } from "./device";
import {
  createStoredProject,
  isLegacyProjectData,
  isStoredProject,
  stableStringify,
  stampProject
} from "./schema";
import { createEncryptedBundle, decryptEncryptedBundle } from "./encrypted-bundle";
import {
  SCHEMA_VERSION,
  type ProjectData,
  type StoredProject,
  type StoredVault
} from "./types";

/**
 * Canonical key for the sync-ready vault (versioned envelope + metadata).
 * The other keys below are compatibility mirrors so earlier builds, existing
 * tests, and the in-app legacy loader keep working during the transition.
 */
export const VAULT_STORAGE_KEY = "prosecraft-vault";
export const PROJECTS_STORAGE_KEY = "prosecraft-projects";
export const ACTIVE_PROJECT_STORAGE_KEY = "prosecraft-active-project";
export const DOCUMENTS_STORAGE_KEY = "prosecraft-documents";
export const CHAPTERS_STORAGE_KEY = "prosecraft-chapters";
export const ACTIVE_DOCUMENT_STORAGE_KEY = "prosecraft-active-document";
export const GOALS_STORAGE_KEY = "prosecraft-writing-goals";
export const ACTIVITY_STORAGE_KEY = "prosecraft-writing-activity";
export const PROJECT_SETTINGS_STORAGE_KEY = "prosecraft-project-settings";

export type VaultLoad = {
  projects: ProjectData[];
  activeProjectId: string;
  stored: StoredProject[];
  deviceId: string;
};

export type ImportResult = {
  imported: number;
  total: number;
};

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Accepts either the current vault envelope or a legacy `ProjectData[]` array
 * and produces a validated vault. Everything that is not a recognized record is
 * dropped rather than throwing, so a partially corrupt store still loads.
 */
function normalizeVault(value: unknown): StoredVault | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<StoredVault>;
  if (!Array.isArray(candidate.projects)) return null;
  const deviceId = typeof candidate.deviceId === "string" && candidate.deviceId
    ? candidate.deviceId
    : getDeviceId();
  const now = Date.now();
  const projects: StoredProject[] = [];
  for (const item of candidate.projects) {
    if (isStoredProject(item)) {
      projects.push(item);
    } else if (isLegacyProjectData(item)) {
      projects.push(createStoredProject(item, deviceId, now));
    }
  }
  if (projects.length === 0) return null;
  return {
    schemaVersion: typeof candidate.schemaVersion === "number" ? candidate.schemaVersion : SCHEMA_VERSION,
    deviceId,
    activeProjectId: typeof candidate.activeProjectId === "string" ? candidate.activeProjectId : projects[0].id,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : now,
    projects
  };
}

/** Reads projects from storage in any supported historical shape. */
function readStoredProjects(): StoredProject[] {
  if (!hasStorage()) return [];
  const vault = normalizeVault(readJson(VAULT_STORAGE_KEY));
  if (vault) return vault.projects;
  const legacy = readJson(PROJECTS_STORAGE_KEY);
  if (Array.isArray(legacy)) {
    const projects = legacy.filter(isLegacyProjectData);
    if (projects.length > 0) return projects.map((project) => createStoredProject(project, getDeviceId(), Date.now()));
  }
  return [];
}

function mirrorActiveProject(projects: ProjectData[], activeProjectId: string): void {
  const active = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  if (!active) return;
  localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(active.documents));
  localStorage.setItem(CHAPTERS_STORAGE_KEY, JSON.stringify(active.chapters));
  localStorage.setItem(ACTIVE_DOCUMENT_STORAGE_KEY, active.activeDocumentId);
  localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify({
    projectGoal: active.projectGoal,
    chapterGoals: active.chapterGoals
  }));
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(active.activity));
  localStorage.setItem(PROJECT_SETTINGS_STORAGE_KEY, JSON.stringify({
    projectName: active.name,
    authorName: active.author
  }));
}

/**
 * Writes an already-stamped set of projects to the canonical vault plus the
 * legacy mirrors. Kept separate from {@link saveVault} so imports can replace
 * records without re-stamping them.
 */
export function writeStored(stored: StoredProject[], activeProjectId: string): void {
  if (!hasStorage()) return;
  const projects = stored.map((project) => project.project);
  const vault: StoredVault = {
    schemaVersion: SCHEMA_VERSION,
    deviceId: getDeviceId(),
    activeProjectId,
    updatedAt: Date.now(),
    projects: stored
  };
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId);
  mirrorActiveProject(projects, activeProjectId);
}

/**
 * Loads the vault and its active project.
 *
 * The legacy `prosecraft-projects` array is still treated as an authoritative
 * domain-data source whenever it disagrees with the vault. ProseCraft's own
 * writes always keep the two in lockstep, so a mismatch can only mean another
 * writer touched the legacy key (an older build, or a test harness placing
 * fixtures). In that case we trust it and re-stamp metadata. This keeps
 * downgrades and existing fixtures working during the transition to the
 * sync-ready vault.
 */
export function loadVault(): VaultLoad | null {
  if (!hasStorage()) return null;
  const vault = normalizeVault(readJson(VAULT_STORAGE_KEY));
  const legacyRaw = readJson(PROJECTS_STORAGE_KEY);
  const legacyProjects = Array.isArray(legacyRaw) ? legacyRaw.filter(isLegacyProjectData) : null;

  const deviceId = getDeviceId();
  if (vault) {
    const vaultProjects = vault.projects.map((project) => project.project);
    if (legacyProjects && legacyProjects.length > 0
      && stableStringify(legacyProjects) !== stableStringify(vaultProjects)) {
      const stored = legacyProjects.map((project) => createStoredProject(project, deviceId, Date.now()));
      const activeProjectId = pickActiveProject(legacyProjects, localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY))
        ?? (legacyProjects.some((project) => project.id === vault.activeProjectId)
          ? vault.activeProjectId
          : legacyProjects[0].id);
      try {
        writeStored(stored, activeProjectId);
      } catch (error) {
        console.error("Could not reconcile legacy projects with the vault.", error);
      }
      return { projects: legacyProjects, activeProjectId, stored, deviceId };
    }
    return {
      projects: vaultProjects,
      activeProjectId: vault.activeProjectId,
      stored: vault.projects,
      deviceId: vault.deviceId
    };
  }

  if (legacyProjects && legacyProjects.length > 0) {
    const stored = legacyProjects.map((project) => createStoredProject(project, deviceId, Date.now()));
    const activeProjectId = pickActiveProject(legacyProjects, localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY))
      ?? legacyProjects[0].id;
    try {
      writeStored(stored, activeProjectId);
    } catch (error) {
      console.error("Could not migrate legacy projects into the vault.", error);
    }
    return { projects: legacyProjects, activeProjectId, stored, deviceId };
  }
  return null;
}

function pickActiveProject(projects: ProjectData[], candidate: string | null): string | null {
  if (!candidate) return null;
  return projects.some((project) => project.id === candidate) ? candidate : null;
}

/** Current device id, exposed so callers can display or attach it. */
export function currentDeviceId(): string {
  return getDeviceId();
}

/** Exposes the stamped records to the sync engine without UI state. */
export function readStoredProjectRecords(): StoredProject[] {
  return readStoredProjects();
}

/**
 * Persists the working set. Each project is diffed against its previous stored
 * version so sync metadata (revision/updatedAt/tombstones) is only advanced for
 * records that actually changed.
 */
export function saveVault(projects: ProjectData[], activeProjectId: string): StoredProject[] {
  if (!hasStorage()) return [];
  const deviceId = getDeviceId();
  const now = Date.now();
  const previousById = new Map(readStoredProjects().map((project) => [project.id, project]));
  const stored = projects.map((project) => stampProject(previousById.get(project.id), project, deviceId, now));
  writeStored(stored, activeProjectId);
  return stored;
}

export type DataBundle = {
  format: "prosecraft.bundle";
  schemaVersion: number;
  exportedAt: number;
  deviceId: string;
  projects: StoredProject[];
};

/** Serializes every stored project into a portable, versioned backup. */
export function createBundleText(): string {
  const bundle: DataBundle = {
    format: "prosecraft.bundle",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    deviceId: getDeviceId(),
    projects: readStoredProjects()
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Merges a backup into the store. Conflicts are resolved per project by
 * last-write-wins on `updatedAt`, with `revision` as a tie-breaker. Entity-level
 * reconciliation arrives with the sync engine; a portable backup only needs
 * whole-project granularity for now.
 */
export function importBundleText(text: string): ImportResult {
  if (!hasStorage()) throw new Error("Storage is not available in this environment.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid ProseCraft backup data.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("That file is not a ProseCraft backup.");
  }
  const candidate = parsed as Partial<DataBundle>;
  if (candidate.format !== "prosecraft.bundle") {
    throw new Error("That file is not a ProseCraft backup.");
  }
  if (!Array.isArray(candidate.projects)) {
    throw new Error("The backup did not contain any projects.");
  }
  const incoming = candidate.projects.filter(isStoredProject);
  if (incoming.length === 0) {
    throw new Error("The backup did not contain any valid projects.");
  }
  return mergeIncomingProjects(incoming);
}

/**
 * Merges incoming project records into the store by last-write-wins on
 * `updatedAt`, with `revision` as a tie-breaker. Shared by the plaintext and
 * encrypted import paths.
 */
function mergeIncomingProjects(incoming: StoredProject[]): ImportResult {
  const existingById = new Map(readStoredProjects().map((project) => [project.id, project]));
  let imported = 0;
  for (const project of incoming) {
    const previous = existingById.get(project.id);
    const wins = !previous
      || project.updatedAt > previous.updatedAt
      || (project.updatedAt === previous.updatedAt && project.revision > previous.revision);
    if (wins) {
      existingById.set(project.id, project);
      imported += 1;
    }
  }
  const merged = [...existingById.values()];
  const savedActiveId = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
  const activeProjectId = merged.some((project) => project.id === savedActiveId)
    ? savedActiveId as string
    : merged[0].id;
  writeStored(merged, activeProjectId);
  return { imported, total: merged.length };
}

/**
 * Builds a passphrase-encrypted backup of every stored project. The result is a
 * self-contained file with a cleartext KDF header and opaque payloads.
 */
export async function createEncryptedBundleText(passphrase: string, hint?: string): Promise<string> {
  return createEncryptedBundle(readStoredProjects(), passphrase, getDeviceId(), hint ? { hint } : {});
}

/** Decrypts an encrypted backup and merges it into the store. */
export async function importEncryptedBundleText(text: string, passphrase: string): Promise<ImportResult> {
  return mergeIncomingProjects(await decryptEncryptedBundle(text, passphrase));
}
