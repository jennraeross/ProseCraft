import { describe, expect, it } from "vitest";
import type { DocumentData } from "./publish/types";
import { showCardInEditor } from "./character-card-visibility";
import { PAGE_KINDS } from "./story-meta";

function page(overrides: Partial<DocumentData> = {}): DocumentData {
  return { id: "page-1", title: "Mira Vale", content: "", space: "Wiki", ...overrides };
}

describe("showCardInEditor", () => {
  it("keeps the character card out of the write view", () => {
    expect(showCardInEditor(page())).toBe(false);
  });

  it("keeps the card out of the write view for every page kind", () => {
    for (const kind of PAGE_KINDS) {
      expect(showCardInEditor(page({ meta: { kind } }))).toBe(false);
    }
  });

  it("hides the card without an active document", () => {
    expect(showCardInEditor(undefined)).toBe(false);
    expect(showCardInEditor(null)).toBe(false);
  });
});
