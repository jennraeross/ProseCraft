import { beforeEach, describe, expect, it } from "vitest";
import { createStoredProject, projectsHaveSameContent, stampProject } from "../schema";
import type { ProjectData, StoredProject } from "../types";
import { BUNDLE_FILE, OPEN_MARKER_FILE, VAULT_FILE } from "./files";
import { FolderSyncProvider } from "./folder-provider";
import { EncryptedFileSyncProvider } from "./bundle-provider";
import { MemoryFileSystem } from "./memory-fs";
import { OpenFolderSyncProvider } from "./open-provider";
import { loadSyncState, saveSyncState, SYNC_STATE_KEY } from "./state";
import { WebDavFileSystem } from "./webdav-provider";

const PASSPHRASE = "correct horse battery";
const IMAGE_SRC = "data:image/png;base64,AA==";

function projectFixture(id = "project-1", name = "Test Novel"): ProjectData {
  return {
    id,
    name,
    author: "Ada Writer",
    activeDocumentId: "doc-1",
    projectGoal: 50_000,
    chapterGoals: { "chapter-1": 2_000 },
    activity: {
      "2026-10-01": { edits: 2, wordsAdded: 120 }
    },
    documents: [
      {
        id: "doc-1",
        title: "Opening Scene",
        content: "<h1>Chapter One</h1><p>It was <strong>dark</strong>.</p>",
        chapterId: "chapter-1"
      },
      {
        id: "doc-2",
        title: "Mara",
        content: "<p>Notes about <em>Mara</em>.</p>",
        space: "Wiki",
        character: {
          role: "Protagonist",
          age: "32",
          gender: "",
          pronouns: "she/her",
          ethnicity: "",
          occupation: "Cartographer",
          appearance: "",
          voice: "",
          personality: "",
          background: "",
          motivations: "",
          flaws: "",
          hobbies: "",
          relationships: ""
        }
      }
    ],
    chapters: [
      { id: "chapter-1", title: "Chapter One", expanded: true, summary: "It begins." }
    ],
    storyboardRows: [
      { id: "row-1", title: "Act I" },
      { id: "row-2", title: "Act II" }
    ],
    storyboardCards: [
      {
        id: "card-1",
        sourceId: "chapter-1",
        rowId: "row-1",
        x: 40,
        y: 40,
        kind: "chapter",
        title: "Opening",
        note: "It begins."
      }
    ],
    storyboardDrawings: [
      { id: "drawing-1", type: "box", x: 120, y: 80, width: 180, height: 100 },
      { id: "drawing-2", type: "text", x: 140, y: 100, width: 140, height: 48, text: "Opening", fontSize: 20 }
    ],
    timelineNodes: [
      { id: "timeline-1", title: "Day One", date: "2026-01-01", time: "", description: "Start" }
    ],
    noteFolders: [{ id: "folder-1", title: "Notes", parentId: null }]
  };
}

function storedProject(now = 1_000, id = "project-1", name = "Test Novel"): StoredProject {
  return createStoredProject(projectFixture(id, name), "device-a", now);
}

beforeEach(() => {
  localStorage.clear();
});

describe("encrypted single-file sync", () => {
  it("creates, unlocks, and re-syncs a bundle", async () => {
    const fs = new MemoryFileSystem();
    const provider = new EncryptedFileSyncProvider(fs);
    const local = storedProject();

    const first = await provider.sync(PASSPHRASE, [local], {}, 1_000, "device-a");
    expect(first.created).toBe(true);
    expect(first.projects).toHaveLength(1);
    expect(await fs.exists(BUNDLE_FILE)).toBe(true);
    expect(await fs.exists(VAULT_FILE)).toBe(false);
    expect(JSON.parse(await fs.readText(BUNDLE_FILE)).format).toBe("prosecraft.encrypted");

    const second = new EncryptedFileSyncProvider(fs);
    const connection = await second.connect(PASSPHRASE);
    expect(connection.created).toBe(false);
    expect(connection.projects).toHaveLength(1);
    expect(connection.projects[0].project.name).toBe("Test Novel");

    const other = new EncryptedFileSyncProvider(fs);
    await expect(other.connect("wrong passphrase")).rejects.toThrow("Incorrect passphrase.");
  });

  it("supports an empty vault", async () => {
    const fs = new MemoryFileSystem();
    const provider = new EncryptedFileSyncProvider(fs);
    const result = await provider.sync(PASSPHRASE, [], {}, 1_000, "device-a");
    expect(result.projects).toHaveLength(0);
    expect(await fs.exists(BUNDLE_FILE)).toBe(true);

    const reopened = new EncryptedFileSyncProvider(fs);
    const connection = await reopened.connect(PASSPHRASE);
    expect(connection.projects).toHaveLength(0);
  });

  it("preserves the losing side of a genuine conflict", async () => {
    const fs = new MemoryFileSystem();
    const first = storedProject(1_000);
    const baseline = await new EncryptedFileSyncProvider(fs)
      .sync(PASSPHRASE, [first], {}, 1_000, "device-a");

    const aEdit = createStoredProject(projectFixture("project-1", "A edit"), "device-a", 1_500);
    await new EncryptedFileSyncProvider(fs)
      .sync(PASSPHRASE, [aEdit], baseline.lastSynced, 1_500, "device-a");

    const bEdit = createStoredProject(projectFixture("project-1", "B edit"), "device-b", 2_000);
    const result = await new EncryptedFileSyncProvider(fs)
      .sync(PASSPHRASE, [bEdit], baseline.lastSynced, 2_000, "device-b");

    expect(result.conflicts).toBe(1);
    expect(result.projects).toHaveLength(2);
    expect(result.projects.some((project) => project.project.name === "B edit")).toBe(true);
    expect(result.projects.some((project) => project.project.name.includes("conflicted copy"))).toBe(true);
  });
});

describe("open-folder sync", () => {
  it("round-trips recoverable project, chapter, and scene trash state", async () => {
    const fs = new MemoryFileSystem();
    const project = storedProject();
    project.project.trashed = true;
    project.project.chapters[0] = { ...project.project.chapters[0], trashed: true };
    project.project.documents[0] = {
      ...project.project.documents[0],
      trashed: true,
      trashedWithChapterId: "chapter-1"
    };

    await new OpenFolderSyncProvider(fs).sync("", [project], {}, 1_000, "device-a");
    const reopened = await new OpenFolderSyncProvider(fs).connect("");

    expect(reopened.projects[0].project.trashed).toBe(true);
    expect(reopened.projects[0].project.chapters[0].trashed).toBe(true);
    expect(reopened.projects[0].project.documents.find((doc) => doc.id === "doc-1"))
      .toMatchObject({ trashed: true, trashedWithChapterId: "chapter-1" });
  });

  it("round-trips projects as Markdown and JSON", async () => {
    const fs = new MemoryFileSystem();
    const provider = new OpenFolderSyncProvider(fs);
    const first = await provider.sync("", [storedProject()], {}, 1_000, "device-a");

    expect(first.created).toBe(true);
    expect(await fs.exists(OPEN_MARKER_FILE)).toBe(true);
    expect(fs.paths()).toContain("projects/project-1/project.json");
    expect(fs.paths()).toContain("projects/project-1/documents/doc-1.md");
    expect(fs.paths()).toContain("projects/project-1/chapters/chapter-1.json");
    expect(fs.paths()).toContain("projects/project-1/storyboard/rows.json");
    expect(fs.paths()).toContain("projects/project-1/storyboard/cards.json");

    const markdown = await fs.readText("projects/project-1/documents/doc-1.md");
    expect(markdown).toContain("title: \"Opening Scene\"");
    expect(markdown).toContain("# Chapter One");
    expect(markdown).toContain("It was **dark**.");

    const connection = await new OpenFolderSyncProvider(fs).connect("");
    expect(connection.projects).toHaveLength(1);
    const project = connection.projects[0];
    expect(project.project.documents).toHaveLength(2);
    expect(project.project.chapters[0].summary).toBe("It begins.");
    expect(project.project.documents.find((doc) => doc.id === "doc-2")?.character?.role)
      .toBe("Protagonist");
    expect(project.project.storyboardRows?.map((row) => row.id)).toEqual(["row-1", "row-2"]);
    expect(project.project.storyboardCards?.[0].note).toBe("It begins.");
    expect(project.project.storyboardCards?.[0]).toMatchObject({ x: 40, y: 40 });
    expect(project.project.storyboardDrawings).toEqual([
      { id: "drawing-1", type: "box", x: 120, y: 80, width: 180, height: 100 },
      { id: "drawing-2", type: "text", x: 140, y: 100, width: 140, height: 48, text: "Opening", fontSize: 20 }
    ]);
    expect(project.project.timelineNodes?.[0].title).toBe("Day One");
    expect(project.project.noteFolders?.[0].title).toBe("Notes");
    expect(project.project.documents[0].markdownSource).toContain("# Chapter One");
    expect(project.project.documents[0].content).toContain("<strong>dark</strong>");
    expect(projectsHaveSameContent(first.projects[0].project, project.project)).toBe(true);
    expect(projectsHaveSameContent(project.project, {
      ...project.project,
      storyboardDrawings: project.project.storyboardDrawings?.map((drawing) =>
        drawing.type === "text" ? { ...drawing, text: "Changed" } : drawing)
    })).toBe(false);

    const second = await new OpenFolderSyncProvider(fs)
      .sync("", [first.projects[0]], first.lastSynced, 1_100, "device-a");
    expect(second.conflicts).toBe(0);
    expect(second.projects).toHaveLength(1);
    expect(second.projects[0].project.documents[0].content).toBe(
      first.projects[0].project.documents[0].content
    );
  });

  it("round-trips image layout through the Markdown documents", async () => {
    const fs = new MemoryFileSystem();
    const fixture = projectFixture();
    const image = `<img src="${IMAGE_SRC}" alt="Chart" data-size="small" data-align="right">`;
    const withImage: ProjectData = {
      ...fixture,
      documents: fixture.documents.map((document) => document.id === "doc-1"
        ? { ...document, content: `<p>Before</p><p>${image}</p><p>After</p>` }
        : document)
    };
    await new OpenFolderSyncProvider(fs)
      .sync("", [createStoredProject(withImage, "device-a", 1_000)], {}, 1_000, "device-a");

    const markdown = await fs.readText("projects/project-1/documents/doc-1.md");
    expect(markdown).toContain(image);

    const connection = await new OpenFolderSyncProvider(fs).connect("");
    const document = connection.projects[0].project.documents.find((doc) => doc.id === "doc-1");
    expect(document?.markdownSource).toContain(image);
    expect(document?.content).toContain(image);
  });

  it("applies external Markdown edits", async () => {
    const fs = new MemoryFileSystem();
    await new OpenFolderSyncProvider(fs)
      .sync("", [storedProject()], {}, 1_000, "device-a");

    const path = "projects/project-1/documents/doc-1.md";
    const edited = (await fs.readText(path)).replace("It was **dark**.", "It was **bright**.");
    await fs.writeText(path, edited);

    const connection = await new OpenFolderSyncProvider(fs).connect("");
    const project = connection.projects[0];
    expect(project.updatedBy).toBe("external");
    expect(project.revision).toBeGreaterThan(1);
    expect(project.project.documents[0].content).toContain("<strong>bright</strong>");
  });

  it("writes tombstones and removes deleted entity files", async () => {
    const fs = new MemoryFileSystem();
    const original = storedProject(1_000);
    const withoutDocument: ProjectData = {
      ...projectFixture(),
      activeDocumentId: "doc-2",
      documents: projectFixture().documents.filter((doc) => doc.id !== "doc-1")
    };
    const updated = stampProject(original, withoutDocument, "device-a", 2_000);

    const provider = new OpenFolderSyncProvider(fs);
    await provider.sync("", [updated], {}, 2_000, "device-a");
    expect(await fs.exists("projects/project-1/documents/doc-1.md")).toBe(false);
    expect(await fs.exists("projects/project-1/documents/doc-2.md")).toBe(true);

    const reopened = await new OpenFolderSyncProvider(fs).connect("");
    expect(reopened.projects[0].project.documents.map((doc) => doc.id)).toEqual(["doc-2"]);
    expect(reopened.projects[0].entities.documents["doc-1"].deletedAt).not.toBeNull();
  });

  it("reports a missing document instead of silently dropping it", async () => {
    const fs = new MemoryFileSystem();
    await new OpenFolderSyncProvider(fs)
      .sync("", [storedProject()], {}, 1_000, "device-a");
    await fs.remove("projects/project-1/documents/doc-1.md");

    await expect(new OpenFolderSyncProvider(fs).connect(""))
      .rejects.toThrow(/document file for doc-1 is missing/);
  });

  it("preserves the document order recorded in project.json", async () => {
    const fs = new MemoryFileSystem();
    const fixture = projectFixture();
    const reordered: ProjectData = {
      ...fixture,
      documents: [...fixture.documents].reverse()
    };
    await new OpenFolderSyncProvider(fs)
      .sync("", [createStoredProject(reordered, "device-a", 1_000)], {}, 1_000, "device-a");

    const connection = await new OpenFolderSyncProvider(fs).connect("");
    expect(connection.projects[0].project.documents.map((doc) => doc.id)).toEqual(["doc-2", "doc-1"]);
  });

  it("treats a missing project header as corruption, not a deletion", async () => {
    const fs = new MemoryFileSystem();
    await new OpenFolderSyncProvider(fs)
      .sync("", [storedProject()], {}, 1_000, "device-a");
    await fs.remove("projects/project-1/project.json");

    await expect(new OpenFolderSyncProvider(fs).connect(""))
      .rejects.toThrow(/missing its project.json file/);
  });

  it("keeps unsafe project ids inside the sync folder", async () => {
    const fs = new MemoryFileSystem();
    await new OpenFolderSyncProvider(fs)
      .sync("", [storedProject(1_000, "../escape", "Escape")], {}, 1_000, "device-a");

    expect(fs.paths().every((path) => path.startsWith("projects/") || path === OPEN_MARKER_FILE))
      .toBe(true);
    expect(fs.paths().some((path) => path.includes(".."))).toBe(false);
  });
});

describe("encrypted-folder sync", () => {
  it("still round-trips the existing layout", async () => {
    const fs = new MemoryFileSystem();
    const provider = new FolderSyncProvider(fs);
    await provider.sync(PASSPHRASE, [storedProject()], {}, 1_000, "device-a");
    expect(await fs.exists(VAULT_FILE)).toBe(true);
    expect(fs.paths()).toContain("projects/project-1/project.enc");

    const reopened = await new FolderSyncProvider(fs).connect(PASSPHRASE);
    expect(reopened.projects).toHaveLength(1);
    expect(reopened.projects[0].project.name).toBe("Test Novel");
  });
});

describe("sync state", () => {
  it("defaults old saved state to the encrypted-folder layout", () => {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ folder: "/tmp/sync", lastSynced: {} }));
    expect(loadSyncState()).toEqual({
      provider: "folder",
      folder: "/tmp/sync",
      mode: "encrypted-folder",
      googleDriveAccessToken: "",
      googleDriveRefreshToken: "",
      googleDriveTokenExpiry: 0,
      googleDriveEmail: "",
      lastSynced: {}
    });
  });

  it("round-trips the selected mode", () => {
    saveSyncState({
      provider: "folder",
      folder: "/tmp/sync",
      mode: "open-folder",
      googleDriveAccessToken: "",
      googleDriveRefreshToken: "",
      googleDriveTokenExpiry: 0,
      googleDriveEmail: "",
      lastSynced: {}
    });
    expect(loadSyncState()?.mode).toBe("open-folder");
  });

  it("round-trips a Google Drive connection", () => {
    saveSyncState({
      provider: "googledrive",
      folder: "",
      mode: "encrypted-file",
      googleDriveAccessToken: "access-token",
      googleDriveRefreshToken: "refresh-token",
      googleDriveTokenExpiry: 1_234,
      googleDriveEmail: "writer@example.com",
      lastSynced: {}
    });
    expect(loadSyncState()).toMatchObject({
      provider: "googledrive",
      mode: "encrypted-file",
      googleDriveAccessToken: "access-token",
      googleDriveRefreshToken: "refresh-token",
      googleDriveTokenExpiry: 1_234,
      googleDriveEmail: "writer@example.com"
    });
  });

  it("treats a Google Drive state without tokens as unconfigured", () => {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
      provider: "googledrive",
      mode: "encrypted-file",
      lastSynced: {}
    }));
    expect(loadSyncState()).toBeNull();
  });
});

describe("WebDAV transport", () => {
  it("renames the single sync file with MOVE", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response("", { status: 201, statusText: "Created" });
    }) as typeof fetch;
    const fs = new WebDavFileSystem({
      baseUrl: "https://example.com/dav/files/user/ProseCraft",
      fetch: fakeFetch
    });

    await fs.rename("prosecraft-sync.prosecraft.tmp", "prosecraft-sync.prosecraft");
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("MOVE");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Destination")).toBe(
      "https://example.com/dav/files/user/ProseCraft/prosecraft-sync.prosecraft"
    );
    expect(headers.get("Overwrite")).toBe("T");
  });
});
