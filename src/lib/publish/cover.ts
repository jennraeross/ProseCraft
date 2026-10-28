import { isEmbeddedImageSrc, MAX_EMBEDDED_IMAGE_BYTES } from "../sanitize";
import { resolveStyleTokens } from "./presets";
import type {
  CompiledBook,
  CompiledCover,
  CoverDesign,
  CoverPalette,
  CoverOptions,
  PublishOptions
} from "./types";

export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 2400;
export const COVER_ACCEPT = "image/png,image/jpeg,image/webp";
export const MAX_COVER_FILE_BYTES = 15_000_000;
const MAX_COVER_PIXELS = 50_000_000;
const COVER_SANS_FONT = 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export type CoverDesignOption = {
  id: CoverDesign;
  label: string;
  detail: string;
};

export type CoverPaletteOption = {
  id: CoverPalette;
  label: string;
  background: string;
  ink: string;
  accent: string;
  muted: string;
};

export const COVER_DESIGNS: CoverDesignOption[] = [
  { id: "classic", label: "Classic", detail: "Centered serif and fine rules" },
  { id: "modern", label: "Modern", detail: "Bold sans title with an accent bar" },
  { id: "minimal", label: "Minimal", detail: "Quiet type inside a hairline frame" },
  { id: "bold", label: "Bold", detail: "Oversized type and a color block" }
];

export const COVER_PALETTES: CoverPaletteOption[] = [
  {
    id: "ink",
    label: "Ink",
    background: "#141813",
    ink: "#f1eadb",
    accent: "#c1a46b",
    muted: "#b8b1a3"
  },
  {
    id: "sage",
    label: "Sage",
    background: "#dde4d6",
    ink: "#23352a",
    accent: "#6f8a6b",
    muted: "#5c6b5b"
  },
  {
    id: "clay",
    label: "Clay",
    background: "#a84e38",
    ink: "#fff1e3",
    accent: "#f0c19d",
    muted: "#f2d7c4"
  },
  {
    id: "ocean",
    label: "Ocean",
    background: "#173545",
    ink: "#eef6f5",
    accent: "#79c2c6",
    muted: "#a8c3c7"
  },
  {
    id: "plum",
    label: "Plum",
    background: "#3b203a",
    ink: "#f7e9ef",
    accent: "#d89bb3",
    muted: "#c9afbd"
  }
];

type FittedText = {
  size: number;
  lines: string[];
  lineHeight: number;
};

const generatedCoverCache = new Map<string, Promise<CompiledCover>>();

export function paletteFor(id: CoverPalette): CoverPaletteOption {
  return COVER_PALETTES.find((palette) => palette.id === id) ?? COVER_PALETTES[0];
}

export function designFor(id: CoverDesign): CoverDesignOption {
  return COVER_DESIGNS.find((design) => design.id === id) ?? COVER_DESIGNS[0];
}

function isSupportedCoverFile(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ["image/png", "image/jpeg", "image/webp"].includes(file.type)
    || (
      (!file.type || file.type === "application/octet-stream" || file.type === "image/jpg")
      && ["png", "jpg", "jpeg", "webp"].includes(extension)
    );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode that image."));
    image.src = src;
  });
}

function mediaTypeFromDataUrl(src: string): CompiledCover["mediaType"] {
  const match = /^data:(image\/png|image\/jpeg|image\/webp);base64,/.exec(src);
  return (match?.[1] as CompiledCover["mediaType"] | undefined) ?? "image/png";
}

function encodedImageFits(dataUrl: string): boolean {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  return base64.length <= Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4;
}

function drawCoverCrop(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement
): void {
  const targetRatio = COVER_WIDTH / COVER_HEIGHT;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    COVER_WIDTH,
    COVER_HEIGHT
  );
}

function encodeCoverCanvas(canvas: HTMLCanvasElement): string {
  for (const quality of [0.86, 0.74, 0.62]) {
    const dataUrl = canvas.toDataURL("image/webp", quality);
    if (dataUrl.startsWith("data:image/webp;base64,") && encodedImageFits(dataUrl)) {
      return dataUrl;
    }
  }
  for (const quality of [0.9, 0.8, 0.7]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.startsWith("data:image/jpeg;base64,") && encodedImageFits(dataUrl)) {
      return dataUrl;
    }
  }
  const dataUrl = canvas.toDataURL("image/png");
  if (encodedImageFits(dataUrl)) return dataUrl;
  throw new Error("That cover image is too large after compression. Try a smaller image.");
}

/**
 * Decodes, centre-crops, and compresses an uploaded cover to the standard 2:3
 * cover shape. Keeping the result as a data URL matches how scene images are
 * stored and keeps project bundles self-contained.
 */
export async function imageFileToCoverDataUrl(file: File): Promise<string> {
  if (!isSupportedCoverFile(file)) throw new Error("Use a PNG, JPG, or WebP image.");
  if (file.size > MAX_COVER_FILE_BYTES) throw new Error("Cover images must be 15 MB or smaller.");

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.type === "image/jpg"
    ? "image/jpeg"
    : file.type || (extension === "webp" ? "image/webp" : extension === "png" ? "image/png" : "image/jpeg");
  const source = !file.type || file.type === "application/octet-stream"
    ? new Blob([file], { type: mimeType })
    : file;
  const imageUrl = URL.createObjectURL(source);

  try {
    const image = await loadImage(imageUrl);
    if (image.naturalWidth * image.naturalHeight > MAX_COVER_PIXELS) {
      throw new Error("That image has too many pixels to use as a cover.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = COVER_WIDTH;
    canvas.height = COVER_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare that cover image.");
    drawCoverCrop(context, image);
    return encodeCoverCanvas(canvas);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function averageImageColor(image: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return "#ffffff";
  context.drawImage(image, 0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export async function resolveCoverImage(
  book: CompiledBook,
  options: PublishOptions
): Promise<CompiledCover | null> {
  const cover = options.cover;
  if (cover.mode === "none") return null;

  if (cover.mode === "image") {
    if (!isEmbeddedImageSrc(cover.image)) return null;
    const image = await loadImage(cover.image);
    return {
      dataUrl: cover.image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      mediaType: mediaTypeFromDataUrl(cover.image),
      background: averageImageColor(image)
    };
  }

  const tokens = resolveStyleTokens(options.style, options.customStyles);
  const key = generatedCoverKey(book, cover, tokens.cssFontFamily);
  const cached = generatedCoverCache.get(key);
  if (cached) return cached;

  const promise = renderGeneratedCover(book, cover, tokens.cssFontFamily).catch((error) => {
    generatedCoverCache.delete(key);
    throw error;
  });
  generatedCoverCache.set(key, promise);
  while (generatedCoverCache.size > 12) {
    const oldest = generatedCoverCache.keys().next().value;
    if (oldest === undefined) break;
    generatedCoverCache.delete(oldest);
  }
  return promise;
}

function generatedCoverKey(
  book: CompiledBook,
  cover: CoverOptions,
  fontFamily: string
): string {
  return JSON.stringify([
    book.title,
    book.subtitle,
    book.author,
    cover.design,
    cover.palette,
    fontFamily
  ]);
}

async function renderGeneratedCover(
  book: CompiledBook,
  cover: CoverOptions,
  styleFontFamily: string
): Promise<CompiledCover> {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement("canvas");
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the generated cover.");

  const palette = paletteFor(cover.palette);
  const fontFamily = cover.design === "modern" || cover.design === "bold"
    ? COVER_SANS_FONT
    : styleFontFamily;

  context.textBaseline = "middle";
  switch (cover.design) {
    case "modern":
      drawModernCover(context, book, palette, fontFamily);
      break;
    case "minimal":
      drawMinimalCover(context, book, palette, fontFamily);
      break;
    case "bold":
      drawBoldCover(context, book, palette, fontFamily);
      break;
    default:
      drawClassicCover(context, book, palette, fontFamily);
      break;
  }

  const dataUrl = encodeGeneratedCover(canvas);
  return {
    dataUrl,
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    mediaType: mediaTypeFromDataUrl(dataUrl),
    background: palette.background
  };
}

function encodeGeneratedCover(canvas: HTMLCanvasElement): string {
  const png = canvas.toDataURL("image/png");
  if (encodedImageFits(png)) return png;
  const webp = canvas.toDataURL("image/webp", 0.92);
  if (webp.startsWith("data:image/webp;base64,") && encodedImageFits(webp)) return webp;
  return png;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function shade(hex: string, amount: number): string {
  const [red, green, blue] = hexToRgb(hex);
  const target = amount < 0 ? 0 : 255;
  const mix = Math.abs(amount);
  return `#${[red, green, blue].map((channel) => {
    const next = Math.round(channel + (target - channel) * mix);
    return Math.min(255, Math.max(0, next)).toString(16).padStart(2, "0");
  }).join("")}`;
}

function withAlpha(hex: string, alpha: number): string {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function setCanvasFont(
  context: CanvasRenderingContext2D,
  size: number,
  family: string,
  weight: number | string = 400,
  style = "normal"
): void {
  context.font = `${style} ${weight} ${Math.round(size)}px ${family}`;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number | string,
  style: string,
  maxWidth: number,
  maxHeight: number,
  maxSize: number,
  minSize: number,
  maxLines: number,
  lineRatio: number
): FittedText {
  if (!text.trim()) return { size: maxSize, lines: [], lineHeight: 0 };

  for (let size = maxSize; size >= minSize; size -= 4) {
    setCanvasFont(context, size, family, weight, style);
    const lines = wrapText(context, text, maxWidth);
    const lineHeight = size * lineRatio;
    const widestLine = lines.reduce(
      (widest, line) => Math.max(widest, context.measureText(line).width),
      0
    );
    if (
      widestLine <= maxWidth + 0.5
      && lines.length <= maxLines
      && lines.length * lineHeight <= maxHeight
    ) {
      return { size, lines, lineHeight };
    }
  }

  setCanvasFont(context, minSize, family, weight, style);
  return {
    size: minSize,
    lines: wrapText(context, text, maxWidth).slice(0, maxLines),
    lineHeight: minSize * lineRatio
  };
}

function drawFittedText(
  context: CanvasRenderingContext2D,
  fitted: FittedText,
  x: number,
  centerY: number,
  align: CanvasTextAlign,
  color: string
): number {
  if (fitted.lines.length === 0) return 0;
  context.fillStyle = color;
  context.textAlign = align;
  const blockHeight = fitted.lines.length * fitted.lineHeight;
  const firstLine = centerY - blockHeight / 2 + fitted.lineHeight / 2;
  fitted.lines.forEach((line, index) => {
    context.fillText(line, x, firstLine + index * fitted.lineHeight);
  });
  return blockHeight;
}

function drawSpacedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  family: string,
  weight: number | string,
  size: number,
  spacing: number,
  color: string,
  align: "left" | "center",
  maxWidth = 1200
): void {
  setCanvasFont(context, size, family, weight);
  const characters = Array.from(text);
  let widths = characters.map((character) => context.measureText(character).width);
  let total = widths.reduce((sum, width) => sum + width, 0)
    + spacing * Math.max(0, characters.length - 1);
  if (total > maxWidth) {
    const scale = maxWidth / total;
    size = Math.max(12, size * scale);
    spacing *= scale;
    setCanvasFont(context, size, family, weight);
    widths = characters.map((character) => context.measureText(character).width);
    total = widths.reduce((sum, width) => sum + width, 0)
      + spacing * Math.max(0, characters.length - 1);
  }
  let cursor = align === "center" ? x - total / 2 : x;
  context.fillStyle = color;
  context.textAlign = "left";
  characters.forEach((character, index) => {
    context.fillText(character, cursor, y);
    cursor += widths[index] + spacing;
  });
}

function drawLine(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 2
): void {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function drawBackground(
  context: CanvasRenderingContext2D,
  palette: CoverPaletteOption
): void {
  const gradient = context.createLinearGradient(0, 0, 0, COVER_HEIGHT);
  gradient.addColorStop(0, palette.background);
  gradient.addColorStop(1, shade(palette.background, -0.16));
  context.fillStyle = gradient;
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);
}

function drawClassicCover(
  context: CanvasRenderingContext2D,
  book: CompiledBook,
  palette: CoverPaletteOption,
  family: string
): void {
  drawBackground(context, palette);

  context.strokeStyle = withAlpha(palette.accent, 0.55);
  context.lineWidth = 2;
  context.strokeRect(92, 92, COVER_WIDTH - 184, COVER_HEIGHT - 184);
  drawLine(context, 650, 272, 950, 272, withAlpha(palette.accent, 0.8), 3);
  context.fillStyle = palette.accent;
  context.beginPath();
  context.arc(800, 272, 7, 0, Math.PI * 2);
  context.fill();

  const title = fitText(
    context,
    book.title,
    family,
    400,
    "normal",
    1120,
    760,
    172,
    80,
    5,
    1.1
  );
  const subtitle = book.subtitle
    ? fitText(context, book.subtitle, family, 400, "italic", 980, 190, 52, 28, 3, 1.3)
    : null;
  const gap = subtitle ? 62 : 0;
  const total = title.lines.length * title.lineHeight
    + gap
    + (subtitle ? subtitle.lines.length * subtitle.lineHeight : 0);
  const groupCenter = 1080;
  const titleCenter = groupCenter - total / 2 + (title.lines.length * title.lineHeight) / 2;
  drawFittedText(context, title, 800, titleCenter, "center", palette.ink);

  if (subtitle) {
    const subtitleCenter = groupCenter
      + total / 2
      - (subtitle.lines.length * subtitle.lineHeight) / 2;
    drawFittedText(context, subtitle, 800, subtitleCenter, "center", palette.muted);
  }

  if (book.author) {
    drawSpacedText(
      context,
      book.author.toUpperCase(),
      800,
      2070,
      family,
      500,
      34,
      7,
      palette.accent,
      "center"
    );
  }
  drawLine(context, 700, 2150, 900, 2150, withAlpha(palette.accent, 0.5), 2);
}

function drawModernCover(
  context: CanvasRenderingContext2D,
  book: CompiledBook,
  palette: CoverPaletteOption,
  family: string
): void {
  drawBackground(context, palette);

  context.fillStyle = palette.accent;
  context.fillRect(118, 320, 18, 620);
  context.fillStyle = withAlpha(palette.accent, 0.24);
  context.fillRect(118, 1110, 1364, 4);

  const title = fitText(
    context,
    book.title.toUpperCase(),
    family,
    800,
    "normal",
    1230,
    700,
    188,
    90,
    5,
    1.04
  );
  const titleCenter = 790;
  drawFittedText(context, title, 176, titleCenter, "left", palette.ink);

  if (book.subtitle) {
    const subtitle = fitText(
      context,
      book.subtitle,
      family,
      400,
      "normal",
      1080,
      180,
      50,
      26,
      3,
      1.3
    );
    const top = titleCenter + (title.lines.length * title.lineHeight) / 2 + 64;
    drawFittedText(
      context,
      subtitle,
      176,
      top + (subtitle.lines.length * subtitle.lineHeight) / 2,
      "left",
      palette.muted
    );
  }

  if (book.author) {
    drawSpacedText(
      context,
      book.author.toUpperCase(),
      176,
      2090,
      family,
      600,
      34,
      6,
      palette.accent,
      "left"
    );
    drawLine(context, 176, 2150, 660, 2150, withAlpha(palette.accent, 0.65), 3);
  }
}

function drawMinimalCover(
  context: CanvasRenderingContext2D,
  book: CompiledBook,
  palette: CoverPaletteOption,
  family: string
): void {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  context.strokeStyle = withAlpha(palette.ink, 0.22);
  context.lineWidth = 2;
  context.strokeRect(100, 100, COVER_WIDTH - 200, COVER_HEIGHT - 200);
  context.fillStyle = palette.accent;
  context.fillRect(770, 250, 60, 6);

  const title = fitText(
    context,
    book.title,
    family,
    400,
    "normal",
    1040,
    680,
    128,
    64,
    5,
    1.12
  );
  const subtitle = book.subtitle
    ? fitText(context, book.subtitle, family, 400, "italic", 960, 180, 46, 26, 3, 1.35)
    : null;
  const gap = subtitle ? 54 : 0;
  const total = title.lines.length * title.lineHeight
    + gap
    + (subtitle ? subtitle.lines.length * subtitle.lineHeight : 0);
  const groupCenter = 1080;
  const titleCenter = groupCenter - total / 2 + (title.lines.length * title.lineHeight) / 2;
  drawFittedText(context, title, 800, titleCenter, "center", palette.ink);

  if (subtitle) {
    const subtitleCenter = groupCenter
      + total / 2
      - (subtitle.lines.length * subtitle.lineHeight) / 2;
    drawFittedText(context, subtitle, 800, subtitleCenter, "center", palette.muted);
  }

  if (book.author) {
    drawSpacedText(
      context,
      book.author.toUpperCase(),
      800,
      2070,
      family,
      500,
      28,
      10,
      palette.accent,
      "center"
    );
  }
  drawLine(context, 760, 2140, 840, 2140, withAlpha(palette.accent, 0.7), 2);
}

function drawBoldCover(
  context: CanvasRenderingContext2D,
  book: CompiledBook,
  palette: CoverPaletteOption,
  family: string
): void {
  drawBackground(context, palette);

  context.fillStyle = withAlpha(palette.accent, 0.16);
  context.beginPath();
  context.arc(1360, 480, 520, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = palette.accent;
  context.fillRect(0, 0, COVER_WIDTH, 18);

  const title = fitText(
    context,
    book.title.toUpperCase(),
    family,
    800,
    "normal",
    1270,
    800,
    210,
    94,
    5,
    1.02
  );
  const titleCenter = 900;
  drawFittedText(context, title, 140, titleCenter, "left", palette.ink);

  if (book.subtitle) {
    const subtitle = fitText(
      context,
      book.subtitle,
      family,
      400,
      "normal",
      1080,
      180,
      50,
      26,
      3,
      1.3
    );
    const top = titleCenter + (title.lines.length * title.lineHeight) / 2 + 60;
    drawFittedText(
      context,
      subtitle,
      140,
      top + (subtitle.lines.length * subtitle.lineHeight) / 2,
      "left",
      palette.muted
    );
  }

  if (book.author) {
    context.fillStyle = palette.accent;
    context.fillRect(0, 2030, COVER_WIDTH, 370);
    drawSpacedText(
      context,
      book.author.toUpperCase(),
      140,
      2195,
      family,
      700,
      40,
      8,
      palette.background,
      "left"
    );
  } else {
    context.fillStyle = palette.accent;
    context.fillRect(140, 2140, 420, 8);
  }
}
