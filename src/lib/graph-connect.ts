/**
 * Pure helpers for drawing a connection between two pages by dragging.
 *
 * Points are world coordinates (see `graph-layout.ts`): `RelationGraph.svelte`
 * converts pointer positions with `screenToWorld` first, so the snap radius is
 * the same at every zoom level.
 */

import type { GraphPoint, GraphView } from "./graph-layout";

/** A page that can be connected: its id and its centre. */
export type ConnectNode = { id: string; x: number; y: number };

/** A relation as it is stored, in its declared direction. */
export type ConnectRelation = { from: string; to: string };

/** The page a dragged connection snaps to; `valid` is false for a duplicate. */
export type ConnectTarget = { id: string; valid: boolean };

/** Converts a point in canvas pixels to world coordinates. */
export function screenToWorld(point: GraphPoint, view: GraphView): GraphPoint {
  return {
    x: (point.x - view.translate.x) / view.scale,
    y: (point.y - view.translate.y) / view.scale
  };
}

/** The nearest page whose centre lies within `radius` of the point, or null. */
export function nodeAtPoint(
  nodes: readonly ConnectNode[],
  point: GraphPoint,
  radius: number
): string | null {
  let found: string | null = null;
  let nearest = radius;
  for (const node of nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    if (distance > nearest) continue;
    found = node.id;
    nearest = distance;
  }
  return found;
}

/** Whether a page already declares a relation towards `toId`. */
export function hasDeclaredRelation(
  relations: readonly ConnectRelation[],
  fromId: string,
  toId: string
): boolean {
  return relations.some((relation) => relation.from === fromId && relation.to === toId);
}

/** A connection is only allowed between two pages that are not linked yet. */
export function canConnect(
  relations: readonly ConnectRelation[],
  fromId: string,
  toId: string
): boolean {
  return fromId !== toId && !hasDeclaredRelation(relations, fromId, toId);
}

/**
 * Resolves the page under the pointer while a connection is dragged. The source
 * page never snaps, so dragging back onto it cancels instead of connecting.
 */
export function connectionTarget(
  nodes: readonly ConnectNode[],
  relations: readonly ConnectRelation[],
  fromId: string,
  point: GraphPoint,
  radius: number
): ConnectTarget | null {
  const id = nodeAtPoint(
    nodes.filter((node) => node.id !== fromId),
    point,
    radius
  );
  if (!id) return null;
  return { id, valid: canConnect(relations, fromId, id) };
}
