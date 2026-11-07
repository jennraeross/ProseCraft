/** Classes that identify authorable rich content inside ordinary scene HTML. */
export const MATH_INLINE_CLASS = "math-inline";
export const MATH_BLOCK_CLASS = "math-block";
export const DIAGRAM_CLASS = "mermaid-diagram";
export const CALC_CLASS = "calc-worksheet";

/** Source limits keep persisted markup small and bound renderer work. */
export const MAX_MATH_SOURCE_LENGTH = 4_000;
export const MAX_DIAGRAM_SOURCE_LENGTH = 20_000;
export const MAX_CALC_SOURCE_LENGTH = 8_000;

export type RichKind = "math-inline" | "math-block" | "diagram" | "calc";

export type RichPlaceholder = {
  kind: RichKind;
  source: string;
};

export const RICH_SELECTOR = `.${MATH_INLINE_CLASS}, .${MATH_BLOCK_CLASS}, .${DIAGRAM_CLASS}, .${CALC_CLASS}`;

export function richKindOf(element: Element): RichKind | null {
  if (element.classList.contains(MATH_INLINE_CLASS)) return "math-inline";
  if (element.classList.contains(MATH_BLOCK_CLASS)) return "math-block";
  if (element.classList.contains(DIAGRAM_CLASS)) return "diagram";
  if (element.classList.contains(CALC_CLASS)) return "calc";
  return null;
}

export function richSourceAttribute(kind: RichKind): "data-tex" | "data-source" {
  return kind === "diagram" || kind === "calc" ? "data-source" : "data-tex";
}

export function richSourceLimit(kind: RichKind): number {
  if (kind === "diagram") return MAX_DIAGRAM_SOURCE_LENGTH;
  return kind === "calc" ? MAX_CALC_SOURCE_LENGTH : MAX_MATH_SOURCE_LENGTH;
}

export function readRichPlaceholder(element: Element): RichPlaceholder | null {
  const kind = richKindOf(element);
  if (!kind) return null;
  const source = (element.getAttribute(richSourceAttribute(kind)) ?? "").trim();
  if (!source) return null;
  return { kind, source: source.slice(0, richSourceLimit(kind)) };
}

/**
 * Creates a clean source-only placeholder. The editor later injects rendered
 * children into it; sanitizing collapses the node back to this shape.
 */
export function createRichPlaceholder(
  kind: RichKind,
  source: string,
  doc: Document = document
): HTMLElement {
  const element = doc.createElement(kind === "math-inline" ? "span" : "div");
  element.className = kind === "diagram"
    ? DIAGRAM_CLASS
    : kind === "calc"
      ? CALC_CLASS
      : kind === "math-block"
        ? MATH_BLOCK_CLASS
        : MATH_INLINE_CLASS;
  element.setAttribute(richSourceAttribute(kind), source.slice(0, richSourceLimit(kind)));
  return element;
}

/**
 * Sanitizer helper: keeps only the source attributes and drops every rendered
 * child, class, style, event handler, or data attribute that may have been
 * pasted or injected.
 */
export function normalizedRichPlaceholder(
  element: Element,
  doc: Document = document
): HTMLElement | null {
  const placeholder = readRichPlaceholder(element);
  if (!placeholder) return null;
  return createRichPlaceholder(placeholder.kind, placeholder.source, doc);
}

export function richPlaceholders(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(RICH_SELECTOR));
}

/** True when the fragment contains at least one equation, diagram, or calculation. */
export function hasRichPlaceholders(html: string): boolean {
  return new RegExp(`class=["'][^"']*\\b(?:${MATH_INLINE_CLASS}|${MATH_BLOCK_CLASS}|${DIAGRAM_CLASS}|${CALC_CLASS})\\b`).test(html);
}
