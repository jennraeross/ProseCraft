const VOID_ELEMENTS = new Set(["BR", "HR", "IMG", "INPUT", "META", "LINK"]);

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXmlAttribute(value: string): string {
  return escapeXml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeXml(node.textContent ?? "");
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();
  const attributes: string[] = [];
  if (node.tagName === "P") {
    const classes = ["eyebrow", "drop-cap"].filter((name) => node.classList.contains(name));
    if (classes.length > 0) attributes.push(`class="${classes.join(" ")}"`);
  }
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href) attributes.push(`href="${escapeXmlAttribute(href)}"`);
  }
  const attributeText = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";

  if (VOID_ELEMENTS.has(node.tagName)) return `<${tag}${attributeText} />`;
  const children = Array.from(node.childNodes).map(serializeNode).join("");
  return `<${tag}${attributeText}>${children}</${tag}>`;
}

/** Converts the sanitized editor fragment into well-formed XHTML. */
export function htmlToXhtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return Array.from(parsed.body.childNodes).map(serializeNode).join("");
}
