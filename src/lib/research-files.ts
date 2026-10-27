const DATABASE_NAME = "prosecraft-research-files";
const DATABASE_VERSION = 1;
const STORE_NAME = "files";

type StoredResearchFile = {
  key: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
};

function recordKey(projectId: string, storageKey: string): string {
  return `${projectId}:${storageKey}`;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Browser file storage is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser file storage."));
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
    request.onerror = () => reject(request.error ?? new Error("Browser file storage failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Browser file storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser file storage was interrupted."));
  });
}

export async function saveBrowserResearchFile(
  projectId: string,
  storageKey: string,
  file: Blob,
  fileName: string,
  mimeType: string
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const record: StoredResearchFile = {
      key: recordKey(projectId, storageKey),
      blob: file,
      fileName,
      mimeType
    };
    const done = transactionComplete(transaction);
    await Promise.all([
      requestResult(transaction.objectStore(STORE_NAME).put(record)),
      done
    ]);
  } finally {
    database.close();
  }
}

export async function deleteBrowserResearchFile(
  projectId: string,
  storageKey: string
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = transactionComplete(transaction);
    await Promise.all([
      requestResult(transaction.objectStore(STORE_NAME).delete(recordKey(projectId, storageKey))),
      done
    ]);
  } finally {
    database.close();
  }
}

export async function browserResearchFileExists(
  projectId: string,
  storageKey: string
): Promise<boolean> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const result = await requestResult(
      transaction.objectStore(STORE_NAME).get(recordKey(projectId, storageKey))
    );
    return result !== undefined;
  } finally {
    database.close();
  }
}

function isPreviewableResearchMime(mimeType: string): boolean {
  return mimeType === "application/pdf"
    || mimeType === "application/json"
    || /^image\/(?:png|jpe?g|gif|webp|avif|bmp|tiff?)$/i.test(mimeType)
    || /^text\/(?:plain|markdown|csv)$/i.test(mimeType);
}

export async function openBrowserResearchFile(
  projectId: string,
  storageKey: string,
  fileName: string,
  mimeType: string
): Promise<void> {
  // Reserve a tab synchronously so the browser still treats this as part of
  // the user's click even though the blob is loaded from IndexedDB.
  const previewWindow = isPreviewableResearchMime(mimeType)
    ? window.open("", "_blank")
    : null;
  try {
    const database = await openDatabase();
    let record: StoredResearchFile | undefined;
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      record = await requestResult(
        transaction.objectStore(STORE_NAME).get(recordKey(projectId, storageKey))
      ) as StoredResearchFile | undefined;
    } finally {
      database.close();
    }
    if (!record) throw new Error(`“${fileName}” is no longer in browser storage.`);

    const blob = record.blob.type ? record.blob : new Blob([record.blob], {
      type: record.mimeType || "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const safePreview = isPreviewableResearchMime(record.mimeType);

    if (safePreview) {
      if (previewWindow) {
        try {
          previewWindow.opener = null;
          previewWindow.location.href = url;
        } catch {
          previewWindow.close();
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.click();
        }
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      }
    } else {
      previewWindow?.close();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      anchor.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
}
