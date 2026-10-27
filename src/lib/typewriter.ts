export type CaretRect = {
  top: number;
  bottom: number;
};

/**
 * Centers a caret-sized rectangle in the viewport using the page scroll.
 * The target is clamped so short documents and the start/end of long ones do
 * not produce empty overscroll.
 */
export function centerCaretInViewport(rect: CaretRect): void {
  if (typeof window === "undefined") return;

  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const viewportHeight = window.innerHeight;
  const caretHeight = Math.max(1, rect.bottom - rect.top);
  const target = window.scrollY + rect.top - (viewportHeight - caretHeight) / 2;
  const maxScroll = Math.max(0, scrollingElement.scrollHeight - viewportHeight);
  const nextScroll = Math.max(0, Math.min(maxScroll, target));

  if (Math.abs(nextScroll - window.scrollY) < 2) return;
  window.scrollTo(window.scrollX, nextScroll);
}
