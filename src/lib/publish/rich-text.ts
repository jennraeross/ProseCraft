export type InlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
};

export type InlineRun = InlineStyle & {
  text: string;
  lineBreak?: boolean;
};

export type BlockKind = "paragraph" | "heading" | "quote" | "list" | "image";

export type Block = {
  kind: BlockKind;
  runs: InlineRun[];
  image?: { src: string; alt: string; width?: number; height?: number };
  level?: number;
  marker?: string;
  eyebrow?: boolean;
};

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

function collectInline(node: Node, style: InlineStyle, output: InlineRun[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    output.push({ text: normalizeText(node.textContent ?? ""), ...style });
    return;
  }
  if (!(node instanceof HTMLElement)) return;

  if (node.tagName === "BR") {
    output.push({ text: "", lineBreak: true, ...style });
    return;
  }

  const next: InlineStyle = { ...style };
  if (node.tagName === "STRONG" || node.tagName === "B") next.bold = true;
  if (node.tagName === "EM" || node.tagName === "I") next.italic = true;
  if (node.tagName === "U") next.underline = true;
  if (node.tagName === "S" || node.tagName === "STRIKE") next.strike = true;
  if (node.tagName === "A") {
    const href = node.getAttribute("href");
    if (href) next.link = href;
  }

  for (const child of Array.from(node.childNodes)) collectInline(child, next, output);
}

export function trimRuns(runs: InlineRun[]): InlineRun[] {
  const result = runs
    .map((run) => ({ ...run }))
    .filter((run) => run.lineBreak || run.text.length > 0);
  const first = result.findIndex((run) => run.lineBreak || run.text.trim().length > 0);
  if (first < 0) return [];
  const last = result.length - 1 - [...result].reverse()
    .findIndex((run) => run.lineBreak || run.text.trim().length > 0);
  const trimmed = result.slice(first, last + 1);
  if (trimmed.length > 0 && !trimmed[0].lineBreak) trimmed[0].text = trimmed[0].text.trimStart();
  if (trimmed.length > 0 && !trimmed[trimmed.length - 1].lineBreak) {
    trimmed[trimmed.length - 1].text = trimmed[trimmed.length - 1].text.trimEnd();
  }
  return trimmed;
}

function blockRuns(node: Node): InlineRun[] {
  const runs: InlineRun[] = [];
  collectInline(node, {}, runs);
  return trimRuns(runs);
}

function splitAroundImages(node: Node): Node[] {
  if (!(node instanceof HTMLElement)) return [node.cloneNode()];
  if (node.tagName === "IMG") return [node.cloneNode(true)];

  const parts: Node[] = [];
  let current = node.cloneNode(false) as HTMLElement;
  for (const child of Array.from(node.childNodes)) {
    for (const part of splitAroundImages(child)) {
      if (part instanceof HTMLElement && part.tagName === "IMG") {
        if (current.hasChildNodes()) parts.push(current);
        parts.push(part);
        current = node.cloneNode(false) as HTMLElement;
      } else {
        current.append(part);
      }
    }
  }
  if (current.hasChildNodes()) parts.push(current);
  return parts;
}

export function blocksFromHtml(html: string): Block[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const blocks: Block[] = [];

  const addBlock = (kind: BlockKind, runs: InlineRun[], extra: Partial<Block> = {}) => {
    if (runs.length > 0) blocks.push({ kind, runs, ...extra });
  };

  const addNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      addBlock("paragraph", trimRuns([{ text: normalizeText(node.textContent ?? "") }]));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.querySelector("img")) {
      for (const part of splitAroundImages(node)) {
        if (part instanceof HTMLElement && part.tagName === "IMG") {
          const src = part.getAttribute("src") ?? "";
          if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(src)) continue;
          const width = Number(part.getAttribute("width"));
          const height = Number(part.getAttribute("height"));
          blocks.push({
            kind: "image",
            runs: [],
            image: {
              src,
              alt: part.getAttribute("alt") ?? "",
              ...(Number.isFinite(width) && width > 0 ? { width } : {}),
              ...(Number.isFinite(height) && height > 0 ? { height } : {})
            }
          });
        } else {
          addNode(part);
        }
      }
      return;
    }
    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") ?? "";
      if (/^data:image\/(?:png|jpeg|webp);base64,/.test(src)) {
        blocks.push({ kind: "image", runs: [], image: { src, alt: node.getAttribute("alt") ?? "" } });
      }
      return;
    }

    switch (node.tagName) {
      case "H1":
        addBlock("heading", blockRuns(node), { level: 1 });
        break;
      case "H2":
        addBlock("heading", blockRuns(node), { level: 2 });
        break;
      case "H3":
        addBlock("heading", blockRuns(node), { level: 3 });
        break;
      case "BLOCKQUOTE": {
        const paragraphs = Array.from(node.querySelectorAll(":scope > p"));
        if (paragraphs.length === 0) {
          addBlock("quote", blockRuns(node));
        } else {
          for (const paragraph of paragraphs) addBlock("quote", blockRuns(paragraph));
        }
        break;
      }
      case "UL":
      case "OL": {
        const items = Array.from(node.children).filter((child) => child.tagName === "LI");
        items.forEach((item, index) => {
          addBlock("list", blockRuns(item), {
            marker: node.tagName === "OL" ? `${index + 1}.` : "•"
          });
        });
        break;
      }
      case "LI":
        addBlock("list", blockRuns(node), { marker: "•" });
        break;
      case "P":
      case "DIV":
      default: {
        const nestedBlocks = Array.from(node.children).some((child) =>
          ["P", "DIV", "H1", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI"].includes(child.tagName)
        );
        if (nestedBlocks && (node.tagName === "DIV" || node.tagName === "P")) {
          for (const child of Array.from(node.childNodes)) addNode(child);
        } else {
          addBlock("paragraph", blockRuns(node), {
            eyebrow: node.tagName === "P" && node.classList.contains("eyebrow")
          });
        }
        break;
      }
    }
  };

  for (const child of Array.from(parsed.body.childNodes)) addNode(child);
  return blocks;
}
