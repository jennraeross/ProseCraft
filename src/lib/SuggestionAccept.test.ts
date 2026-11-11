import { describe, expect, it } from "vitest";
import type { PagePair } from "./relations";
import {
  defaultSuggestionChoice,
  relationFromSuggestion,
  suggestionSourceId,
  suggestionTargetId
} from "./suggestion-accept";

const pair: PagePair = { a: "mira", b: "jonas", key: "jonas|mira", count: 3 };

describe("suggestion accept", () => {
  it("starts with no type preference, an empty label and A to B", () => {
    expect(defaultSuggestionChoice()).toEqual({ type: "other", label: "", direction: "a-to-b" });
  });

  it("stores the relation on A and points at B for A to B", () => {
    expect(suggestionSourceId(pair, "a-to-b")).toBe("mira");
    expect(suggestionTargetId(pair, "a-to-b")).toBe("jonas");
  });

  it("swaps source and target for B to A", () => {
    expect(suggestionSourceId(pair, "b-to-a")).toBe("jonas");
    expect(suggestionTargetId(pair, "b-to-a")).toBe("mira");
  });

  it("builds a relation input from the chosen type and direction", () => {
    expect(
      relationFromSuggestion(pair, { type: "rival", label: "", direction: "b-to-a" })
    ).toEqual({
      sourceId: "jonas",
      relation: { to: "mira", type: "rival" }
    });
  });

  it("trims a label and leaves it out when blank", () => {
    expect(
      relationFromSuggestion(pair, { type: "family", label: "  Estranged brother  ", direction: "a-to-b" })
    ).toEqual({
      sourceId: "mira",
      relation: { to: "jonas", type: "family", label: "Estranged brother" }
    });
    expect(
      relationFromSuggestion(pair, { type: "friend", label: "   ", direction: "a-to-b" }).relation
    ).not.toHaveProperty("label");
  });
});
