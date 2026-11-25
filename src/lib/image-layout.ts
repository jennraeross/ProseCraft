/**
 * Layout properties of an embedded image: how wide it sits in the text column,
 * where it is aligned, and whether text flows around it. The values persist as
 * `data-` attributes so they survive sanitizing; CSS in the editor and the
 * export style helper read the same vocabulary.
 */
export type ImageLayoutSize = "small" | "medium" | "large" | "full" | "original" | "custom";
export type ImageLayoutAlign = "left" | "center" | "right";
export type ImageLayoutWrap = "block" | "wrap-left" | "wrap-right";

export type ImageLayout = {
  size: ImageLayoutSize;
  width?: number;
  align: ImageLayoutAlign;
  wrap: ImageLayoutWrap;
};

export const DEFAULT_IMAGE_LAYOUT: Readonly<ImageLayout> = {
  size: "large",
  align: "center",
  wrap: "block"
};

export const MIN_IMAGE_WIDTH = 10;
export const MAX_IMAGE_WIDTH = 100;

/** Width in percent of the text column for the named sizes. */
const SIZE_PERCENT: Record<Exclude<ImageLayoutSize, "custom" | "original">, number> = {
  small: 25,
  medium: 50,
  large: 75,
  full: 100
};

/** A floated image may not take more than half the column, or text has no room. */
const MAX_WRAP_PERCENT = 50;

function asSize(value: unknown): ImageLayoutSize | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "small":
    case "medium":
    case "large":
    case "full":
    case "original":
    case "custom":
      return value;
    default:
      return null;
  }
}

function asAlign(value: unknown): ImageLayoutAlign | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "left":
    case "center":
    case "right":
      return value;
    default:
      return null;
  }
}

function asWrap(value: unknown): ImageLayoutWrap | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "block":
    case "wrap-left":
    case "wrap-right":
      return value;
    default:
      return null;
  }
}

/** Rounds a custom width and keeps it inside the range the UI can render. */
export function clampImageWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_IMAGE_WIDTH;
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(width)));
}

function asWidth(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? clampImageWidth(value) : null;
  if (typeof value !== "string" || !/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return null;
  return clampImageWidth(Number(value));
}

/**
 * Validates an untrusted layout (attributes, stored JSON, UI state) and fills
 * in defaults. A custom size without a usable width falls back to the default
 * size; align and wrap are kept when they are valid.
 */
function normalizeImageLayout(input: unknown): ImageLayout {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const align = asAlign(source.align) ?? DEFAULT_IMAGE_LAYOUT.align;
  const wrap = asWrap(source.wrap) ?? DEFAULT_IMAGE_LAYOUT.wrap;
  const size = asSize(source.size) ?? DEFAULT_IMAGE_LAYOUT.size;
  if (size === "custom") {
    const width = asWidth(source.width);
    if (width !== null) return { size, width, align, wrap };
    return { size: DEFAULT_IMAGE_LAYOUT.size, align, wrap };
  }
  return { size, align, wrap };
}

function writeAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function widthAttribute(layout: ImageLayout): string | null {
  if (layout.size !== "custom") return null;
  return String(layout.width ?? MAX_IMAGE_WIDTH);
}

/** Reads the layout of an editor image; unknown values read as the defaults. */
export function readImageLayout(image: HTMLImageElement | Element): ImageLayout {
  return normalizeImageLayout({
    size: image.getAttribute("data-size"),
    width: image.getAttribute("data-width"),
    align: image.getAttribute("data-align"),
    wrap: image.getAttribute("data-wrap")
  });
}

/**
 * Writes the layout to an image as validated `data-` attributes only.
 * Default values are removed so plain images stay free of extra markup.
 */
export function applyImageLayout(image: HTMLImageElement | Element, layout: ImageLayout): void {
  const safe = normalizeImageLayout(layout);
  writeAttribute(image, "data-size", safe.size === DEFAULT_IMAGE_LAYOUT.size ? null : safe.size);
  writeAttribute(image, "data-width", widthAttribute(safe));
  writeAttribute(image, "data-align", safe.align === DEFAULT_IMAGE_LAYOUT.align ? null : safe.align);
  writeAttribute(image, "data-wrap", safe.wrap === DEFAULT_IMAGE_LAYOUT.wrap ? null : safe.wrap);
}

/**
 * Width a layout asks for, as a percentage of the text column, or `null` when
 * the picture keeps its own pixel size. A wrapped picture never takes more than
 * half the column, so text has room beside it.
 */
export function imageWidthPercent(layout: ImageLayout): number | null {
  const safe = normalizeImageLayout(layout);
  if (safe.size === "original") return null;
  const percent = safe.size === "custom" ? safe.width ?? MAX_IMAGE_WIDTH : SIZE_PERCENT[safe.size];
  return safe.wrap === "block" ? percent : Math.min(percent, MAX_WRAP_PERCENT);
}

/**
 * CSS declarations for the same layout in exported documents. Sizes are
 * percentages of the text column; wrapped images float and keep a margin to
 * the text that flows around them. Pass `{ sizing: false }` to keep an image's
 * own pixel size (a `width` attribute) and apply only its alignment and flow.
 */
export function imageLayoutStyle(layout: ImageLayout, options: { sizing?: boolean } = {}): string {
  const safe = normalizeImageLayout(layout);
  const sizing = options.sizing !== false;
  const percent = sizing ? imageWidthPercent(safe) : null;
  const declarations: string[] = [];
  if (safe.wrap === "block") {
    if (sizing) declarations.push(percent === null ? "width: auto" : `width: ${percent}%`);
    // Also cap a picture that keeps its own pixel size, so it never runs past the column.
    declarations.push("max-width: 100%", "height: auto");
    if (safe.align === "center") declarations.push("margin-left: auto", "margin-right: auto");
    else if (safe.align === "right") declarations.push("margin-left: auto", "margin-right: 0");
    else declarations.push("margin-left: 0", "margin-right: auto");
  } else {
    if (sizing) declarations.push(percent === null ? "width: auto" : `width: ${percent}%`);
    declarations.push(!sizing || percent === null ? "max-width: 50%" : "max-width: 100%", "height: auto");
    declarations.push(
      `float: ${safe.wrap === "wrap-left" ? "left" : "right"}`,
      safe.wrap === "wrap-left" ? "margin: 4px 18px 14px 0" : "margin: 4px 0 14px 18px"
    );
  }
  return `${declarations.join("; ")};`;
}

/**
 * Applies the layout as inline CSS to every block image, matching what the
 * editor draws. Exports render sanitized HTML without the editor stylesheet,
 * so the validated layout has to travel with the image itself.
 */
export function applyImageLayoutStyles(html: string): string {
  if (!html.includes("<img")) return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  for (const image of Array.from(parsed.body.querySelectorAll("img"))) {
    if (image.getAttribute("data-inline") === "true") continue;
    // A `width` attribute is an explicit pixel size; keep it and only carry
    // the alignment and text flow, matching the editor's `img:not([width])`.
    const sizing = !image.hasAttribute("width");
    image.setAttribute("style", imageLayoutStyle(readImageLayout(image), { sizing }));
    changed = true;
  }
  return changed ? parsed.body.innerHTML : html;
}

export type ImageBox = {
  /** Rendered size, in points. */
  width: number;
  height: number;
  /** Distance from the left edge of the column, in points. */
  offset: number;
};

/**
 * Places a block picture in a text column, for formats that draw pictures at
 * absolute positions (the PDF). The width is the one the layout asks for,
 * aligned inside the column, never wider than the column and shrunk to fit
 * `maxHeight`. `pixelSize` keeps an explicit size (a `width` attribute) and
 * applies only the alignment, as `applyImageLayoutStyles` does. A wrapped
 * picture is still drawn whole: a printed page has no text flow to wrap around.
 */
export function imageLayoutBox(
  layout: ImageLayout,
  columnWidth: number,
  pictureWidth: number,
  pictureHeight: number,
  options: { pixelSize?: boolean; maxHeight?: number } = {}
): ImageBox {
  const safe = normalizeImageLayout(layout);
  const sourceWidth = Math.max(1, pictureWidth);
  const sourceHeight = Math.max(1, pictureHeight);
  const percent = options.pixelSize ? null : imageWidthPercent(safe);
  const cap = safe.wrap === "block" ? columnWidth : (columnWidth * MAX_WRAP_PERCENT) / 100;
  let width = Math.min(percent === null ? sourceWidth : (columnWidth * percent) / 100, cap);
  let height = (sourceHeight / sourceWidth) * width;
  const maxHeight = options.maxHeight ?? Infinity;
  if (height > maxHeight) {
    width *= maxHeight / height;
    height = maxHeight;
  }
  const free = Math.max(0, columnWidth - width);
  const offset = safe.align === "right" ? free : safe.align === "center" ? free / 2 : 0;
  return { width, height, offset };
}
