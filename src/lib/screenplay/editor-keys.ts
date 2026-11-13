/**
 * Pure keyboard rules for the screenplay editor: the element-type cycle,
 * detection for freshly typed lines, and the upper-casing rules.
 *
 * Nothing in here touches the DOM so the behaviour stays testable.
 */

/** Element types an editor paragraph can carry. */
export type EditorElementType =
  | "scene-heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition";

export const EDITOR_ELEMENT_TYPES: readonly EditorElementType[] = [
  "scene-heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition"
];

export type EditorKey = "Tab" | "Enter" | "ShiftTab";

export type EditorKeyContext = {
  /** The current paragraph holds no text yet. */
  empty: boolean;
};

const SCENE_HEADING = /^(?:INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)(?:\s|$)/i;
const TRANSITION = /TO:$/;

function isAllCaps(line: string): boolean {
  const name = line.replace(/\s*\([^)]*\)$/, "").trim();
  return /[A-Z]/.test(name) && !/[a-z]/.test(name);
}

/**
 * The type the next paragraph should get after pressing a key.
 *
 * Enter starts the block that usually follows the current element; Tab walks
 * the character, transition, and parenthetical column cycle, and Shift+Tab
 * reverses it.
 */
export function nextElementType(
  current: EditorElementType,
  key: EditorKey,
  context: EditorKeyContext = { empty: false }
): EditorElementType {
  if (key === "Enter") {
    switch (current) {
      case "scene-heading":
        return "action";
      case "character":
        return context.empty ? "action" : "dialogue";
      case "dialogue":
        return "character";
      case "parenthetical":
        return "dialogue";
      case "transition":
        return "scene-heading";
      default:
        return "action";
    }
  }

  if (key === "Tab") {
    switch (current) {
      case "action":
        return context.empty ? "character" : "action";
      case "character":
        return "transition";
      case "dialogue":
        return "parenthetical";
      default:
        return current;
    }
  }

  switch (current) {
    case "character":
      return "action";
    case "transition":
      return "character";
    case "parenthetical":
      return "dialogue";
    default:
      return current;
  }
}

/**
 * Guesses the element type from a typed line, or null when the text gives no
 * hint and the paragraph should keep its current type.
 */
export function autoDetectType(text: string): EditorElementType | null {
  const line = text.trim();
  if (line === "") return null;
  if (isAllCaps(line) && TRANSITION.test(line)) return "transition";
  if (SCENE_HEADING.test(line)) return "scene-heading";
  if (isAllCaps(line)) return "character";
  return null;
}

/** Scene headings, character cues, and transitions are always upper-case. */
export function autoCase(type: EditorElementType, text: string): string {
  return type === "scene-heading" || type === "character" || type === "transition"
    ? text.toUpperCase()
    : text;
}
