import { mergeProjects } from "./merge";
import type { SyncProvider, SyncResult, SyncStamp } from "./types";
import type { StoredProject } from "../types";

/**
 * Shared connect → merge → push flow used by every sync layout, so conflict
 * handling cannot drift between the encrypted file, encrypted folder, and open
 * folder providers.
 */
export async function syncViaProvider(
  provider: SyncProvider,
  passphrase: string,
  local: StoredProject[],
  lastSynced: Record<string, SyncStamp>,
  now: number,
  deviceId: string
): Promise<SyncResult> {
  const connection = await provider.connect(passphrase);
  const merged = mergeProjects(local, connection.projects, lastSynced, now, deviceId);
  const projects = provider.normalize ? provider.normalize(merged.projects) : merged.projects;
  await provider.push(projects, connection.vaultKey);
  if (merged.removedIds.length > 0) await provider.remove(merged.removedIds);
  return {
    projects,
    created: connection.created,
    imported: merged.imported,
    exported: merged.exported,
    removed: merged.removedIds.length,
    conflicts: merged.conflicts,
    lastSynced: merged.lastSynced
  };
}
