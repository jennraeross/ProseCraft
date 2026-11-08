/**
 * Layout properties of an embedded image: how wide it sits in the text column,
 * where it is aligned, and whether text flows around it. The values persist as
 * `data-` attributes so they survive sanitizing; CSS in the editor and the
 * export style helper read the same vocabulary.
 */
export type ImageLayoutSize = "small" | "medium" | "large" | "full" | "custom";
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
const SIZE_PERCENT: Record<Exclude<ImageLayoutSize, "custom">, number> = {
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
 * CSS declarations for the same layout in exported documents. Sizes are
 * percentages of the text column; wrapped images float and keep a margin to
 * the text that flows around them.
 */
export function imageLayoutStyle(layout: ImageLayout): string {
  const safe = normalizeImageLayout(layout);
  const percent = safe.size === "custom" ? safe.width ?? MAX_IMAGE_WIDTH : SIZE_PERCENT[safe.size];
  const declarations: string[] = [];
  if (safe.wrap === "block") {
    declarations.push(`width: ${percent}%`, "max-width: 100%");
    declarations.push("height: auto");
    if (safe.align === "center") declarations.push("margin-left: auto", "margin-right: auto");
    else if (safe.align === "right") declarations.push("margin-left: auto", "margin-right: 0");
    else declarations.push("margin-left: 0", "margin-right: auto");
  } else {
    const floated = Math.min(percent, MAX_WRAP_PERCENT);
    declarations.push(`width: ${floated}%`, "max-width: 100%");
    declarations.push(
      "height: auto",
      `float: ${safe.wrap === "wrap-left" ? "left" : "right"}`,
      safe.wrap === "wrap-left" ? "margin: 4px 18px 14px 0" : "margin: 4px 0 14px 18px"
    );
  }
  return `${declarations.join("; ")};`;
}
