/**
 * Fountain 1.1 parsing and serialization for screenplay documents.
 *
 * The model is structural only: emphasis marks (*italic*, **bold**,
 * ***bold italic***, _underline_) stay verbatim inside `text`, notes become
 * their own elements so no content is lost, and boneyard is dropped.
 */

export type ScreenplayElement = {
  type:
    | "scene-heading"
    | "action"
    | "character"
    | "dialogue"
    | "parenthetical"
    | "transition"
    | "centered"
    | "section"
    | "synopsis"
    | "note"
    | "page-break";
  text: string;
  /** Heading level, one per leading '#'. */
  level?: number;
  /** The character cue starts a dual dialogue block ("^"). */
  dual?: boolean;
  /** The element was written with a forcing marker (".", "!", "@", ">"). */
  forced?: boolean;
  sceneNumber?: string;
};

const TITLE_PAGE_KEYS = new Set([
  "title",
  "credit",
  "author",
  "author(s)",
  "authors",
  "source",
  "notes",
  "draft date",
  "date",
  "contact",
  "copyright",
  "revision"
]);

const TITLE_PAGE_LINE = /^([A-Za-z][A-Za-z ()]*?)\s*:\s*(.*)$/;
const SCENE_HEADING = /^(?:INT\.?\/EXT\.?|I\/E\.?|INT|EXT|EST)(?:\.|\s)/i;
const SCENE_NUMBER = /#([^#]+)#\s*$/;
const SECTION = /^(#{1,6})(?:\s+(.*))?$/;
const PAGE_BREAK = /^={3,}$/;
const PARENTHETICAL = /^\(.*\)$/;

function isTransition(text: string): boolean {
  return /TO:$/.test(text) && text === text.toUpperCase();
}

function isCharacterText(text: string): boolean {
  if (text === "") return false;
  if (SCENE_HEADING.test(text) || isTransition(text)) return false;
  if (/^[#=.>!\[@]/.test(text)) return false;
  const name = text.replace(/\s*\([^)]*\)$/, "");
  return /[A-Z]/.test(name) && !/[a-z]/.test(name);
}

/** Action text needs a "!" when it would otherwise be read as another element. */
function needsActionMarker(text: string): boolean {
  if (text === "") return false;
  if (/^[.!>#=]/.test(text) || text.startsWith("[[")) return true;
  return SCENE_HEADING.test(text) || isTransition(text);
}

function readSceneNumber(text: string): { text: string; sceneNumber?: string } {
  const match = SCENE_NUMBER.exec(text);
  if (match === null) return { text };
  const sceneNumber = match[1].trim();
  if (sceneNumber === "") return { text };
  return { text: text.slice(0, match.index).trimEnd(), sceneNumber };
}

function readCharacterCue(text: string): { text: string; dual: boolean; forced: boolean } | null {
  const forced = text.startsWith("@");
  let cue = forced ? text.slice(1).trim() : text;
  let dual = false;
  if (cue.endsWith("^")) {
    cue = cue.slice(0, -1).trim();
    dual = true;
  }
  if (cue === "") return null;
  if (!forced && !isCharacterText(cue)) return null;
  return { text: cue, dual, forced };
}

/** Inline notes leave their host line, taking only the space that followed them. */
function extractNotes(line: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const text = line.replace(/\[\[([\s\S]*?)\]\] ?/g, (_match, inner: string) => {
    notes.push(inner.trim());
    return "";
  });
  return { text, notes };
}

/** Reads a note that starts a line and may span several lines. `index` points past the first line. */
function readNote(
  lines: string[],
  index: number,
  line: string
): { text: string; rest: string; next: number } {
  const opening = line.indexOf("[[");
  const first = line.slice(opening + 2);
  const closing = first.indexOf("]]");
  if (closing !== -1) {
    return { text: first.slice(0, closing).trim(), rest: first.slice(closing + 2), next: index };
  }
  const parts = [first];
  let next = index;
  while (next < lines.length) {
    const current = lines[next];
    next++;
    const end = current.indexOf("]]");
    if (end !== -1) {
      parts.push(current.slice(0, end));
      return { text: parts.join("\n").trim(), rest: current.slice(end + 2), next };
    }
    parts.push(current);
  }
  return { text: parts.join("\n").trim(), rest: "", next };
}

function readTitlePage(lines: string[]): { title: Record<string, string>; index: number } {
  const title: Record<string, string> = {};
  let index = 0;
  let key: string | null = null;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") break;
    const match = TITLE_PAGE_LINE.exec(line);
    if (match !== null && TITLE_PAGE_KEYS.has(match[1].trim().toLowerCase())) {
      key = match[1].trim();
      title[key] = match[2].trim();
      index++;
      continue;
    }
    // Indented lines continue the value of the previous key.
    if (key === null || !/^\s/.test(line)) break;
    title[key] = `${title[key]}\n${line.trim()}`;
    index++;
  }
  return { title, index };
}

export function parseFountain(source: string): {
  title: Record<string, string>;
  elements: ScreenplayElement[];
} {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "")
    .split("\n");
  const { title, index: bodyStart } = readTitlePage(lines);
  const elements: ScreenplayElement[] = [];
  let index = bodyStart;
  let previousBlank = true;
  let pending: string | null = null;

  while (pending !== null || index < lines.length) {
    let line: string;
    if (pending !== null) {
      line = pending;
      pending = null;
    } else {
      line = lines[index];
      index++;
    }
    const trimmed = line.trim();

    if (trimmed === "") {
      previousBlank = true;
      continue;
    }

    // A note that starts a line may continue over several lines.
    if (trimmed.startsWith("[[")) {
      const note = readNote(lines, index, line);
      elements.push({ type: "note", text: note.text });
      index = note.next;
      const rest = note.rest.trim();
      if (rest !== "") pending = rest;
      continue;
    }

    const inline = extractNotes(line);
    const text = inline.text.trim();
    const notes = inline.notes;

    if (text.startsWith(".") && !text.startsWith("..") && text.length > 1) {
      const numbered = readSceneNumber(text.slice(1).trim());
      const heading: ScreenplayElement = { type: "scene-heading", text: numbered.text, forced: true };
      if (numbered.sceneNumber !== undefined) heading.sceneNumber = numbered.sceneNumber;
      elements.push(heading);
      previousBlank = false;
      continue;
    }

    if (SCENE_HEADING.test(text) && previousBlank) {
      const numbered = readSceneNumber(text);
      const heading: ScreenplayElement = { type: "scene-heading", text: numbered.text };
      if (numbered.sceneNumber !== undefined) heading.sceneNumber = numbered.sceneNumber;
      elements.push(heading);
      previousBlank = false;
      continue;
    }

    if (previousBlank && index < lines.length && lines[index].trim() !== "") {
      const cue = readCharacterCue(text);
      if (cue !== null) {
        const character: ScreenplayElement = { type: "character", text: cue.text };
        if (cue.dual) character.dual = true;
        if (cue.forced) character.forced = true;
        elements.push(character);
        for (const note of notes) elements.push({ type: "note", text: note });
        while (index < lines.length) {
          const raw = lines[index];
          if (raw.trim() === "") break;
          index++;
          const current = extractNotes(raw);
          const dialogue = current.text.trim();
          if (dialogue !== "") {
            elements.push(
              PARENTHETICAL.test(dialogue)
                ? { type: "parenthetical", text: dialogue }
                : { type: "dialogue", text: dialogue }
            );
          }
          for (const note of current.notes) elements.push({ type: "note", text: note });
        }
        previousBlank = false;
        continue;
      }
    }

    let element: ScreenplayElement;

    if (text.startsWith(">") && text.endsWith("<") && text.length > 2) {
      element = { type: "centered", text: text.slice(1, -1).trim() };
    } else if (text.startsWith(">") && text.length > 1) {
      element = { type: "transition", text: text.slice(1).trim(), forced: true };
    } else if (isTransition(text)) {
      element = { type: "transition", text };
    } else if (PAGE_BREAK.test(text)) {
      element = { type: "page-break", text: "" };
    } else if (SECTION.test(text)) {
      const section = SECTION.exec(text) as RegExpExecArray;
      element = { type: "section", text: (section[2] ?? "").trim(), level: section[1].length };
    } else if (text.startsWith("=")) {
      element = { type: "synopsis", text: text.slice(1).trim() };
    } else if (text.startsWith("!") && text.length > 1) {
      element = { type: "action", text: text.slice(1).trim(), forced: true };
    } else {
      element = { type: "action", text };
    }

    elements.push(element);
    for (const note of notes) elements.push({ type: "note", text: note });
    // Sections and synopses belong to the outline, so a following scene heading
    // does not need its own blank line.
    if (element.type !== "section" && element.type !== "synopsis") previousBlank = false;
  }

  return { title, elements };
}

function serializeElement(element: ScreenplayElement): string {
  switch (element.type) {
    case "scene-heading": {
      const marker = element.forced || !SCENE_HEADING.test(element.text) ? "." : "";
      const number = element.sceneNumber === undefined ? "" : ` #${element.sceneNumber}#`;
      return `${marker}${element.text}${number}`;
    }
    case "action":
      return `${element.forced || needsActionMarker(element.text) ? "!" : ""}${element.text}`;
    case "character": {
      const marker = element.forced || !isCharacterText(element.text) ? "@" : "";
      return `${marker}${element.text}${element.dual ? " ^" : ""}`;
    }
    case "dialogue":
      return element.text;
    case "parenthetical":
      return PARENTHETICAL.test(element.text) ? element.text : `(${element.text})`;
    case "transition":
      return `${element.forced || !isTransition(element.text) ? ">" : ""}${element.text}`;
    case "centered":
      return `> ${element.text} <`;
    case "section":
      return `${"#".repeat(element.level ?? 1)}${element.text === "" ? "" : ` ${element.text}`}`;
    case "synopsis":
      return `= ${element.text}`.trimEnd();
    case "note":
      return `[[${element.text}]]`;
    case "page-break":
      return "===";
    default:
      return element.text;
  }
}

export function serializeFountain(title: Record<string, string>, elements: ScreenplayElement[]): string {
  const blocks: string[] = [];
  const titleLines: string[] = [];
  for (const [key, value] of Object.entries(title)) {
    const [first, ...rest] = value.split("\n");
    titleLines.push(`${key}: ${first}`.trimEnd());
    for (const line of rest) titleLines.push(`    ${line}`.trimEnd());
  }
  if (titleLines.length > 0) blocks.push(titleLines.join("\n"));

  // A character cue, its parentheticals and its dialogue form one block: a
  // blank line between them would end the dialogue.
  let block: string[] = [];
  const flush = () => {
    if (block.length > 0) {
      blocks.push(block.join("\n"));
      block = [];
    }
  };
  for (const element of elements) {
    const line = serializeElement(element);
    if (line === "") continue;
    if (element.type === "dialogue" || element.type === "parenthetical") {
      block.push(line);
      continue;
    }
    flush();
    block.push(line);
  }
  flush();

  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}
