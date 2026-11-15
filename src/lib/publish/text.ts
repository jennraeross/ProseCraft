import { resolveBookCitations } from "../citations/bibliography";
import { htmlToPlainText } from "./content";
import { resolveBookFootnotes, sceneFootnoteNumberMap, type ResolvedFootnote } from "./footnotes";
import { resolveStyleTokens } from "./presets";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

function formatNotesBlock(notes: ResolvedFootnote[], uppercase: boolean): string {
  const heading = uppercase ? "NOTES" : "Notes";
  const lines = notes.map((note) => {
    const noteText = htmlToPlainText(note.html);
    return noteText ? `[${note.number}] ${noteText}` : `[${note.number}]`;
  });
  return [heading, ...lines].join("\n");
}

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
  const { book: resolvedBook, bibliography } = resolveBookCitations(book, options);
  book = resolvedBook;
  const tokens = resolveStyleTokens(options.style, options.customStyles);
  const blocks: string[] = [];
  const bookFootnotes = resolveBookFootnotes(book, options);
  const restartPerChapter = Boolean(options.footnotesRestartPerChapter);

  if (options.includeTitlePage) {
    blocks.push(book.title);
    if (book.subtitle) blocks.push(book.subtitle);
    if (book.author) blocks.push(`by ${book.author}`);
    if (book.copyright && !options.includeCopyrightPage) blocks.push(book.copyright);
  }
  if (options.includeCopyrightPage && book.copyright) blocks.push(book.copyright);
  if (book.dedication) blocks.push(book.dedication);
  if (options.includeTableOfContents && book.chapters.length > 0) {
    blocks.push([
      tokens.chapterHeadingUppercase ? "CONTENTS" : "Contents",
      ...book.chapters.map((chapter, index) => `${index + 1}. ${chapter.label}`)
    ].join("\n"));
  }
  for (const page of book.frontMatter) {
    blocks.push([page.title, page.body].filter(Boolean).join("\n\n"));
  }

  for (const chapter of book.chapters) {
    if (options.includeChapterTitles) {
      blocks.push(tokens.chapterHeadingUppercase ? chapter.label.toUpperCase() : chapter.label);
    }
    const scenes: string[] = [];
    for (const scene of chapter.scenes) {
      const sceneBlocks: string[] = [];
      if (options.includeSceneTitles) sceneBlocks.push(scene.title);
      const sceneFootnotes = bookFootnotes.byScene.get(scene);
      const sceneText = sceneFootnotes
        ? htmlToPlainText(scene.html, { footnoteNumbers: sceneFootnoteNumberMap(sceneFootnotes) })
        : scene.text;
      sceneBlocks.push(sceneText);
      scenes.push(sceneBlocks.filter(Boolean).join("\n\n"));
    }
    const separator = separatorText(options.sceneSeparator);
    blocks.push(scenes.join(separator ? `\n\n${separator}\n\n` : "\n\n"));
    if (restartPerChapter) {
      const chapterNotes = bookFootnotes.byChapter.get(chapter) ?? [];
      if (chapterNotes.length > 0) {
        blocks.push(formatNotesBlock(chapterNotes, tokens.chapterHeadingUppercase));
      }
    }
  }

  for (const page of book.backMatter) {
    blocks.push([page.title, page.body].filter(Boolean).join("\n\n"));
  }

  if (!restartPerChapter && bookFootnotes.all.length > 0) {
    blocks.push(formatNotesBlock(bookFootnotes.all, tokens.chapterHeadingUppercase));
  }

  if (bibliography && bibliography.entries.length > 0) {
    const heading = tokens.chapterHeadingUppercase
      ? bibliography.heading.toUpperCase()
      : bibliography.heading;
    const lines = bibliography.entries.map((entry) => entry.text);
    blocks.push([heading, ...lines].join("\n"));
  }

  const text = `${blocks.filter(Boolean).join("\n\n")}\n`;
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.text.extension}`,
    extension: FORMAT_INFO.text.extension,
    formatName: FORMAT_INFO.text.formatName
  };
}
