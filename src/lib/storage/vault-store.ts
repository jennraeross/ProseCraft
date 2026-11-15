import type { StoredVault } from "./types";

/**
 * IndexedDB-backed storage for the canonical vault.
 *
 * localStorage is limited to roughly 5 MB in WebKit, which is easily exhausted
 * by embedded illustrations and cover art. The vault is much larger than that,
 * so it lives in IndexedDB while preferences and the device id stay in
 * localStorage.
 *
 * Writes are coalesced and run in the background. Callers keep a synchronous
 * in-memory cache (see `repository.ts`), so the UI never waits on IndexedDB.
 */

const DATABASE_NAME = "prosecraft-vault";
const DATABASE_VERSION = 1;
const STORE_NAME = "vault";
const RECORD_KEY = "current";
const WRITE_DELAY_MS = 250;

export type VaultBackend = "indexeddb" | "localstorage";

let backend: VaultBackend = "localstorage";
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> | null = null;
let pendingVault: StoredVault | null = null;
let lastError: unknown = null;
let forcedWriteError: unknown = null;
const errorListeners = new Set<(error: unknown) => void>();

export function getVaultBackend(): VaultBackend {
  return backend;
}

export function setVaultBackend(value: VaultBackend): void {
  backend = value;
}

/**
 * WebKit reports localStorage exhaustion as `QuotaExceededError` with the
 * message “The quota has been exceeded.” Firefox uses a different name/code.
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError"
      || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
      || error.code === 22
      || error.code === 1014;
  }
  if (error instanceof Error) {
    return error.name === "QuotaExceededError"
      || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
      || /quota/i.test(error.message);
  }
  return false;
}

/** Subscribes to background write failures. Returns an unsubscribe function. */
export function onVaultStorageError(listener: (error: unknown) => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function notifyError(error: unknown): void {
  lastError = error;
  for (const listener of errorListeners) {
    try {
      listener(error);
    } catch {
      // A failing listener must not break persistence.
    }
  }
}

function openVaultDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open vault storage."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("Vault storage failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Vault storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Vault storage was interrupted."));
  });
}

export async function readVaultRecord(): Promise<unknown> {
  const database = await openVaultDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(RECORD_KEY)
    ) as { key: string; vault: unknown } | undefined;
    return record?.vault;
  } finally {
    database.close();
  }
}

function isDataCloneError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { name?: unknown }).name === "DataCloneError";
}

async function putVaultRecord(database: IDBDatabase, vault: StoredVault): Promise<void> {
  const transaction = database.transaction(STORE_NAME, "readwrite");
  try {
    const request = transaction.objectStore(STORE_NAME).put({ key: RECORD_KEY, vault });
    await Promise.all([requestResult(request), transactionComplete(transaction)]);
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction already finished or aborted.
    }
    throw error;
  }
}

/**
 * IndexedDB rejects structured-clone-unfriendly values such as Svelte `$state`
 * proxies with a DataCloneError. Callers should pass plain data, but a missed
 * snapshot must never leave the app unable to save: fall back to a JSON copy so
 * the write still succeeds.
 */
export async function writeVaultRecord(vault: StoredVault): Promise<void> {
  const database = await openVaultDatabase();
  try {
    try {
      await putVaultRecord(database, vault);
    } catch (error) {
      if (!isDataCloneError(error)) throw error;
      console.warn(
        "The vault contained values IndexedDB cannot clone; storing a plain copy instead.",
        error
      );
      await putVaultRecord(database, JSON.parse(JSON.stringify(vault)) as StoredVault);
    }
  } finally {
    database.close();
  }
}

export async function deleteVaultRecord(): Promise<void> {
  const database = await openVaultDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = transactionComplete(transaction);
    await Promise.all([
      requestResult(transaction.objectStore(STORE_NAME).delete(RECORD_KEY)),
      done
    ]);
  } finally {
    database.close();
  }
}

/** Queues the latest vault snapshot for a background IndexedDB write. */
export function queueVaultWrite(vault: StoredVault): void {
  if (backend !== "indexeddb") return;
  pendingVault = vault;
  if (writing || writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = undefined;
    startWriting();
  }, WRITE_DELAY_MS);
}

function startWriting(): void {
  if (writing) return;
  writing = (async () => {
    while (pendingVault) {
      const vault = pendingVault;
      pendingVault = null;
      if (forcedWriteError) {
        const error = forcedWriteError;
        forcedWriteError = null;
        notifyError(error);
        continue;
      }
      try {
        await writeVaultRecord(vault);
        lastError = null;
      } catch (error) {
        notifyError(error);
      }
    }
  })().finally(() => {
    writing = null;
    if (pendingVault && !writeTimer) startWriting();
  });
}

/**
 * Waits for all queued writes to finish. Throws the most recent write error so
 * callers that need durability (export, import, sync, app close) can react.
 */
export async function flushVaultStorage(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = undefined;
  }
  // Writes can be queued while an earlier flush is awaiting IndexedDB, so keep
  // draining until both the queue and the active write are empty.
  while (pendingVault || writing) {
    if (pendingVault && !writing) startWriting();
    if (writing) await writing;
  }
  if (lastError) throw lastError;
}

export function getVaultStorageError(): unknown {
  return lastError;
}

/** Test helper: makes the next background write fail with `error`. */
export function setVaultWriteFailureForTests(error: unknown): void {
  forcedWriteError = error;
}

/** Test helper: clears timers, listeners, and cached error state. */
export function resetVaultStoreForTests(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = undefined;
  writing = null;
  pendingVault = null;
  lastError = null;
  forcedWriteError = null;
  backend = "localstorage";
  errorListeners.clear();
}
