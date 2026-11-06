import { getDeviceId } from "./device";
import { sanitizeHtml } from "../sanitize";
import {
  createStoredProject,
  isLegacyProjectData,
  isStoredProject,
  stampProject
} from "./schema";
import { createEncryptedBundle, decryptEncryptedBundle } from "./encrypted-bundle";
import {
  SCHEMA_VERSION,
  type ProjectData,
  type StoredProject,
  type StoredVault
} from "./types";
import {
  flushVaultStorage as flushQueuedVaultWrites,
  getVaultBackend,
  queueVaultWrite,
  readVaultRecord,
  resetVaultStoreForTests,
  setVaultBackend,
  writeVaultRecord
} from "./vault-store";

export {
  flushVaultStorage,
  isQuotaExceededError,
  onVaultStorageError
} from "./vault-store";

/**
 * Canonical key for the sync-ready vault (versioned envelope + metadata).
 * IndexedDB is the primary store; the keys below are read only to migrate
 * installs created before the move off localStorage.
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

const LEGACY_STORAGE_KEYS = [
  VAULT_STORAGE_KEY,
  PROJECTS_STORAGE_KEY,
  ACTIVE_PROJECT_STORAGE_KEY,
  DOCUMENTS_STORAGE_KEY,
  CHAPTERS_STORAGE_KEY,
  ACTIVE_DOCUMENT_STORAGE_KEY,
  GOALS_STORAGE_KEY,
  ACTIVITY_STORAGE_KEY,
  PROJECT_SETTINGS_STORAGE_KEY
];

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

let vaultCache: StoredVault | null = null;
let initialized = false;

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

/**
 * Reads the pre-IndexedDB localStorage shapes. The vault wins whenever it is
 * present; `prosecraft-projects` is only a migration source. This ordering is
 * important because legacy keys are no longer updated and must never overwrite
 * a newer vault.
 */
function readLocalVault(): StoredVault | null {
  if (!hasStorage()) return null;
  const vault = normalizeVault(readJson(VAULT_STORAGE_KEY));
  if (vault) return vault;

  const legacy = readJson(PROJECTS_STORAGE_KEY);
  if (!Array.isArray(legacy)) return null;
  const projects = legacy.filter(isLegacyProjectData);
  if (projects.length === 0) return null;

  const deviceId = getDeviceId();
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    deviceId,
    activeProjectId: pickActiveProject(projects, localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY))
      ?? projects[0].id,
    updatedAt: now,
    projects: projects.map((project) => createStoredProject(project, deviceId, now))
  };
}

/** Removes the old localStorage copies once IndexedDB holds a verified vault. */
function clearLegacyVaultKeys(): void {
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // A failed cleanup is harmless; the vault is already authoritative.
    }
  }
}

/**
 * Initializes the local store and migrates any existing localStorage data into
 * IndexedDB. Must be awaited once before the editor reads the vault.
 */
export async function initVaultStorage(): Promise<void> {
  if (initialized) return;
  if (!hasStorage()) {
    initialized = true;
    return;
  }

  const local = readLocalVault();

  if (typeof indexedDB === "undefined") {
    setVaultBackend("localstorage");
    vaultCache = local;
    initialized = true;
    return;
  }

  try {
    const existing = normalizeVault(await readVaultRecord());
    if (existing) {
      setVaultBackend("indexeddb");
      vaultCache = existing;
      clearLegacyVaultKeys();
      initialized = true;
      return;
    }

    setVaultBackend("indexeddb");
    vaultCache = local;
    if (local) {
      await writeVaultRecord(local);
      const verified = normalizeVault(await readVaultRecord());
      if (!verified) throw new Error("Could not verify the migrated vault.");
      vaultCache = verified;
      clearLegacyVaultKeys();
    }
    initialized = true;
  } catch (error) {
    // IndexedDB can be unavailable in locked-down webviews. Keep the app usable
    // on localStorage rather than failing to start.
    console.error("Could not initialize IndexedDB vault storage; using localStorage.", error);
    setVaultBackend("localstorage");
    vaultCache = local;
    initialized = true;
  }
}

function writeLocalVault(vault: StoredVault): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, vault.activeProjectId);
}

function writeStoredInternal(stored: StoredProject[], activeProjectId: string): void {
  const vault: StoredVault = {
    schemaVersion: SCHEMA_VERSION,
    deviceId: getDeviceId(),
    activeProjectId,
    updatedAt: Date.now(),
    projects: stored
  };
  vaultCache = vault;
  if (getVaultBackend() === "indexeddb") {
    queueVaultWrite(vault);
    return;
  }
  writeLocalVault(vault);
}

/**
 * Writes an already-stamped set of projects to the vault. Kept separate from
 * {@link saveVault} so imports can replace records without re-stamping them.
 */
export function writeStored(stored: StoredProject[], activeProjectId: string): void {
  if (!hasStorage()) return;
  writeStoredInternal(stored, activeProjectId);
}

function readStoredProjects(): StoredProject[] {
  return vaultCache?.projects ?? readLocalVault()?.projects ?? [];
}

/**
 * Loads the vault and its active project. The cache is populated by
 * {@link initVaultStorage}; the localStorage reader remains as a synchronous
 * fallback for tests and environments without IndexedDB.
 */
export function loadVault(): VaultLoad | null {
  if (!hasStorage()) return null;
  const vault = vaultCache ?? readLocalVault();
  if (!vault) return null;
  return {
    projects: vault.projects.map((project) => project.project),
    activeProjectId: vault.activeProjectId,
    stored: vault.projects,
    deviceId: vault.deviceId
  };
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
  writeStoredInternal(stored, activeProjectId);
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
export async function importBundleText(text: string): Promise<ImportResult> {
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
 *
 * Incoming document content is sanitized before storage so an imported backup
 * cannot introduce HTML that the editor would later execute (self-XSS defense
 * for backups obtained from outside this installation).
 */
async function mergeIncomingProjects(incoming: StoredProject[]): Promise<ImportResult> {
  const existingById = new Map(readStoredProjects().map((project) => [project.id, project]));
  let imported = 0;
  for (const project of incoming) {
    const previous = existingById.get(project.id);
    const wins = !previous
      || project.updatedAt > previous.updatedAt
      || (project.updatedAt === previous.updatedAt && project.revision > previous.revision);
    if (wins) {
      existingById.set(project.id, sanitizeStoredProject(project));
      imported += 1;
    }
  }
  const merged = [...existingById.values()];
  const savedActiveId = vaultCache?.activeProjectId
    ?? localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
  const activeProjectId = merged.some((project) => project.id === savedActiveId)
    ? savedActiveId as string
    : merged[0].id;
  writeStored(merged, activeProjectId);
  await flushQueuedVaultWrites();
  return { imported, total: merged.length };
}

/**
 * Returns a copy of a stored project whose document bodies have been run
 * through the same sanitizer the editor uses at persist time. Skipped outside
 * the browser so the storage layer stays importable in test runners.
 */
function sanitizeStoredProject(project: StoredProject): StoredProject {
  if (typeof document === "undefined") return project;
  const sanitized = { ...project.project };
  sanitized.documents = project.project.documents.map((document) => ({
    ...document,
    content: sanitizeHtml(document.content)
  }));
  return { ...project, project: sanitized };
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

/** Test helper: clears the in-memory vault and the IndexedDB write queue. */
export function resetVaultStorageForTests(): void {
  vaultCache = null;
  initialized = false;
  resetVaultStoreForTests();
}
