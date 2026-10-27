import type { TimelineNode } from "./storage/types";

export const TIMELINE_TITLE_LIMIT = 160;
export const TIMELINE_WHEN_LIMIT = 80;
export const TIMELINE_DESCRIPTION_LIMIT = 4000;

function normalizeText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export function createTimelineNode(): TimelineNode {
  return {
    id: crypto.randomUUID(),
    title: "",
    date: "",
    time: "",
    description: ""
  };
}

/** Keeps older, partially written, or imported timeline data renderable. */
export function normalizeTimelineNodes(value: unknown): TimelineNode[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const nodes: TimelineNode[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const node = entry as Partial<TimelineNode>;
    if (typeof node.id !== "string" || !node.id || seen.has(node.id)) continue;
    seen.add(node.id);
    nodes.push({
      id: node.id,
      title: normalizeText(node.title, TIMELINE_TITLE_LIMIT),
      date: normalizeText(node.date, TIMELINE_WHEN_LIMIT),
      time: normalizeText(node.time, TIMELINE_WHEN_LIMIT),
      description: normalizeText(node.description, TIMELINE_DESCRIPTION_LIMIT)
    });
  }
  return nodes;
}
