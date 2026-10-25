/**
 * Svelte action that grows a textarea to fit its content. Pass the current
 * value as the action parameter so external updates (project switches, sync,
 * mirrored summaries) resize too, not just local typing.
 */
export function autoResize(node: HTMLTextAreaElement, value?: string) {
  let frame = 0;
  let lastWidth = node.clientWidth;

  function resize() {
    if (!node.isConnected || node.getClientRects().length === 0) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      resize();
    });
  }

  resize();
  node.addEventListener("input", schedule);

  // Watch the parent's width instead of the textarea itself: resizing the
  // textarea changes its own height, which would otherwise loop the observer.
  const parent = node.parentElement;
  const observer = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(() => {
      if (node.clientWidth === lastWidth) return;
      lastWidth = node.clientWidth;
      schedule();
    });
  if (parent) observer?.observe(parent);
  const visibilityObserver = typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) schedule();
    });
  visibilityObserver?.observe(node);

  return {
    update() {
      schedule();
    },
    destroy() {
      node.removeEventListener("input", schedule);
      observer?.disconnect();
      visibilityObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      node.style.height = "";
    }
  };
}
