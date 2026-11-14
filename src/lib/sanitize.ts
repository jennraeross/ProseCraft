import { applyImageLayout, readImageLayout } from "./image-layout";
import { normalizedRichPlaceholder, richKindOf } from "./rich/model";

const safeTags = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "DIV", "EM", "H1", "H2", "H3", "HR", "I",
  "IMG", "LI", "OL", "P", "PRE", "S", "STRIKE", "STRONG", "TABLE", "TBODY", "TD", "TH",
  "THEAD", "TR", "U", "UL"
]);

/** Screenplay element types that may mark a paragraph, mirroring the parser. */
const screenplayTypes = new Set([
  "scene-heading", "action", "character", "dialogue", "parenthetical", "transition",
  "centered", "section", "synopsis", "note", "page-break"
]);

const inlineSafeTags = new Set([
  "A", "B", "BR", "CODE", "DEL", "EM", "I", "S", "STRIKE", "STRONG", "U"
]);
export const FOOTNOTE_REF_CLASS = "footnote-ref";
export const FOOTNOTE_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_EMBEDDED_IMAGE_BYTES = 1_500_000;

/** Returns true when `id` is a valid, safe footnote identifier. */
export function isValidFootnoteId(id: string): boolean {
  return FOOTNOTE_ID_RE.test(id);
}

/** Returns true when a data URL is an embedded image within the export limit. */
export function isEmbeddedImageSrc(src: string): boolean {
  const encodedImage = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  return Boolean(
    encodedImage
    && encodedImage[1].length <= Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4
  );
}

function cleanNode(node: Node, inlineOnly = false): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
  if (!(node instanceof HTMLElement)) return null;

  const richKind = richKindOf(node);
  if (richKind) {
    if (inlineOnly && richKind !== "math-inline") return null;
    // Equations and diagrams persist as source only. Any rendered SVG or
    // pasted markup inside the widget is discarded here.
    return normalizedRichPlaceholder(node);
  }

  if (node.tagName === "SUP" && node.classList.contains(FOOTNOTE_REF_CLASS)) {
    if (inlineOnly) return null;
    const id = node.getAttribute("data-footnote-id") ?? "";
    if (!isValidFootnoteId(id)) return null;
    const clean = document.createElement("sup");
    clean.className = FOOTNOTE_REF_CLASS;
    clean.setAttribute("data-footnote-id", id);
    clean.setAttribute("contenteditable", "false");
    return clean;
  }

  if (node.tagName === "DIV" && node.classList.contains("scene-break")) {
    if (inlineOnly) return null;
    // Chapter dividers persist as structural markers with their glyph, so
    // undo restores and tiles render identically to the live editor.
    const clean = document.createElement("div");
    clean.className = ["scene-break"]
      .concat(node.classList.contains("scene-break-line") ? ["scene-break-line"] : [])
      .concat(node.classList.contains("scene-break-blank") ? ["scene-break-blank"] : [])
      .join(" ");
    clean.setAttribute("contenteditable", "false");
    for (const child of Array.from(node.childNodes)) {
      const cleanChild = cleanNode(child, inlineOnly);
      if (cleanChild) clean.append(cleanChild);
    }
    return clean;
  }

  const allowedTags = inlineOnly ? inlineSafeTags : safeTags;
  if (!allowedTags.has(node.tagName)) {
    const fragment = document.createDocumentFragment();
    for (const child of Array.from(node.childNodes)) {
      const cleanChild = cleanNode(child, inlineOnly);
      if (cleanChild) fragment.append(cleanChild);
    }
    return fragment;
  }

  const clean = document.createElement(
    node.tagName === "STRIKE" || node.tagName === "DEL" ? "s" : node.tagName.toLowerCase()
  );
  if (!inlineOnly && node.tagName === "P" && node.classList.contains("eyebrow")) {
    clean.classList.add("eyebrow");
  }
  if (node.tagName === "P") {
    // Screenplay markers survive as validated data attributes; unknown values
    // are dropped, so a paragraph cannot smuggle in arbitrary state.
    const screenplayType = node.getAttribute("data-sp");
    if (screenplayType !== null && screenplayTypes.has(screenplayType)) {
      clean.setAttribute("data-sp", screenplayType);
    }
  }
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href) {
      try {
        const url = new URL(href, window.location.href);
        if (["http:", "https:", "mailto:"].includes(url.protocol)) {
          clean.setAttribute("href", href);
        }
      } catch {
        // Invalid links are kept as plain text.
      }
    }
  }
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (!isEmbeddedImageSrc(src)) return null;
    clean.setAttribute("src", src);
    clean.setAttribute("alt", (node.getAttribute("alt") ?? "").slice(0, 500));
    for (const dimension of ["width", "height"]) {
      const value = Number(node.getAttribute(dimension));
      if (Number.isInteger(value) && value > 0 && value <= 2400) {
        clean.setAttribute(dimension, String(value));
      }
    }
    // Layout survives as validated data attributes; unknown or hostile values
    // read as the defaults and are therefore dropped.
    applyImageLayout(clean, readImageLayout(node));
  }
  for (const child of Array.from(node.childNodes)) {
    const cleanChild = cleanNode(child, inlineOnly);
    if (cleanChild) clean.append(cleanChild);
  }
  return clean;
}

function sanitizeWith(html: string, inlineOnly: boolean): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const container = document.createElement("div");
  for (const child of Array.from(parsed.body.childNodes)) {
    const cleanChild = cleanNode(child, inlineOnly);
    if (cleanChild) container.append(cleanChild);
  }
  return container.innerHTML;
}

/**
 * Sanitizes editor HTML against the same small allowlist used by the writing
 * surface. The result is safe to store, preview, and embed in exported files.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeWith(html, false);
}

/**
 * Sanitizes footnote HTML against an inline-only allowlist (blocking headings,
 * images, tables, scene breaks, and nested footnote markers).
 */
export function sanitizeInlineHtml(html: string): string {
  return sanitizeWith(html, true);
}
