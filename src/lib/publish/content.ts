const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGCAPTION", "FIGURE",
  "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "LI", "MAIN",
  "NAV", "OL", "P", "PRE", "SECTION", "UL"
]);

type TextBlock = { text: string; tight: boolean };

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "\n";
  return Array.from(node.childNodes)
    .map((child) => {
      const text = inlineText(child);
      return child instanceof HTMLElement && BLOCK_TAGS.has(child.tagName)
        ? ` ${text} `
        : text;
    })
    .join("");
}

function collectBlocks(root: HTMLElement): TextBlock[] {
  const blocks: TextBlock[] = [];
  let buffer = "";

  const flush = (tight = false) => {
    const text = buffer
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
    if (text) blocks.push({ text, tight });
    buffer = "";
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    if (node.tagName === "BR") {
      buffer += "\n";
      return;
    }

    if (node.tagName === "UL" || node.tagName === "OL") {
      flush();
      const items = Array.from(node.children).filter((child) => child.tagName === "LI");
      items.forEach((item, index) => {
        const marker = node.tagName === "OL" ? `${index + 1}.` : "•";
        const text = inlineText(item).replace(/\s+/g, " ").trim();
        if (text) blocks.push({ text: `${marker} ${text}`, tight: true });
      });
      return;
    }

    if (node.tagName === "LI") {
      flush();
      const text = inlineText(node).replace(/\s+/g, " ").trim();
      if (text) blocks.push({ text: `• ${text}`, tight: true });
      return;
    }

    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock) flush();
    for (const child of Array.from(node.childNodes)) walk(child);
    if (isBlock) flush();
  };

  for (const child of Array.from(root.childNodes)) walk(child);
  flush();
  return blocks;
}

/** Turns sanitized editor HTML into readable plain text with paragraph breaks. */
export function htmlToPlainText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const blocks = collectBlocks(parsed.body);
  let output = "";
  let previousTight = false;
  blocks.forEach((block, index) => {
    if (index > 0) output += block.tight && previousTight ? "\n" : "\n\n";
    output += block.text;
    previousTight = block.tight;
  });
  return output;
}

/**
 * Marks the first narrative paragraph in a scene so the HTML and EPUB styles
 * can target it for a drop cap without accidentally styling an eyebrow label.
 */
export function markDropCapParagraph(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const first = Array.from(parsed.body.querySelectorAll("p")).find((paragraph) =>
    !paragraph.classList.contains("eyebrow")
    && !paragraph.closest("blockquote")
    && !paragraph.closest("li")
  );
  if (!first) return html;
  first.classList.add("drop-cap");
  return parsed.body.innerHTML;
}

export function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

export function hasVisibleText(text: string): boolean {
  return text.trim().length > 0;
}
