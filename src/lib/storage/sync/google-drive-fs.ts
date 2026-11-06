import type { SyncDirEntry, SyncFileSystem } from "./types";

/**
 * Configuration for the Google Drive filesystem adapter.
 */
export type GoogleDriveOptions = {
  /** OAuth access token for Drive API. Ignored when `getAccessToken` is set. */
  accessToken?: string;
  /**
   * Supplies a fresh access token for each request. Use this when the token can
   * be refreshed while a sync is running.
   */
  getAccessToken?: () => string | Promise<string>;
  /** Custom fetch implementation, primarily for testing. */
  fetch?: typeof fetch;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
};

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

function cleanPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Escapes a value for a Drive `q` string. Drive treats `\` and `'` as special
 * characters, so a project named "Ada's Novel" must not break the query.
 */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Filesystem adapter backed by the Google Drive API using the application data
 * folder (`appDataFolder`). Paths are relative to the app data root and use `/`
 * separators.
 *
 * `appDataFolder` is flat, so directories are virtual: a file named
 * `projects/p1/documents/doc-1.enc` implicitly creates the `projects`, `p1`,
 * and `documents` directories. This matches the `SyncFileSystem` contract,
 * including directory removal and rename.
 */
export class GoogleDriveFileSystem implements SyncFileSystem {
  private readonly accessToken: string | undefined;
  private readonly getAccessToken: (() => string | Promise<string>) | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: GoogleDriveOptions) {
    if (!options.accessToken && !options.getAccessToken) {
      throw new Error("A Google Drive access token is required.");
    }
    this.accessToken = options.accessToken;
    this.getAccessToken = options.getAccessToken;
    this.fetch = options.fetch ?? fetch;
  }

  private async resolveAccessToken(): Promise<string> {
    const token = this.getAccessToken ? await this.getAccessToken() : this.accessToken;
    if (!token) throw new Error("Google Drive is not connected.");
    return token;
  }

  private async authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await this.resolveAccessToken()}`);
    return this.fetch(url, { ...init, headers });
  }

  private async ensureOk(response: Response, operation: string): Promise<void> {
    if (response.ok) return;
    if (response.status === 401) {
      throw new Error("Google Drive authorization expired. Please reconnect.");
    }
    let detail = "";
    try {
      const text = await response.text();
      if (text) detail = `: ${text.slice(0, 300)}`;
    } catch {
      // The status alone is still useful.
    }
    throw new Error(
      `Google Drive ${operation} failed (${response.status} ${response.statusText})${detail}`
    );
  }

  /**
   * Lists every file in the app data folder. Drive caps each page at 1000
   * entries, so callers must follow `nextPageToken` for large libraries.
   */
  private async listFiles(query?: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(DRIVE_API);
      url.searchParams.set("spaces", "appDataFolder");
      url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set(
        "q",
        query ? `(${query}) and trashed = false` : "trashed = false"
      );
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await this.authorizedFetch(url.toString());
      await this.ensureOk(response, "list");
      const data = (await response.json()) as {
        files?: DriveFile[];
        nextPageToken?: string;
      };
      if (Array.isArray(data.files)) files.push(...data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return files;
  }

  /** Finds exact file names. Drive's `=` search is not trusted alone. */
  private async findFiles(path: string): Promise<DriveFile[]> {
    const clean = cleanPath(path);
    if (!clean) return [];
    const files = await this.listFiles(`name = '${escapeQueryValue(clean)}'`);
    return files.filter((file) => file.name === clean);
  }

  /** Finds files beneath a virtual directory. */
  private async findFilesUnder(path: string): Promise<DriveFile[]> {
    const clean = cleanPath(path);
    if (!clean) return [];
    const prefix = `${clean}/`;
    // Listing and filtering is more reliable than a `name contains` query:
    // Drive's search tokenizer may split on `/` and miss a nested prefix.
    const files = await this.listFiles();
    return files.filter((file) => file.name.startsWith(prefix));
  }

  private async createFile(path: string, content: string): Promise<void> {
    const boundary = `prosecraft-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const metadata = JSON.stringify({ name: path, parents: ["appDataFolder"] });
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      content,
      `--${boundary}--`,
      ""
    ].join("\r\n");

    const response = await this.authorizedFetch(
      `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name`,
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body
      }
    );
    await this.ensureOk(response, "create");
  }

  private async updateFile(fileId: string, content: string): Promise<void> {
    const response = await this.authorizedFetch(
      `${DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=media`,
      {
        method: "PATCH",
        headers: { "Content-Type": "text/plain; charset=UTF-8" },
        body: content
      }
    );
    await this.ensureOk(response, "upload");
  }

  private async renameFile(fileId: string, name: string): Promise<void> {
    const response = await this.authorizedFetch(
      `${DRIVE_API}/${encodeURIComponent(fileId)}?fields=id,name`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ name })
      }
    );
    await this.ensureOk(response, "rename");
  }

  private async deleteFile(fileId: string): Promise<void> {
    const response = await this.authorizedFetch(
      `${DRIVE_API}/${encodeURIComponent(fileId)}`,
      { method: "DELETE" }
    );
    if (response.status === 404) return;
    await this.ensureOk(response, "delete");
  }

  async listDir(path: string): Promise<SyncDirEntry[]> {
    const prefix = cleanPath(path);
    const files = await this.listFiles();
    const prefixPath = prefix ? `${prefix}/` : "";
    const entries = new Map<string, SyncDirEntry>();

    for (const file of files) {
      const name = file.name;
      if (prefix && name === prefix) continue;
      if (prefixPath && !name.startsWith(prefixPath)) continue;
      const relativeName = prefixPath ? name.slice(prefixPath.length) : name;
      if (!relativeName) continue;

      const firstSlash = relativeName.indexOf("/");
      if (firstSlash === -1) {
        entries.set(relativeName, { name: relativeName, isDirectory: false });
      } else {
        const dirName = relativeName.slice(0, firstSlash);
        // A directory wins if a stray file shares its name.
        entries.set(dirName, { name: dirName, isDirectory: true });
      }
    }

    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async readText(path: string): Promise<string> {
    const files = await this.findFiles(path);
    if (files.length === 0) throw new Error(`Missing file: ${path}`);

    const response = await this.authorizedFetch(
      `${DRIVE_API}/${encodeURIComponent(files[0].id)}?alt=media`
    );
    await this.ensureOk(response, "download");
    return response.text();
  }

  async writeText(path: string, content: string): Promise<void> {
    const clean = cleanPath(path);
    if (!clean) throw new Error("Invalid sync path.");

    const existing = await this.findFiles(clean);
    if (existing.length === 0) {
      await this.createFile(clean, content);
      return;
    }

    // A previous interrupted run may have left duplicate names. Update the
    // first one and remove the rest so later reads are deterministic.
    await this.updateFile(existing[0].id, content);
    for (const duplicate of existing.slice(1)) {
      await this.deleteFile(duplicate.id);
    }
  }

  /**
   * Creates a virtual directory. Nothing is written because directories only
   * exist as prefixes on file names in `appDataFolder`.
   */
  async createDir(path: string): Promise<void> {
    const clean = cleanPath(path);
    if (clean.split("/").some((segment) => segment === "." || segment === "..")) {
      throw new Error("Invalid directory path.");
    }
  }

  async remove(path: string): Promise<void> {
    const clean = cleanPath(path);
    if (!clean) throw new Error("Invalid sync path.");

    const exact = await this.findFiles(clean);
    const children = await this.findFilesUnder(clean);
    const ids = new Set([...exact, ...children].map((file) => file.id));
    for (const id of ids) {
      await this.deleteFile(id);
    }
  }

  async exists(path: string): Promise<boolean> {
    const clean = cleanPath(path);
    if (!clean) return true;

    const exact = await this.findFiles(clean);
    if (exact.length > 0) return true;
    return (await this.findFilesUnder(clean)).length > 0;
  }

  async rename(from: string, to: string): Promise<void> {
    const cleanFrom = cleanPath(from);
    const cleanTo = cleanPath(to);
    if (!cleanFrom || !cleanTo) throw new Error("Invalid sync path.");

    const exact = await this.findFiles(cleanFrom);
    const children = await this.findFilesUnder(cleanFrom);
    if (exact.length === 0 && children.length === 0) {
      throw new Error(`Missing file: ${from}`);
    }

    for (const file of exact) await this.renameFile(file.id, cleanTo);
    // Virtual directories are renamed by renaming every file beneath them.
    for (const file of children) {
      const suffix = file.name.slice(cleanFrom.length);
      await this.renameFile(file.id, `${cleanTo}${suffix}`);
    }
  }
}
