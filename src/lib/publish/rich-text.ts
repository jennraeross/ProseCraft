import { readImageLayout, type ImageLayout } from "../image-layout";
import { FOOTNOTE_REF_CLASS, isValidFootnoteId } from "../sanitize";

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
  /** Inline equation/diagram image. Text is empty when this is present. */
  image?: { src: string; alt: string; width?: number; height?: number };
  /** Inline footnote reference id (`data-footnote-id`). Text is empty when this is present. */
  footnoteId?: string;
};

export type BlockKind = "paragraph" | "heading" | "quote" | "list" | "image";

export type BlockImage = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Stored layout of the picture, so a renderer can place it like the editor. */
  layout: ImageLayout;
  /** True when a `width` attribute names an explicit pixel size. */
  pixelSized: boolean;
};

export type Block = {
  kind: BlockKind;
  runs: InlineRun[];
  image?: BlockImage;
  level?: number;
  marker?: string;
  eyebrow?: boolean;
};

/** A block-level picture, with its stored layout and explicit size. */
function blockImage(element: HTMLElement): BlockImage | null {
  const src = element.getAttribute("src") ?? "";
  if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(src)) return null;
  const width = Number(element.getAttribute("width") ?? element.getAttribute("data-display-width"));
  const height = Number(element.getAttribute("height") ?? element.getAttribute("data-display-height"));
  return {
    src,
    alt: element.getAttribute("alt") ?? "",
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
    layout: readImageLayout(element),
    pixelSized: element.hasAttribute("width")
  };
}

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

  if (node.tagName === "SUP" && node.classList.contains(FOOTNOTE_REF_CLASS)) {
    const id = node.getAttribute("data-footnote-id") ?? "";
    if (isValidFootnoteId(id)) {
      output.push({ text: "", ...style, footnoteId: id });
    }
    return;
  }

  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (/^data:image\/(?:png|jpeg|webp);base64,/.test(src)) {
      const width = Number(node.getAttribute("width") ?? node.getAttribute("data-display-width"));
      const height = Number(node.getAttribute("height") ?? node.getAttribute("data-display-height"));
      output.push({
        text: "",
        ...style,
        image: {
          src,
          alt: node.getAttribute("alt") ?? "",
          ...(Number.isFinite(width) && width > 0 ? { width } : {}),
          ...(Number.isFinite(height) && height > 0 ? { height } : {})
        }
      });
    }
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
  const visible = (run: InlineRun) =>
    run.lineBreak || Boolean(run.image) || Boolean(run.footnoteId) || run.text.trim().length > 0;
  const result = runs
    .map((run) => ({ ...run }))
    .filter((run) => run.lineBreak || Boolean(run.image) || Boolean(run.footnoteId) || run.text.length > 0);
  const first = result.findIndex(visible);
  if (first < 0) return [];
  const last = result.length - 1 - [...result].reverse().findIndex(visible);
  const trimmed = result.slice(first, last + 1);
  if (trimmed.length > 0 && !trimmed[0].lineBreak && !trimmed[0].image && !trimmed[0].footnoteId) {
    trimmed[0].text = trimmed[0].text.trimStart();
  }
  if (trimmed.length > 0 && !trimmed[trimmed.length - 1].lineBreak
    && !trimmed[trimmed.length - 1].image && !trimmed[trimmed.length - 1].footnoteId) {
    trimmed[trimmed.length - 1].text = trimmed[trimmed.length - 1].text.trimEnd();
  }
  return trimmed;
}

function blockRuns(node: Node): InlineRun[] {
  const runs: InlineRun[] = [];
  collectInline(node, {}, runs);
  return trimRuns(runs);
}

/** Parses an inline HTML fragment (such as a footnote body) into styled inline runs. */
export function inlineRunsFromHtml(html: string): InlineRun[] {
  if (!html) return [];
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return blockRuns(parsed.body);
}

function splitAroundImages(node: Node): Node[] {
  if (!(node instanceof HTMLElement)) return [node.cloneNode()];
  if (node.tagName === "IMG") return [node.cloneNode(true)];

  const parts: Node[] = [];
  let current = node.cloneNode(false) as HTMLElement;
  for (const child of Array.from(node.childNodes)) {
    for (const part of splitAroundImages(child)) {
      if (part instanceof HTMLElement && part.tagName === "IMG"
        && part.getAttribute("data-inline") !== "true") {
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
    if (node.querySelector('img:not([data-inline="true"])')) {
      for (const part of splitAroundImages(node)) {
        if (part instanceof HTMLElement && part.tagName === "IMG"
          && part.getAttribute("data-inline") !== "true") {
          const image = blockImage(part);
          if (image) blocks.push({ kind: "image", runs: [], image });
        } else {
          addNode(part);
        }
      }
      return;
    }
    if (node.tagName === "IMG") {
      const image = blockImage(node);
      if (image) blocks.push({ kind: "image", runs: [], image });
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
