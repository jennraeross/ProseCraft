/** Maximum number of reference panes next to the editor (so five panels in total). */
export const MAX_SPLIT_PANES = 4;

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
