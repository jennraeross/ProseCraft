import { describe, expect, it } from "vitest";
import {
  MAX_SPLIT_PANES,
  addSplitPane,
  canAddSplitPane,
  docTarget,
  fileTarget,
  moveSplitPane,
  openBeside,
  parseSplitTarget,
  pruneSplitTargets,
  removeSplitPane,
  setSplitTarget,
  tileColumns
} from "./split";

describe("split pane state", () => {
  it("parses and builds targets", () => {
    expect(parseSplitTarget(docTarget("a-1"))).toEqual({ kind: "doc", id: "a-1" });
    expect(parseSplitTarget(fileTarget("f:2"))).toEqual({ kind: "file", id: "f:2" });
    expect(parseSplitTarget("")).toBeNull();
    expect(parseSplitTarget("doc:")).toBeNull();
    expect(parseSplitTarget("other:1")).toBeNull();
  });

  it("allows five reference panes next to the editor and no more", () => {
    let panes = [] as ReturnType<typeof addSplitPane>;
    for (let index = 0; index < MAX_SPLIT_PANES + 2; index += 1) {
      panes = addSplitPane(panes, `p${index}`);
    }
    expect(panes).toHaveLength(MAX_SPLIT_PANES);
    expect(canAddSplitPane(panes)).toBe(false);
    expect(canAddSplitPane(panes.slice(1))).toBe(true);
  });

  it("removes a pane and sets a target without touching the others", () => {
    const panes = addSplitPane(addSplitPane([], "a"), "b");
    const targeted = setSplitTarget(panes, "b", docTarget("x"));
    expect(targeted).toEqual([{ id: "a", target: "" }, { id: "b", target: "doc:x" }]);
    expect(removeSplitPane(targeted, "a")).toEqual([{ id: "b", target: "doc:x" }]);
  });

  it("clears targets that no longer exist but keeps the pane", () => {
    const panes = [
      { id: "a", target: "doc:gone" },
      { id: "b", target: "file:kept" },
      { id: "c", target: "" }
    ];
    expect(pruneSplitTargets(panes, new Set(["file:kept"]))).toEqual([
      { id: "a", target: "" },
      { id: "b", target: "file:kept" },
      { id: "c", target: "" }
    ]);
  });
});

describe("open beside", () => {
  it("leaves the panes alone when the target is already open", () => {
    const panes = [{ id: "a", target: docTarget("x") }];
    expect(openBeside(panes, docTarget("x"), "new")).toEqual([{ id: "a", target: "doc:x" }]);
  });

  it("fills the first empty pane before adding a new one", () => {
    const panes = [
      { id: "a", target: docTarget("x") },
      { id: "b", target: "" },
      { id: "c", target: "" }
    ];
    expect(openBeside(panes, fileTarget("y"), "new")).toEqual([
      { id: "a", target: "doc:x" },
      { id: "b", target: "file:y" },
      { id: "c", target: "" }
    ]);
  });

  it("appends a new pane while below the limit", () => {
    const panes = [{ id: "a", target: docTarget("x") }];
    expect(openBeside(panes, fileTarget("y"), "b")).toEqual([
      { id: "a", target: "doc:x" },
      { id: "b", target: "file:y" }
    ]);
  });

  it("opens the first pane on an empty list", () => {
    expect(openBeside([], docTarget("x"), "a")).toEqual([{ id: "a", target: "doc:x" }]);
  });

  it("replaces the last pane once the limit is reached", () => {
    const panes = ["a", "b", "c", "d", "e"].map((id) => ({ id, target: docTarget(id) }));
    const next = openBeside(panes, fileTarget("fresh"), "new");
    expect(next).toHaveLength(MAX_SPLIT_PANES);
    expect(next[next.length - 1]).toEqual({ id: "e", target: "file:fresh" });
    expect(next.slice(0, -1)).toEqual(panes.slice(0, -1));
  });
});

describe("move split pane", () => {
  const panes = [
    { id: "a", target: "" },
    { id: "b", target: "" },
    { id: "c", target: "" }
  ];
  const ids = (list: ReturnType<typeof moveSplitPane>) => list.map((pane) => pane.id);

  it("swaps a pane with its neighbour", () => {
    expect(ids(moveSplitPane(panes, "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(moveSplitPane(panes, "b", 1))).toEqual(["a", "c", "b"]);
  });

  it("does nothing at the ends or for an unknown id", () => {
    expect(ids(moveSplitPane(panes, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveSplitPane(panes, "c", 1))).toEqual(["a", "b", "c"]);
    expect(ids(moveSplitPane(panes, "missing", 1))).toEqual(["a", "b", "c"]);
  });
});

describe("tile columns", () => {
  it("keeps one column for no tiles, a single tile or a too narrow container", () => {
    expect(tileColumns(0, 1600)).toBe(1);
    expect(tileColumns(1, 1600)).toBe(1);
    expect(tileColumns(6, 200)).toBe(1);
  });

  it("never uses more columns than tiles", () => {
    expect(tileColumns(2, 5000)).toBe(2);
    expect(tileColumns(3, 5000)).toBe(3);
  });

  it("uses as many columns as fit while the rows stay balanced", () => {
    expect(tileColumns(4, 680)).toBe(2);
    expect(tileColumns(5, 1020)).toBe(3);
    expect(tileColumns(6, 1020)).toBe(3);
  });

  it("prefers balanced rows over a nearly empty last row", () => {
    expect(tileColumns(4, 1020)).toBe(2);
    expect(tileColumns(6, 1360)).toBe(3);
  });

  it("honours a custom minimum tile width", () => {
    expect(tileColumns(4, 1000, 250)).toBe(4);
    expect(tileColumns(4, 1000, 400)).toBe(2);
  });
});
