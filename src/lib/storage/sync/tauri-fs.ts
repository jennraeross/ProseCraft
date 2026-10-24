import { invoke } from "@tauri-apps/api/core";
import type { SyncDirEntry, SyncFileSystem } from "./types";

type RawEntry = {
  name: string;
  isDirectory: boolean;
};

/**
 * Filesystem adapter backed by the app's Rust `sync_*` commands. Paths are
 * relative to the chosen folder; `/` is accepted by both macOS/Linux and
 * Windows path handling.
 */
export class TauriFileSystem implements SyncFileSystem {
  constructor(private readonly root: string) {}

  /**
   * Resolves a provider-relative path beneath the chosen sync root. Rejecting
   * `.`/`..` segments and empty paths is defense in depth: record ids are also
   * encoded by the layout, but this adapter must never let a malformed path
   * reach a recursive delete outside the folder the user picked.
   */
  private resolve(path: string): string {
    const relative = path.replace(/^[/\\]+/, "");
    const segments = relative.split(/[\\/]+/).filter(Boolean);
    if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error("Invalid sync path.");
    }
    const root = this.root.length > 1 ? this.root.replace(/[\\/]+$/, "") : this.root;
    const joined = segments.join("/");
    return root.endsWith("/") || root.endsWith("\\") ? `${root}${joined}` : `${root}/${joined}`;
  }

  async listDir(path: string): Promise<SyncDirEntry[]> {
    const entries = await invoke<RawEntry[]>("sync_list_dir", { path: this.resolve(path) });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: Boolean(entry.isDirectory)
    }));
  }

  async readText(path: string): Promise<string> {
    return invoke<string>("sync_read_text", { path: this.resolve(path) });
  }

  async writeText(path: string, content: string): Promise<void> {
    await invoke("sync_write_text", { path: this.resolve(path), content });
  }

  async createDir(path: string): Promise<void> {
    await invoke("sync_create_dir", { path: this.resolve(path) });
  }

  async remove(path: string): Promise<void> {
    await invoke("sync_remove", { path: this.resolve(path) });
  }

  async exists(path: string): Promise<boolean> {
    return invoke<boolean>("sync_exists", { path: this.resolve(path) });
  }
}
