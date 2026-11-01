import {
  ENVELOPE_VERSION,
  createVault,
  decryptEntity,
  encryptEntity,
  isEntityEnvelope,
  isVaultHeader,
  unlockVault,
  type EntityEnvelope,
  type VaultHeader
} from "./crypto";
import { isStoredProject } from "./schema";
import type { StoredProject } from "./types";

export const ENCRYPTED_BUNDLE_FORMAT = "prosecraft.encrypted";

/**
 * A portable, end-to-end encrypted backup. The header exposes only KDF params
 * and the wrapped content key; project contents live in `entities` as opaque
 * envelopes. The same format doubles as the single-file sync container.
 */
export type EncryptedBundle = {
  format: string;
  version: number;
  createdAt: number;
  hint?: string;
  header: VaultHeader;
  entities: EntityEnvelope[];
};

export type CreateEncryptedBundleOptions = {
  hint?: string;
  memoryKiB?: number;
  iterations?: number;
  parallelism?: number;
};

export type OpenEncryptedBundle = {
  bundle: EncryptedBundle;
  header: VaultHeader;
  vaultKey: Uint8Array;
  projects: StoredProject[];
};

/** Parses and validates the cleartext envelope of an encrypted bundle. */
export function parseEncryptedBundle(text: string): EncryptedBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid ProseCraft backup data.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("That file is not an encrypted ProseCraft backup.");
  }
  const bundle = parsed as Partial<EncryptedBundle>;
  if (bundle.format !== ENCRYPTED_BUNDLE_FORMAT
    || bundle.version !== ENVELOPE_VERSION
    || !isVaultHeader(bundle.header)
    || !Array.isArray(bundle.entities)) {
    throw new Error("That file is not an encrypted ProseCraft backup.");
  }
  return bundle as EncryptedBundle;
}

/** Decrypts every project envelope using an already-unlocked vault key. */
export function decryptBundleProjects(bundle: EncryptedBundle, vaultKey: Uint8Array): StoredProject[] {
  const projects: StoredProject[] = [];
  for (const envelope of bundle.entities) {
    // Only project envelopes are accepted; anything else means the bundle was
    // written by a different (or future) layout and must not be merged.
    if (!isEntityEnvelope(envelope) || envelope.kind !== "project") continue;
    const payload = decryptEntity(vaultKey, envelope);
    // The envelope id is authenticated, so a payload that claims another id is
    // tampering and must not be imported.
    if (isStoredProject(payload) && payload.id === envelope.id) projects.push(payload);
  }
  return projects;
}

/** Serializes projects into an encrypted bundle using an existing vault key. */
export function serializeEncryptedBundle(
  projects: StoredProject[],
  header: VaultHeader,
  vaultKey: Uint8Array,
  deviceId: string,
  createdAt: number,
  hint?: string
): string {
  const entities = projects.map((project) => encryptEntity(vaultKey, {
    kind: "project",
    id: project.id,
    projectId: project.id,
    deviceId: project.updatedBy || deviceId,
    updatedAt: project.updatedAt,
    revision: project.revision
  }, project));
  const bundle: EncryptedBundle = {
    format: ENCRYPTED_BUNDLE_FORMAT,
    version: ENVELOPE_VERSION,
    createdAt,
    hint,
    header,
    entities
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Encrypts whole project records. Each project becomes one envelope whose
 * cleartext header carries the routing/merge metadata sync needs.
 */
export async function createEncryptedBundle(
  stored: StoredProject[],
  passphrase: string,
  deviceId: string,
  options: CreateEncryptedBundleOptions = {}
): Promise<string> {
  const { header, vaultKey } = await createVault(passphrase, options);
  return serializeEncryptedBundle(stored, header, vaultKey, deviceId, Date.now(), options.hint);
}

/** Reads the cleartext hint without needing the passphrase. */
export function readEncryptedBundleHint(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as Partial<EncryptedBundle>;
    return typeof parsed?.hint === "string" && parsed.hint ? parsed.hint : undefined;
  } catch {
    return undefined;
  }
}

/** Parses, unlocks, and decrypts an encrypted bundle. */
export async function openEncryptedBundle(text: string, passphrase: string): Promise<OpenEncryptedBundle> {
  const bundle = parseEncryptedBundle(text);
  const vaultKey = await unlockVault(bundle.header, passphrase);
  return {
    bundle,
    header: bundle.header,
    vaultKey,
    projects: decryptBundleProjects(bundle, vaultKey)
  };
}

/**
 * Unlocks and decrypts an encrypted backup. Throws "Incorrect passphrase." when
 * the passphrase is wrong and a descriptive error for malformed files.
 */
export async function decryptEncryptedBundle(text: string, passphrase: string): Promise<StoredProject[]> {
  const opened = await openEncryptedBundle(text, passphrase);
  if (opened.projects.length === 0) {
    throw new Error("The backup did not contain any readable projects.");
  }
  return opened.projects;
}
