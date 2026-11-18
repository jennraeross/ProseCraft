import TurndownService from "turndown";
import { marked, type Token } from "marked";
import {
  DEFAULT_IMAGE_LAYOUT,
  MAX_IMAGE_WIDTH,
  readImageLayout,
  type ImageLayout
} from "../image-layout";
import {
  CALC_CLASS,
  DIAGRAM_CLASS,
  MATH_BLOCK_CLASS,
  MATH_INLINE_CLASS,
  hasRichPlaceholders,
  richPlaceholders
} from "../rich/model";
import { resolveBookCitations } from "../citations/bibliography";
import {
  CITE_REF_CLASS,
  CITE_REF_SELECTOR,
  formatPandocCitations,
  parseCiteData,
  parsePandocCitationCluster,
  type CiteRefItem
} from "../citations/cite-marker";
import { FOOTNOTE_REF_CLASS, isValidFootnoteId, sanitizeInlineHtml } from "../sanitize";
import { resolveBookFootnotes, type ResolvedFootnote } from "./footnotes";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type ExportPayload,
  type FootnoteDef,
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

/** The validated layout attributes `applyImageLayout` would write. */
function layoutAttributes(layout: ImageLayout): string[] {
  const attributes: string[] = [];
  if (layout.size !== DEFAULT_IMAGE_LAYOUT.size) {
    attributes.push(`data-size="${escapeAttribute(layout.size)}"`);
  }
  if (layout.size === "custom") {
    attributes.push(`data-width="${layout.width ?? MAX_IMAGE_WIDTH}"`);
  }
  if (layout.align !== DEFAULT_IMAGE_LAYOUT.align) {
    attributes.push(`data-align="${escapeAttribute(layout.align)}"`);
  }
  if (layout.wrap !== DEFAULT_IMAGE_LAYOUT.wrap) {
    attributes.push(`data-wrap="${escapeAttribute(layout.wrap)}"`);
  }
  return attributes;
}

function hasImageLayout(node: HTMLElement): boolean {
  return layoutAttributes(readImageLayout(node)).length > 0;
}

/** Markdown has no syntax for image layout, so such images stay raw HTML. */
function imageLayoutTag(node: HTMLElement, src: string): string {
  const attributes = [
    `src="${escapeAttribute(src)}"`,
    `alt="${escapeAttribute(node.getAttribute("alt") ?? "")}"`,
    ...layoutAttributes(readImageLayout(node))
  ];
  return `<img ${attributes.join(" ")}>`;
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
  service.addRule("imageLayout", {
    filter: (node) => node.nodeName === "IMG" && hasImageLayout(node),
    replacement: (_content, node) => {
      const src = node.getAttribute("src");
      return src ? imageLayoutTag(node, src) : "";
    }
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
  service.addRule("calc", {
    filter: (node) => node.classList.contains(CALC_CLASS),
    replacement: (_content, node) => {
      const source = richSource(node as HTMLElement, "data-source").trim();
      const fence = source.includes("```") ? "~~~~" : "```";
      return `\n\n${fence}calc\n${source}\n${fence}\n\n`;
    }
  });
  service.addRule("footnoteRef", {
    filter: (node) =>
      node.nodeName === "SUP"
      && node.classList.contains(FOOTNOTE_REF_CLASS)
      && isValidFootnoteId(node.getAttribute("data-footnote-id") ?? ""),
    replacement: (_content, node) => {
      const id = (node as HTMLElement).getAttribute("data-footnote-id") ?? "";
      return `[^${id}]`;
    }
  });
  service.addRule("citeRef", {
    filter: (node) =>
      node.nodeName === "SPAN"
      && node.classList.contains(CITE_REF_CLASS),
    replacement: (_content, node) => {
      const cites = parseCiteData((node as HTMLElement).getAttribute("data-cites"));
      return cites ? formatPandocCitations(cites) : "";
    }
  });
  service.addRule("table", {
    filter: "table",
    replacement: (_content, node) => tableMarkdown(node as HTMLTableElement)
  });
  service.addRule("underline", {
    filter: "u",
    replacement: (content) => `<u>${content}</u>`
  });
  service.addRule("strikethrough", {
    filter: (node) => node.nodeName === "S" || node.nodeName === "DEL" || node.nodeName === "STRIKE",
    replacement: (content) => `~~${content}~~`
  });
  return service;
}

/** Elements that make a cell more than a line of text, which a pipe table can't hold. */
const CELL_BLOCKS = "p, h1, h2, h3, ul, ol, li, blockquote, pre, hr, table, div, br";

/**
 * A table as Markdown. Turndown has no table rule, so without this every cell
 * came out as a paragraph of its own and the table was lost on the way back
 * (the Markdown editor, Markdown export, open-folder sync). A table with a
 * header row of `th` cells, the same number of `td` cells in every other row,
 * and only inline content (no blocks or line breaks) in its cells becomes a
 * GFM pipe table, which marked reads back as the same table. Any other table
 * is kept as HTML, which marked passes through and the sanitizer keeps.
 */
function tableMarkdown(table: HTMLTableElement): string {
  const cells = Array.from(table.rows).map((row) => Array.from(row.cells));
  const width = cells[0]?.length ?? 0;
  const pipeTable =
    width > 0
    && cells[0].every((cell) => cell.nodeName === "TH")
    && cells.slice(1).every((row) => row.length === width && row.every((cell) => cell.nodeName === "TD"))
    && cells.flat().every((cell) =>
      !cell.querySelector(CELL_BLOCKS)
      // Turndown leaves code as it is, so a pipe in it can't be escaped for the table.
      && Array.from(cell.querySelectorAll("code")).every((code) => !code.textContent?.includes("|")));
  if (pipeTable) {
    const lines = cells.map((row) => row.map((cell) => markdownService().turndown(cell.innerHTML).trim()));
    if (lines.every((row) => row.every((text) => !text.includes("\n")))) {
      const line = (row: string[]) => `| ${row.map((text) => text.replace(/\|/g, "\\|")).join(" | ")} |`;
      const [header, ...body] = lines;
      return `\n\n${[line(header), line(header.map(() => "---")), ...body.map(line)].join("\n")}\n\n`;
    }
  }
  const kept = table.cloneNode(true) as HTMLElement;
  // Placeholders are stored by their attributes alone; whatever is inside them (the marker
  // Turndown was given to see, or a rendered equation from the editor) is left out.
  for (const element of [
    ...kept.querySelectorAll(`sup.${FOOTNOTE_REF_CLASS}, ${CITE_REF_SELECTOR}`),
    ...richPlaceholders(kept)
  ]) {
    element.replaceChildren();
  }
  // A blank line would end marked's HTML block in the middle of the table.
  const html = kept.outerHTML.replace(/\n(?=[ \t]*\n)/g, "&#10;");
  return `\n\n${html}\n\n`;
}

function configureMarked(): void {
  if (markedConfigured) return;
  markedConfigured = true;
  marked.use({
    extensions: [
      {
        name: "footnoteDef",
        level: "block",
        start(src) {
          return src.search(/(?:^|\n)[ \t]{0,3}\[\^[A-Za-z0-9_-]{1,32}\]:/);
        },
        tokenizer(src) {
          const head = /^[ \t]{0,3}\[\^([A-Za-z0-9_-]{1,32})\]:[ \t]*([^\n]*)(?:\n|$)/.exec(src);
          if (!head) return undefined;
          let raw = head[0];
          const lines = [head[2]];
          let rest = src.slice(raw.length);
          while (rest.length > 0) {
            if (/^[ \t]{0,3}\[\^[A-Za-z0-9_-]{1,32}\]:/.test(rest)) break;
            const cont = /^(?: {2,4}|\t)([^\n]*)(?:\n|$)/.exec(rest);
            if (cont) {
              raw += cont[0];
              lines.push(cont[1]);
              rest = rest.slice(cont[0].length);
              continue;
            }
            const blankCont = /^\n(?: {2,4}|\t)([^\n]*)(?:\n|$)/.exec(rest);
            if (blankCont) {
              raw += blankCont[0];
              lines.push("", blankCont[1]);
              rest = rest.slice(blankCont[0].length);
              continue;
            }
            break;
          }
          return {
            type: "footnoteDef",
            raw,
            id: head[1],
            text: lines.join("\n").trim()
          };
        },
        renderer() {
          return "";
        }
      },
      {
        name: "footnoteRef",
        level: "inline",
        start(src) {
          return src.search(/\[\^[A-Za-z0-9_-]{1,32}\]/);
        },
        tokenizer(src) {
          const match = /^\[\^([A-Za-z0-9_-]{1,32})\]/.exec(src);
          if (!match) return undefined;
          return {
            type: "footnoteRef",
            raw: match[0],
            id: match[1]
          };
        },
        renderer(token: Token) {
          const ref = token as Token & { id?: string };
          const id = String(ref.id ?? "");
          if (!isValidFootnoteId(id)) return "";
          return `<sup class="${FOOTNOTE_REF_CLASS}" data-footnote-id="${escapeAttribute(id)}" contenteditable="false"></sup>`;
        }
      },
      {
        name: "citeRef",
        level: "inline",
        start(src) {
          return src.search(/\[(?!\^)[^\]\n]*@/);
        },
        tokenizer(src) {
          if (!src.startsWith("[") || src.startsWith("[^")) return undefined;
          let end = -1;
          let escaped = false;
          for (let i = 1; i < src.length; i += 1) {
            const ch = src[i];
            if (escaped) {
              escaped = false;
              continue;
            }
            if (ch === "\\") {
              escaped = true;
              continue;
            }
            if (ch === "[" || ch === "\n" || ch === "\r") {
              return undefined;
            }
            if (ch === "]") {
              end = i;
              break;
            }
          }
          if (end <= 1) return undefined;
          const next = src[end + 1];
          if (next === "(" || (next === "[" && src[end + 2] !== "^")) return undefined;
          const raw = src.slice(0, end + 1);
          const cites = parsePandocCitationCluster(src.slice(1, end));
          if (!cites) return undefined;
          return {
            type: "citeRef",
            raw,
            cites
          };
        },
        renderer(token: Token) {
          const ref = token as Token & { cites?: CiteRefItem[] };
          if (!ref.cites || ref.cites.length === 0) return "";
          return `<span class="${CITE_REF_CLASS}" data-cites="${escapeAttribute(JSON.stringify(ref.cites))}" contenteditable="false"></span>`;
        }
      },
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
        const lang = (token.lang ?? "").trim().toLowerCase();
        if (lang === "mermaid") {
          return `<div class="${DIAGRAM_CLASS}" data-source="${escapeAttribute(token.text)}"></div>\n`;
        }
        if (lang === "calc" || lang === "mathcad") {
          return `<div class="${CALC_CLASS}" data-source="${escapeAttribute(token.text)}"></div>\n`;
        }
        return false;
      }
    }
  });
}

export function htmlToInlineMarkdown(html: string): string {
  const clean = sanitizeInlineHtml(html);
  if (!clean) return "";
  return markdownService().turndown(seedRichPlaceholders(clean)).trim();
}

export function htmlToMarkdown(html: string, footnotes?: readonly FootnoteDef[]): string {
  const body = markdownService().turndown(seedRichPlaceholders(html)).trim();
  if (!footnotes || footnotes.length === 0) return body;
  const defs = footnotes
    .filter((fn) => isValidFootnoteId(fn.id))
    .map((fn) => {
      const text = htmlToInlineMarkdown(fn.html);
      return text ? `[^${fn.id}]: ${text.replace(/\n/g, "\n    ")}` : `[^${fn.id}]:`;
    });
  if (defs.length === 0) return body;
  return body ? `${body}\n\n${defs.join("\n")}` : defs.join("\n");
}

/**
 * Turndown skips nodes whose text is empty, which would drop source-only
 * equations, diagrams, and footnote markers. A zero-width marker makes each
 * placeholder visible to Turndown; the custom rules replace it with the
 * stored Markdown syntax.
 */
function seedRichPlaceholders(html: string): string {
  const hasRich = hasRichPlaceholders(html);
  const hasFootnotes = html.includes(FOOTNOTE_REF_CLASS);
  const hasCitations = html.includes(CITE_REF_CLASS);
  if (!hasRich && !hasFootnotes && !hasCitations) return html;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  if (hasRich) {
    for (const element of richPlaceholders(parsed.body)) {
      element.replaceChildren("\u200b");
    }
  }
  if (hasFootnotes) {
    for (const element of parsed.body.querySelectorAll<HTMLElement>(
      `sup.${FOOTNOTE_REF_CLASS}[data-footnote-id]`
    )) {
      element.replaceChildren("\u200b");
    }
  }
  if (hasCitations) {
    for (const element of parsed.body.querySelectorAll<HTMLElement>(CITE_REF_SELECTOR)) {
      element.replaceChildren("\u200b");
    }
  }
  return parsed.body.innerHTML;
}

export function markdownToHtml(markdown: string): string {
  configureMarked();
  return marked.parse(markdown, { async: false }) as string;
}

/** Parses Markdown into body HTML and extracted inline-sanitized footnote definitions. */
export function markdownToDocument(markdown: string): { html: string; footnotes: FootnoteDef[] } {
  configureMarked();
  const tokens = marked.lexer(markdown);
  const byId = new Map<string, FootnoteDef>();
  for (const token of tokens) {
    if (token.type !== "footnoteDef") continue;
    const defToken = token as Token & { id?: string; text?: string };
    const id = String(defToken.id ?? "");
    if (!isValidFootnoteId(id)) continue;
    const rawText = String(defToken.text ?? "");
    const inlineHtml = rawText
      ? sanitizeInlineHtml(marked.parseInline(rawText, { async: false }) as string)
      : "";
    byId.set(id, { id, html: inlineHtml });
  }
  return {
    html: marked.parser(tokens),
    footnotes: [...byId.values()]
  };
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

function markdownFootnoteLabel(
  note: ResolvedFootnote,
  restartPerChapter: boolean,
  chapterCount: number
): string {
  return restartPerChapter && chapterCount > 1
    ? `${note.chapterIndex + 1}-${note.number}`
    : String(note.number);
}

function renumberSceneHtmlForMarkdown(
  html: string,
  sceneFootnotes: ReadonlyMap<string, ResolvedFootnote> | undefined,
  restartPerChapter: boolean,
  chapterCount: number
): string {
  if (!sceneFootnotes || sceneFootnotes.size === 0 || !html.includes(FOOTNOTE_REF_CLASS)) {
    return seedRichPlaceholders(html);
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const element of Array.from(parsed.body.querySelectorAll<HTMLElement>(
    `sup.${FOOTNOTE_REF_CLASS}[data-footnote-id]`
  ))) {
    const id = element.getAttribute("data-footnote-id") ?? "";
    const note = sceneFootnotes.get(id);
    if (!note) {
      element.remove();
      continue;
    }
    element.setAttribute(
      "data-footnote-id",
      markdownFootnoteLabel(note, restartPerChapter, chapterCount)
    );
  }
  return seedRichPlaceholders(parsed.body.innerHTML);
}

export function exportMarkdown(book: CompiledBook, options: PublishOptions): ExportPayload {
  const { book: resolvedBook, bibliography } = resolveBookCitations(book, options);
  book = resolvedBook;
  const turndown = markdownService();
  const blocks: string[] = [];
  const bookFootnotes = resolveBookFootnotes(book, options);
  const restartPerChapter = Boolean(options.footnotesRestartPerChapter);

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
      const sceneHtml = renumberSceneHtmlForMarkdown(
        scene.html,
        bookFootnotes.byScene.get(scene),
        restartPerChapter,
        book.chapters.length
      );
      sceneBlocks.push(normalizeMarkdown(turndown.turndown(sceneHtml)));
      scenes.push(sceneBlocks.filter(Boolean).join("\n\n"));
    }
    const separator = separatorMarkdown(options.sceneSeparator);
    blocks.push(scenes.join(separator ? `\n\n${separator}\n\n` : "\n\n"));
  }

  for (const page of book.backMatter) {
    blocks.push([page.title ? `## ${page.title}` : "", page.body].filter(Boolean).join("\n\n"));
  }

  if (bibliography && bibliography.entries.length > 0) {
    const items = bibliography.entries
      .map((entry) => `- ${htmlToInlineMarkdown(entry.html)}`)
      .join("\n");
    blocks.push(`## ${bibliography.heading}\n\n${items}`);
  }

  if (bookFootnotes.all.length > 0) {
    const defs = bookFootnotes.all.map((note) => {
      const label = markdownFootnoteLabel(note, restartPerChapter, book.chapters.length);
      const text = htmlToInlineMarkdown(note.html);
      return text ? `[^${label}]: ${text.replace(/\n/g, "\n    ")}` : `[^${label}]:`;
    });
    blocks.push(defs.join("\n"));
  }

  const markdown = `${blocks.filter(Boolean).join("\n\n")}\n`;
  return {
    blob: new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.markdown.extension}`,
    extension: FORMAT_INFO.markdown.extension,
    formatName: FORMAT_INFO.markdown.formatName
  };
}
