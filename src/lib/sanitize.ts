const safeTags = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "DIV", "EM", "H1", "H2", "H3", "HR", "I",
  "IMG", "LI", "OL", "P", "PRE", "S", "STRIKE", "STRONG", "TABLE", "TBODY", "TD", "TH",
  "THEAD", "TR", "U", "UL"
]);
const MAX_EMBEDDED_IMAGE_BYTES = 1_500_000;

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

  const clean = document.createElement(
    node.tagName === "STRIKE" || node.tagName === "DEL" ? "s" : node.tagName.toLowerCase()
  );
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
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    const encodedImage = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
    if (!encodedImage || encodedImage[1].length > Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4) return null;
    clean.setAttribute("src", src);
    clean.setAttribute("alt", (node.getAttribute("alt") ?? "").slice(0, 500));
    for (const dimension of ["width", "height"]) {
      const value = Number(node.getAttribute(dimension));
      if (Number.isInteger(value) && value > 0 && value <= 2400) {
        clean.setAttribute(dimension, String(value));
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
