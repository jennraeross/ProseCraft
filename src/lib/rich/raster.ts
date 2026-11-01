import { MAX_EMBEDDED_IMAGE_BYTES } from "../sanitize";

const MAX_CANVAS_SIDE = 4096;
const DEFAULT_SCALES = [3, 2, 1.5, 1];

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const base64 = dataUrl.slice(comma + 1);
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Rasterizes trusted SVG produced by MathJax or Mermaid. The SVG is loaded as
 * an image, so scripts, event handlers, and external references cannot execute
 * in the application context.
 */
export async function rasterizeSvg(
  svgMarkup: string,
  width: number,
  height: number,
  options: { scale?: number; color?: string } = {}
): Promise<string> {
  const displayWidth = Math.max(1, Math.round(width));
  const displayHeight = Math.max(1, Math.round(height));

  const parsed = new DOMParser().parseFromString(svgMarkup, "text/html");
  const svg = parsed.querySelector("svg");
  if (!svg) throw new Error("Could not prepare an equation or diagram for export.");

  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(displayWidth));
  svg.setAttribute("height", String(displayHeight));
  svg.removeAttribute("style");

  let source = svg.outerHTML;
  if (options.color) source = source.replace(/currentColor/g, options.color);

  const requested = options.scale ?? 3;
  const scales = [requested, ...DEFAULT_SCALES.filter((value) => value < requested)];
  let lastSize = 0;

  for (const scale of scales) {
    const canvasWidth = Math.min(MAX_CANVAS_SIDE, Math.ceil(displayWidth * scale));
    const canvasHeight = Math.min(MAX_CANVAS_SIDE, Math.ceil(displayHeight * scale));
    const effectiveScale = Math.min(canvasWidth / displayWidth, canvasHeight / displayHeight);

    const image = await loadSvgImage(source);
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare an equation or diagram for export.");
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(image, 0, 0, displayWidth * effectiveScale, displayHeight * effectiveScale);

    const dataUrl = canvas.toDataURL("image/png");
    lastSize = estimateDataUrlBytes(dataUrl);
    if (lastSize <= MAX_EMBEDDED_IMAGE_BYTES) return dataUrl;
  }

  throw new Error(
    `An equation or diagram is too large to export (${Math.round(lastSize / 1024)} KB). `
    + "Try simplifying it."
  );
}

async function loadSvgImage(source: string): Promise<HTMLImageElement> {
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render an equation or diagram for export."));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
