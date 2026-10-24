import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { argon2idAsync } from "@noble/hashes/argon2.js";

/**
 * Envelope format version. Bump when the cleartext header or KDF contract
 * changes so older readers can refuse or migrate rather than misread.
 */
export const ENVELOPE_VERSION = 1;

/** OWASP-recommended Argon2id parameters (19 MiB, 2 passes, single lane). */
export const ARGON2_DEFAULTS = {
  memoryKiB: 19456,
  iterations: 2,
  parallelism: 1
} as const;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 24;
const VAULT_KEY_AAD = "prosecraft-vault-key-v1";

/**
 * Upper bounds for KDF parameters read from a vault header. Without them, a
 * malformed or hostile header could request an enormous Argon2 allocation and
 * hang the app while unlocking. The generous ceiling still allows much stronger
 * settings than the defaults.
 */
const MAX_KDF_MEMORY_KIB = 262_144;
const MAX_KDF_ITERATIONS = 16;
const MAX_KDF_PARALLELISM = 8;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && BASE64_PATTERN.test(value);
}

function isBase64OfLength(value: string, length: number): boolean {
  if (!isBase64(value)) return false;
  try {
    return atob(value).length === length;
  } catch {
    return false;
  }
}

export type KdfParams = {
  algorithm: "argon2id";
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  salt: string;
};

export type WrappedKey = {
  nonce: string;
  ciphertext: string;
};

/** Cleartext part of `vault.json`: enough to derive the key, nothing secret. */
export type VaultHeader = {
  version: number;
  kdf: KdfParams;
  wrappedKey: WrappedKey;
  hint?: string;
};

/**
 * Thin cleartext header for an encrypted record. Only routing/merge metadata is
 * visible; the payload itself is opaque. `body` is the AEAD ciphertext and the
 * header fields are authenticated as additional data.
 */
export type EntityEnvelope = {
  version: number;
  kind: string;
  id: string;
  projectId: string;
  deviceId: string;
  updatedAt: number;
  revision: number;
  nonce: string;
  body: string;
};

export type EntityMetaPlain = {
  kind: string;
  id: string;
  projectId: string;
  deviceId: string;
  updatedAt: number;
  revision: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function entityAad(envelope: EntityEnvelope): Uint8Array {
  return encoder.encode([
    "prosecraft-entity",
    String(envelope.version),
    envelope.kind,
    envelope.id,
    envelope.projectId,
    envelope.deviceId,
    String(envelope.updatedAt),
    String(envelope.revision)
  ].join("\u0000"));
}

export function isKdfParams(value: unknown): value is KdfParams {
  if (typeof value !== "object" || value === null) return false;
  const params = value as Partial<KdfParams>;
  return params.algorithm === "argon2id"
    && typeof params.memoryKiB === "number" && Number.isInteger(params.memoryKiB)
    && params.memoryKiB >= 8 && params.memoryKiB <= MAX_KDF_MEMORY_KIB
    && typeof params.iterations === "number" && Number.isInteger(params.iterations)
    && params.iterations >= 1 && params.iterations <= MAX_KDF_ITERATIONS
    && typeof params.parallelism === "number" && Number.isInteger(params.parallelism)
    && params.parallelism >= 1 && params.parallelism <= MAX_KDF_PARALLELISM
    && typeof params.salt === "string" && isBase64(params.salt);
}

export function isVaultHeader(value: unknown): value is VaultHeader {
  if (typeof value !== "object" || value === null) return false;
  const header = value as Partial<VaultHeader>;
  const wrapped = header.wrappedKey;
  return header.version === ENVELOPE_VERSION
    && isKdfParams(header.kdf)
    && typeof wrapped === "object"
    && wrapped !== null
    && typeof wrapped.nonce === "string"
    && isBase64OfLength(wrapped.nonce, NONCE_LENGTH)
    && typeof wrapped.ciphertext === "string"
    && isBase64OfLength(wrapped.ciphertext, KEY_LENGTH + 16)
    && (header.hint === undefined || typeof header.hint === "string");
}

export function isEntityEnvelope(value: unknown): value is EntityEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as Partial<EntityEnvelope>;
  return envelope.version === ENVELOPE_VERSION
    && typeof envelope.kind === "string"
    && typeof envelope.id === "string"
    && typeof envelope.projectId === "string"
    && typeof envelope.deviceId === "string"
    && typeof envelope.updatedAt === "number" && Number.isFinite(envelope.updatedAt)
    && typeof envelope.revision === "number" && Number.isInteger(envelope.revision) && envelope.revision >= 0
    && typeof envelope.nonce === "string"
    && isBase64OfLength(envelope.nonce, NONCE_LENGTH)
    && typeof envelope.body === "string"
    && isBase64(envelope.body);
}

/**
 * Derives the key-encryption key from a passphrase. The passphrase is normalized
 * to NFKC so the same text typed on different platforms derives the same key.
 */
export async function deriveKek(passphrase: string, kdf: KdfParams): Promise<Uint8Array> {
  if (!isKdfParams(kdf)) throw new Error("Unsupported key-derivation parameters.");
  return argon2idAsync(
    encoder.encode(passphrase.normalize("NFKC")),
    base64ToBytes(kdf.salt),
    {
      m: kdf.memoryKiB,
      t: kdf.iterations,
      p: kdf.parallelism,
      dkLen: KEY_LENGTH
    }
  );
}

function wrapVaultKey(vaultKey: Uint8Array, kek: Uint8Array): WrappedKey {
  const nonce = randomBytes(NONCE_LENGTH);
  const ciphertext = xchacha20poly1305(kek, nonce, encoder.encode(VAULT_KEY_AAD)).encrypt(vaultKey);
  return { nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(ciphertext) };
}

function unwrapVaultKey(wrapped: WrappedKey, kek: Uint8Array): Uint8Array {
  return xchacha20poly1305(kek, base64ToBytes(wrapped.nonce), encoder.encode(VAULT_KEY_AAD))
    .decrypt(base64ToBytes(wrapped.ciphertext));
}

export type CreatedVault = {
  header: VaultHeader;
  vaultKey: Uint8Array;
};

export type CreateVaultOptions = {
  hint?: string;
  memoryKiB?: number;
  iterations?: number;
  parallelism?: number;
};

/**
 * Creates a fresh vault: a random content key, wrapped by a passphrase-derived
 * key. The returned header is safe to store/transmit in the clear.
 */
export async function createVault(passphrase: string, options: CreateVaultOptions = {}): Promise<CreatedVault> {
  if (!passphrase) throw new Error("A passphrase is required.");
  const vaultKey = randomBytes(KEY_LENGTH);
  const kdf: KdfParams = {
    algorithm: "argon2id",
    memoryKiB: options.memoryKiB ?? ARGON2_DEFAULTS.memoryKiB,
    iterations: options.iterations ?? ARGON2_DEFAULTS.iterations,
    parallelism: options.parallelism ?? ARGON2_DEFAULTS.parallelism,
    salt: bytesToBase64(randomBytes(SALT_LENGTH))
  };
  const kek = await deriveKek(passphrase, kdf);
  const wrappedKey = wrapVaultKey(vaultKey, kek);
  return {
    header: { version: ENVELOPE_VERSION, kdf, wrappedKey, hint: options.hint },
    vaultKey
  };
}

/** Recovers the content key. Throws a user-facing error on a wrong passphrase. */
export async function unlockVault(header: VaultHeader, passphrase: string): Promise<Uint8Array> {
  if (!isVaultHeader(header)) throw new Error("This is not a valid ProseCraft vault.");
  const kek = await deriveKek(passphrase, header.kdf);
  try {
    return unwrapVaultKey(header.wrappedKey, kek);
  } catch {
    throw new Error("Incorrect passphrase.");
  }
}

/** Encrypts a JSON payload into an envelope with an authenticated header. */
export function encryptEntity(vaultKey: Uint8Array, meta: EntityMetaPlain, payload: unknown): EntityEnvelope {
  const nonce = randomBytes(NONCE_LENGTH);
  const header: EntityEnvelope = {
    version: ENVELOPE_VERSION,
    kind: meta.kind,
    id: meta.id,
    projectId: meta.projectId,
    deviceId: meta.deviceId,
    updatedAt: meta.updatedAt,
    revision: meta.revision,
    nonce: bytesToBase64(nonce),
    body: ""
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = xchacha20poly1305(vaultKey, nonce, entityAad(header)).encrypt(plaintext);
  header.body = bytesToBase64(ciphertext);
  return header;
}

/**
 * Decrypts an envelope. Authentication covers the cleartext header, so any
 * change to `id`, `revision`, etc. makes this throw instead of returning
 * attacker-controlled metadata.
 */
export function decryptEntity(vaultKey: Uint8Array, envelope: EntityEnvelope): unknown {
  if (!isEntityEnvelope(envelope)) throw new Error("This record is not readable.");
  let plaintext: Uint8Array;
  try {
    plaintext = xchacha20poly1305(vaultKey, base64ToBytes(envelope.nonce), entityAad(envelope))
      .decrypt(base64ToBytes(envelope.body));
  } catch {
    throw new Error("This record could not be decrypted.");
  }
  try {
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error("This record could not be decoded.");
  }
}
