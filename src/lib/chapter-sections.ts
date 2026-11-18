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

/** Scene ids a divider may carry (`data-scene-id`). */
const SCENE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidSceneId(id: string): boolean {
  return SCENE_ID_PATTERN.test(id);
}

/**
 * A divider block. Atomic in the editor (never typed into, clicked through).
 * With `sceneId`, it names the scene that starts after it, so a chapter save
 * can tell which scene each section belongs to.
 */
export function sceneBreakHtml(separator: SceneSeparator, sceneId?: string): string {
  const extra = separator === "line"
    ? " scene-break-line"
    : separator === "blank" || separator === "none"
      ? " scene-break-blank"
      : "";
  const inner = separator === "line" ? "" : escapeGlyph(sceneBreakGlyph(separator));
  const id = sceneId && isValidSceneId(sceneId) ? ` data-scene-id="${sceneId}"` : "";
  return `<div class="${SCENE_BREAK_CLASS}${extra}"${id} contenteditable="false">${inner}</div>`;
}

export function isSceneBreakElement(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement
    && node.tagName === "DIV"
    && node.classList.contains(SCENE_BREAK_CLASS);
}

function ensureSectionHtml(html: string): string {
  return html.trim() ? html : "<p><br></p>";
}

/**
 * Joins per-scene HTML into one chapter document with dividers between. With
 * `sceneIds` (one per section), each divider names the scene after it.
 */
export function buildChapterHtml(
  sections: string[],
  separator: SceneSeparator,
  sceneIds?: readonly string[]
): string {
  if (sections.length === 0) return "<p><br></p>";
  return sections
    .map((section, index) => (index > 0 ? sceneBreakHtml(separator, sceneIds?.[index]) : "")
      + ensureSectionHtml(section))
    .join("");
}

/**
 * The scene each section of chapter HTML belongs to, from its top-level
 * dividers: "" for the first section and for a divider without an id.
 */
export function chapterSceneIds(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const ids = [""];
  for (const child of Array.from(parsed.body.childNodes)) {
    if (isSceneBreakElement(child)) ids.push(child.getAttribute("data-scene-id") ?? "");
  }
  return ids;
}

/**
 * Which scene each section goes to, by the ids its dividers carry: the first
 * section stays with the first live scene, and each later one goes to the scene
 * its divider names, live or trashed (a merge undone). So deleting a divider
 * joins the scene after it to the one before, and the other scenes keep their
 * text. `null` when the ids can't say (a divider without one, from a paste or
 * an older undo step, an unknown or repeated id): then sections go by position.
 */
export function chapterSectionTargets(
  liveIds: readonly string[],
  trashedIds: readonly string[],
  sceneIds: readonly string[] | undefined,
  sectionCount: number
): string[] | null {
  if (!sceneIds || sceneIds.length !== sectionCount || liveIds.length === 0) return null;
  const known = new Set([...liveIds, ...trashedIds]);
  const targets = [liveIds[0], ...sceneIds.slice(1)];
  if (targets.slice(1).some((id) => !id || !known.has(id))) return null;
  if (new Set(targets).size !== targets.length) return null;
  return targets;
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
