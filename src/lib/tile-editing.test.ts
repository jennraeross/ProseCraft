import { describe, expect, it } from "vitest";
import type { DocumentData } from "./publish/types";
import { patchTileDocument } from "./tile-editing";

const documents: DocumentData[] = [
  { id: "scene", title: "Scene 1", content: "<p>one</p>", markdownSource: "one" },
  { id: "wiki", title: "Castle", content: "<p>two</p>", space: "Wiki" }
];

describe("patchTileDocument", () => {
  it("renames one document and leaves the others in place", () => {
    const next = patchTileDocument(documents, "scene", { title: "Opening" });
    expect(next[0]).toEqual({ ...documents[0], title: "Opening" });
    expect(next[1]).toBe(documents[1]);
  });

  it("drops the cached markdown source when the body changes", () => {
    const next = patchTileDocument(documents, "scene", { content: "<p>one more</p>" });
    expect(next[0]).toEqual({ id: "scene", title: "Scene 1", content: "<p>one more</p>" });
  });

  it("keeps the markdown source when the body is unchanged", () => {
    const next = patchTileDocument(documents, "scene", { content: "<p>one</p>" });
    expect(next[0]).toBe(documents[0]);
  });

  it("edits wiki pages like any other document", () => {
    const next = patchTileDocument(documents, "wiki", { title: "Castle Keep", content: "<p>three</p>" });
    expect(next[1]).toEqual({ id: "wiki", title: "Castle Keep", content: "<p>three</p>", space: "Wiki" });
  });

  it("returns the same documents for an unknown id", () => {
    const next = patchTileDocument(documents, "missing", { title: "Nope" });
    expect(next).toEqual(documents);
    expect(next[0]).toBe(documents[0]);
  });
});
