/**
 * Screenplay layout: maps the parsed Fountain element model to document HTML
 * and estimates paper length from the industry-standard 12 pt Courier page.
 */

import type { ScreenplayElement } from "./fountain";

const ELEMENT_TYPES = new Set<string>([
  "scene-heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
  "section",
  "synopsis",
  "note",
  "page-break"
]);

/** True for the `data-sp` values that mark a paragraph as a screenplay element. */
function isElementType(value: string | null): value is ScreenplayElement["type"] {
  return value !== null && ELEMENT_TYPES.has(value);
}

/** Emphasis stays verbatim in `text`; the HTML form uses the matching tags. */
const EMPHASIS = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineToHtml(text: string): string {
  const html: string[] = [];
  let index = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    const start = match.index ?? 0;
    html.push(escapeHtml(text.slice(index, start)));
    const [whole, boldItalic, bold, italic, underline] = match;
    if (boldItalic !== undefined) {
      html.push(`<strong><em>${escapeHtml(boldItalic)}</em></strong>`);
    } else if (bold !== undefined) {
      html.push(`<strong>${escapeHtml(bold)}</strong>`);
    } else if (italic !== undefined) {
      html.push(`<em>${escapeHtml(italic)}</em>`);
    } else {
      html.push(`<u>${escapeHtml(underline)}</u>`);
    }
    index = start + whole.length;
  }
  html.push(escapeHtml(text.slice(index)));
  return html.join("");
}

function inlineFromHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const inner = Array.from(node.childNodes).map(inlineFromHtml).join("");
  switch (node.tagName) {
    case "EM":
    case "I":
      return `*${inner}*`;
    case "STRONG":
    case "B":
      return `**${inner}**`;
    case "U":
      return `_${inner}_`;
    case "BR":
      return "\n";
    default:
      return inner;
  }
}

/** Serializes the element model to plain paragraphs carrying a `data-sp` marker. */
export function elementsToHtml(elements: ScreenplayElement[]): string {
  return elements
    .map((element) => `<p data-sp="${element.type}">${inlineToHtml(element.text)}</p>`)
    .join("");
}

/** Reads editor HTML back into elements; unknown or unmarked paragraphs are action. */
export function htmlToElements(html: string): ScreenplayElement[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return Array.from(parsed.body.children).map((node) => {
    const type = node.getAttribute("data-sp");
    return {
      type: isElementType(type) ? type : "action",
      text: inlineFromHtml(node).trim()
    };
  });
}

/** Industry-standard page: 12 pt Courier, 55 lines, US letter with 1" margins. */
export const SCREENPLAY_PAGE = {
  fontFamily: "Courier",
  fontSize: 12,
  linesPerPage: 55,
  /** Wrapping widths in characters for each column. */
  actionWidth: 60,
  dialogueWidth: 35,
  parentheticalWidth: 25,
  /** Indents in characters from the page edge; action starts at the 1.5" margin. */
  dialogueIndent: 25,
  parentheticalIndent: 31,
  characterIndent: 37,
  /** Transitions sit flush against the right margin. */
  transitionAlign: "right"
} as const;

/** Greedy word wrap at a column width in characters. */
export function wrapScreenplayText(text: string, width: number): string[] {
  const wrapped: string[] = [];
  for (const line of text.split("\n")) {
    const words = line.trim().split(/\s+/).filter((word) => word !== "");
    if (words.length === 0) {
      wrapped.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      if (current === "") current = word;
      else if (current.length + 1 + word.length <= width) current += ` ${word}`;
      else {
        wrapped.push(current);
        current = word;
      }
    }
    wrapped.push(current);
  }
  return wrapped;
}

const PRINTED_TYPES = new Set<ScreenplayElement["type"]>([
  "scene-heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered"
]);

function contentLines(element: ScreenplayElement): string[] {
  switch (element.type) {
    case "action":
    case "scene-heading":
      return wrapScreenplayText(element.text, SCREENPLAY_PAGE.actionWidth);
    case "dialogue":
      return wrapScreenplayText(element.text, SCREENPLAY_PAGE.dialogueWidth);
    case "parenthetical":
      return wrapScreenplayText(element.text, SCREENPLAY_PAGE.parentheticalWidth);
    case "character":
    case "transition":
    case "centered":
      return [element.text];
    default:
      return [];
  }
}

function nextPrinted(elements: ScreenplayElement[], index: number): ScreenplayElement | null {
  for (let next = index + 1; next < elements.length; next++) {
    const element = elements[next];
    if (element.type === "page-break") return null;
    if (PRINTED_TYPES.has(element.type)) return element;
  }
  return null;
}

export type ScenePageEstimate = {
  heading: string;
  startPage: number;
  pages: number;
};

export type PageEstimate = {
  pages: number;
  lines: number;
  byScene: ScenePageEstimate[];
};

/**
 * Counts the lines an element occupies, including the blank line that follows
 * it and the line of the next block that must share its page. Scene headings
 * and character cues are never left alone at the bottom of a page.
 */
function requiredLines(element: ScreenplayElement, content: string[], following: ScreenplayElement | null): number {
  let required = content.length;
  if (element.type === "scene-heading") {
    required += 1;
    if (following !== null) required += following.type === "character" ? 2 : 1;
  } else if (element.type === "character" && following !== null) {
    if (following.type === "dialogue" || following.type === "parenthetical") required += 1;
  }
  return required;
}

/** Estimates paper pages from the Fountain element model. */
export function estimatePages(elements: ScreenplayElement[]): PageEstimate {
  const byScene: ScenePageEstimate[] = [];
  let scene: { heading: string; startPage: number; lastPage: number } | null = null;
  let page = 1;
  let line = 1;
  let lines = 0;
  let lastPage = 1;
  let separated = false;
  let previous: ScreenplayElement | null = null;

  const closeScene = () => {
    if (scene !== null) {
      byScene.push({
        heading: scene.heading,
        startPage: scene.startPage,
        pages: scene.lastPage - scene.startPage + 1
      });
      scene = null;
    }
  };

  const turnPage = () => {
    page += 1;
    line = 1;
  };

  for (let index = 0; index < elements.length; index++) {
    const current = elements[index];

    if (current.type === "page-break") {
      // An explicit break starts a new page and drops the pending blank line.
      turnPage();
      separated = false;
      previous = null;
      continue;
    }
    if (!PRINTED_TYPES.has(current.type)) continue;

    const continuesDialogue =
      (current.type === "dialogue" || current.type === "parenthetical") &&
      previous !== null &&
      (previous.type === "character" || previous.type === "dialogue" || previous.type === "parenthetical");

    if (!continuesDialogue && separated && line > 1) {
      lines += 1;
      line += 1;
      if (line > SCREENPLAY_PAGE.linesPerPage) turnPage();
    }

    const content = contentLines(current);
    const following = nextPrinted(elements, index);
    const required = requiredLines(current, content, following);
    if (
      (current.type === "scene-heading" || current.type === "character") &&
      line + required - 1 > SCREENPLAY_PAGE.linesPerPage
    ) {
      turnPage();
    }

    const startPage = page;
    for (let written = 0; written < content.length; written++) {
      if (line > SCREENPLAY_PAGE.linesPerPage) turnPage();
      lines += 1;
      lastPage = page;
      line += 1;
    }

    if (current.type === "scene-heading") {
      closeScene();
      scene = { heading: current.text, startPage, lastPage };
    } else if (scene !== null) {
      scene.lastPage = lastPage;
    }

    separated = true;
    previous = current;
  }

  closeScene();
  return {
    pages: lines === 0 ? 0 : lastPage,
    lines,
    byScene
  };
}

/** One page of screenplay runs about one minute on screen. */
export function estimateRuntime(pages: number): number {
  if (!Number.isFinite(pages) || pages <= 0) return 0;
  return Math.round(pages);
}

export type ScreenplayCharacterStats = {
  name: string;
  /** Dialogue elements, excluding parentheticals. */
  lines: number;
  words: number;
};

export type SceneSetting = "INT" | "EXT" | "INT/EXT" | "OTHER";

export type ScreenplayLocationStats = {
  heading: string;
  setting: SceneSetting;
  place: string;
  timeOfDay: string;
};

export type ScreenplayTextStats = {
  lines: number;
  words: number;
};

export type ScreenplayStats = {
  scenes: number;
  /** Characters in order of first appearance. */
  characters: ScreenplayCharacterStats[];
  locations: ScreenplayLocationStats[];
  action: ScreenplayTextStats;
  dialogue: ScreenplayTextStats;
  /** Spoken words as a share of all action and dialogue words. */
  dialogueRatio: number;
};

const SCENE_SETTING = /^(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*/i;
const TIME_SEPARATOR = /\s+[-–—]\s+/;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** "MARA (V.O.)" and "Mara" name the same character. */
function characterName(cue: string): string {
  const trimmed = cue.trim();
  let name = trimmed;
  while (/\([^)]*\)\s*$/.test(name)) name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return (name === "" ? trimmed : name).toUpperCase();
}

function settingOf(prefix: string): SceneSetting {
  const letters = prefix.replace(/[^A-Z]/gi, "").toUpperCase();
  if (letters === "EST") return "EXT";
  const mixed = letters === "IE" || (letters.includes("INT") && letters.includes("EXT"));
  if (mixed) return "INT/EXT";
  if (letters.includes("INT")) return "INT";
  if (letters.includes("EXT")) return "EXT";
  return "OTHER";
}

/** Splits "INT. LIGHTHOUSE - NIGHT" into setting, place, and time of day. */
function readLocation(heading: string): Omit<ScreenplayLocationStats, "heading"> {
  const match = SCENE_SETTING.exec(heading);
  const rest = (match === null ? heading : heading.slice(match[0].length)).trim();
  const parts = rest.split(TIME_SEPARATOR);
  const timeOfDay = parts.length > 1 ? parts[parts.length - 1].trim() : "";
  const place = (parts.length > 1 ? parts.slice(0, -1).join(" - ") : rest).trim();
  return {
    setting: match === null ? "OTHER" : settingOf(match[1]),
    place,
    timeOfDay
  };
}

export function screenplayStats(elements: ScreenplayElement[]): ScreenplayStats {
  const characters = new Map<string, ScreenplayCharacterStats>();
  const locations: ScreenplayLocationStats[] = [];
  const action: ScreenplayTextStats = { lines: 0, words: 0 };
  const dialogue: ScreenplayTextStats = { lines: 0, words: 0 };
  let scenes = 0;
  let speaker: string | null = null;

  for (const element of elements) {
    switch (element.type) {
      case "scene-heading":
        scenes += 1;
        locations.push({ heading: element.text, ...readLocation(element.text) });
        speaker = null;
        break;
      case "character":
        speaker = characterName(element.text);
        if (!characters.has(speaker)) {
          characters.set(speaker, { name: speaker, lines: 0, words: 0 });
        }
        break;
      case "dialogue": {
        const words = countWords(element.text);
        dialogue.lines += 1;
        dialogue.words += words;
        const character = speaker === null ? undefined : characters.get(speaker);
        if (character !== undefined) {
          character.lines += 1;
          character.words += words;
        }
        break;
      }
      case "action":
        action.lines += 1;
        action.words += countWords(element.text);
        speaker = null;
        break;
      case "transition":
      case "centered":
      case "page-break":
        speaker = null;
        break;
      default:
        break;
    }
  }

  const spoken = action.words + dialogue.words;
  return {
    scenes,
    characters: Array.from(characters.values()),
    locations,
    action,
    dialogue,
    dialogueRatio: spoken === 0 ? 0 : dialogue.words / spoken
  };
}
