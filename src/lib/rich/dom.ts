import { readRichPlaceholder, richPlaceholders } from "./model";
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
