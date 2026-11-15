import type { LabelDef, LabelColor } from "./publish/types";

/** Eight named colours usable on light and dark themes. */
export const LABEL_COLORS: ReadonlyArray<{ key: LabelColor; css: string }> = [
  { key: "grey", css: "#8a8f98" },
  { key: "amber", css: "#ffb74d" },
  { key: "green", css: "#a8d593" },
  { key: "blue", css: "#7fb3ff" },
  { key: "orange", css: "#ff8c42" },
  { key: "purple", css: "#c9a0dc" },
  { key: "red", css: "#e4574d" },
  { key: "pink", css: "#d4a5ff" },
];

/** Built-in labels: draft = grey/"Draft", revised = amber/"Revised", final = green/"Final" */
export const DEFAULT_LABELS: LabelDef[] = [
  { id: "label-draft", name: "Draft", color: "grey" },
  { id: "label-revised", name: "Revised", color: "amber" },
  { id: "label-final", name: "Final", color: "green" },
];

/** Validate unknown stored data, drop bad entries, de-duplicate ids, keep max 24. */
export function normalizeLabels(value: unknown): LabelDef[] | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const entries = Array.isArray(value) ? value : Object.values(value);
  const valid: LabelDef[] = [];
  const seenIds = new Set<string>();
  const labelColors: ReadonlySet<LabelColor> = new Set([
    "grey", "amber", "green", "blue", "orange", "purple", "red", "pink"
  ]);
  for (const entry of entries) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      "id" in entry === false ||
      typeof (entry as LabelDef).id !== "string" ||
      !((entry as LabelDef).id as string) ||
      typeof (entry as LabelDef).name !== "string" ||
      typeof (entry as LabelDef).color !== "string"
    ) {
      continue;
    }
    let color = (entry as LabelDef).color as string;
    // Normalize invalid colors to "grey", but keep valid LabelColor names
    if (!labelColors.has(color as LabelColor) && !/^#?[0-9a-fA-F]{6}$/.test(color)) {
      color = "grey";
    }
    const id = (entry as LabelDef).id as string;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    valid.push({ id, name: (entry as LabelDef).name, color: color as LabelColor });
    if (valid.length >= 24) break;
  }
  return valid.length > 0 ? valid : undefined;
}

/** Return stored labels or the defaults. */
export function projectLabels(project: { labels?: unknown }): LabelDef[] {
  const stored = normalizeLabels(project.labels);
  return stored ?? DEFAULT_LABELS;
}

/** Add a label if the id doesn't already exist. */
export function addLabel(
  labels: LabelDef[],
  id: string,
  name: string,
  color: LabelColor
): LabelDef[] {
  if (labels.some((l) => l.id === id)) return labels;
  if (labels.length >= 24) return labels;
  return [...labels, { id, name, color }];
}

/** Rename a label by id. */
export function renameLabel(
  labels: LabelDef[],
  id: string,
  newName: string
): LabelDef[] {
  const index = labels.findIndex((l) => l.id === id);
  if (index === -1) return labels;
  return labels.map((l, i) =>
    i === index ? { ...l, name: newName } : l
  );
}

/** Recolor a label by id. */
export function recolorLabel(
  labels: LabelDef[],
  id: string,
  newColor: LabelColor
): LabelDef[] {
  const index = labels.findIndex((l) => l.id === id);
  if (index === -1) return labels;
  return labels.map((l, i) =>
    i === index ? { ...l, color: newColor } : l
  );
}

/** Remove a label by id, clear assignments in documents and chapters. */
export function removeLabel(
  labels: LabelDef[],
  id: string,
  documents: { labelId?: string }[],
  chapters: { labelId?: string }[]
): { labels: LabelDef[]; documents: { labelId?: string }[]; chapters: { labelId?: string }[] } {
  const removedId = id;
  const newLabels = labels.filter((l) => l.id !== removedId);
  const newDocuments = documents.map((doc) => {
    if (doc.labelId === removedId) return { ...doc, labelId: undefined };
    return doc;
  });
  const newChapters = chapters.map((chap) => {
    if (chap.labelId === removedId) return { ...chap, labelId: undefined };
    return chap;
  });
  return { labels: newLabels, documents: newDocuments, chapters: newChapters };
}

/** Set labelId on an item. */
export function setLabel<Item extends { labelId?: string }>(
  item: Item,
  labelId: string | undefined
): Item & { labelId: string | undefined } {
  return { ...item, labelId };
}

/** Find a label by id. */
export function labelById(labels: LabelDef[], id: string): LabelDef | undefined {
  return labels.find((l) => l.id === id);
}

/** Count scenes per label, ignoring trashed. */
export function countByLabel(
  documents: { labelId?: string; trashed?: boolean }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const doc of documents) {
    if (doc.trashed) continue;
    if (doc.labelId) {
      counts[doc.labelId] = (counts[doc.labelId] || 0) + 1;
    }
  }
  return counts;
}