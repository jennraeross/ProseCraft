import { describe, expect, it } from "vitest";
import { commentText } from "./comment-dom";
import {
  addFootnote,
  createFootnoteId,
  decodeBodyUndoValue,
  encodeBodyUndoValue,
  extractFootnoteIds,
  findDanglingFootnoteRefs,
  findOrphanFootnotes,
  footnoteMarkerHtml,
  footnoteNumbers,
  normalizeFootnotes,
  numberedFootnotes,
  pruneOrphanFootnotes,
  removeFootnote,
  removeFootnoteRefFromHtml,
  renumberFootnoteMarkers,
  updateFootnote
} from "./footnotes";
import type { FootnoteDef } from "./publish/types";
import { isValidFootnoteId } from "./sanitize";
import { UndoManager } from "./undo/manager";

describe("footnote id and marker helpers", () => {
  it("generates valid ids with createFootnoteId", () => {
    const id = createFootnoteId(() => 0.25);
    expect(isValidFootnoteId(id)).toBe(true);
    expect(id).toMatch(/^fn-[a-z0-9]{6}$/);
  });

  it("builds empty non-editable markers and rejects invalid ids", () => {
    expect(footnoteMarkerHtml("fn-1")).toBe(
      `<sup class="footnote-ref" data-footnote-id="fn-1" contenteditable="false"></sup>`
    );
    expect(() => footnoteMarkerHtml("bad id!")).toThrow(/Invalid footnote id/);
  });
});

describe("document order numbering and orphan detection", () => {
  const html =
    `<p>First${footnoteMarkerHtml("fn-b")} and second${footnoteMarkerHtml("fn-a")}</p>`
    + `<p>Repeat${footnoteMarkerHtml("fn-b")} and missing${footnoteMarkerHtml("fn-missing")}</p>`;

  const defs: FootnoteDef[] = [
    { id: "fn-a", html: "Alpha" },
    { id: "fn-orphan", html: "Unused" },
    { id: "fn-b", html: "Beta" }
  ];

  it("extracts ids and assigns 1-based numbers by first appearance in document order", () => {
    expect(extractFootnoteIds(html)).toEqual(["fn-b", "fn-a", "fn-b", "fn-missing"]);
    expect([...footnoteNumbers(html).entries()]).toEqual([
      ["fn-b", 1],
      ["fn-a", 2],
      ["fn-missing", 3]
    ]);
  });

  it("pairs ordered numbers with definitions and flags missing definitions", () => {
    expect(numberedFootnotes(html, defs)).toEqual([
      { id: "fn-b", number: 1, html: "Beta", missingDefinition: false },
      { id: "fn-a", number: 2, html: "Alpha", missingDefinition: false },
      { id: "fn-missing", number: 3, html: "", missingDefinition: true }
    ]);
  });

  it("detects and prunes orphan definitions and detects dangling refs", () => {
    expect(findOrphanFootnotes(html, defs)).toEqual([{ id: "fn-orphan", html: "Unused" }]);
    expect(pruneOrphanFootnotes(html, defs)).toEqual([
      { id: "fn-a", html: "Alpha" },
      { id: "fn-b", html: "Beta" }
    ]);
    expect(findDanglingFootnoteRefs(html, defs)).toEqual(["fn-missing"]);
  });
});

describe("immutable footnote CRUD helpers", () => {
  it("adds footnotes immutably using an injected id factory and sanitizes inline HTML", () => {
    let counter = 0;
    const factory = () => `fn-${++counter}`;

    const initial: readonly FootnoteDef[] = Object.freeze([
      { id: "fn-1", html: "Existing" }
    ]);

    const added = addFootnote(initial, `Note <em>one</em><h1>heading</h1>`, factory);
    expect(initial).toEqual([{ id: "fn-1", html: "Existing" }]);
    expect(added.footnote).toEqual({ id: "fn-2", html: "Note <em>one</em>heading" });
    expect(added.markerHtml).toBe(footnoteMarkerHtml("fn-2"));
    expect(added.footnotes).toEqual([
      { id: "fn-1", html: "Existing" },
      { id: "fn-2", html: "Note <em>one</em>heading" }
    ]);
  });

  it("throws when the injected id factory returns invalid or permanently colliding ids", () => {
    expect(() => addFootnote([], "Note", () => "bad id!")).toThrow(/Invalid footnote id/);
    expect(() => addFootnote([{ id: "fn-1", html: "One" }], "Two", () => "fn-1"))
      .toThrow(/unique id/);
  });

  it("updates and removes footnotes immutably", () => {
    const initial: readonly FootnoteDef[] = Object.freeze([
      { id: "fn-1", html: "First" },
      { id: "fn-2", html: "Second" }
    ]);

    const updated = updateFootnote(initial, "fn-2", `Updated <b>text</b><img src="data:image/png;base64,AA==">`);
    expect(initial[1].html).toBe("Second");
    expect(updated).toEqual([
      { id: "fn-1", html: "First" },
      { id: "fn-2", html: "Updated <b>text</b>" }
    ]);

    const removed = removeFootnote(updated, "fn-1");
    expect(updated).toHaveLength(2);
    expect(removed).toEqual([{ id: "fn-2", html: "Updated <b>text</b>" }]);
  });

  it("removes only the targeted footnote marker from HTML", () => {
    const html = `<p>One${footnoteMarkerHtml("fn-1")} two${footnoteMarkerHtml("fn-2")}.</p>`;
    expect(removeFootnoteRefFromHtml(html, "fn-1")).toBe(
      `<p>One two${footnoteMarkerHtml("fn-2")}.</p>`
    );
  });

  it("normalizes stored footnote arrays while keeping undefined absent", () => {
    expect(normalizeFootnotes(undefined)).toBeUndefined();
    expect(normalizeFootnotes("not-an-array")).toBeUndefined();
    expect(normalizeFootnotes([
      { id: "fn-1", html: `<b>Ok</b><div class="scene-break">* * *</div>` },
      { id: "fn-1", html: "Duplicate ignored" },
      { id: "bad id", html: "Dropped" },
      { id: "fn-2", html: 123 },
      null
    ])).toEqual([{ id: "fn-1", html: "<b>Ok</b>" }]);
  });
});

describe("DOM numbering and atomic undo encoding", () => {
  it("sets data-num in DOM order, keeps markers empty/non-editable, and leaves commentText untouched", () => {
    const root = document.createElement("div");
    root.innerHTML =
      `<p>Alpha${footnoteMarkerHtml("fn-b")} beta<sup class="footnote-ref" data-footnote-id="fn-a">stale</sup></p>`
      + `<p>Gamma${footnoteMarkerHtml("fn-b")} delta</p>`;

    const map = renumberFootnoteMarkers(root);
    expect([...map.entries()]).toEqual([["fn-b", 1], ["fn-a", 2]]);
    const refs = Array.from(root.querySelectorAll<HTMLElement>("sup.footnote-ref"));
    expect(refs.map((el) => el.getAttribute("data-num"))).toEqual(["1", "2", "1"]);
    expect(refs.every((el) => el.getAttribute("contenteditable") === "false")).toBe(true);
    expect(refs.every((el) => el.childNodes.length === 0)).toBe(true);
    expect(commentText(root)).toBe("Alpha betaGamma delta");
  });

  it("encodes and decodes body undo snapshots and restores marker + definition together", () => {
    const undo = new UndoManager<null>();
    const initialHtml = "<p>Hello world</p>";
    const initialSnapshot = encodeBodyUndoValue(initialHtml, [{ docId: "doc-1", footnotes: undefined }]);
    expect(initialSnapshot).toBe(initialHtml);
    undo.sync("body", initialSnapshot);

    const withMarkerHtml = `<p>Hello${footnoteMarkerHtml("fn-1")} world</p>`;
    const defs: FootnoteDef[] = [{ id: "fn-1", html: "<b>Note</b>" }];
    const withFootnoteSnapshot = encodeBodyUndoValue(withMarkerHtml, [{ docId: "doc-1", footnotes: defs }]);

    undo.record("body", "page-1", withFootnoteSnapshot, {
      kind: "other",
      time: 10,
      caretMoved: true,
      before: null,
      after: null
    });

    // Delete marker + definition together.
    undo.record("body", "page-1", initialSnapshot, {
      kind: "delete",
      time: 20,
      caretMoved: false,
      before: null,
      after: null
    });

    const undone = undo.undoField("body");
    expect(undone).not.toBeNull();
    const decodedUndo = decodeBodyUndoValue(undone!.value);
    expect(decodedUndo.html).toBe(withMarkerHtml);
    expect(decodedUndo.footnotes.get("doc-1")).toEqual(defs);

    const redone = undo.redoField("body");
    expect(redone).not.toBeNull();
    const decodedRedo = decodeBodyUndoValue(redone!.value);
    expect(decodedRedo.html).toBe(initialHtml);
    expect(decodedRedo.footnotes.size).toBe(0);
  });
});
