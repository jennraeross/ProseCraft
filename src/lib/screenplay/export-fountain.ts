import type { CompiledBook, DocumentData } from "../publish/types";
import { serializeFountain, type ScreenplayElement } from "./fountain";
import { htmlToElements } from "./layout";

/** Title page fields for the whole project, written above the script. */
function projectTitlePage(book: CompiledBook): Record<string, string> {
  const page: Record<string, string> = { Title: book.title };
  if (book.author.trim() !== "") {
    page.Credit = "Written by";
    page.Author = book.author;
  }
  return page;
}

/** Script elements of every screenplay document, in chapter order. */
export function bookToElements(book: CompiledBook): ScreenplayElement[] {
  const elements: ScreenplayElement[] = [];
  for (const chapter of book.chapters) {
    for (const scene of chapter.scenes) elements.push(...htmlToElements(scene.html));
  }
  return elements;
}

/** A single document as Fountain, without a title page. */
export function documentToFountain(document: DocumentData): string {
  return serializeFountain({}, htmlToElements(document.content));
}

/** Every screenplay document of a project as one Fountain file. */
export function bookToFountain(book: CompiledBook): string {
  return serializeFountain(projectTitlePage(book), bookToElements(book));
}
