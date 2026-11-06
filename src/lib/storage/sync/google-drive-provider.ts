import { EncryptedFileSyncProvider } from "./bundle-provider";
import { FolderSyncProvider } from "./folder-provider";
import { GoogleDriveFileSystem, type GoogleDriveOptions } from "./google-drive-fs";
import { OpenFolderSyncProvider } from "./open-provider";
import type { SyncMode, SyncProvider } from "./types";

/**
 * Builds a full `SyncProvider` that syncs projects over Google Drive by
 * combining {@link GoogleDriveFileSystem} with one of the existing layouts.
 * Merge, conflict, tombstone, and corruption handling all come from the layout
 * providers; this only supplies the Google Drive transport layer.
 *
 * Google Drive is best used with the single encrypted file layout, but the
 * folder layouts are supported so users can move an existing sync setup.
 */
export function createGoogleDriveProvider(
  options: GoogleDriveOptions,
  mode: SyncMode = "encrypted-file",
  vaultOptions: ConstructorParameters<typeof FolderSyncProvider>[1] = {}
): SyncProvider {
  const fs = new GoogleDriveFileSystem(options);
  switch (mode) {
    case "open-folder":
      return new OpenFolderSyncProvider(fs);
    case "encrypted-folder":
      return new FolderSyncProvider(fs, vaultOptions);
    case "encrypted-file":
      return new EncryptedFileSyncProvider(fs);
  }
}

export type { SyncProvider } from "./types";
