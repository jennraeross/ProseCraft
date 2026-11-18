import {
  type CslDate,
  type CslItem,
  type CslName,
  parseMonthNumber,
  parsePersonName
} from "./csl";

export type BibtexParseResult = {
  items: CslItem[];
  warnings: string[];
};

const BUILTIN_MONTHS: Record<string, string> = {
  jan: "1",
  feb: "2",
  mar: "3",
  apr: "4",
  may: "5",
  jun: "6",
  jul: "7",
  aug: "8",
  sep: "9",
  oct: "10",
  nov: "11",
  dec: "12"
};

const BIBTEX_TYPE_MAP: Record<string, string> = {
  article: "article-journal",
  book: "book",
  mvbook: "book",
  collection: "book",
  mvcollection: "book",
  inbook: "chapter",
  incollection: "chapter",
  bookinbook: "chapter",
  inproceedings: "paper-conference",
  conference: "paper-conference",
  proceedings: "paper-conference",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  thesis: "thesis",
  techreport: "report",
  report: "report",
  online: "webpage",
  electronic: "webpage",
  www: "webpage",
  webpage: "webpage",
  unpublished: "manuscript",
  manuscript: "manuscript",
  dataset: "dataset",
  software: "software",
  misc: "document",
  booklet: "document",
  manual: "document"
};

const PRECOMPOSED_ACCENTS: Record<string, Record<string, string>> = {
  '"': {
    a: "ä", e: "ë", i: "ï", o: "ö", u: "ü", y: "ÿ",
    A: "Ä", E: "Ë", I: "Ï", O: "Ö", U: "Ü", Y: "Ÿ"
  },
  "'": {
    a: "á", c: "ć", e: "é", i: "í", l: "ĺ", n: "ń", o: "ó", r: "ŕ", s: "ś", u: "ú", y: "ý", z: "ź",
    A: "Á", C: "Ć", E: "É", I: "Í", L: "Ĺ", N: "Ń", O: "Ó", R: "Ŕ", S: "Ś", U: "Ú", Y: "Ý", Z: "Ź"
  },
  "`": {
    a: "à", e: "è", i: "ì", o: "ò", u: "ù",
    A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù"
  },
  "^": {
    a: "â", c: "ĉ", e: "ê", g: "ĝ", h: "ĥ", i: "î", j: "ĵ", o: "ô", s: "ŝ", u: "û", w: "ŵ", y: "ŷ",
    A: "Â", C: "Ĉ", E: "Ê", G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", O: "Ô", S: "Ŝ", U: "Û", W: "Ŵ", Y: "Ŷ"
  },
  "~": {
    a: "ã", i: "ĩ", n: "ñ", o: "õ", u: "ũ",
    A: "Ã", I: "Ĩ", N: "Ñ", O: "Õ", U: "Ũ"
  },
  "=": {
    a: "ā", e: "ē", i: "ī", o: "ō", u: "ū",
    A: "Ā", E: "Ē", I: "Ī", O: "Ō", U: "Ū"
  },
  ".": {
    c: "ċ", e: "ė", g: "ġ", z: "ż",
    C: "Ċ", E: "Ė", G: "Ġ", I: "İ", Z: "Ż"
  },
  u: {
    a: "ă", e: "ĕ", g: "ğ", i: "ĭ", o: "ŏ", u: "ŭ",
    A: "Ă", E: "Ĕ", G: "Ğ", I: "Ĭ", O: "Ŏ", U: "Ŭ"
  },
  v: {
    c: "č", d: "ď", e: "ě", l: "ľ", n: "ň", r: "ř", s: "š", t: "ť", z: "ž",
    C: "Č", D: "Ď", E: "Ě", L: "Ľ", N: "Ň", R: "Ř", S: "Š", T: "Ť", Z: "Ž"
  },
  H: {
    o: "ő", u: "ű",
    O: "Ő", U: "Ű"
  },
  c: {
    c: "ç", s: "ş", t: "ţ",
    C: "Ç", S: "Ş", T: "Ţ"
  },
  k: {
    a: "ą", e: "ę", i: "į", u: "ų",
    A: "Ą", E: "Ę", I: "Į", U: "Ų"
  },
  r: {
    a: "å", u: "ů",
    A: "Å", U: "Ů"
  }
};

const COMBINING_ACCENTS: Record<string, string> = {
  '"': "\u0308",
  "'": "\u0301",
  "`": "\u0300",
  "^": "\u0302",
  "~": "\u0303",
  "=": "\u0304",
  ".": "\u0307",
  u: "\u0306",
  v: "\u030C",
  H: "\u030B",
  c: "\u0327",
  k: "\u0328",
  r: "\u030A",
  d: "\u0323",
  b: "\u0331"
};

const SPECIAL_MACROS: Record<string, string> = {
  ss: "ß",
  SS: "ẞ",
  ae: "æ",
  AE: "Æ",
  oe: "œ",
  OE: "Œ",
  aa: "å",
  AA: "Å",
  o: "ø",
  O: "Ø",
  l: "ł",
  L: "Ł",
  dh: "ð",
  DH: "Ð",
  th: "þ",
  TH: "Þ",
  i: "ı",
  j: "ȷ",
  textendash: "–",
  textemdash: "—",
  textquotedblleft: "“",
  textquotedblright: "”",
  textquoteleft: "‘",
  textquoteright: "’",
  textquotesingle: "'",
  textasciitilde: "~",
  textbackslash: "\\",
  ldots: "…",
  dots: "…"
};

const LBRACE_PLACEHOLDER = "\uE001";
const RBRACE_PLACEHOLDER = "\uE002";

function applyAccent(cmd: string, target: string): string {
  const normalizedTarget = target === "\\i" ? "i" : target === "\\j" ? "j" : target;
  const precomposed = PRECOMPOSED_ACCENTS[cmd]?.[normalizedTarget];
  if (precomposed) return precomposed;
  const combining = COMBINING_ACCENTS[cmd];
  if (combining && normalizedTarget.length === 1) {
    return `${normalizedTarget}${combining}`.normalize("NFC");
  }
  return normalizedTarget;
}

/** Converts common LaTeX accents, macros, and protective braces to Unicode text. */
export function decodeLatex(input: string, options: { isPages?: boolean } = {}): string {
  if (!input) return "";
  let text = input
    .replace(/\\\{/g, LBRACE_PLACEHOLDER)
    .replace(/\\\}/g, RBRACE_PLACEHOLDER);

  // Symbol-command accents: {\"u}, \"{u}, \"u, \"{\i}, etc.
  const symbolAccentRe = /\{\\(["'`^~=.])\s*(?:\\([ij])\b|\{?([A-Za-z])\}?)\s*\}|\\(["'`^~=.])\s*(?:\{\s*(?:\\([ij])\b|([A-Za-z]))\s*\}|\\([ij])\b|([A-Za-z]))/g;
  // Letter-command accents: {\v{c}}, {\v c}, \v{c}, \v c, \c{c}, etc.
  const letterAccentRe = /\{\\([uvHckrdb])\s+(?:\\([ij])\b|\{?([A-Za-z])\}?)\s*\}|\{\\([uvHckrdb])\{\s*(?:\\([ij])\b|([A-Za-z]))\s*\}\}|\\([uvHckrdb])\{\s*(?:\\([ij])\b|([A-Za-z]))\s*\}|\\([uvHckrdb])\s+(?:\\([ij])\b|([A-Za-z]))\b/g;

  for (let pass = 0; pass < 3; pass += 1) {
    const next = text
      .replace(
        symbolAccentRe,
        (
          _m,
          c1, i1, l1,
          c2, i2, l2, i3, l3
        ) => {
          const cmd = c1 ?? c2;
          const letter = i1 ?? l1 ?? i2 ?? l2 ?? i3 ?? l3;
          return applyAccent(cmd, letter);
        }
      )
      .replace(
        letterAccentRe,
        (
          _m,
          c1, i1, l1,
          c2, i2, l2,
          c3, i3, l3,
          c4, i4, l4
        ) => {
          const cmd = c1 ?? c2 ?? c3 ?? c4;
          const letter = i1 ?? l1 ?? i2 ?? l2 ?? i3 ?? l3 ?? i4 ?? l4;
          return applyAccent(cmd, letter);
        }
      );
    if (next === text) break;
    text = next;
  }

  // Named LaTeX macros such as {\ss}, \ss{}, \ss , \textemdash, etc.
  text = text.replace(
    /\\(textquotedblleft|textquotedblright|textquoteleft|textquoteright|textquotesingle|textasciitilde|textbackslash|textendash|textemdash|ldots|dots|SS|ss|AE|ae|OE|oe|AA|aa|DH|dh|TH|th|O|o|L|l|i|j)(?:\{\}|\s+|(?![A-Za-z]))/g,
    (_m, name: string) => SPECIAL_MACROS[name] ?? ""
  );

  // Escaped punctuation and ties.
  text = text
    .replace(/\\([&%$_#])/g, "$1")
    .replace(/---/g, "—")
    .replace(/--/g, options.isPages ? "-" : "–")
    .replace(/~/g, " ");

  // Strip protective braces and restore escaped literal braces.
  text = text
    .replace(/[{}]/g, "")
    .replace(new RegExp(LBRACE_PLACEHOLDER, "g"), "{")
    .replace(new RegExp(RBRACE_PLACEHOLDER, "g"), "}")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function decodeRawIdentifier(input: string): string {
  return input
    .trim()
    .replace(/^\{+|\}+$/g, "")
    .replace(/\\([_&#%])/g, "$1")
    .trim();
}

function splitAtDepthZero(input: string, separatorRe: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let lastIndex = 0;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (depth === 0) {
      separatorRe.lastIndex = i;
      const match = separatorRe.exec(input);
      if (match && match.index === i) {
        parts.push(input.slice(lastIndex, i));
        i += match[0].length;
        lastIndex = i;
        continue;
      }
    }
    i += 1;
  }
  parts.push(input.slice(lastIndex));
  return parts;
}

function isSingleOuterBracedGroup(text: string): boolean {
  if (!text.startsWith("{") || !text.endsWith("}")) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && i < text.length - 1) return false;
    }
  }
  return depth === 0;
}

function parseBibtexAuthors(raw: string): CslName[] | undefined {
  const chunks = splitAtDepthZero(raw.trim(), /\s+and\s+/iy)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const names: CslName[] = [];

  for (const chunk of chunks) {
    if (isSingleOuterBracedGroup(chunk)) {
      const literal = decodeLatex(chunk);
      if (literal) names.push({ literal });
      continue;
    }

    const commaParts = splitAtDepthZero(chunk, /,/y);
    if (commaParts.length >= 2) {
      if (commaParts.length >= 3) {
        const family = decodeLatex(commaParts[0]);
        const suffix = decodeLatex(commaParts[1]);
        const given = decodeLatex(commaParts.slice(2).join(", "));
        if (family || given) {
          const entry: CslName = {};
          if (family) entry.family = family;
          if (given) entry.given = given;
          if (suffix) entry.suffix = suffix;
          names.push(entry);
        }
      } else {
        const family = decodeLatex(commaParts[0]);
        const given = decodeLatex(commaParts[1]);
        if (family || given) {
          const entry: CslName = {};
          if (family) entry.family = family;
          if (given) entry.given = given;
          names.push(entry);
        }
      }
      continue;
    }

    const decoded = decodeLatex(chunk);
    const parsed = parsePersonName(decoded);
    if (parsed) names.push(parsed);
  }

  return names.length > 0 ? names : undefined;
}

function parseBibtexIssued(fields: Record<string, string>): CslDate | undefined {
  const rawDate = fields.date ? decodeLatex(fields.date) : "";
  if (rawDate) {
    const isoMatch = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(rawDate.trim());
    if (isoMatch) {
      const parts = [Number.parseInt(isoMatch[1], 10)];
      if (isoMatch[2]) parts.push(Number.parseInt(isoMatch[2], 10));
      if (isoMatch[3]) parts.push(Number.parseInt(isoMatch[3], 10));
      return { "date-parts": [parts] };
    }
  }

  const rawYear = fields.year ? decodeLatex(fields.year) : "";
  const rawMonth = fields.month ? decodeLatex(fields.month) : "";
  if (!rawYear) {
    return rawDate ? { literal: rawDate } : undefined;
  }

  const yearMatch = /^(-?\d{1,4})$/.exec(rawYear.trim());
  if (!yearMatch) {
    return { literal: rawMonth ? `${rawMonth} ${rawYear}` : rawYear };
  }
  const year = Number.parseInt(yearMatch[1], 10);
  const month = rawMonth ? parseMonthNumber(rawMonth) : undefined;
  const parts = month !== undefined ? [year, month] : [year];
  return { "date-parts": [parts] };
}

function splitEntryFields(body: string): string[] {
  const parts: string[] = [];
  let braceDepth = 0;
  let inQuotes = false;
  let start = 0;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "\\" && i + 1 < body.length) {
      i += 1;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (ch === "\"" && braceDepth === 0) {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && braceDepth === 0 && !inQuotes) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts;
}

function findDepthZeroChar(text: string, target: string): number {
  let braceDepth = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      i += 1;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (ch === "\"" && braceDepth === 0) {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === target && braceDepth === 0 && !inQuotes) {
      return i;
    }
  }
  return -1;
}

function evaluateValueExpression(
  expr: string,
  macros: Map<string, string>
): string {
  const tokens: string[] = [];
  let braceDepth = 0;
  let inQuotes = false;
  let start = 0;

  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === "\\" && i + 1 < expr.length) {
      i += 1;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (ch === "\"" && braceDepth === 0) {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "#" && braceDepth === 0 && !inQuotes) {
      tokens.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  tokens.push(expr.slice(start));

  return tokens
    .map((rawToken) => {
      const token = rawToken.trim();
      if (!token) return "";
      if (
        (token.startsWith("{") && token.endsWith("}"))
        || (token.startsWith("\"") && token.endsWith("\""))
      ) {
        return token.slice(1, -1);
      }
      const lower = token.toLowerCase();
      if (macros.has(lower)) return macros.get(lower)!;
      if (Object.hasOwn(BUILTIN_MONTHS, lower)) return BUILTIN_MONTHS[lower];
      return token;
    })
    .join("");
}

function scanEntryDelimiter(
  text: string,
  openIndex: number,
  openChar: "{" | "("
): number {
  const closeChar = openChar === "{" ? "}" : ")";
  const baseBraceDepth = openChar === "{" ? 1 : 0;
  let braceDepth = baseBraceDepth;
  let parenDepth = openChar === "(" ? 1 : 0;
  let inQuotes = false;

  for (let i = openIndex + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      i += 1;
      continue;
    }
    if (ch === "\"" && braceDepth === baseBraceDepth) {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "{") {
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth -= 1;
      if (openChar === "{" && !inQuotes && braceDepth === 0) {
        return i;
      }
      if (braceDepth < 0) braceDepth = 0;
      continue;
    }
    if (openChar === "(" && !inQuotes && braceDepth === 0) {
      if (ch === "(") {
        parenDepth += 1;
      } else if (ch === ")") {
        parenDepth -= 1;
        if (parenDepth === 0) return i;
      }
    }
  }

  return -1;
}

function parseFieldAssignments(
  body: string,
  macros: Map<string, string>,
  contextLabel: string,
  warnings: string[]
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const segment of splitEntryFields(body)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eqIndex = findDepthZeroChar(trimmed, "=");
    if (eqIndex <= 0) {
      warnings.push(`Malformed field in ${contextLabel}: "${trimmed.slice(0, 60)}".`);
      continue;
    }
    const name = trimmed.slice(0, eqIndex).trim().toLowerCase();
    const valueExpr = trimmed.slice(eqIndex + 1).trim();
    if (!/^[a-z0-9_.-]+$/i.test(name)) {
      warnings.push(`Invalid field name "${name}" in ${contextLabel}.`);
      continue;
    }
    fields[name] = evaluateValueExpression(valueExpr, macros);
  }
  return fields;
}

/**
 * Parses BibTeX / BibLaTeX text into CSL-JSON items and non-fatal warnings.
 */
export function parseBibtex(text: string): BibtexParseResult {
  const items: CslItem[] = [];
  const warnings: string[] = [];
  const macros = new Map<string, string>();

  let index = 0;
  while (index < text.length) {
    const atIndex = text.indexOf("@", index);
    if (atIndex === -1) break;

    const headerMatch = /^@([A-Za-z]+)\s*([{(])/.exec(text.slice(atIndex));
    if (!headerMatch) {
      warnings.push(`Malformed BibTeX "@" construct near offset ${atIndex}.`);
      index = atIndex + 1;
      continue;
    }

    const entryType = headerMatch[1].toLowerCase();
    const openChar = headerMatch[2] as "{" | "(";
    const openIndex = atIndex + headerMatch[0].length - 1;
    const closeIndex = scanEntryDelimiter(text, openIndex, openChar);
    if (closeIndex === -1) {
      warnings.push(`Unclosed BibTeX "@${headerMatch[1]}" entry near offset ${atIndex}.`);
      break;
    }

    const body = text.slice(openIndex + 1, closeIndex);
    index = closeIndex + 1;

    if (entryType === "comment" || entryType === "preamble") {
      continue;
    }

    if (entryType === "string") {
      const eqIndex = findDepthZeroChar(body, "=");
      if (eqIndex <= 0) {
        warnings.push("Malformed @string macro definition skipped.");
        continue;
      }
      const key = body.slice(0, eqIndex).trim().toLowerCase();
      const expr = body.slice(eqIndex + 1).trim();
      if (!/^[a-z0-9_.-]+$/i.test(key)) {
        warnings.push(`Invalid @string macro key "${key}" skipped.`);
        continue;
      }
      macros.set(key, evaluateValueExpression(expr, macros));
      continue;
    }

    const commaIndex = findDepthZeroChar(body, ",");
    if (commaIndex === -1) {
      warnings.push(`Malformed BibTeX "@${headerMatch[1]}" entry (missing citekey comma) skipped.`);
      continue;
    }

    const citeKey = body.slice(0, commaIndex).trim();
    if (!citeKey || /\s|[=]/.test(citeKey)) {
      warnings.push(`Malformed BibTeX "@${headerMatch[1]}" entry (invalid citekey) skipped.`);
      continue;
    }

    const fieldsBody = body.slice(commaIndex + 1);
    const fields = parseFieldAssignments(
      fieldsBody,
      macros,
      `@${headerMatch[1]}{${citeKey}}`,
      warnings
    );

    const cslType = Object.hasOwn(BIBTEX_TYPE_MAP, entryType) ? BIBTEX_TYPE_MAP[entryType] : "document";
    const item: CslItem = {
      id: citeKey,
      type: cslType,
      citeKey,
      provider: "import"
    };

    const titleRaw = fields.title ?? (entryType === "book" ? fields.booktitle : undefined);
    if (titleRaw) {
      const title = decodeLatex(titleRaw);
      if (title) item.title = title;
    }

    if (fields.author) {
      const author = parseBibtexAuthors(fields.author);
      if (author) item.author = author;
    }
    if (fields.editor) {
      const editor = parseBibtexAuthors(fields.editor);
      if (editor) item.editor = editor;
    }

    const issued = parseBibtexIssued(fields);
    if (issued) item.issued = issued;

    const containerRaw =
      fields.journal
      ?? fields.journaltitle
      ?? (entryType !== "book" ? fields.booktitle : undefined);
    if (containerRaw) {
      const containerTitle = decodeLatex(containerRaw);
      if (containerTitle) item["container-title"] = containerTitle;
    }

    const publisherRaw = fields.publisher ?? fields.school ?? fields.institution ?? fields.organization;
    if (publisherRaw) {
      const publisher = decodeLatex(publisherRaw);
      if (publisher) item.publisher = publisher;
    }

    const placeRaw = fields.address ?? fields.location;
    if (placeRaw) {
      const place = decodeLatex(placeRaw);
      if (place) item["publisher-place"] = place;
    }

    if (fields.volume) {
      const volume = decodeLatex(fields.volume);
      if (volume) item.volume = volume;
    }
    const issueRaw = fields.issue ?? fields.number;
    if (issueRaw) {
      const issue = decodeLatex(issueRaw);
      if (issue) item.issue = issue;
    }
    if (fields.pages) {
      const page = decodeLatex(fields.pages, { isPages: true }).replace(/\s*[–—-]+\s*/g, "-");
      if (page) item.page = page;
    }
    if (fields.doi) {
      const doi = decodeRawIdentifier(fields.doi);
      if (doi) item.DOI = doi;
    }
    if (fields.url) {
      const url = decodeRawIdentifier(fields.url);
      if (url) item.URL = url;
    }
    if (fields.isbn) {
      const isbn = decodeRawIdentifier(fields.isbn);
      if (isbn) item.ISBN = isbn;
    }
    if (fields.edition) {
      const edition = decodeLatex(fields.edition);
      if (edition) item.edition = edition;
    }
    const langRaw = fields.language ?? fields.langid;
    if (langRaw) {
      const language = decodeLatex(langRaw);
      if (language) item.language = language;
    }
    if (fields.abstract) {
      const abstractFree = decodeLatex(fields.abstract);
      if (abstractFree) item["abstract-free"] = abstractFree;
    }

    items.push(item);
  }

  return { items, warnings };
}
