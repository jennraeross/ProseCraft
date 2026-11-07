import {
  CALC_CLASS,
  DIAGRAM_CLASS,
  MATH_BLOCK_CLASS,
  readRichPlaceholder,
  richPlaceholders
} from "./model";
import { renderRich, type RichRenderOptions, type RenderedRich } from "./render";

export function applyRichRender(element: HTMLElement, rendered: RenderedRich): void {
  element.replaceChildren();
  element.classList.add("rich-rendered");
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", rendered.alt);
  // This marker lets the editor avoid repeatedly re-rendering unchanged source.
  element.setAttribute("data-rendered-source", rendered.source);
  if (rendered.svg) {
    element.innerHTML = rendered.svg;
    return;
  }
  if (!rendered.dataUrl) return;
  const image = element.ownerDocument.createElement("img");
  image.src = rendered.dataUrl;
  image.alt = rendered.alt;
  image.setAttribute("width", String(Math.max(1, Math.round(rendered.width))));
  image.setAttribute("height", String(Math.max(1, Math.round(rendered.height))));
  if (rendered.kind === "math-inline") image.setAttribute("data-inline", "true");
  element.append(image);
}

export function showRichFallback(element: HTMLElement, source: string, message: string): void {
  element.replaceChildren();
  element.classList.add("rich-render-error");
  element.setAttribute("title", message);
  element.textContent = source;
}

/** Renders the placeholders under a root in order, sharing one renderer cache. */
export async function renderRichWidgets(
  root: ParentNode,
  options: RichRenderOptions
): Promise<void> {
  for (const element of richPlaceholders(root)) {
    const placeholder = readRichPlaceholder(element);
    if (!placeholder) continue;
    element.setAttribute("contenteditable", "false");
    if (element.getAttribute("data-rendered-source") === placeholder.source
      && element.childElementCount > 0) {
      continue;
    }

    try {
      const rendered = await renderRich(placeholder.kind, placeholder.source, options);
      // The document or source may have changed while the renderer worked.
      if (!(root as Node).contains(element)
        || readRichPlaceholder(element)?.source !== placeholder.source) {
        continue;
      }
      applyRichRender(element, rendered);
    } catch (error) {
      if (!(root as Node).contains(element)
        || readRichPlaceholder(element)?.source !== placeholder.source) {
        continue;
      }
      showRichFallback(
        element,
        placeholder.source,
        error instanceof Error ? error.message : "Could not render this content."
      );
    }
  }
}

const BLOCK_RICH_SELECTOR = `.${MATH_BLOCK_CLASS}, .${DIAGRAM_CLASS}, .${CALC_CLASS}`;

function isBlockRich(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.matches(BLOCK_RICH_SELECTOR);
}

function significantSibling(node: Node, direction: "next" | "previous"): Node | null {
  let sibling = direction === "next" ? node.nextSibling : node.previousSibling;
  while (sibling && sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim()) {
    sibling = direction === "next" ? sibling.nextSibling : sibling.previousSibling;
  }
  return sibling;
}

function emptyParagraph(doc: Document): HTMLParagraphElement {
  const paragraph = doc.createElement("p");
  paragraph.append(doc.createElement("br"));
  return paragraph;
}

/**
 * Block equations, diagrams, and calculations can't hold the caret, so a
 * block at the very start or end of the document, or directly against another
 * block widget, would leave no place to click and type. An empty paragraph is
 * added in each such gap. Returns true when the DOM changed.
 */
export function ensureParagraphsAroundRichBlocks(root: HTMLElement): boolean {
  let changed = false;
  for (const block of Array.from(root.querySelectorAll<HTMLElement>(BLOCK_RICH_SELECTOR))) {
    const next = significantSibling(block, "next");
    if (!next || isBlockRich(next)) {
      block.after(emptyParagraph(root.ownerDocument));
      changed = true;
    }
    if (!significantSibling(block, "previous")) {
      block.before(emptyParagraph(root.ownerDocument));
      changed = true;
    }
  }
  return changed;
}

/**
 * Where a click on a widget lands. Block widgets span the full line but their
 * rendering is usually narrower, so a click in the empty space beside or
 * below it means "put the caret next to this", not "edit this".
 */
export function richClickSide(element: HTMLElement, x: number, y: number): "content" | "before" | "after" {
  if (!isBlockRich(element)) return "content";
  const graphic = element.querySelector("svg, img");
  if (!graphic) return "content";
  const box = graphic.getBoundingClientRect();
  const slop = 4;
  if (x >= box.left - slop && x <= box.right + slop && y >= box.top - slop && y <= box.bottom + slop) {
    return "content";
  }
  return x > box.right || y > box.bottom ? "after" : "before";
}

/** The editable neighbour on one side of a block widget, created if missing. */
export function editableNeighbor(block: HTMLElement, side: "before" | "after"): Node {
  const sibling = significantSibling(block, side === "after" ? "next" : "previous");
  if (sibling && !isBlockRich(sibling)) return sibling;
  const paragraph = emptyParagraph(block.ownerDocument);
  if (side === "after") block.after(paragraph);
  else block.before(paragraph);
  return paragraph;
}
