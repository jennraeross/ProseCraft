import type { PagePair, RelationInput } from "./relations";
import type { RelationType } from "./story-meta";

/** Which page of a suggested pair stores the relation. */
export type SuggestionDirection = "a-to-b" | "b-to-a";

/** The choices made in the inline form of a suggestion. */
export type SuggestionChoice = {
  type: RelationType;
  label: string;
  direction: SuggestionDirection;
};

/** Initial state of a freshly opened suggestion form. */
export function defaultSuggestionChoice(): SuggestionChoice {
  return { type: "other", label: "", direction: "a-to-b" };
}

/** The page that ends up holding the relation. */
export function suggestionSourceId(pair: PagePair, direction: SuggestionDirection): string {
  return direction === "a-to-b" ? pair.a : pair.b;
}

/** The page the relation points at. */
export function suggestionTargetId(pair: PagePair, direction: SuggestionDirection): string {
  return direction === "a-to-b" ? pair.b : pair.a;
}

/**
 * Builds the arguments for `addRelation` from a suggested pair and the
 * user's choices. A blank label is left out so it does not persist as "".
 */
export function relationFromSuggestion(
  pair: PagePair,
  choice: SuggestionChoice
): { sourceId: string; relation: RelationInput } {
  const label = choice.label.trim();
  return {
    sourceId: suggestionSourceId(pair, choice.direction),
    relation: {
      to: suggestionTargetId(pair, choice.direction),
      type: choice.type,
      ...(label ? { label } : {})
    }
  };
}
