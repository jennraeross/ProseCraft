import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChapterData, DocumentData } from "../publish/types";
import { resetDeviceIdCache } from "./device";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  PROJECTS_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  flushVaultStorage,
  initVaultStorage,
  importBundleText,
  isQuotaExceededError,
  loadVault,
  onVaultStorageError,
  resetVaultStorageForTests,
  saveVault
} from "./repository";
import { createStoredProject } from "./schema";
import type { ProjectData, StoredVault } from "./types";
import {
  getVaultBackend,
  readVaultRecord,
  setVaultWriteFailureForTests,
  writeVaultRecord
} from "./vault-store";

const DATABASE_NAME = "prosecraft-vault";

function projectFixture(id = "project-1", name = "Test Novel"): ProjectData {
  const chapter: ChapterData = { id: `${id}-chapter`, title: "Chapter One", expanded: true };
  const document: DocumentData = {
    id: `${id}-document`,
    title: "Opening Scene",
    content: "<p>It was a dark and stormy night.</p>",
    chapterId: chapter.id
  };
  return {
    id,
    name,
    author: "Ada Writer",
    activeDocumentId: document.id,
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    documents: [document],
    chapters: [chapter]
  };
}

function deleteVaultDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete the test database."));
    // A blocked delete means a connection is still open; resolving keeps the
    // suite from hanging, and the next test still starts from a clean cache.
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  resetVaultStorageForTests();
  resetDeviceIdCache();
  localStorage.clear();
  await deleteVaultDatabase();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  resetVaultStorageForTests();
  resetDeviceIdCache();
  localStorage.clear();
  await deleteVaultDatabase();
});

describe("vault storage initialization", () => {
  it("migrates legacy localStorage projects into IndexedDB and clears the old keys", async () => {
    const legacyProject = projectFixture("legacy-project", "Legacy Novel");
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([legacyProject]));
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, legacyProject.id);

    await initVaultStorage();

    expect(getVaultBackend()).toBe("indexeddb");
    const loaded = loadVault();
    expect(loaded?.projects).toHaveLength(1);
    expect(loaded?.projects[0].name).toBe("Legacy Novel");
    expect(loaded?.activeProjectId).toBe(legacyProject.id);

    // The vault was verified in IndexedDB before the legacy keys were dropped.
    const persisted = await readVaultRecord() as StoredVault | null;
    expect(persisted?.projects[0].project.name).toBe("Legacy Novel");
    expect(localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull();
  });

  it("prefers an existing IndexedDB vault over stale legacy localStorage data", async () => {
    const deviceId = "device-under-test";
    const vaultProject = createStoredProject(
      projectFixture("vault-project", "Vault Novel"),
      deviceId,
      1_000
    );
    await writeVaultRecord({
      schemaVersion: 2,
      deviceId,
      activeProjectId: vaultProject.id,
      updatedAt: 1_000,
      projects: [vaultProject]
    });
    localStorage.setItem(
      PROJECTS_STORAGE_KEY,
      JSON.stringify([projectFixture("legacy-project", "Stale Novel")])
    );

    await initVaultStorage();

    const loaded = loadVault();
    expect(loaded?.projects.map((project) => project.name)).toEqual(["Vault Novel"]);
    expect(localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull();
  });

  it("falls back to localStorage when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const legacyProject = projectFixture("fallback-project", "Fallback Novel");
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify([legacyProject]));

    await initVaultStorage();

    expect(getVaultBackend()).toBe("localstorage");
    const loaded = loadVault();
    expect(loaded?.projects[0].name).toBe("Fallback Novel");

    saveVault([projectFixture("saved-project", "Saved Novel")], "saved-project");
    const written = JSON.parse(localStorage.getItem(VAULT_STORAGE_KEY) ?? "null") as StoredVault | null;
    expect(written?.projects[0].project.name).toBe("Saved Novel");
  });
});

describe("vault persistence", () => {
  it("round-trips a saved project through IndexedDB", async () => {
    await initVaultStorage();
    const project = projectFixture("round-trip", "Round Trip Novel");

    saveVault([project], project.id);
    await flushVaultStorage();

    // Simulate a reload: drop the in-memory cache but keep IndexedDB.
    resetVaultStorageForTests();
    await initVaultStorage();

    const loaded = loadVault();
    expect(loaded?.projects).toHaveLength(1);
    expect(loaded?.projects[0].name).toBe("Round Trip Novel");
    expect(loaded?.projects[0].documents[0].content).toContain("dark and stormy");
  });

  it("does not write legacy mirror keys", async () => {
    await initVaultStorage();
    const project = projectFixture("no-mirror", "No Mirror");
    saveVault([project], project.id);
    await flushVaultStorage();

    expect(localStorage.getItem(PROJECTS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull();
  });

  it("reports background write failures through listeners and flush", async () => {
    await initVaultStorage();
    const errors: unknown[] = [];
    const unsubscribe = onVaultStorageError((error) => errors.push(error));
    const quotaError = new DOMException("The quota has been exceeded.", "QuotaExceededError");

    saveVault([projectFixture("quota", "Quota Novel")], "quota");
    setVaultWriteFailureForTests(quotaError);

    await expect(flushVaultStorage()).rejects.toBe(quotaError);
    expect(errors).toEqual([quotaError]);
    expect(isQuotaExceededError(quotaError)).toBe(true);

    unsubscribe();
  });

  it("clears a previous error after a successful write", async () => {
    await initVaultStorage();
    const quotaError = new DOMException("The quota has been exceeded.", "QuotaExceededError");

    saveVault([projectFixture("first", "First")], "first");
    setVaultWriteFailureForTests(quotaError);
    await expect(flushVaultStorage()).rejects.toBe(quotaError);

    saveVault([projectFixture("second", "Second")], "second");
    await expect(flushVaultStorage()).resolves.toBeUndefined();
  });

  it("keeps the active project when importing a newer bundle", async () => {
    await initVaultStorage();
    saveVault(
      [projectFixture("first", "First"), projectFixture("second", "Second")],
      "second"
    );
    await flushVaultStorage();

    const incoming = createStoredProject(
      projectFixture("first", "First, revised"),
      "another-device",
      Date.now() + 10_000
    );
    const result = await importBundleText(JSON.stringify({
      format: "prosecraft.bundle",
      schemaVersion: 2,
      exportedAt: Date.now(),
      deviceId: "another-device",
      projects: [incoming]
    }));

    expect(result.imported).toBe(1);
    const loaded = loadVault();
    expect(loaded?.activeProjectId).toBe("second");
    expect(loaded?.projects.find((project) => project.id === "first")?.name)
      .toBe("First, revised");
  });
});

describe("isQuotaExceededError", () => {
  it("recognizes quota errors and ignores unrelated failures", () => {
    expect(isQuotaExceededError(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isQuotaExceededError(new Error("The quota has been exceeded."))).toBe(true);
    expect(isQuotaExceededError(new Error("Network unavailable"))).toBe(false);
    expect(isQuotaExceededError("quota")).toBe(false);
  });
});
