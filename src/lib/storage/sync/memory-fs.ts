import type { SyncDirEntry, SyncFileSystem } from "./types";

function normalize(path: string): string {
  return path.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

/** In-memory filesystem used by tests and preview tooling. */
export class MemoryFileSystem implements SyncFileSystem {
  private readonly files = new Map<string, string>();
  private readonly dirs = new Set<string>();

  async listDir(path: string): Promise<SyncDirEntry[]> {
    const base = normalize(path);
    const prefix = base ? `${base}/` : "";
    const entries = new Map<string, boolean>();
    for (const full of this.allPaths()) {
      if (!full.startsWith(prefix)) continue;
      const rest = full.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      if (slash === -1) {
        entries.set(rest, this.dirs.has(`${prefix}${rest}`));
      } else {
        entries.set(rest.slice(0, slash), true);
      }
    }
    return [...entries.entries()]
      .map(([name, isDirectory]) => ({ name, isDirectory }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async readText(path: string): Promise<string> {
    const value = this.files.get(normalize(path));
    if (value === undefined) throw new Error(`Missing file: ${path}`);
    return value;
  }

  async writeText(path: string, content: string): Promise<void> {
    const target = normalize(path);
    this.files.set(target, content);
    this.createAncestors(target);
  }

  async createDir(path: string): Promise<void> {
    const target = normalize(path);
    if (target) this.dirs.add(target);
    this.createAncestors(target);
  }

  async remove(path: string): Promise<void> {
    const target = normalize(path);
    this.files.delete(target);
    this.dirs.delete(target);
    const prefix = `${target}/`;
    for (const full of this.allPaths()) {
      if (!full.startsWith(prefix)) continue;
      this.files.delete(full);
      this.dirs.delete(full);
    }
  }

  async exists(path: string): Promise<boolean> {
    const target = normalize(path);
    if (this.files.has(target) || this.dirs.has(target)) return true;
    const prefix = `${target}/`;
    return [...this.files.keys()].some((full) => full.startsWith(prefix));
  }

  /** Test helper: every path currently stored. */
  paths(): string[] {
    return [...this.files.keys()].sort();
  }

  private allPaths(): string[] {
    return [...this.files.keys(), ...this.dirs];
  }

  private createAncestors(path: string): void {
    const parts = path.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      this.dirs.add(current);
    }
  }
}
