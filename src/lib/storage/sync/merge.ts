import { createStoredProject, projectsHaveSameContent } from "../schema";
import type { StoredProject } from "../types";
import type { SyncStamp } from "./types";

/**
 * Code-unit string ordering. This deliberately avoids `localeCompare`: last-
 * write-wins must pick the same winner on every device, regardless of locale or
 * ICU version.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function newerThan(project: StoredProject, stamp: SyncStamp): boolean {
  return project.updatedAt > stamp.updatedAt
    || (project.updatedAt === stamp.updatedAt && project.revision > stamp.revision);
}

function compareRecords(a: StoredProject, b: StoredProject): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  if (a.revision !== b.revision) return a.revision - b.revision;
  return compareStrings(a.updatedBy, b.updatedBy);
}

/** Clones a losing project under a new id so no edits are silently discarded. */
export function createConflictCopy(loser: StoredProject, now: number, deviceId: string): StoredProject {
  const suffix = Math.random().toString(36).slice(2, 7);
  const id = `${loser.id}-conflict-${now.toString(36)}-${suffix}`;
  return createStoredProject({
    ...loser.project,
    id,
    name: `${loser.project.name} (conflicted copy)`
  }, deviceId, now);
}

export type MergeOutcome = {
  projects: StoredProject[];
  lastSynced: Record<string, SyncStamp>;
  imported: number;
  exported: number;
  conflicts: number;
  /** Project ids that should be deleted from the remote folder. */
  removedIds: string[];
};

/**
 * Reconciles local and remote project sets. Change detection is anchored to the
 * last synced stamp per project:
 *
 * - only one side changed → take it
 * - both changed → last-write-wins, and the loser is preserved as a conflicted
 *   copy so nothing is lost
 * - present on one side only and never synced → new project
 * - present on one side only and previously synced → deletion (a delete that
 *   races a local edit keeps the edited side as a conflicted copy)
 */
export function mergeProjects(
  local: StoredProject[],
  remote: StoredProject[],
  lastSynced: Record<string, SyncStamp>,
  now: number,
  deviceId: string
): MergeOutcome {
  const localById = new Map(local.map((project) => [project.id, project]));
  const remoteById = new Map(remote.map((project) => [project.id, project]));
  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...Object.keys(lastSynced)]);
  const projects: StoredProject[] = [];
  const removedIds: string[] = [];
  let imported = 0;
  let exported = 0;
  let conflicts = 0;

  for (const id of ids) {
    const localProject = localById.get(id);
    const remoteProject = remoteById.get(id);
    const base = lastSynced[id];

    if (localProject && remoteProject) {
      const sameContent = projectsHaveSameContent(localProject.project, remoteProject.project);
      if (sameContent) {
        projects.push(compareRecords(localProject, remoteProject) >= 0 ? localProject : remoteProject);
        continue;
      }
      const localChanged = !base || newerThan(localProject, base);
      const remoteChanged = !base || newerThan(remoteProject, base);
      if (localChanged && remoteChanged) {
        const localWins = compareRecords(localProject, remoteProject) >= 0;
        projects.push(localWins ? localProject : remoteProject);
        projects.push(createConflictCopy(localWins ? remoteProject : localProject, now, deviceId));
        conflicts += 1;
      } else if (remoteChanged) {
        projects.push(remoteProject);
        imported += 1;
      } else {
        projects.push(localProject);
        exported += 1;
      }
      continue;
    }

    if (localProject) {
      if (base && !remoteProject) {
        // Deleted on the remote side. Preserve a local edit made after the
        // last sync instead of destroying it.
        if (newerThan(localProject, base)) {
          projects.push(createConflictCopy(localProject, now, deviceId));
          conflicts += 1;
        }
      } else {
        projects.push(localProject);
        exported += 1;
      }
      continue;
    }

    if (remoteProject) {
      if (base) {
        // Deleted locally. If the remote changed after the last sync, keep its
        // content as a conflicted copy before removing the original.
        if (newerThan(remoteProject, base)) {
          projects.push(createConflictCopy(remoteProject, now, deviceId));
          conflicts += 1;
        }
        removedIds.push(id);
      } else {
        projects.push(remoteProject);
        imported += 1;
      }
    }
  }

  const nextSynced: Record<string, SyncStamp> = {};
  for (const project of projects) {
    nextSynced[project.id] = { updatedAt: project.updatedAt, revision: project.revision };
  }
  return { projects, lastSynced: nextSynced, imported, exported, conflicts, removedIds };
}
