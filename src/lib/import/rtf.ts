/**
 * A small, tolerant RTF reader for running text.
 *
 * Scrivener stores each document as RTF. The importer only needs paragraphs,
 * line breaks and the common character styles, so this reader intentionally
 * ignores layout, tables, images and every other destination it does not know.
 */

type RtfState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  uc: number;
};

const DEFAULT_CODEPAGE = "windows-1252";

function stateCopy(state: RtfState): RtfState {
  return { ...state };
}

function isAsciiLetter(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

function isAsciiDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Converts the running text of an RTF document to a small HTML fragment.
 * Unknown control words are ignored and malformed input never throws.
 */
export function rtfToHtml(rtf: string | Uint8Array): string {
  const bytes = typeof rtf === "string" ? null : rtf;
  const source = typeof rtf === "string" ? rtf : "";

  let codepage = DEFAULT_CODEPAGE;
  let decoder = new TextDecoder(codepage);
  let byteBuffer: number[] = [];
  let codeUnits: number[] = [];
  let skipChars = 0;

  let state: RtfState = { bold: false, italic: false, underline: false, strike: false, uc: 1 };
  const stack: RtfState[] = [];
  let skipDepth = 0;

  const paragraphs: string[] = [];
  let current = "";
  // Tags that should be open according to the current state, and how many of
  // them have actually been written. Both are needed because tags are only
  // emitted once the paragraph has content.
  let openTags: string[] = [];
  let emittedTags = 0;
  let currentHasText = false;

  function desiredTags(): string[] {
    const tags: string[] = [];
    if (state.bold) tags.push("strong");
    if (state.italic) tags.push("em");
    if (state.underline) tags.push("u");
    if (state.strike) tags.push("s");
    return tags;
  }

  function emitOpenTags(): void {
    if (!currentHasText) return;
    for (let index = emittedTags; index < openTags.length; index += 1) {
      current += `<${openTags[index]}>`;
    }
    emittedTags = openTags.length;
  }

  /**
   * Brings the written tags in line with the current style state. Only the
   * part that actually changed is closed or opened, so the HTML stays nested:
   * bold then bold+italic becomes `<strong>a <em>b</em></strong>`, never a
   * second `<strong>` inside the first one.
   */
  function syncTags(): void {
    flushText();
    const desired = desiredTags();
    let keep = 0;
    while (keep < openTags.length && keep < desired.length && openTags[keep] === desired[keep]) keep += 1;
    for (let index = emittedTags - 1; index >= keep; index -= 1) {
      current += `</${openTags[index]}>`;
    }
    if (emittedTags > keep) emittedTags = keep;
    openTags = desired;
    emitOpenTags();
  }

  function appendText(text: string): void {
    if (!text) return;
    currentHasText = true;
    emitOpenTags();
    current += escapeHtml(text);
  }

  function flushBytes(): void {
    if (byteBuffer.length === 0) return;
    const text = decoder.decode(new Uint8Array(byteBuffer));
    byteBuffer = [];
    appendText(text);
  }

  /**
   * Emits the collected UTF-16 code units. `\uN` carries one unit each, so a
   * surrogate pair is only a valid character when the units are joined here
   * rather than converted one by one.
   */
  function flushCodeUnits(): void {
    if (codeUnits.length === 0) return;
    let text = "";
    for (const unit of codeUnits) text += String.fromCharCode(unit);
    codeUnits = [];
    appendText(text);
  }

  function flushText(): void {
    flushBytes();
    flushCodeUnits();
  }

  function appendByte(byte: number): void {
    byteBuffer.push(byte);
  }

  function appendHtml(html: string): void {
    flushText();
    currentHasText = true;
    emitOpenTags();
    current += html;
  }

  function closeTags(): void {
    for (let index = emittedTags - 1; index >= 0; index -= 1) {
      current += `</${openTags[index]}>`;
    }
    emittedTags = 0;
  }

  function endParagraph(): void {
    flushText();
    closeTags();
    paragraphs.push(current);
    current = "";
    currentHasText = false;
    syncTags();
  }

  function setCodepage(next: string): void {
    flushText();
    codepage = next === "65001" ? "utf-8" : `windows-${next}`;
    try {
      decoder = new TextDecoder(codepage);
    } catch {
      codepage = DEFAULT_CODEPAGE;
      decoder = new TextDecoder(codepage);
    }
  }

  function applyControlWord(word: string, parameter: string | null): void {
    const hasParameter = parameter !== null;
    const number = hasParameter ? Number.parseInt(parameter, 10) : null;

    switch (word) {
      case "ansicpg":
        if (number !== null) setCodepage(String(number));
        return;
      case "uc":
        if (number !== null) state.uc = Math.max(number, 0);
        return;
      case "u":
        // Deliberately no flushCodeUnits(): two escapes in a row form one
        // surrogate pair and must stay in the buffer until both have arrived.
        flushBytes();
        if (number !== null && Number.isFinite(number)) {
          const unit = number < 0 ? number + 65536 : number;
          if (unit >= 0 && unit <= 0xffff) codeUnits.push(unit);
        }
        skipChars = state.uc;
        return;
      case "b":
        state.bold = number !== 0;
        syncTags();
        return;
      case "i":
        state.italic = number !== 0;
        syncTags();
        return;
      case "ul":
        state.underline = number !== 0;
        syncTags();
        return;
      case "ulnone":
        state.underline = false;
        syncTags();
        return;
      case "strike":
        state.strike = number !== 0;
        syncTags();
        return;
      case "plain":
        state.bold = false;
        state.italic = false;
        state.underline = false;
        state.strike = false;
        syncTags();
        return;
      case "pard":
        syncTags();
        return;
      case "par":
        endParagraph();
        return;
      case "line":
        appendHtml("<br>");
        return;
      case "tab":
        appendText("\t");
        return;
      default:
        return;
    }
  }

  function processString(): void {
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];

      if (char === "{") {
        if (skipDepth > 0) skipDepth += 1;
        stack.push(stateCopy(state));
        continue;
      }
      if (char === "}") {
        if (skipDepth > 0) {
          skipDepth -= 1;
          // The state pushed by the `{` that started the skipped destination.
          if (skipDepth === 0) stack.pop();
          continue;
        }
        flushText();
        state = stack.pop() ?? state;
        syncTags();
        continue;
      }
      if (skipDepth > 0) continue;

      if (char === "\\") {
        const next = source[index + 1];
        if (next === undefined) break;

        if (next === "'") {
          const hex = source.slice(index + 2, index + 4);
          index += 3;
          if (skipChars > 0) {
            skipChars -= 1;
            continue;
          }
          if (/^[0-9a-fA-F]{2}$/.test(hex)) appendByte(Number.parseInt(hex, 16));
          continue;
        }

        // A control word or symbol is never one of the \ucN replacement
        // characters, so a pending skip run ends here. Without this two
        // escapes written without fallbacks (`\u-10179\u-8704`) would swallow
        // each other.
        skipChars = 0;

        // An escaped line break is a paragraph break, just like `\par`. The
        // CRLF pair counts once and is not emitted as text.
        if (next === "\n" || next === "\r") {
          index += next === "\r" && source[index + 2] === "\n" ? 2 : 1;
          endParagraph();
          continue;
        }

        if (isAsciiLetter(next)) {
          let end = index + 1;
          while (end < source.length && isAsciiLetter(source[end])) end += 1;
          const word = source.slice(index + 1, end);
          let parameter = "";
          if (source[end] === "-") {
            parameter += "-";
            end += 1;
          }
          while (end < source.length && isAsciiDigit(source[end])) {
            parameter += source[end];
            end += 1;
          }
          if (source[end] === " ") end += 1;
          index = end - 1;

          if (word === "fonttbl" || word === "colortbl" || word === "stylesheet"
            || word === "info" || word === "pict" || word === "header"
            || word === "footer" || word === "footnote" || word === "listtable"
            || word === "listoverridetable" || word === "rsidtbl") {
            skipDepth = 1;
            continue;
          }

          applyControlWord(word, parameter === "" ? null : parameter);
          continue;
        }

        index += 1;
        if (next === "*") {
          skipDepth = 1;
          continue;
        }

        switch (next) {
          case "~":
            appendHtml("&nbsp;");
            break;
          case "_":
            appendHtml("&#8209;");
            break;
          case "-":
            break;
          case "{":
          case "}":
          case "\\":
            appendText(next);
            break;
          default:
            break;
        }
        continue;
      }

      // A bare CR or LF is only file layout, never text.
      if (char === "\r" || char === "\n") continue;

      if (skipChars > 0) {
        skipChars -= 1;
        continue;
      }
      flushText();
      appendText(char);
    }
  }

  function processBytes(): void {
    for (let index = 0; index < bytes!.length; index += 1) {
      const byte = bytes![index];

      if (byte === 0x7b) {
        if (skipDepth > 0) skipDepth += 1;
        stack.push(stateCopy(state));
        continue;
      }
      if (byte === 0x7d) {
        if (skipDepth > 0) {
          skipDepth -= 1;
          // The state pushed by the `{` that started the skipped destination.
          if (skipDepth === 0) stack.pop();
          continue;
        }
        flushText();
        state = stack.pop() ?? state;
        syncTags();
        continue;
      }
      if (skipDepth > 0) continue;

      if (byte === 0x5c) {
        if (index + 1 >= bytes!.length) break;
        const next = bytes![index + 1];

        if (next === 0x27) {
          index += 1;
          if (index + 2 >= bytes!.length) break;
          const hex = String.fromCharCode(bytes![index + 1], bytes![index + 2]);
          index += 2;
          if (skipChars > 0) {
            skipChars -= 1;
            continue;
          }
          if (/^[0-9a-fA-F]{2}$/.test(hex)) appendByte(Number.parseInt(hex, 16));
          continue;
        }

        // A control word or symbol is never one of the \ucN replacement
        // characters, so a pending skip run ends here. Without this two
        // escapes written without fallbacks (`\u-10179\u-8704`) would swallow
        // each other.
        skipChars = 0;

        // An escaped line break is a paragraph break, just like `\par`. The
        // CRLF pair counts once and is not emitted as text.
        if (next === 0x0a || next === 0x0d) {
          index += next === 0x0d && bytes![index + 2] === 0x0a ? 2 : 1;
          endParagraph();
          continue;
        }

        if ((next >= 0x41 && next <= 0x5a) || (next >= 0x61 && next <= 0x7a)) {
          let end = index + 1;
          while (end < bytes!.length) {
            const value = bytes![end];
            if (!((value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a))) break;
            end += 1;
          }
          const word = new TextDecoder("latin1").decode(bytes!.subarray(index + 1, end));
          let parameter = "";
          if (bytes![end] === 0x2d) {
            parameter += "-";
            end += 1;
          }
          while (end < bytes!.length && bytes![end] >= 0x30 && bytes![end] <= 0x39) {
            parameter += String.fromCharCode(bytes![end]);
            end += 1;
          }
          if (bytes![end] === 0x20) end += 1;
          index = end - 1;

          if (word === "fonttbl" || word === "colortbl" || word === "stylesheet"
            || word === "info" || word === "pict" || word === "header"
            || word === "footer" || word === "footnote" || word === "listtable"
            || word === "listoverridetable" || word === "rsidtbl") {
            skipDepth = 1;
            continue;
          }

          applyControlWord(word, parameter === "" ? null : parameter);
          continue;
        }

        index += 1;
        if (next === 0x2a) {
          skipDepth = 1;
          continue;
        }

        switch (next) {
          case 0x7e:
            appendHtml("&nbsp;");
            break;
          case 0x5f:
            appendHtml("&#8209;");
            break;
          case 0x2d:
            break;
          case 0x7b:
          case 0x7d:
          case 0x5c:
            appendText(String.fromCharCode(next));
            break;
          default:
            break;
        }
        continue;
      }

      // A bare CR or LF is only file layout, never text.
      if (byte === 0x0d || byte === 0x0a) continue;

      if (skipChars > 0) {
        skipChars -= 1;
        continue;
      }
      flushText();
      appendByte(byte);
    }
  }

  try {
    if (bytes) processBytes();
    else processString();
    flushText();
    closeTags();
    if (currentHasText || current.length > 0) paragraphs.push(current);
  } catch {
    return "<p><br></p>";
  }

  const visible = paragraphs.filter((paragraph) => paragraph.length > 0);
  if (visible.length === 0) return "<p><br></p>";
  return visible.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

export function rtfToPlainText(rtf: string | Uint8Array): string {
  return rtfToHtml(rtf)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8209;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .trim();
}
