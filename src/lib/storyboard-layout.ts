import type { StoryboardCard, StoryboardDrawing, StoryboardRow } from "./storage/types";

export type BoardPoint = { x: number; y: number };
export type BoardViewportRect = Pick<DOMRect, "left" | "top">;
export type StoryboardCardRecord =
  Omit<StoryboardCard, "x" | "y"> & Partial<Pick<StoryboardCard, "x" | "y">>;

const LEGACY_CARD_STEP_X = 250;
const LEGACY_ROW_STEP_Y = 290;
const MAX_DRAWING_COORDINATE = 10_000_000;

export type DrawingBounds = { x: number; y: number; width: number; height: number };

export const BOARD_MIN_ZOOM = 0.4;
export const BOARD_MAX_ZOOM = 2.5;

/** Keeps the storyboard zoom inside the range the UI can navigate safely. */
export function clampBoardZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, zoom));
}

/**
 * Converts a pointer position in the viewport to the translated and scaled
 * canvas world. `pan` is the world point shown at the viewport's top-left.
 */
export function boardPointFromClient(
  clientX: number,
  clientY: number,
  rect: BoardViewportRect,
  pan: BoardPoint,
  zoom = 1
): BoardPoint {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    x: (clientX - rect.left) / scale + pan.x,
    y: (clientY - rect.top) / scale + pan.y
  };
}

/**
 * Places legacy cards into a stable freeform grid based on their former row
 * and order. Explicit positions always win over the migration layout.
 */
export function positionStoryboardCards(
  cards: StoryboardCardRecord[],
  rows: StoryboardRow[]
): StoryboardCard[] {
  const rowIndex = new Map(rows.map((row, index) => [row.id, index]));
  const nextIndexByRow = new Map<string, number>();

  return cards.map((card) => {
    const row = card.rowId || rows[0]?.id || "";
    const rowPosition = rowIndex.get(row) ?? 0;
    const columnPosition = nextIndexByRow.get(row) ?? 0;
    nextIndexByRow.set(row, columnPosition + 1);
    const hasPosition = Number.isFinite(card.x)
      && Number.isFinite(card.y)
      && Math.abs(card.x ?? 0) <= 10_000_000
      && Math.abs(card.y ?? 0) <= 10_000_000;

    return {
      ...card,
      x: hasPosition ? Math.round(card.x ?? 0) : 40 + columnPosition * LEGACY_CARD_STEP_X,
      y: hasPosition ? Math.round(card.y ?? 0) : 40 + rowPosition * LEGACY_ROW_STEP_Y
    };
  });
}

/** Starts added cards near the viewport center and offsets repeats slightly. */
export function boardPointAtViewportCenter(
  width: number,
  height: number,
  pan: BoardPoint,
  offset = 0,
  zoom = 1
): BoardPoint {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    x: Math.round(pan.x + width / (2 * scale) - 110 + offset),
    y: Math.round(pan.y + height / (2 * scale) - 80 + offset)
  };
}

/** Returns a nonzero rectangle covering a drag from any corner to any corner. */
export function drawingBoundsFromPoints(
  start: BoardPoint,
  end: BoardPoint,
  minimumSize = 24
): DrawingBounds {
  return {
    x: Math.round(Math.min(start.x, end.x)),
    y: Math.round(Math.min(start.y, end.y)),
    width: Math.max(minimumSize, Math.round(Math.abs(end.x - start.x))),
    height: Math.max(minimumSize, Math.round(Math.abs(end.y - start.y)))
  };
}

export function moveStoryboardDrawing(
  drawing: StoryboardDrawing,
  delta: BoardPoint
): StoryboardDrawing {
  if (drawing.type === "line" || drawing.type === "arrow") {
    return {
      ...drawing,
      startX: Math.round(drawing.startX + delta.x),
      startY: Math.round(drawing.startY + delta.y),
      endX: Math.round(drawing.endX + delta.x),
      endY: Math.round(drawing.endY + delta.y)
    };
  }
  return {
    ...drawing,
    x: Math.round(drawing.x + delta.x),
    y: Math.round(drawing.y + delta.y)
  };
}

export function resizeStoryboardDrawing(
  drawing: StoryboardDrawing,
  delta: BoardPoint,
  minimumWidth = 24,
  minimumHeight = 24
): StoryboardDrawing {
  if (drawing.type !== "box" && drawing.type !== "text") return drawing;
  return {
    ...drawing,
    width: Math.max(minimumWidth, Math.round(drawing.width + delta.x)),
    height: Math.max(minimumHeight, Math.round(drawing.height + delta.y))
  };
}

/** Discards malformed drawing records before loading them into the canvas. */
export function normalizeStoryboardDrawings(value: unknown): StoryboardDrawing[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is StoryboardDrawing => {
    if (typeof item !== "object" || item === null) return false;
    const drawing = item as Partial<StoryboardDrawing>;
    if (typeof drawing.id !== "string" || drawing.id.length === 0) return false;

    if (drawing.type === "line" || drawing.type === "arrow") {
      return [drawing.startX, drawing.startY, drawing.endX, drawing.endY]
        .every(isValidDrawingCoordinate);
    }

    if (drawing.type === "box" || drawing.type === "text") {
      const validGeometry = [drawing.x, drawing.y, drawing.width, drawing.height]
        .every(isValidDrawingCoordinate)
        && (drawing.width ?? 0) > 0
        && (drawing.height ?? 0) > 0;
      return validGeometry && (drawing.type !== "text" || typeof drawing.text === "string");
    }

    return false;
  }).map((drawing) => {
    if (drawing.type === "line" || drawing.type === "arrow") {
      return {
        ...drawing,
        startX: Math.round(drawing.startX),
        startY: Math.round(drawing.startY),
        endX: Math.round(drawing.endX),
        endY: Math.round(drawing.endY)
      };
    }
    if (drawing.type === "text") {
      return {
        ...drawing,
        x: Math.round(drawing.x),
        y: Math.round(drawing.y),
        width: Math.round(drawing.width),
        height: Math.round(drawing.height),
        fontSize: normalizeStoryboardTextFontSize(drawing.fontSize)
      };
    }
    return {
      ...drawing,
      x: Math.round(drawing.x),
      y: Math.round(drawing.y),
      width: Math.round(drawing.width),
      height: Math.round(drawing.height)
    };
  });
}

export function normalizeStoryboardTextFontSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 14;
  return Math.round(Math.min(72, Math.max(8, value)));
}

function isValidDrawingCoordinate(value: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Math.abs(value) <= MAX_DRAWING_COORDINATE;
}
