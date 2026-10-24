const safeTags = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "H1", "H2", "H3", "I", "LI",
  "OL", "P", "S", "STRIKE", "STRONG", "U", "UL"
]);

function cleanNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
  if (!(node instanceof HTMLElement)) return null;

  if (!safeTags.has(node.tagName)) {
    const fragment = document.createDocumentFragment();
    for (const child of Array.from(node.childNodes)) {
      const cleanChild = cleanNode(child);
      if (cleanChild) fragment.append(cleanChild);
    }
    return fragment;
  }

  const clean = document.createElement(node.tagName === "STRIKE" ? "s" : node.tagName.toLowerCase());
  if (node.tagName === "P" && node.classList.contains("eyebrow")) {
    clean.classList.add("eyebrow");
  }
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href) {
      try {
        const url = new URL(href, window.location.href);
        if (["http:", "https:", "mailto:"].includes(url.protocol)) {
          clean.setAttribute("href", href);
        }
      } catch {
        // Invalid links are kept as plain text.
      }
    }
  }
  for (const child of Array.from(node.childNodes)) {
    const cleanChild = cleanNode(child);
    if (cleanChild) clean.append(cleanChild);
  }
  return clean;
}

/**
 * Sanitizes editor HTML against the same small allowlist used by the writing
 * surface. The result is safe to store, preview, and embed in exported files.
 */
export function sanitizeHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const container = document.createElement("div");
  for (const child of Array.from(parsed.body.childNodes)) {
    const cleanChild = cleanNode(child);
    if (cleanChild) container.append(cleanChild);
  }
  return container.innerHTML;
}
