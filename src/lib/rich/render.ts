import { renderMathSvg } from "./math";
import { renderDiagramSvg } from "./mermaid";
import type { RichKind } from "./model";
import { rasterizeSvg } from "./raster";

export type RichRenderMode = "svg" | "png";

export type RichRenderOptions = {
  mode: RichRenderMode;
  /** Ink used when rasterizing equations for print exports. */
  color?: string;
  /** Base body size in points, used to size inline equations. */
  bodySizePt?: number;
};

export type RenderedRich = {
  kind: RichKind;
  source: string;
  alt: string;
  width: number;
  height: number;
  svg?: string;
  dataUrl?: string;
};

const CACHE_LIMIT = 160;
const cache = new Map<string, Promise<RenderedRich>>();

function diagramAlt(source: string): string {
  const line = source
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith("%%") && !entry.startsWith("---"));
  return line ? `Diagram: ${line.slice(0, 160)}` : "Diagram";
}

function cacheKey(kind: RichKind, source: string, options: RichRenderOptions): string {
  const em = Math.round((options.bodySizePt ?? 12) * 4 / 3);
  const color = options.mode === "png" ? options.color ?? "#111111" : "current";
  return `${kind}\u0000${options.mode}\u0000${color}\u0000${em}\u0000${source}`;
}

/**
 * Renders one equation or diagram. Repeated content (for example the same
 * equation in preview and export) is served from a small in-memory cache.
 */
export function renderRich(
  kind: RichKind,
  source: string,
  options: RichRenderOptions
): Promise<RenderedRich> {
  const key = cacheKey(kind, source, options);
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = renderUncached(kind, source, options);
  cache.set(key, promise);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
  return promise;
}

async function renderUncached(
  kind: RichKind,
  source: string,
  options: RichRenderOptions
): Promise<RenderedRich> {
  if (kind === "diagram") {
    const diagram = await renderDiagramSvg(source);
    const alt = diagramAlt(source);
    if (options.mode === "svg") {
      return { kind, source, alt, width: diagram.width, height: diagram.height, svg: diagram.svg };
    }
    const dataUrl = await rasterizeSvg(diagram.svg, diagram.width, diagram.height, {
      scale: 2.5
    });
    return { kind, source, alt, width: diagram.width, height: diagram.height, dataUrl };
  }

  const emPx = Math.min(48, Math.max(10, (options.bodySizePt ?? 12) * 4 / 3));
  const math = await renderMathSvg(source, kind === "math-block", emPx);
  const alt = `Equation: ${source}`;
  if (options.mode === "svg") {
    return { kind, source, alt, width: math.width, height: math.height, svg: math.svg };
  }
  const dataUrl = await rasterizeSvg(math.svg, math.width, math.height, {
    scale: 3,
    color: options.color ?? "#1d211d"
  });
  return { kind, source, alt, width: math.width, height: math.height, dataUrl };
}

/** Test hook; production code should not depend on cache contents. */
export function clearRichRenderCache(): void {
  cache.clear();
}
