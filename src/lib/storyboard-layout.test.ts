import { describe, expect, it } from "vitest";
import {
  boardPointAtViewportCenter,
  boardPointFromClient,
  clampBoardZoom,
  drawingBoundsFromPoints,
  moveStoryboardDrawing,
  normalizeStoryboardDrawings,
  positionStoryboardCards,
  resizeStoryboardDrawing,
  type StoryboardCardRecord
} from "./storyboard-layout";

const card = (id: string, rowId: string, position: Partial<StoryboardCardRecord> = {}) => ({
  id,
  sourceId: id,
  rowId,
  kind: "blank" as const,
  title: id,
  note: "",
  ...position
});

describe("storyboard canvas layout", () => {
  it("migrates legacy row ordering into distinct stable 2D positions", () => {
    const cards = positionStoryboardCards([
      card("a", "row-a"),
      card("b", "row-a"),
      card("c", "row-b")
    ], [{ id: "row-a", title: "Act 1" }, { id: "row-b", title: "Act 2" }]);

    expect(cards.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 40, y: 40 },
      { x: 290, y: 40 },
      { x: 40, y: 330 }
    ]);
  });

  it("preserves valid saved positions and replaces malformed positions", () => {
    const cards = positionStoryboardCards([
      card("placed", "row-a", { x: 321.4, y: -70.8 }),
      card("legacy", "row-a", { x: Number.NaN, y: 10 })
    ], [{ id: "row-a", title: "Act 1" }]);

    expect(cards.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 321, y: -71 },
      { x: 290, y: 40 }
    ]);
  });

  it("converts viewport pointers into translated world coordinates", () => {
    expect(boardPointFromClient(150, 260, { left: 20, top: 60 }, { x: 300, y: 500 }))
      .toEqual({ x: 430, y: 700 });
  });

  it("accounts for zoom when converting pointers and centering new cards", () => {
    expect(boardPointFromClient(150, 260, { left: 20, top: 60 }, { x: 300, y: 500 }, 2))
      .toEqual({ x: 365, y: 600 });
    expect(boardPointAtViewportCenter(800, 600, { x: 100, y: 200 }, 24, 2))
      .toEqual({ x: 214, y: 294 });
  });

  it("clamps zoom to a usable range", () => {
    expect(clampBoardZoom(0.1)).toBe(0.4);
    expect(clampBoardZoom(4)).toBe(2.5);
    expect(clampBoardZoom(Number.NaN)).toBe(1);
  });

  it("places new cards around the visible viewport center", () => {
    expect(boardPointAtViewportCenter(800, 600, { x: 100, y: 200 }, 24))
      .toEqual({ x: 414, y: 444 });
  });

  it("normalizes drawing rectangles regardless of drag direction", () => {
    expect(drawingBoundsFromPoints({ x: 200, y: 140 }, { x: 80, y: 60 }))
      .toEqual({ x: 80, y: 60, width: 120, height: 80 });
    expect(drawingBoundsFromPoints({ x: 80, y: 60 }, { x: 81, y: 61 }))
      .toEqual({ x: 80, y: 60, width: 24, height: 24 });
  });

  it("moves vector endpoints and canvas object origins together", () => {
    expect(moveStoryboardDrawing({
      id: "arrow",
      type: "arrow",
      startX: 10,
      startY: 20,
      endX: 90,
      endY: 40
    }, { x: -5, y: 12 })).toEqual({
      id: "arrow",
      type: "arrow",
      startX: 5,
      startY: 32,
      endX: 85,
      endY: 52
    });
    expect(moveStoryboardDrawing({
      id: "box",
      type: "box",
      x: 10,
      y: 20,
      width: 90,
      height: 40
    }, { x: 4, y: -8 })).toMatchObject({ x: 14, y: 12 });
  });

  it("resizes boxes and text areas without allowing zero-sized shapes", () => {
    expect(resizeStoryboardDrawing({
      id: "box",
      type: "box",
      x: 10,
      y: 20,
      width: 90,
      height: 40
    }, { x: -200, y: -200 })).toMatchObject({ width: 24, height: 24 });
    expect(resizeStoryboardDrawing({
      id: "text",
      type: "text",
      x: 10,
      y: 20,
      width: 180,
      height: 56,
      text: "Label",
      fontSize: 14
    }, { x: 30, y: 20 }, 100, 40)).toMatchObject({ width: 210, height: 76 });
  });

  it("keeps valid drawing records and filters malformed geometry", () => {
    expect(normalizeStoryboardDrawings([
      { id: "arrow", type: "arrow", startX: 20.4, startY: 30, endX: 90, endY: 100.8 },
      { id: "text", type: "text", x: 10, y: 20, width: 160, height: 52, text: "Beginning", fontSize: 24 },
      { id: "bad-size", type: "box", x: 1, y: 2, width: 0, height: 80 },
      { id: "bad-text", type: "text", x: 1, y: 2, width: 80, height: 40, text: 4 },
      { id: "bad-point", type: "line", startX: Number.NaN, startY: 0, endX: 1, endY: 1 }
    ])).toEqual([
      { id: "arrow", type: "arrow", startX: 20, startY: 30, endX: 90, endY: 101 },
      { id: "text", type: "text", x: 10, y: 20, width: 160, height: 52, text: "Beginning", fontSize: 24 }
    ]);
  });

  it("defaults legacy text to a normal font size and clamps invalid ranges", () => {
    expect(normalizeStoryboardDrawings([
      { id: "legacy", type: "text", x: 0, y: 0, width: 120, height: 40, text: "Legacy" },
      { id: "too-large", type: "text", x: 0, y: 0, width: 120, height: 40, text: "Large", fontSize: 99 },
      { id: "too-small", type: "text", x: 0, y: 0, width: 120, height: 40, text: "Small", fontSize: 2 }
    ])).toMatchObject([
      { id: "legacy", fontSize: 14 },
      { id: "too-large", fontSize: 72 },
      { id: "too-small", fontSize: 8 }
    ]);
  });
});
