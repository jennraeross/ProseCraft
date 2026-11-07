export type CaretRect = {
  top: number;
  bottom: number;
};

/**
 * Nearest ancestor that scrolls on its own, so features that follow the caret can use
 * the editor's tile instead of the page. Returns null when the page is the scroll container.
 */
export function scrollContainerOf(element: Element | null): HTMLElement | null {
  if (typeof window === "undefined") return null;

  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * Centers a caret-sized rectangle in the viewport using the page scroll, or the scroll of
 * `container` when the editor sits in its own tile. The target is clamped so short documents
 * and the start/end of long ones do not produce empty overscroll.
 */
export function centerCaretInViewport(rect: CaretRect, container?: HTMLElement | null): void {
  if (typeof window === "undefined") return;

  const caretHeight = Math.max(1, rect.bottom - rect.top);

  if (container) {
    const bounds = container.getBoundingClientRect();
    const target = container.scrollTop + (rect.top - bounds.top) - (bounds.height - caretHeight) / 2;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScroll = Math.max(0, Math.min(maxScroll, target));

    if (Math.abs(nextScroll - container.scrollTop) < 2) return;
    container.scrollTo({ top: nextScroll });
    return;
  }

  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const viewportHeight = window.innerHeight;
  const target = window.scrollY + rect.top - (viewportHeight - caretHeight) / 2;
  const maxScroll = Math.max(0, scrollingElement.scrollHeight - viewportHeight);
  const nextScroll = Math.max(0, Math.min(maxScroll, target));

  if (Math.abs(nextScroll - window.scrollY) < 2) return;
  window.scrollTo(window.scrollX, nextScroll);
}
