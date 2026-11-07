/** Maximum number of reference panes next to the editor (so six panels in total). */
export const MAX_SPLIT_PANES = 5;

export type SplitPaneState = { id: string; target: string };
export type SplitOption = { value: string; label: string };
export type SplitGroup = { label: string; options: SplitOption[] };
export type SplitTarget = { kind: "doc" | "file"; id: string };

export const docTarget = (id: string): string => `doc:${id}`;
export const fileTarget = (id: string): string => `file:${id}`;

/** Splits a pane target such as `doc:<id>` into its kind and id; empty or malformed targets give null. */
export function parseSplitTarget(target: string): SplitTarget | null {
  const match = /^(doc|file):(.+)$/.exec(target);
  return match ? { kind: match[1] as SplitTarget["kind"], id: match[2] } : null;
}

export function canAddSplitPane(panes: readonly SplitPaneState[]): boolean {
  return panes.length < MAX_SPLIT_PANES;
}

/** Appends an empty pane, or returns the list unchanged once the limit is reached. */
export function addSplitPane(panes: readonly SplitPaneState[], id: string): SplitPaneState[] {
  return canAddSplitPane(panes) ? [...panes, { id, target: "" }] : [...panes];
}

export function removeSplitPane(panes: readonly SplitPaneState[], id: string): SplitPaneState[] {
  return panes.filter((pane) => pane.id !== id);
}

/**
 * Opens `target` beside the editor: reuses a pane that already shows it, otherwise fills the first
 * empty pane, otherwise appends a pane, otherwise replaces the last pane so the action always applies.
 */
export function openBeside(
  panes: readonly SplitPaneState[],
  target: string,
  newId: string
): SplitPaneState[] {
  if (panes.some((pane) => pane.target === target)) {
    return [...panes];
  }
  const freeIndex = panes.findIndex((pane) => pane.target === "");
  if (freeIndex !== -1) {
    return panes.map((pane, index) => (index === freeIndex ? { ...pane, target } : pane));
  }
  if (canAddSplitPane(panes)) {
    return [...panes, { id: newId, target }];
  }
  return panes.map((pane, index) => (index === panes.length - 1 ? { ...pane, target } : pane));
}

/** Swaps a pane with its neighbour, so `delta` of -1 moves it left and 1 moves it right; no-op at the ends. */
export function moveSplitPane(
  panes: readonly SplitPaneState[],
  id: string,
  delta: -1 | 1
): SplitPaneState[] {
  const index = panes.findIndex((pane) => pane.id === id);
  const neighbour = index + delta;
  if (index === -1 || neighbour < 0 || neighbour >= panes.length) {
    return [...panes];
  }
  const next = [...panes];
  next[index] = panes[neighbour];
  next[neighbour] = panes[index];
  return next;
}

export function setSplitTarget(
  panes: readonly SplitPaneState[],
  id: string,
  target: string
): SplitPaneState[] {
  return panes.map((pane) => (pane.id === id ? { ...pane, target } : pane));
}

/** Clears targets that no longer exist (deleted or trashed), keeping the panes themselves open. */
export function pruneSplitTargets(
  panes: readonly SplitPaneState[],
  validTargets: ReadonlySet<string>
): SplitPaneState[] {
  return panes.map((pane) => (pane.target && !validTargets.has(pane.target) ? { ...pane, target: "" } : pane));
}

/**
 * Number of columns that fit `tileCount` tiles into `containerWidth`: at least 1, at most `tileCount`.
 * Slanted towards balanced rows, so tiles are not left alone in a last row - four tiles in a width
 * that fits three columns become 2+2 rather than 3+1, while five tiles stay 3+2.
 */
export function tileColumns(tileCount: number, containerWidth: number, minTileWidth = 340): number {
  const tiles = Math.floor(tileCount);
  if (!Number.isFinite(tiles) || tiles <= 1) {
    return 1;
  }
  const fitting = Math.floor(containerWidth / minTileWidth);
  const maxColumns = Math.min(tiles, Number.isFinite(fitting) ? fitting : 1);
  for (let columns = maxColumns; columns > 1; columns -= 1) {
    const remainder = tiles % columns;
    if (remainder === 0 || remainder >= columns - 1) {
      return columns;
    }
  }
  return 1;
}
