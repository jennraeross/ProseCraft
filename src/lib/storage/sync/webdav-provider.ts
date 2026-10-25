import { FolderSyncProvider } from "./folder-provider";
import type { SyncDirEntry, SyncFileSystem } from "./types";
import type { SyncProvider } from "./types";

/**
 * Configuration for a WebDAV sync endpoint (e.g. Nextcloud, ownCloud, or any
 * WebDAV-compatible server). Projects are stored encrypted under this base URL,
 * using the same per-entity layout as {@link FolderSyncProvider}.
 */
export type WebDavOptions = {
  /** Base WebDAV URL, e.g. "https://nextcloud.example.com/remote.php/dav/files/user/ProseCraft" */
  baseUrl: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password (or app password / token) */
  password?: string;
  /** Custom fetch implementation, primarily for testing */
  fetch?: typeof fetch;
};

function parseBasicAuth(username: string, password: string): string {
  return "Basic " + btoa(`${username}:${password}`);
}

/** Split a WebDAV multistatus XML body into individual <response> blocks. */
function splitResponseBlocks(xml: string): string[] {
  const blocks: string[] = [];
  const regex = /<(?:[^:\s]+:)?response[^>]*>[\s\S]*?<\/(?:[^:\s]+:)?response>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

/** Extract the <d:href> value from a response block. */
function extractHref(block: string): string | null {
  const match = block.match(/<(?:[^:\s]+:)?href>([^<]+)<\/(?:[^:\s]+:)?href>/i);
  return match ? match[1] : null;
}

/** True when a response block declares a WebDAV collection (directory). */
function isCollection(block: string): boolean {
  return /<(?:[^:\s]+:)?resourcetype>\s*<(?:[^:\s]+:)?collection\/?>/i.test(block);
}

/** Turn a WebDAV href into the last path segment (the entry name). */
function hrefToName(href: string): string {
  const clean = href.replace(/\/$/, "");
  const lastSlash = clean.lastIndexOf("/");
  return lastSlash === -1 ? clean : clean.slice(lastSlash + 1);
}

/**
 * Filesystem adapter backed by WebDAV HTTP. Paths passed by callers are
 * relative (e.g. `vault.json`, `projects/p1/project.enc`) and are resolved
 * against the configured base URL.
 *
 * WebDAV operations used:
 *   - PROPFIND  → listDir (Depth: 1), exists (Depth: 0)
 *   - GET       → readText
 *   - PUT       → writeText
 *   - MKCOL     → createDir
 *   - DELETE    → remove
 *
 * Authentication: Basic auth header built from `username`/`password`. Servers
 * must allow CORS from the app's origin, or the request must be proxied.
 */
export class WebDavFileSystem implements SyncFileSystem {
  private readonly baseUrl: string;
  private readonly authHeader: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: WebDavOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch ?? fetch;
    if (options.username && options.password) {
      this.authHeader = parseBasicAuth(options.username, options.password);
    }
  }

  /** Resolve a relative path against the WebDAV base URL. */
  private resolve(path: string): string {
    const cleanPath = path.replace(/^\//, "");
    return `${this.baseUrl}/${cleanPath}`;
  }

  private async request(method: string, url: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.authHeader) headers["Authorization"] = this.authHeader;

    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          headers[key] = value;
        }
      } else {
        Object.assign(headers, init.headers as Record<string, string>);
      }
    }

    return this.fetch(url, { ...init, method, headers });
  }

  async listDir(path: string): Promise<SyncDirEntry[]> {
    const url = this.resolve(path);
    let response: Response;
    try {
      response = await this.request("PROPFIND", url, { headers: { Depth: "1" } });
    } catch (error) {
      throw new Error(`WebDAV PROPFIND failed for ${path}: ${error}`);
    }
    // A missing collection is not an error: it simply has no entries yet.
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`WebDAV PROPFIND failed: ${response.status} ${response.statusText}`);
    }
    const xml = await response.text();
    const blocks = splitResponseBlocks(xml);
    const entries: SyncDirEntry[] = [];
    const requestBase = new URL(this.resolve(path), this.baseUrl + "/").href.replace(/\/$/, "");

    for (const block of blocks) {
      const href = extractHref(block);
      if (!href) continue;
      // Skip the collection itself (Depth: 1 includes it).
      let absoluteHref: string;
      try {
        absoluteHref = new URL(href, this.baseUrl + "/").href.replace(/\/$/, "");
      } catch {
        absoluteHref = href.replace(/\/$/, "");
      }
      if (absoluteHref === requestBase) continue;
      entries.push({
        name: hrefToName(href),
        isDirectory: isCollection(block)
      });
    }
    return entries;
  }

  async readText(path: string): Promise<string> {
    const url = this.resolve(path);
    const response = await this.request("GET", url);
    if (response.status === 404) throw new Error(`Missing file: ${path}`);
    if (!response.ok) throw new Error(`WebDAV GET failed: ${response.status} ${response.statusText}`);
    return response.text();
  }

  async writeText(path: string, content: string): Promise<void> {
    const url = this.resolve(path);
    const response = await this.request("PUT", url, { body: content });
    if (!response.ok) throw new Error(`WebDAV PUT failed: ${response.status} ${response.statusText}`);
  }

  async createDir(path: string): Promise<void> {
    const url = this.resolve(path);
    const response = await this.request("MKCOL", url);
    // MKCOL on an existing collection returns 405 Method Not Allowed or 403
    // Forbidden on some servers; treat both as "already exists" success.
    if (response.status === 405 || response.status === 403) return;
    if (!response.ok) throw new Error(`WebDAV MKCOL failed: ${response.status} ${response.statusText}`);
  }

  async remove(path: string): Promise<void> {
    const url = this.resolve(path);
    const response = await this.request("DELETE", url);
    if (response.status === 404) return; // already gone
    if (!response.ok) throw new Error(`WebDAV DELETE failed: ${response.status} ${response.statusText}`);
  }

  async exists(path: string): Promise<boolean> {
    const response = await this.request("PROPFIND", this.resolve(path), {
      headers: { Depth: "0" }
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`WebDAV PROPFIND failed: ${response.status} ${response.statusText}`);
    return true;
  }
}

/**
 * Convenience factory: builds a full `SyncProvider` that syncs encrypted
 * projects over WebDAV by combining {@link WebDavFileSystem} with
 * {@link FolderSyncProvider}. All merge, conflict, tombstone, and corruption
 * handling comes from `FolderSyncProvider`; this only supplies the WebDAV
 * transport layer.
 */
export function createWebDavProvider(
  options: WebDavOptions,
  vaultOptions: ConstructorParameters<typeof FolderSyncProvider>[1] = {}
): FolderSyncProvider {
  return new FolderSyncProvider(new WebDavFileSystem(options), vaultOptions);
}

export type { SyncProvider } from "./types";
