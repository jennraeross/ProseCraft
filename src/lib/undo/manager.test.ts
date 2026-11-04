import { describe, expect, it } from "vitest";
import { applyStateStep, diffState, diffText, editKindFromInputType, removedIds, UndoManager } from "./manager";

const edit = (kind: "type" | "delete" | "newline" | "other", time: number, caretMoved = false) => ({
  kind, time, caretMoved, before: null, after: null
});

function field(value = "") {
  const undo = new UndoManager<null>();
  undo.sync("a", value);
  return undo;
}

describe("diffText", () => {
  it.each([["abc", "abXc"], ["abc", "ac"], ["", "x"], ["x", ""], ["aaa", "aaaa"], ["same", "same"]])(
    "describes %s -> %s",
    (before, after) => {
      const { from, removed, inserted } = diffText(before, after);
      expect(before.slice(0, from) + inserted + before.slice(from + removed.length)).toBe(after);
    }
  );
});

describe("editKindFromInputType", () => {
  it("classifies input types", () => {
    expect(editKindFromInputType("insertText")).toBe("type");
    expect(editKindFromInputType("deleteContentBackward")).toBe("delete");
    expect(editKindFromInputType("insertParagraph")).toBe("newline");
    expect(editKindFromInputType("insertFromPaste")).toBe("other");
    expect(editKindFromInputType("insertText", true)).toBe("compose");
  });
});

describe("field grouping", () => {
  it("joins typing within two seconds", () => {
    const undo = field();
    undo.record("a", "p", "o", edit("type", 0));
    undo.record("a", "p", "on", edit("type", 1999));
    expect(undo.undoField("a")?.value).toBe("");
  });

  it("splits typing at two seconds from the start of the group", () => {
    const undo = field();
    undo.record("a", "p", "o", edit("type", 0));
    undo.record("a", "p", "on", edit("type", 1000));
    undo.record("a", "p", "one", edit("type", 2000));
    expect(undo.undoField("a")?.value).toBe("on");
    expect(undo.undoField("a")?.value).toBe("");
  });

  it("splits between typing and deleting, around newlines, and after a caret move", () => {
    const undo = field();
    undo.record("a", "p", "xx", edit("type", 0));
    undo.record("a", "p", "x", edit("delete", 1));
    undo.record("a", "p", "x\n", edit("newline", 2));
    undo.record("a", "p", "x\ny", edit("type", 3));
    undo.record("a", "p", "zx\ny", edit("type", 4, true));
    const values = [1, 2, 3, 4, 5].map(() => undo.undoField("a")?.value);
    expect(values).toEqual(["x\ny", "x\n", "x", "xx", ""]);
  });

  it("does not join an edit that follows an undo", () => {
    const undo = field();
    undo.record("a", "p", "ab", edit("type", 0));
    undo.record("a", "p", "ab c", edit("newline", 1));
    undo.undoField("a");
    undo.record("a", "p", "abd", edit("type", 2));
    expect(undo.undoField("a")?.value).toBe("ab");
  });

  it("clears redo after a new edit", () => {
    const undo = field();
    undo.record("a", "p", "a", edit("type", 0));
    undo.undoField("a");
    undo.record("a", "p", "b", edit("type", 1));
    expect(undo.redoField("a")).toBeNull();
  });

  it("discards history when the text changed elsewhere", () => {
    const undo = field();
    undo.record("a", "p", "a", edit("type", 0));
    undo.sync("a", "from sync");
    expect(undo.undoField("a")).toBeNull();
    expect(undo.undoPage("p", () => true)).toBeNull();
  });
});

describe("field isolation", () => {
  it("only undoes the requested field", () => {
    const undo = new UndoManager<null>();
    undo.sync("a", "");
    undo.sync("b", "");
    undo.record("a", "p", "a", edit("type", 0));
    undo.record("b", "p", "b", edit("type", 1));
    expect(undo.undoField("a")).toMatchObject({ key: "a", value: "" });
    expect(undo.undoField("a")).toBeNull();
    expect(undo.undoField("b")).toMatchObject({ key: "b", value: "" });
  });
});

describe("page history", () => {
  const board = (x: number, note: string) => ({ cards: [{ id: "c", x, note }] });

  it("undoes across fields and state in order, then redoes", () => {
    const undo = new UndoManager<null>();
    undo.sync("a", "");
    undo.record("a", "p", "text", edit("type", 0));
    undo.pushState("p", diffState(board(0, ""), board(5, ""), {}, 1)!);
    const first = undo.undoPage("p", () => true);
    expect(first?.type).toBe("state");
    expect(undo.undoPage("p", () => true)).toMatchObject({ type: "field", value: "" });
    expect(undo.undoPage("p", () => true)).toBeNull();
    expect(undo.redoPage("p", () => true)).toMatchObject({ type: "field", value: "text" });
    expect(undo.redoPage("p", () => true)?.type).toBe("state");
  });

  it("keeps page and field in step when the field undoes alone", () => {
    const undo = new UndoManager<null>();
    undo.sync("a", "");
    undo.record("a", "p", "x", edit("type", 0));
    undo.undoField("a");
    expect(undo.undoPage("p", () => true)).toBeNull();
    expect(undo.redoPage("p", () => true)).toMatchObject({ value: "x" });
  });

  it("keeps separate pages apart", () => {
    const undo = new UndoManager<null>();
    undo.pushState("p", diffState(board(0, ""), board(1, ""), {}, 0)!);
    expect(undo.undoPage("q", () => true)).toBeNull();
    expect(undo.undoPage("p", () => true)).not.toBeNull();
  });

  it("merges repeated changes to the same props made close together", () => {
    const undo = new UndoManager<null>();
    undo.pushState("p", diffState(board(0, ""), board(1, ""), {}, 0)!);
    undo.pushState("p", diffState(board(1, ""), board(2, ""), {}, 100)!);
    const result = undo.undoPage("p", () => true);
    if (result?.type !== "state") throw new Error("expected a state step");
    expect(applyStateStep(board(2, ""), result.step, "undo")).toEqual(board(0, ""));
    expect(undo.undoPage("p", () => true)).toBeNull();
  });

  it("does not merge changes further apart", () => {
    const undo = new UndoManager<null>();
    undo.pushState("p", diffState(board(0, ""), board(1, ""), {}, 0)!);
    undo.pushState("p", diffState(board(1, ""), board(2, ""), {}, 5000)!);
    undo.undoPage("p", () => true);
    expect(undo.undoPage("p", () => true)).not.toBeNull();
  });

  it("discards a field step that cannot be applied", () => {
    const undo = new UndoManager<null>();
    undo.sync("a", "");
    undo.record("a", "p", "x", edit("type", 0));
    expect(undo.undoPage("p", () => false)).toBeNull();
  });
});

describe("external editor steps", () => {
  function pageWithFieldThenExternal() {
    const undo = new UndoManager<null>();
    undo.sync("title", "");
    undo.record("title", "p", "t", edit("type", 0));
    undo.recordExternal("p", "md");
    return undo;
  }

  it("keeps its position among field steps", () => {
    const undo = pageWithFieldThenExternal();
    expect(undo.undoPage("p", () => true)).toEqual({ type: "external", key: "md" });
    undo.externalUndone("p", "md");
    expect(undo.undoPage("p", () => true)).toMatchObject({ type: "field", key: "title" });
  });

  it("comes after a field step recorded later", () => {
    const undo = new UndoManager<null>();
    undo.recordExternal("p", "md");
    undo.sync("title", "");
    undo.record("title", "p", "t", edit("type", 0));
    expect(undo.undoPage("p", () => true)).toMatchObject({ type: "field", key: "title" });
    expect(undo.undoPage("p", () => true)).toEqual({ type: "external", key: "md" });
  });

  it("stays in step when the editor undoes by itself", () => {
    const undo = pageWithFieldThenExternal();
    undo.externalUndone("p", "md");
    expect(undo.undoPage("p", () => true)).toMatchObject({ type: "field", key: "title" });
    expect(undo.redoPage("p", () => true)).toMatchObject({ type: "field", key: "title" });
    expect(undo.redoPage("p", () => true)).toEqual({ type: "external", key: "md" });
    undo.externalRedone("p", "md");
    expect(undo.redoPage("p", () => true)).toBeNull();
  });

  it("skips steps for an editor that is not available", () => {
    const undo = pageWithFieldThenExternal();
    expect(undo.undoPage("p", (key) => key !== "md")).toMatchObject({ type: "field", key: "title" });
  });

  it("discards a step the editor could not apply", () => {
    const undo = pageWithFieldThenExternal();
    undo.undoPage("p", () => true);
    undo.discardNewest("p", "undo");
    expect(undo.undoPage("p", () => true)).toMatchObject({ type: "field", key: "title" });
  });

  it("forgets steps when the editor history is cleared", () => {
    const undo = new UndoManager<null>();
    undo.recordExternal("p", "md");
    undo.recordExternal("p", "md");
    undo.forgetExternal("p", "md");
    expect(undo.undoPage("p", () => true)).toBeNull();
  });
});

describe("state steps", () => {
  it("restores only changed props, leaving newer text alone", () => {
    const step = diffState({ cards: [{ id: "c", x: 0, note: "old" }] }, { cards: [{ id: "c", x: 9, note: "old" }] })!;
    const undone = applyStateStep({ cards: [{ id: "c", x: 9, note: "new" }] }, step, "undo");
    expect(undone).toEqual({ cards: [{ id: "c", x: 0, note: "new" }] });
  });

  it("returns null when nothing changed apart from ignored props", () => {
    expect(diffState(
      { docs: [{ id: "d", content: "a" }] },
      { docs: [{ id: "d", content: "b" }] },
      { docs: ["content"] }
    )).toBeNull();
  });

  it("restores a removed item and its position", () => {
    const before = { nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    const after = { nodes: [{ id: "a" }, { id: "c" }] };
    expect(applyStateStep(after, diffState(before, after)!, "undo")).toEqual(before);
  });

  it("restores order", () => {
    const before = { nodes: [{ id: "a" }, { id: "b" }] };
    const after = { nodes: [{ id: "b" }, { id: "a" }] };
    const step = diffState(before, after)!;
    expect(applyStateStep(after, step, "undo")).toEqual(before);
    expect(applyStateStep(before, step, "redo")).toEqual(after);
  });

  it("keeps text added to an item when undo removes it and redo restores it", () => {
    const step = diffState({ nodes: [] }, { nodes: [{ id: "a", text: "" }] })!;
    const removed = applyStateStep({ nodes: [{ id: "a", text: "typed" }] }, step, "undo");
    expect(removed).toEqual({ nodes: [] });
    expect(applyStateStep(removed, step, "redo")).toEqual({ nodes: [{ id: "a", text: "typed" }] });
  });

  it("skips items that no longer exist", () => {
    const step = diffState({ nodes: [{ id: "a", x: 0 }] }, { nodes: [{ id: "a", x: 1 }] })!;
    expect(applyStateStep({ nodes: [] }, step, "undo")).toEqual({ nodes: [] });
  });

  it("patches plain objects by top-level prop", () => {
    const step = diffState({ options: { a: 1, b: 1 } }, { options: { a: 2, b: 1 } })!;
    expect(applyStateStep({ options: { a: 2, b: 5 } }, step, "undo")).toEqual({ options: { a: 1, b: 5 } });
  });

  it("forgets a permanently deleted item so redo cannot restore it", () => {
    const undo = new UndoManager<null>();
    undo.pushState("p", diffState({ docs: [] }, { docs: [{ id: "d" }] }, {}, 0)!);
    undo.forget("docs", "d");
    expect(undo.undoPage("p", () => true)).toBeNull();
  });

  it("lists removed ids", () => {
    expect(removedIds({ docs: [{ id: "a" }, { id: "b" }] }, { docs: [{ id: "b" }] }))
      .toEqual([{ collection: "docs", id: "a" }]);
  });
});
