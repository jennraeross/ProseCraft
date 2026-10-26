import TurndownService from "turndown";
import { marked } from "marked";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

let service: TurndownService | undefined;

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
  return service;
}

export function htmlToMarkdown(html: string): string {
  return markdownService().turndown(html).trim();
}

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false });
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
