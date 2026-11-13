import type { DocumentData } from "../publish/types";
import type { ScreenplayElement } from "./fountain";
import { elementsToHtml } from "./layout";

const PLACEHOLDER_HEADING = "INT./EXT. LOCATION - DAY";
const PLACEHOLDER_CHARACTER = "CHARACTER";

const SPEAKER_PREFIX = /^([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 .'\-()]{0,40}):\s+(.+)$/;
const LEADING_DASH = /^\s*[—–-]\s+(.+)$/;
const DASH_ATTRIBUTION = /^(.+?[,!?.])\s+[—–-]\s+(.+)$/;
const QUOTED_SPEECH = /"([^"]+)"|“([^”]+)”|„([^“”]+)[“”]|«([^»]+)»/g;

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "\n";
  const inner = Array.from(node.childNodes).map(inlineText).join("");
  switch (node.tagName) {
    case "EM":
    case "I":
      return `*${inner}*`;
    case "STRONG":
    case "B":
      return `**${inner}**`;
    case "U":
      return `_${inner}_`;
    default:
      return inner;
  }
}

const CONTAINER_BLOCKS = new Set(["DIV", "BLOCKQUOTE", "UL", "OL", "SECTION", "ARTICLE"]);
const LEAF_BLOCKS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "PRE"]);

function collectLines(root: Node, lines: string[]) {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      for (const part of (child.textContent ?? "").split("\n")) {
        const trimmed = part.trim();
        if (trimmed) lines.push(trimmed);
      }
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const hasBlockChildren = Array.from(child.children).some(
      (el) => CONTAINER_BLOCKS.has(el.tagName) || LEAF_BLOCKS.has(el.tagName)
    );
    if (CONTAINER_BLOCKS.has(child.tagName) && hasBlockChildren) {
      collectLines(child, lines);
      continue;
    }
    for (const part of inlineText(child).split("\n")) {
      const trimmed = part.trim();
      if (trimmed) lines.push(trimmed);
    }
  }
}

function stripOuterQuotes(text: string): string {
  const trimmed = text.trim();
  const pairs: Array<[string, string]> = [
    ["\"", "\""],
    ["“", "”"],
    ["„", "“"],
    ["„", "”"],
    ["«", "»"]
  ];
  for (const [open, close] of pairs) {
    if (trimmed.length > open.length + close.length && trimmed.startsWith(open) && trimmed.endsWith(close)) {
      return trimmed.slice(open.length, trimmed.length - close.length).trim();
    }
  }
  return trimmed;
}

const SPEAKER_PARTICLES = new Set(["de", "del", "der", "di", "la", "le", "van", "von", "of", "the", "al"]);
const NON_SPEAKER_WORDS = new Set(["http", "https", "mailto", "file", "note", "notes", "time", "date"]);

function isSpeakerName(candidate: string): boolean {
  const withoutExtension = candidate.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!withoutExtension || /[,;?!]/.test(withoutExtension)) return false;
  const words = withoutExtension.split(/\s+/);
  if (words.length > 4) return false;
  if (words.length === 1) {
    return !NON_SPEAKER_WORDS.has(words[0].toLowerCase()) && /^[A-ZÀ-ÖØ-Þ]/.test(words[0]);
  }
  return words.every((word) =>
    /^[A-ZÀ-ÖØ-Þ0-9]/.test(word) || SPEAKER_PARTICLES.has(word.toLowerCase())
  );
}

function convertLine(line: string): ScreenplayElement[] {
  const speakerMatch = SPEAKER_PREFIX.exec(line);
  if (speakerMatch && isSpeakerName(speakerMatch[1])) {
    return [
      { type: "character", text: speakerMatch[1].trim().toUpperCase() },
      { type: "dialogue", text: stripOuterQuotes(speakerMatch[2]) }
    ];
  }

  const dashMatch = LEADING_DASH.exec(line);
  if (dashMatch) {
    const body = dashMatch[1].trim();
    const split = DASH_ATTRIBUTION.exec(body);
    if (split) {
      const result: ScreenplayElement[] = [
        { type: "character", text: PLACEHOLDER_CHARACTER },
        { type: "dialogue", text: split[1].trim() }
      ];
      if (split[2].trim()) result.push({ type: "action", text: split[2].trim() });
      return result;
    }
    return [
      { type: "character", text: PLACEHOLDER_CHARACTER },
      { type: "dialogue", text: body }
    ];
  }

  QUOTED_SPEECH.lastIndex = 0;
  const matches = Array.from(line.matchAll(QUOTED_SPEECH));
  if (matches.length > 0) {
    const elements: ScreenplayElement[] = [];
    let cursor = 0;
    for (const match of matches) {
      const start = match.index ?? 0;
      const before = line.slice(cursor, start).trim();
      if (before) elements.push({ type: "action", text: before });
      const spoken = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim();
      if (spoken) {
        elements.push({ type: "character", text: PLACEHOLDER_CHARACTER });
        elements.push({ type: "dialogue", text: spoken });
      }
      cursor = start + match[0].length;
    }
    const after = line.slice(cursor).trim();
    if (after) elements.push({ type: "action", text: after });
    if (elements.length > 0) return elements;
  }

  return [{ type: "action", text: line }];
}

/**
 * Converts prose editor HTML into screenplay elements, starting with a
 * scene-heading placeholder and preserving every piece of text.
 */
export function proseToScreenplayElements(html: string): ScreenplayElement[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  collectLines(parsed.body, lines);

  const elements: ScreenplayElement[] = [
    { type: "scene-heading", text: PLACEHOLDER_HEADING }
  ];
  for (const line of lines) {
    elements.push(...convertLine(line));
  }
  return elements;
}

/** Converts a prose scene document into a screenplay-formatted document. */
export function convertDocumentToScreenplay(document: DocumentData): DocumentData {
  const elements = proseToScreenplayElements(document.content);
  const { markdownSource: _markdownSource, ...rest } = document;
  return {
    ...rest,
    content: elementsToHtml(elements),
    format: "screenplay"
  };
}
