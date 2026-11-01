import { MAX_DIAGRAM_SOURCE_LENGTH } from "./model";

export type DiagramRenderResult = {
  svg: string;
  width: number;
  height: number;
};

const MAX_WIDTH = 680;
const MAX_HEIGHT = 900;
let counter = 0;

type MermaidApi = {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;

async function mermaidApi(): Promise<MermaidApi> {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = (async () => {
    const module = await import("mermaid");
    const mermaid = (module.default ?? module) as MermaidApi;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
      htmlLabels: false,
      maxTextSize: MAX_DIAGRAM_SOURCE_LENGTH,
      maxEdges: 500,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      flowchart: { htmlLabels: false, useMaxWidth: false },
      class: { htmlLabels: false, useMaxWidth: false },
      state: { useMaxWidth: false },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
      er: { useMaxWidth: false }
    });
    return mermaid;
  })();
  try {
    return await mermaidPromise;
  } catch (error) {
    mermaidPromise = null;
    throw error;
  }
}

function viewBoxSize(value: string | null): { width: number; height: number } | null {
  const parts = (value ?? "").trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const width = parts[2];
  const height = parts[3];
  return width > 0 && height > 0 ? { width, height } : null;
}

function numericLength(value: string | null): number | null {
  const match = /^([\d.]+)(?:px)?$/.exec(value ?? "");
  const number = match ? Number(match[1]) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Renders a Mermaid definition to a standalone SVG sized for the page. HTML
 * labels are disabled in the renderer configuration so the same SVG can be
 * safely rasterized to PNG for PDF, DOCX, and EPUB.
 */
export async function renderDiagramSvg(source: string): Promise<DiagramRenderResult> {
  const definition = source.trim();
  if (!definition) throw new Error("Add a Mermaid definition to render a diagram.");
  if (definition.length > MAX_DIAGRAM_SOURCE_LENGTH) {
    throw new Error("That diagram is too large to render.");
  }

  const mermaid = await mermaidApi();
  const id = `prosecraft-diagram-${++counter}`;
  let svgMarkup: string;
  try {
    svgMarkup = (await mermaid.render(id, definition)).svg;
  } catch (error) {
    const message = error instanceof Error && error.message
      ? `Could not render that diagram: ${error.message.split("\n")[0]}`
      : "Could not render that diagram. Check the Mermaid syntax.";
    throw new Error(message);
  }

  const parsed = new DOMParser().parseFromString(svgMarkup, "text/html");
  const svg = parsed.querySelector("svg");
  if (!svg) throw new Error("Could not render that diagram. Check the Mermaid syntax.");

  const box = viewBoxSize(svg.getAttribute("viewBox"));
  const naturalWidth = numericLength(svg.getAttribute("width")) ?? box?.width ?? MAX_WIDTH;
  const naturalHeight = numericLength(svg.getAttribute("height")) ?? box?.height ?? MAX_HEIGHT;
  const scale = Math.min(1, MAX_WIDTH / naturalWidth, MAX_HEIGHT / naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("role", "img");
  svg.setAttribute("focusable", "false");
  svg.removeAttribute("style");

  return { svg: svg.outerHTML, width, height };
}
