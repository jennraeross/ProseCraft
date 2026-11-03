import { describe, expect, it } from "vitest";
import {
  MAX_SPLIT_PANES,
  addSplitPane,
  canAddSplitPane,
  docTarget,
  fileTarget,
  parseSplitTarget,
  pruneSplitTargets,
  removeSplitPane,
  setSplitTarget
} from "./split";

describe("split pane state", () => {
  it("parses and builds targets", () => {
    expect(parseSplitTarget(docTarget("a-1"))).toEqual({ kind: "doc", id: "a-1" });
    expect(parseSplitTarget(fileTarget("f:2"))).toEqual({ kind: "file", id: "f:2" });
    expect(parseSplitTarget("")).toBeNull();
    expect(parseSplitTarget("doc:")).toBeNull();
    expect(parseSplitTarget("other:1")).toBeNull();
  });

  it("allows four reference panes next to the editor and no more", () => {
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
