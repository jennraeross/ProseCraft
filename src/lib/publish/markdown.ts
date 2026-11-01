import TurndownService from "turndown";
import { marked, type Token } from "marked";
import {
  DIAGRAM_CLASS,
  MATH_BLOCK_CLASS,
  MATH_INLINE_CLASS,
  hasRichPlaceholders,
  richPlaceholders
} from "../rich/model";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

let service: TurndownService | undefined;
let markedConfigured = false;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function richSource(node: HTMLElement, attribute: string): string {
  return node.getAttribute(attribute) ?? "";
}

function markdownService(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    hr: "* * *"
  });
  service.addRule("eyebrow", {
    filter: (node) => node.nodeName === "P" && node.classList.contains("eyebrow"),
    replacement: (content) => `**${content.trim()}**\n\n`
  });
  service.addRule("mathInline", {
    filter: (node) => node.nodeName === "SPAN" && node.classList.contains(MATH_INLINE_CLASS),
    replacement: (_content, node) => `$${richSource(node as HTMLElement, "data-tex").trim()}$`
  });
  service.addRule("mathBlock", {
    filter: (node) => node.classList.contains(MATH_BLOCK_CLASS),
    replacement: (_content, node) => {
      const tex = richSource(node as HTMLElement, "data-tex").trim();
      return `\n\n$$\n${tex}\n$$\n\n`;
    }
  });
  service.addRule("mermaid", {
    filter: (node) => node.classList.contains(DIAGRAM_CLASS),
    replacement: (_content, node) => {
      const source = richSource(node as HTMLElement, "data-source").trim();
      const fence = source.includes("```") ? "~~~~" : "```";
      return `\n\n${fence}mermaid\n${source}\n${fence}\n\n`;
    }
  });
  return service;
}

function configureMarked(): void {
  if (markedConfigured) return;
  markedConfigured = true;
  marked.use({
    extensions: [
      {
        name: "mathBlock",
        level: "block",
        start(src) {
          return src.search(/(?:^|\n)[ \t]*(?:\$\$|\\\[)/);
        },
        tokenizer(src) {
          const dollar = /^\$\$[ \t]*(?:\r?\n)?([\s\S]+?)(?:\r?\n)?[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src);
          if (dollar) {
            return {
              type: "mathBlock",
              raw: dollar[0],
              text: dollar[1].trim()
            };
          }
          const bracket = /^\\\[[ \t]*(?:\r?\n)?([\s\S]+?)(?:\r?\n)?[ \t]*\\\][ \t]*(?:\n|$)/.exec(src);
          if (bracket) {
            return {
              type: "mathBlock",
              raw: bracket[0],
              text: bracket[1].trim()
            };
          }
          return undefined;
        },
        renderer(token: Token) {
          const math = token as Token & { text?: string };
          return `<div class="${MATH_BLOCK_CLASS}" data-tex="${escapeAttribute(String(math.text ?? ""))}"></div>\n`;
        }
      },
      {
        name: "mathInline",
        level: "inline",
        start(src) {
          return src.search(/\$|\\\(/);
        },
        tokenizer(src) {
          const paren = /^\\\(([\s\S]+?)\\\)/.exec(src);
          if (paren) {
            return { type: "mathInline", raw: paren[0], text: paren[1].trim(), display: false };
          }
          const double = /^\$\$([^$\n]+?)\$\$/.exec(src);
          if (double) {
            return { type: "mathInline", raw: double[0], text: double[1].trim(), display: true };
          }
          // Avoid treating currency such as "$5" or "$ 5" as math.
          const single = /^\$(?![\s\d])([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
          if (single) {
            return { type: "mathInline", raw: single[0], text: single[1].trim(), display: false };
          }
          return undefined;
        },
        renderer(token: Token) {
          const math = token as Token & { text?: string; display?: boolean };
          const kind = math.display ? MATH_BLOCK_CLASS : MATH_INLINE_CLASS;
          return `<span class="${kind}" data-tex="${escapeAttribute(String(math.text ?? ""))}"></span>`;
        }
      }
    ],
    renderer: {
      code(token) {
        if ((token.lang ?? "").trim().toLowerCase() === "mermaid") {
          return `<div class="${DIAGRAM_CLASS}" data-source="${escapeAttribute(token.text)}"></div>\n`;
        }
        return false;
      }
    }
  });
}

export function htmlToMarkdown(html: string): string {
  return markdownService().turndown(seedRichPlaceholders(html)).trim();
}

/**
 * Turndown skips nodes whose text is empty, which would drop source-only
 * equations and diagrams. A zero-width marker makes each placeholder visible
 * to Turndown; the custom rules replace it with the stored Markdown syntax.
 */
function seedRichPlaceholders(html: string): string {
  if (!hasRichPlaceholders(html)) return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const element of richPlaceholders(parsed.body)) {
    element.replaceChildren("\u200b");
  }
  return parsed.body.innerHTML;
}

export function markdownToHtml(markdown: string): string {
  configureMarked();
  return marked.parse(markdown, { async: false }) as string;
}

function separatorMarkdown(separator: SceneSeparator): string {
  switch (separator) {
    case "hash":
    case "asterisks":
    case "line":
      return "* * *";
    case "blank":
      return "";
    default:
      return "";
  }
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function exportMarkdown(book: CompiledBook, options: PublishOptions): ExportPayload {
  const turndown = markdownService();
  const blocks: string[] = [];

  if (options.includeTitlePage) {
    const frontMatter = [
      "---",
      `title: ${yamlString(book.title)}`,
      book.author ? `author: ${yamlString(book.author)}` : "",
      "---"
    ].filter(Boolean).join("\n");
    blocks.push(frontMatter);
    blocks.push(`# ${book.title}`);
    if (book.subtitle) blocks.push(`_${book.subtitle}_`);
    if (book.author) blocks.push(`by ${book.author}`);
    if (book.copyright && !options.includeCopyrightPage) blocks.push(book.copyright);
  }
  if (options.includeCopyrightPage && book.copyright) blocks.push(book.copyright);
  if (book.dedication) blocks.push(`> ${book.dedication.replace(/\n/g, "\n> ")}`);
  if (options.includeTableOfContents && book.chapters.length > 0) {
    blocks.push(["## Contents", ...book.chapters.map((chapter) => `- ${chapter.label}`)].join("\n"));
  }
  for (const page of book.frontMatter) {
    blocks.push([page.title ? `## ${page.title}` : "", page.body].filter(Boolean).join("\n\n"));
  }

  for (const chapter of book.chapters) {
    if (options.includeChapterTitles) blocks.push(`## ${chapter.label}`);
    const scenes: string[] = [];
    for (const scene of chapter.scenes) {
      const sceneBlocks: string[] = [];
      if (options.includeSceneTitles) sceneBlocks.push(`### ${scene.title}`);
      sceneBlocks.push(normalizeMarkdown(turndown.turndown(scene.html)));
      scenes.push(sceneBlocks.filter(Boolean).join("\n\n"));
    }
    const separator = separatorMarkdown(options.sceneSeparator);
    blocks.push(scenes.join(separator ? `\n\n${separator}\n\n` : "\n\n"));
  }

  for (const page of book.backMatter) {
    blocks.push([page.title ? `## ${page.title}` : "", page.body].filter(Boolean).join("\n\n"));
  }

  const markdown = `${blocks.filter(Boolean).join("\n\n")}\n`;
  return {
    blob: new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.markdown.extension}`,
    extension: FORMAT_INFO.markdown.extension,
    formatName: FORMAT_INFO.markdown.formatName
  };
}
