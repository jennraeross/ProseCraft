const DEVICE_STORAGE_KEY = "prosecraft-device-id";

let cached: string | null = null;

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Returns a stable id for this installation. It is used to attribute changes
 * for last-write-wins merges and is intentionally device-local: it never syncs.
 */
export function getDeviceId(): string {
  if (cached) return cached;
  if (typeof localStorage === "undefined") {
    cached = createDeviceId();
    return cached;
  }
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const next = createDeviceId();
    localStorage.setItem(DEVICE_STORAGE_KEY, next);
    cached = next;
    return next;
  } catch {
    cached = createDeviceId();
    return cached;
  }
}

/** Test helper so suites can simulate a fresh installation. */
export function resetDeviceIdCache(): void {
  cached = null;
}
