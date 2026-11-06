import { beforeEach, describe, expect, it } from "vitest";
import { createStoredProject } from "../schema";
import type { ProjectData } from "../types";
import { GoogleDriveFileSystem } from "./google-drive-fs";
import { createGoogleDriveProvider } from "./google-drive-provider";

type FakeFile = { id: string; name: string; content: string };

type RecordedCall = {
  method: string;
  url: string;
  body?: string;
  authorization?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Parses the multipart body used by the Drive "create file" endpoint. */
function parseMultipart(body: string): { name: string; content: string } {
  const boundary = body.match(/^--([^\r\n]+)/)?.[1];
  if (!boundary) throw new Error("Missing multipart boundary.");
  const parts = body.split(`--${boundary}`);
  const jsonPart = parts[1] ?? "";
  const textPart = parts[2] ?? "";
  const jsonBody = jsonPart.slice(jsonPart.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
  const name = (JSON.parse(jsonBody) as { name: string }).name;
  const content = textPart.slice(textPart.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
  return { name, content };
}

/**
 * A tiny in-memory Drive. It deliberately ignores the `q` parameter so the
 * adapter has to filter exact names and directory prefixes itself.
 */
class FakeDrive {
  private readonly files = new Map<string, FakeFile>();
  private nextId = 1;
  readonly calls: RecordedCall[] = [];

  get fileNames(): string[] {
    return [...this.files.values()].map((file) => file.name).sort();
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : undefined;
    this.calls.push({
      method,
      url: url.toString(),
      body,
      authorization: new Headers(init.headers).get("Authorization") ?? undefined
    });

    if (url.pathname === "/drive/v3/files" && method === "GET") {
      return json({
        files: [...this.files.values()].map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: "text/plain"
        }))
      });
    }

    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const { name, content } = parseMultipart(body ?? "");
      const id = `file-${this.nextId++}`;
      this.files.set(id, { id, name, content });
      return json({ id, name });
    }

    const fileMatch = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (fileMatch) {
      const id = decodeURIComponent(fileMatch[1]);
      const file = this.files.get(id);
      if (method === "DELETE") {
        this.files.delete(id);
        return new Response(null, { status: 204 });
      }
      if (!file) return new Response("missing", { status: 404 });
      if (method === "PATCH") {
        const metadata = JSON.parse(body ?? "{}") as { name?: string };
        if (metadata.name) file.name = metadata.name;
        return json({ id, name: file.name });
      }
      if (method === "GET" && url.searchParams.get("alt") === "media") {
        return new Response(file.content);
      }
    }

    const uploadMatch = url.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/);
    if (uploadMatch) {
      const id = uploadMatch[1] ? decodeURIComponent(uploadMatch[1]) : "";
      if (method === "PATCH" && id) {
        const file = this.files.get(id);
        if (!file) return new Response("missing", { status: 404 });
        file.content = body ?? "";
        return json({ id });
      }
      if (method === "POST") {
        const { name, content } = parseMultipart(body ?? "");
        const newId = `file-${this.nextId++}`;
        this.files.set(newId, { id: newId, name, content });
        return json({ id: newId, name });
      }
    }

    return new Response(`Unhandled ${method} ${url.pathname}`, { status: 404 });
  };
}

function projectFixture(): ProjectData {
  return {
    id: "project-1",
    name: "Test Novel",
    author: "Ada Writer",
    activeDocumentId: "doc-1",
    projectGoal: 50_000,
    chapterGoals: {},
    activity: {},
    documents: [
      {
        id: "doc-1",
        title: "Opening Scene",
        content: "<p>It was <strong>dark</strong>.</p>"
      }
    ],
    chapters: [],
    storyboardRows: [],
    storyboardCards: [],
    storyboardDrawings: [],
    timelineNodes: [],
    noteFolders: []
  };
}

describe("Google Drive filesystem", () => {
  let drive: FakeDrive;
  let fs: GoogleDriveFileSystem;

  beforeEach(() => {
    drive = new FakeDrive();
    fs = new GoogleDriveFileSystem({ accessToken: "token", fetch: drive.fetch });
  });

  it("creates, reads, updates, and lists files", async () => {
    await fs.writeText("projects/p1/project.enc", "one");
    expect(await fs.exists("projects/p1/project.enc")).toBe(true);
    expect(await fs.readText("projects/p1/project.enc")).toBe("one");

    await fs.writeText("projects/p1/project.enc", "two");
    expect(await fs.readText("projects/p1/project.enc")).toBe("two");
    expect(drive.fileNames).toEqual(["projects/p1/project.enc"]);

    expect(await fs.listDir("")).toEqual([{ name: "projects", isDirectory: true }]);
    expect(await fs.listDir("projects")).toEqual([{ name: "p1", isDirectory: true }]);
    expect(await fs.listDir("projects/p1")).toEqual([{ name: "project.enc", isDirectory: false }]);
  });

  it("removes a virtual directory and all of its files", async () => {
    await fs.writeText("projects/p1/project.enc", "one");
    await fs.writeText("projects/p1/documents/doc-1.enc", "doc");
    await fs.writeText("projects/p2/project.enc", "two");

    await fs.remove("projects/p1");
    expect(drive.fileNames).toEqual(["projects/p2/project.enc"]);
    expect(await fs.exists("projects/p1")).toBe(false);
    expect(await fs.exists("projects/p2")).toBe(true);
  });

  it("renames a single file and a virtual directory", async () => {
    await fs.writeText("prosecraft-sync.prosecraft.tmp", "bundle");
    await fs.rename("prosecraft-sync.prosecraft.tmp", "prosecraft-sync.prosecraft");
    expect(drive.fileNames).toEqual(["prosecraft-sync.prosecraft"]);

    await fs.writeText("projects/p1/documents/doc-1.enc", "doc");
    await fs.rename("projects/p1", "projects/p2");
    expect(drive.fileNames).toEqual([
      "projects/p2/documents/doc-1.enc",
      "prosecraft-sync.prosecraft"
    ]);
  });

  it("handles names containing an apostrophe", async () => {
    const path = "projects/ada's-novel/project.enc";
    await fs.writeText(path, "content");
    expect(await fs.exists(path)).toBe(true);
    expect(await fs.readText(path)).toBe("content");
    expect(await fs.listDir("projects")).toEqual([{ name: "ada's-novel", isDirectory: true }]);
  });

  it("asks the token provider for a token on every request", async () => {
    let token = "first";
    const tokenFs = new GoogleDriveFileSystem({
      getAccessToken: async () => token,
      fetch: drive.fetch
    });

    await tokenFs.writeText("a.txt", "one");
    token = "second";
    await tokenFs.readText("a.txt");

    expect(drive.calls[0].authorization).toBe("Bearer first");
    expect(drive.calls.at(-1)?.authorization).toBe("Bearer second");
  });

  it("reports an expired authorization clearly", async () => {
    const expired = new GoogleDriveFileSystem({
      accessToken: "token",
      fetch: async () => new Response("unauthorized", { status: 401 })
    });
    await expect(expired.exists("anything")).rejects.toThrow(/authorization expired/i);
  });
});

describe("Google Drive sync provider", () => {
  it("round-trips an encrypted bundle", async () => {
    const drive = new FakeDrive();
    const options = { accessToken: "token", fetch: drive.fetch };
    const provider = createGoogleDriveProvider(options, "encrypted-file");
    const project = createStoredProject(projectFixture(), "device-a", 1_000);

    const first = await provider.sync("correct horse battery", [project], {}, 1_000, "device-a");
    expect(first.created).toBe(true);
    expect(drive.fileNames).toEqual(["prosecraft-sync.prosecraft"]);

    const reopened = createGoogleDriveProvider(options, "encrypted-file");
    const connection = await reopened.connect("correct horse battery");
    expect(connection.created).toBe(false);
    expect(connection.projects).toHaveLength(1);
    expect(connection.projects[0].project.name).toBe("Test Novel");
  });

  it("round-trips the encrypted-folder layout", async () => {
    const drive = new FakeDrive();
    const options = { accessToken: "token", fetch: drive.fetch };
    const project = createStoredProject(projectFixture(), "device-a", 1_000);

    await createGoogleDriveProvider(options, "encrypted-folder")
      .sync("correct horse battery", [project], {}, 1_000, "device-a");
    expect(drive.fileNames).toContain("vault.json");
    expect(drive.fileNames).toContain("projects/project-1/project.enc");

    const connection = await createGoogleDriveProvider(options, "encrypted-folder")
      .connect("correct horse battery");
    expect(connection.projects[0].project.documents[0].title).toBe("Opening Scene");
  });
});
