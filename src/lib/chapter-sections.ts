import type { SceneSeparator } from "./publish/types";
import { RICH_SELECTOR } from "./rich/model";

/** Class marking a scene divider block in chapter HTML. */
export const SCENE_BREAK_CLASS = "scene-break";

/** Markdown marker line separating scenes in chapter source. */
export const SCENE_BREAK_MARKER = "<!-- scene-break -->";

const MEDIA_SELECTOR = "img, svg, video, audio, canvas, input";

function escapeGlyph(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Glyph shown inside an editor divider for the publish separator setting. */
export function sceneBreakGlyph(separator: SceneSeparator): string {
  switch (separator) {
    case "hash":
      return "#";
    case "asterisks":
      return "* * *";
    default:
      return "";
  }
}

/** A divider block. Atomic in the editor (never typed into, clicked through). */
export function sceneBreakHtml(separator: SceneSeparator): string {
  const extra = separator === "line"
    ? " scene-break-line"
    : separator === "blank" || separator === "none"
      ? " scene-break-blank"
      : "";
  const inner = separator === "line" ? "" : escapeGlyph(sceneBreakGlyph(separator));
  return `<div class="${SCENE_BREAK_CLASS}${extra}" contenteditable="false">${inner}</div>`;
}

export function isSceneBreakElement(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement
    && node.tagName === "DIV"
    && node.classList.contains(SCENE_BREAK_CLASS);
}

function ensureSectionHtml(html: string): string {
  return html.trim() ? html : "<p><br></p>";
}

/** Joins per-scene HTML into one chapter document with dividers between. */
export function buildChapterHtml(sections: string[], separator: SceneSeparator): string {
  if (sections.length === 0) return "<p><br></p>";
  return sections.map(ensureSectionHtml).join(sceneBreakHtml(separator));
}

function sectionHtml(nodes: Node[], doc: Document): string {
  const container = doc.createElement("div");
  for (const node of nodes) container.append(node.cloneNode(true));
  return container.innerHTML;
}

/**
 * Splits chapter HTML back into per-section HTML at top-level dividers.
 * Nested dividers (from pastes) are dropped; each section keeps its order.
 */
export function splitChapterHtml(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sections: string[] = [];
  let current: Node[] = [];
  for (const child of Array.from(parsed.body.childNodes)) {
    if (isSceneBreakElement(child)) {
      sections.push(sectionHtml(current, parsed));
      current = [];
      continue;
    }
    if (child instanceof HTMLElement) {
      for (const nested of Array.from(child.querySelectorAll(`.${SCENE_BREAK_CLASS}`))) {
        nested.remove();
      }
    }
    current.push(child);
  }
  sections.push(sectionHtml(current, parsed));
  return sections;
}

/** True when a section holds no text, media, or rich widgets. */
export function sectionIsBlank(html: string): boolean {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  if ((parsed.body.textContent ?? "").trim() !== "") return false;
  return parsed.body.querySelector(`${MEDIA_SELECTOR}, ${RICH_SELECTOR}`) === null;
}

const MARKER_PATTERN = /^[ \t]*<!--[ \t]*scene-break[ \t]*-->[ \t]*$/;

/** Splits chapter markdown source into per-section sources at marker lines. */
export function splitChapterMarkdown(source: string): string[] {
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of source.split("\n")) {
    if (MARKER_PATTERN.test(line)) {
      sections.push(current.join("\n").replace(/^\n+|\n+$/g, ""));
      current = [];
      continue;
    }
    current.push(line);
  }
  sections.push(current.join("\n").replace(/^\n+|\n+$/g, ""));
  return sections;
}

/** Joins per-section markdown sources with marker lines. */
export function joinChapterMarkdown(sections: string[]): string {
  return sections.join(`\n\n${SCENE_BREAK_MARKER}\n\n`);
}
