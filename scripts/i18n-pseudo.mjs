#!/usr/bin/env node
/**
 * Generate a pseudo-localized catalog for layout and coverage checks.
 *
 *   npm run i18n:pseudo
 *
 * Every literal text run gets accented characters and the message is wrapped in
 * markers. Placeholders, ICU syntax and inline tags are copied verbatim, so the
 * output is still valid. Text that stays plain English in the app is not coming
 * from the catalog and still needs extracting.
 *
 * The generated file is gitignored and only appears in the language picker in
 * development builds.
 */
import fs from "node:fs";

const messagesDir = new URL("../src/lib/i18n/messages/", import.meta.url);
const sourcePath = new URL("en.json", messagesDir);
const targetPath = new URL("en-XA.json", messagesDir);

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const accents = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú",
  y: "ý",
  A: "Á",
  E: "É",
  I: "Í",
  O: "Ó",
  U: "Ú",
  Y: "Ý"
};

const pseudo = {};
for (const [key, message] of Object.entries(source)) {
  pseudo[key] = `[!! ${pseudoLocalize(String(message))} !!]`;
}

fs.writeFileSync(targetPath, `${JSON.stringify(pseudo, null, 2)}\n`);
console.log(`Wrote ${pseudoKeys()} keys to src/lib/i18n/messages/en-XA.json`);

function pseudoLocalize(message) {
  let output = "";
  let index = 0;
  while (index < message.length) {
    const char = message[index];

    if (char === "{") {
      const close = findClosingBrace(message, index);
      if (close !== -1) {
        output += pseudoExpression(message.slice(index + 1, close));
        index = close + 1;
        continue;
      }
    }

    if (char === "<") {
      const tag = /^<\/?(?:strong|em|code|kbd)>/i.exec(message.slice(index));
      if (tag) {
        output += tag[0];
        index += tag[0].length;
        continue;
      }
    }

    output += accents[char] ?? char;
    index += 1;
  }
  return output;
}

/** Keep placeholders intact, but localize the literal branches inside plurals. */
function pseudoExpression(expression) {
  const parts = splitTopLevel(expression);
  const name = (parts[0] ?? "").trim();
  const kind = (parts[1] ?? "").trim();

  if ((kind === "plural" || kind === "select") && parts.length > 2) {
    const options = parseOptions(parts.slice(2).join(","));
    if (options.length > 0) {
      const rebuilt = options
        .map(([selector, body]) => `${selector} {${pseudoLocalize(body)}}`)
        .join(" ");
      return `{${name}, ${kind}, ${rebuilt}}`;
    }
  }

  return `{${expression}}`;
}

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseOptions(text) {
  const options = [];
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
    if (index >= text.length) break;

    const selectorStart = index;
    while (index < text.length && !/[\s{]/.test(text[index] ?? "")) index += 1;
    const selector = text.slice(selectorStart, index);
    while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
    if (text[index] !== "{") break;

    const close = findClosingBrace(text, index);
    if (close === -1) break;
    options.push([selector, text.slice(index + 1, close)]);
    index = close + 1;
  }
  return options;
}

function findClosingBrace(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function pseudoKeys() {
  return Object.keys(pseudo).length;
}
