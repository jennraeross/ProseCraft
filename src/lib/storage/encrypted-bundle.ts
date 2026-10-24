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
 * envelopes. This is the same envelope shape Phase 2 will use for files in the
 * synced folder, so the crypto path is exercised end to end today.
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
  const entities = stored.map((project) => encryptEntity(vaultKey, {
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
    createdAt: Date.now(),
    hint: options.hint,
    header,
    entities
  };
  return JSON.stringify(bundle, null, 2);
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

/**
 * Unlocks and decrypts an encrypted backup. Throws "Incorrect passphrase." when
 * the passphrase is wrong and a descriptive error for malformed files.
 */
export async function decryptEncryptedBundle(text: string, passphrase: string): Promise<StoredProject[]> {
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
  const vaultKey = await unlockVault(bundle.header, passphrase);
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
  if (projects.length === 0) {
    throw new Error("The backup did not contain any readable projects.");
  }
  return projects;
}
