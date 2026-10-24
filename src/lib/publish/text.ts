import { PRESETS } from "./presets";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

function separatorText(separator: SceneSeparator): string {
  switch (separator) {
    case "hash":
      return "#";
    case "asterisks":
      return "* * *";
    case "line":
      return "--------";
    case "blank":
      return "";
    default:
      return "";
  }
}

export function exportText(book: CompiledBook, options: PublishOptions): ExportPayload {
  const tokens = PRESETS[options.style];
  const blocks: string[] = [];

  if (options.includeTitlePage) {
    blocks.push(book.title);
    if (book.subtitle) blocks.push(book.subtitle);
    if (book.author) blocks.push(`by ${book.author}`);
    if (book.copyright) blocks.push(book.copyright);
  }
  if (book.dedication) blocks.push(book.dedication);

  for (const chapter of book.chapters) {
    if (options.includeChapterTitles) {
      blocks.push(tokens.chapterHeadingUppercase ? chapter.label.toUpperCase() : chapter.label);
    }
    const scenes: string[] = [];
    for (const scene of chapter.scenes) {
      const sceneBlocks: string[] = [];
      if (options.includeSceneTitles) sceneBlocks.push(scene.title);
      sceneBlocks.push(scene.text);
      scenes.push(sceneBlocks.filter(Boolean).join("\n\n"));
    }
    const separator = separatorText(options.sceneSeparator);
    blocks.push(scenes.join(separator ? `\n\n${separator}\n\n` : "\n\n"));
  }

  const text = `${blocks.filter(Boolean).join("\n\n")}\n`;
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.text.extension}`,
    extension: FORMAT_INFO.text.extension,
    formatName: FORMAT_INFO.text.formatName
  };
}
