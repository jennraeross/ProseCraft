/**
 * Pure TypeScript citation and bibliography formatter for the eight built-in
 * styles (`apa7`, `chicago-author-date`, `chicago-notes`, `mla9`, `harvard`,
 * `ieee`, `vancouver`, `din1505`) in English (`en`) and German (`de`).
 */

import type { CslItem, CslName } from "./csl";
import {
  LOCALE_TERMS,
  getStyleTemplate,
  type BibliographyNameTemplate,
  type CitationLocale,
  type CitationStyleId,
  type LocaleTerms,
  type NameFormatMode,
  type StyleTemplate
} from "./styles";

export type CitationItemInput = {
  item: CslItem;
  locator?: string;
  label?: "page" | "chapter" | "section";
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
};

export type CitationFormatContext = {
  /** 1-based citation index for numeric styles (`ieee`, `vancouver`). */
  index?: number;
  /** Optional per-item 1-based indices for multi-item numeric citations. */
  indices?: Record<string, number>;
  locale: CitationLocale;
  /** Optional precomputed year disambiguation suffixes (`{ [itemId]: "a" }`). */
  yearSuffixes?: Record<string, string>;
  /** Optional library list used to compute year disambiguation suffixes. */
  library?: CslItem[];
};

export type FormattedCitation = {
  text: string;
  html: string;
};

export type FormattedBibliographyEntry = {
  id: string;
  text: string;
  html: string;
};

type Span = {
  italic: boolean;
  text: string;
};

class SpanBuilder {
  private readonly spans: Span[] = [];

  push(text: string): this {
    if (!text) return this;
    const prev = this.spans[this.spans.length - 1];
    if (prev && !prev.italic) {
      prev.text += text;
    } else {
      this.spans.push({ italic: false, text });
    }
    return this;
  }

  pushItalic(text: string): this {
    if (!text) return this;
    const prev = this.spans[this.spans.length - 1];
    if (prev && prev.italic) {
      prev.text += text;
    } else {
      this.spans.push({ italic: true, text });
    }
    return this;
  }

  pushSpans(spans: readonly Span[]): this {
    for (const span of spans) {
      if (span.italic) {
        this.pushItalic(span.text);
      } else {
        this.push(span.text);
      }
    }
    return this;
  }

  isEmpty(): boolean {
    return this.spans.length === 0 || this.spans.every((span) => span.text.length === 0);
  }

  rawText(): string {
    return this.spans.map((span) => span.text).join("");
  }

  endsWithPunctuation(): boolean {
    const raw = this.rawText().trimEnd();
    return /[.!?]["']?$/.test(raw);
  }

  ensurePeriod(): this {
    if (this.isEmpty()) return this;
    if (!this.endsWithPunctuation()) {
      this.push(".");
    }
    return this;
  }

  getSpans(): Span[] {
    return this.spans;
  }

  build(): FormattedCitation {
    const raw = this.rawText();
    const cleanedText = raw.replace(/\s{2,}/g, " ").trim();
    const html = this.spans
      .map((span) => {
        const escaped = escapeHtml(span.text);
        return span.italic ? `<i>${escaped}</i>` : escaped;
      })
      .join("")
      .replace(/\s{2,}/g, " ")
      .trim();
    return { text: cleanedText, html };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFamilyWithParticle(name: CslName): string {
  const parts = [name["non-dropping-particle"], name.family].filter(Boolean);
  return parts.join(" ");
}

function getInTextName(name: CslName): string {
  return getFamilyWithParticle(name) || name.literal || name.given || "";
}

function firstCharUpper(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  const first = Array.from(trimmed)[0] ?? "";
  return first.toUpperCase();
}

function formatInitials(given: string | undefined, withDots: boolean): string {
  if (!given) return "";
  const tokens = given.trim().split(/\s+/).filter(Boolean);
  const formatted: string[] = [];

  for (const token of tokens) {
    if (token.includes("-")) {
      const subParts = token
        .split("-")
        .map((part) => firstCharUpper(part))
        .filter(Boolean);
      if (subParts.length > 0) {
        formatted.push(withDots ? subParts.map((ch) => `${ch}.`).join("-") : subParts.join(""));
      }
    } else {
      const initial = firstCharUpper(token);
      if (initial) {
        formatted.push(withDots ? `${initial}.` : initial);
      }
    }
  }

  return withDots ? formatted.join(" ") : formatted.join("");
}

function formatSingleName(name: CslName, mode: NameFormatMode): string {
  if (name.literal && !name.family && !name.given) {
    return name.literal;
  }
  const family = getFamilyWithParticle(name);
  if (!family && name.literal) return name.literal;

  const given = name.given ?? "";
  const dropping = name["dropping-particle"] ?? "";
  const givenWithDropping = [given, dropping].filter(Boolean).join(" ");

  switch (mode) {
    case "family-given": {
      const parts = [family, givenWithDropping, name.suffix].filter(Boolean);
      return parts.join(", ");
    }
    case "given-family": {
      const core = [given, dropping, family].filter(Boolean).join(" ");
      return name.suffix ? `${core}, ${name.suffix}` : core;
    }
    case "family-initials-dots": {
      const initials = formatInitials(given, true);
      const parts = [family, initials, name.suffix].filter(Boolean);
      return parts.join(", ");
    }
    case "initials-family": {
      const initials = formatInitials(given, true);
      const core = [initials, dropping, family].filter(Boolean).join(" ");
      return name.suffix ? `${core}, ${name.suffix}` : core;
    }
    case "family-initials-compact": {
      const initials = formatInitials(given, false);
      const core = [family, initials].filter(Boolean).join(" ");
      return name.suffix ? `${core} ${name.suffix}` : core;
    }
  }
}

function formatInTextAuthors(
  names: readonly CslName[],
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale
): string {
  if (names.length === 0) return "";
  const { inText } = template;
  if (names.length >= inText.etAlThreshold) {
    return `${getInTextName(names[0])} ${terms.etAl}`;
  }
  if (names.length === 1) {
    return getInTextName(names[0]);
  }
  const conj = inText.useAmpersand ? "&" : terms.and;
  if (names.length === 2) {
    return `${getInTextName(names[0])} ${conj} ${getInTextName(names[1])}`;
  }
  const useOxford = template.bibliography.names.oxfordComma && locale === "en";
  const allButLast = names.slice(0, -1).map(getInTextName).join(", ");
  const last = getInTextName(names[names.length - 1]);
  return `${allButLast}${useOxford ? "," : ""} ${conj} ${last}`;
}

function formatNoteAuthors(
  names: readonly CslName[],
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale
): string {
  if (names.length === 0) return "";
  if (names.length >= template.inText.etAlThreshold) {
    return `${formatSingleName(names[0], "given-family")} ${terms.etAl}`;
  }
  const formatted = names.map((name) => formatSingleName(name, "given-family"));
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} ${terms.and} ${formatted[1]}`;
  const useOxford = locale === "en";
  return `${formatted.slice(0, -1).join(", ")}${useOxford ? "," : ""} ${terms.and} ${formatted[formatted.length - 1]}`;
}

function formatEditorSuffix(
  count: number,
  kind: BibliographyNameTemplate["primaryEditorSuffix"],
  terms: LocaleTerms
): string {
  const plural = count > 1;
  switch (kind) {
    case "paren-cap":
      return ` ${plural ? terms.editorParenPlural : terms.editorParenSingular}`;
    case "paren-lower":
      return ` ${plural ? terms.editorParenLowerPlural : terms.editorParenLowerSingular}`;
    case "comma-ed":
      return `, ${plural ? terms.editorAbbrevPlural : terms.editorAbbrevSingular}`;
    case "comma-editor":
      return `, ${plural ? terms.editorFullPlural : terms.editorFullSingular}`;
  }
}

function formatBibNameList(
  names: readonly CslName[],
  nameTpl: BibliographyNameTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  isEditorRole = false
): string {
  if (names.length === 0) return "";

  let rendered: string;
  if (names.length >= nameTpl.etAlThreshold) {
    if (nameTpl.etAlEllipsisBeforeLast) {
      const head = names
        .slice(0, nameTpl.etAlKeep)
        .map((name, idx) =>
          formatSingleName(name, idx === 0 ? nameTpl.firstAuthor : nameTpl.otherAuthors)
        )
        .join(nameTpl.separator);
      const last = formatSingleName(names[names.length - 1], nameTpl.otherAuthors);
      rendered = `${head}, ... ${last}`;
    } else {
      const kept = names
        .slice(0, nameTpl.etAlKeep)
        .map((name, idx) =>
          formatSingleName(name, idx === 0 ? nameTpl.firstAuthor : nameTpl.otherAuthors)
        )
        .join(nameTpl.separator);
      const commaBeforeEtAl = Boolean(nameTpl.commaBeforeEtAl);
      rendered = `${kept}${commaBeforeEtAl ? ", " : " "}${terms.etAl}`;
    }
  } else if (names.length === 1) {
    rendered = formatSingleName(names[0], nameTpl.firstAuthor);
  } else {
    const formatted = names.map((name, idx) =>
      formatSingleName(name, idx === 0 ? nameTpl.firstAuthor : nameTpl.otherAuthors)
    );
    if (nameTpl.lastSeparator === "comma") {
      rendered = formatted.join(", ");
    } else if (nameTpl.lastSeparator === "semicolon") {
      rendered = formatted.join(nameTpl.separator);
    } else if (nameTpl.lastSeparator === "ampersand") {
      const head = formatted.slice(0, -1).join(nameTpl.separator);
      rendered = `${head}, & ${formatted[formatted.length - 1]}`;
    } else {
      if (formatted.length === 2) {
        const commaTwo = nameTpl.firstAuthor === "family-given";
        rendered = `${formatted[0]}${commaTwo ? "," : ""} ${terms.and} ${formatted[1]}`;
      } else {
        const useOxford = nameTpl.oxfordComma && locale === "en";
        const head = formatted.slice(0, -1).join(nameTpl.separator);
        rendered = `${head}${useOxford ? "," : ""} ${terms.and} ${formatted[formatted.length - 1]}`;
      }
    }
  }

  if (isEditorRole) {
    rendered += formatEditorSuffix(names.length, nameTpl.primaryEditorSuffix, terms);
  }
  return rendered;
}

function formatContainerEditors(
  editors: readonly CslName[],
  mode: BibliographyNameTemplate["containerEditorMode"],
  terms: LocaleTerms,
  locale: CitationLocale
): string {
  if (editors.length === 0) return "";
  const plural = editors.length > 1;
  const joinAnd = (list: string[], ox = locale === "en"): string => {
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} ${terms.and} ${list[1]}`;
    return `${list.slice(0, -1).join(", ")}${ox ? "," : ""} ${terms.and} ${list[list.length - 1]}`;
  };

  switch (mode) {
    case "initials-ed-paren": {
      const list = editors.map((ed) => formatSingleName(ed, "initials-family"));
      const joined =
        list.length === 2
          ? `${list[0]} & ${list[1]}`
          : list.length > 2
            ? `${list.slice(0, -1).join(", ")}, & ${list[list.length - 1]}`
            : list[0];
      const suffix = plural ? terms.editorParenPlural : terms.editorParenSingular;
      return `${joined} ${suffix}`;
    }
    case "edited-by": {
      const list = editors.map((ed) => formatSingleName(ed, "given-family"));
      return `${terms.editedBy} ${joinAnd(list)}`;
    }
    case "ed-abbrev": {
      const list = editors.map((ed) => formatSingleName(ed, "given-family"));
      return `${terms.noteEdAbbrev} ${joinAnd(list)}`;
    }
    case "family-initials-ed-paren": {
      const list = editors.map((ed) => formatSingleName(ed, "family-initials-dots"));
      const suffix = plural ? terms.editorParenLowerPlural : terms.editorParenLowerSingular;
      return `${joinAnd(list, false)} ${suffix}`;
    }
    case "initials-ed-cap": {
      const list = editors.map((ed) => formatSingleName(ed, "initials-family"));
      const suffix = plural ? terms.editorParenPlural.slice(1, -1) : terms.editorParenSingular.slice(1, -1);
      // IEEE uses "Ed." / "Eds." in EN and "Hrsg." in DE
      const ieeeLabel = locale === "en" ? (plural ? "Eds." : "Ed.") : suffix;
      return `${joinAnd(list)}, ${ieeeLabel}`;
    }
    case "compact-editor": {
      const list = editors.map((ed) => formatSingleName(ed, "family-initials-compact"));
      const suffix = plural ? terms.editorFullPlural : terms.editorFullSingular;
      return `${list.join(", ")}, ${suffix}`;
    }
    case "family-given-hrsg-paren": {
      const list = editors.map((ed) => formatSingleName(ed, "family-given"));
      const suffix = plural ? terms.editorParenPlural : terms.editorParenSingular;
      return `${list.join(" ; ")} ${suffix}`;
    }
  }
}

function extractYear(item: CslItem): string | undefined {
  const firstPart = item.issued?.["date-parts"]?.[0]?.[0];
  if (firstPart !== undefined && String(firstPart).trim()) {
    return String(firstPart).trim();
  }
  const raw = item.issued?.literal ?? item.issued?.raw;
  if (raw) {
    const match = /\b(\d{4})\b/.exec(raw);
    return match ? match[1] : raw.trim();
  }
  return undefined;
}

function formatYear(item: CslItem, terms: LocaleTerms, yearSuffix?: string): string {
  const year = extractYear(item);
  if (year) {
    return yearSuffix ? `${year}${yearSuffix}` : year;
  }
  return yearSuffix ? `${terms.noDate}-${yearSuffix}` : terms.noDate;
}

function isRangeValue(value: string): boolean {
  return /\d\s*[-–—,]\s*\d/.test(value);
}

function formatPageRange(value: string): string {
  return value.replace(/(\d[A-Za-z]?)\s*-{1,2}\s*(?=[A-Za-z]?\d)/g, "$1\u2013");
}

function formatPageLabel(page: string, terms: LocaleTerms): string {
  const normalized = formatPageRange(page.trim());
  return `${isRangeValue(normalized) ? terms.pagePlural : terms.pageSingle} ${normalized}`;
}

function formatLocator(
  locator: string,
  label: "page" | "chapter" | "section",
  omitPageLabel: boolean,
  terms: LocaleTerms
): string {
  const trimmed = formatPageRange(locator.trim());
  if (!trimmed) return "";
  if (label === "page") {
    return omitPageLabel ? trimmed : formatPageLabel(trimmed, terms);
  }
  if (label === "chapter") {
    return `${terms.chapter} ${trimmed}`;
  }
  return `${terms.section} ${trimmed}`;
}

function ordinalEn(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatEdition(
  raw: string | undefined,
  terms: LocaleTerms,
  locale: CitationLocale,
  harvardStyle = false
): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const num = Number.parseInt(trimmed, 10);
    if (locale === "de") return `${num}. ${terms.editionSuffix}`;
    return `${ordinalEn(num)} ${harvardStyle ? terms.editionSuffixHarvard : terms.editionSuffix}`;
  }
  return trimmed;
}

function normalizeDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function formatDoiOrUrl(
  item: CslItem,
  doiFormat: "url" | "doi-lower" | "doi-upper"
): string | undefined {
  if (item.DOI) {
    const bare = normalizeDoi(item.DOI);
    if (bare) {
      if (doiFormat === "doi-lower") return `doi: ${bare}`;
      if (doiFormat === "doi-upper") return `DOI: ${bare}`;
      return `https://doi.org/${bare}`;
    }
  }
  return item.URL;
}

function normalizeItemType(rawType: string):
  | "book"
  | "article-journal"
  | "chapter"
  | "paper-conference"
  | "webpage"
  | "report"
  | "thesis" {
  const lower = rawType.toLowerCase();
  if (lower === "article-journal" || lower === "article-magazine" || lower === "article-newspaper" || lower === "article") {
    return "article-journal";
  }
  if (lower === "chapter" || lower === "entry-encyclopedia" || lower === "entry-dictionary") {
    return "chapter";
  }
  if (lower === "paper-conference") return "paper-conference";
  if (lower === "webpage" || lower === "post-weblog" || lower === "post") return "webpage";
  if (lower === "report" || lower === "manuscript") return "report";
  if (lower === "thesis") return "thesis";
  return "book";
}

function isStandaloneItalicType(type: ReturnType<typeof normalizeItemType>): boolean {
  return type === "book" || type === "report" || type === "thesis" || type === "webpage";
}

function appendQuoted(
  sb: SpanBuilder,
  text: string,
  trailingPunct: "" | "." | ",",
  inside: boolean,
  quote = '"'
): void {
  const trimmed = text.trim();
  const endsTerminal = /[.!?]$/.test(trimmed);
  const effectivePunct = endsTerminal && trailingPunct === "." ? "" : trailingPunct;
  if (inside) {
    sb.push(`${quote}${trimmed}${effectivePunct}${quote}`);
  } else {
    sb.push(`${quote}${trimmed}${quote}${effectivePunct}`);
  }
}

function formatPlacePublisher(
  item: CslItem,
  colonSpacing: "tight" | "spaced" | "publisher-only"
): string | undefined {
  const place = item["publisher-place"]?.trim();
  const pub = item.publisher?.trim();
  if (colonSpacing === "publisher-only") {
    return pub || place || undefined;
  }
  if (place && pub) {
    return colonSpacing === "spaced" ? `${place} : ${pub}` : `${place}: ${pub}`;
  }
  return pub || place || undefined;
}

function getPrimaryContributors(item: CslItem): {
  names: CslName[];
  isEditor: boolean;
} {
  if (item.author && item.author.length > 0) {
    return { names: item.author, isEditor: false };
  }
  if (item.editor && item.editor.length > 0) {
    return { names: item.editor, isEditor: true };
  }
  return { names: [], isEditor: false };
}

function getSortKey(item: CslItem, template: StyleTemplate, terms: LocaleTerms, locale: CitationLocale): string {
  const { names } = getPrimaryContributors(item);
  if (names.length > 0) {
    return formatBibNameList(names, template.bibliography.names, terms, locale, false);
  }
  return item.title ?? "";
}

function compareStrings(a: string, b: string): number {
  const base = a.localeCompare(b, undefined, { sensitivity: "base" });
  return base !== 0 ? base : a.localeCompare(b);
}

function sortBibliographyItems(
  items: readonly CslItem[],
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale
): CslItem[] {
  const unique: CslItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      unique.push(item);
    }
  }
  if (template.bibliography.sort === "citation-order") {
    return unique;
  }
  return unique.sort((a, b) => {
    const keyDiff = compareStrings(
      getSortKey(a, template, terms, locale),
      getSortKey(b, template, terms, locale)
    );
    if (keyDiff !== 0) return keyDiff;

    const yearA = extractYear(a) ?? "";
    const yearB = extractYear(b) ?? "";
    if (yearA !== yearB) {
      if (!yearA) return -1;
      if (!yearB) return 1;
      const yearDiff = compareStrings(yearA, yearB);
      if (yearDiff !== 0) return yearDiff;
    }

    const titleDiff = compareStrings(a.title ?? "", b.title ?? "");
    if (titleDiff !== 0) return titleDiff;

    return compareStrings(a.id, b.id);
  });
}

function indexToSuffix(index: number): string {
  // 0 -> "a", 25 -> "z", 26 -> "aa"
  let n = index;
  let result = "";
  do {
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/**
 * Computes disambiguation suffixes (`"a"`, `"b"`, ...) for items sharing the
 * same in-text author label and publication year in author-date styles.
 */
export function computeDisambiguation(
  style: CitationStyleId,
  items: readonly CslItem[],
  locale: CitationLocale = "en"
): Record<string, string> {
  const template = getStyleTemplate(style);
  // No prototype, so an item id such as "constructor" finds nothing inherited.
  const suffixes: Record<string, string> = Object.create(null);
  if (!template.inText.disambiguateYear) {
    return suffixes;
  }
  const terms = LOCALE_TERMS[locale];
  const sorted = sortBibliographyItems(items, template, terms, locale);
  const groups = new Map<string, CslItem[]>();

  for (const item of sorted) {
    const { names } = getPrimaryContributors(item);
    const authorKey =
      names.length > 0
        ? formatInTextAuthors(names, template, terms, locale)
        : (item.title ?? item.id);
    const yearKey = extractYear(item) ?? terms.noDate;
    const groupKey = `${authorKey.toLowerCase()}||${yearKey.toLowerCase()}`;
    const bucket = groups.get(groupKey);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }

  for (const bucket of groups.values()) {
    if (bucket.length <= 1) continue;
    bucket.forEach((item, idx) => {
      suffixes[item.id] = indexToSuffix(idx);
    });
  }
  return suffixes;
}

function appendInTextTitle(
  sb: SpanBuilder,
  item: CslItem,
  template: StyleTemplate
): void {
  const title = item.title?.trim() || item.id;
  const kind = normalizeItemType(item.type);
  if (isStandaloneItalicType(kind) && template.inText.italicizeStandaloneTitle) {
    sb.pushItalic(title);
  } else if (kind === "article-journal" || kind === "chapter" || kind === "paper-conference") {
    sb.push(`"${title}"`);
  } else {
    sb.push(title);
  }
}

function formatChicagoNoteItem(
  entry: CitationItemInput,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale
): Span[] {
  const { item, locator, label = "page", prefix, suffix, suppressAuthor } = entry;
  const sb = new SpanBuilder();
  if (prefix) {
    sb.push(prefix.endsWith(" ") ? prefix : `${prefix} `);
  }

  const kind = normalizeItemType(item.type);
  const { names, isEditor } = getPrimaryContributors(item);
  const year = formatYear(item, terms);
  const title = item.title?.trim() ?? "";

  if (!suppressAuthor && names.length > 0) {
    let authorStr = formatNoteAuthors(names, template, terms, locale);
    if (isEditor) {
      authorStr += `, ${names.length > 1 ? terms.editorAbbrevPlural : terms.editorAbbrevSingular}`;
    }
    sb.push(`${authorStr}, `);
  }

  if (kind === "article-journal") {
    if (title) {
      appendQuoted(sb, title, ",", terms.quotePunctuationInside);
      sb.push(" ");
    }
    if (item["container-title"]) {
      sb.pushItalic(item["container-title"]);
    }
    const volIssueParts: string[] = [];
    if (item.volume) volIssueParts.push(item.volume);
    if (item.issue) volIssueParts.push(`${terms.issueWord} ${item.issue}`);
    if (volIssueParts.length > 0) {
      sb.push(` ${volIssueParts.join(", ")}`);
    }
    sb.push(` (${year})`);

    if (locator) {
      if (label === "page") {
        sb.push(`: ${formatPageRange(locator.trim())}`);
      } else {
        if (item.page) sb.push(`: ${formatPageRange(item.page.trim())}`);
        sb.push(`, ${formatLocator(locator, label, true, terms)}`);
      }
    } else if (item.page) {
      sb.push(`: ${formatPageRange(item.page.trim())}`);
    }

    const link = formatDoiOrUrl(item, "url");
    if (link) {
      sb.push(`, ${link}`);
    }
  } else if (kind === "chapter" || kind === "paper-conference") {
    if (title) {
      appendQuoted(sb, title, ",", terms.quotePunctuationInside);
      sb.push(" ");
    }
    if (item["container-title"]) {
      sb.push(`${terms.inWord.toLowerCase()} `);
      sb.pushItalic(item["container-title"]);
    }
    if (item.editor && item.editor.length > 0 && !isEditor) {
      sb.push(`, ${formatContainerEditors(item.editor, "ed-abbrev", terms, locale)}`);
    }
    const pubBlock = formatPlacePublisher(item, "tight");
    const parenContent = [pubBlock, year].filter(Boolean).join(", ");
    if (parenContent) {
      sb.push(` (${parenContent})`);
    }
    if (locator) {
      sb.push(`, ${formatLocator(locator, label, true, terms)}`);
    } else if (item.page) {
      sb.push(`, ${formatPageRange(item.page.trim())}`);
    }
    const link = formatDoiOrUrl(item, "url");
    if (link) {
      sb.push(`, ${link}`);
    }
  } else if (kind === "webpage") {
    if (title) {
      appendQuoted(sb, title, ",", terms.quotePunctuationInside);
    }
    if (item["container-title"]) {
      sb.push(` ${item["container-title"]}`);
    }
    sb.push(`, ${year}`);
    if (locator) {
      sb.push(`, ${formatLocator(locator, label, true, terms)}`);
    }
    const link = formatDoiOrUrl(item, "url");
    if (link) {
      sb.push(`, ${link}`);
    }
  } else if (kind === "thesis") {
    if (title) {
      appendQuoted(sb, title, "", terms.quotePunctuationInside);
    }
    const parenParts = [terms.thesisPhdShort, item.publisher, year].filter(Boolean);
    if (parenParts.length > 0) {
      sb.push(` (${parenParts.join(", ")})`);
    }
    if (locator) {
      sb.push(`, ${formatLocator(locator, label, true, terms)}`);
    }
  } else {
    // book or report
    if (title) {
      sb.pushItalic(title);
    }
    const edition = formatEdition(item.edition, terms, locale);
    if (edition) {
      sb.push(`, ${edition}`);
    }
    const pubBlock = formatPlacePublisher(item, "tight");
    const parenContent = [pubBlock, year].filter(Boolean).join(", ");
    if (parenContent) {
      sb.push(` (${parenContent})`);
    }
    if (locator) {
      sb.push(`, ${formatLocator(locator, label, true, terms)}`);
    }
    const link = formatDoiOrUrl(item, "url");
    if (link) {
      sb.push(`, ${link}`);
    }
  }

  if (suffix) {
    const trimmed = suffix.trim();
    if (trimmed) {
      sb.push(/^[.,;:!?\])]/.test(trimmed) ? trimmed : ` ${trimmed}`);
    }
  }

  return sb.getSpans();
}

/**
 * Formats an in-text citation (or footnote citation for `"note"` styles).
 */
export function formatCitation(
  style: CitationStyleId,
  items: readonly CitationItemInput[],
  context: CitationFormatContext
): FormattedCitation {
  if (items.length === 0) {
    return { text: "", html: "" };
  }

  const template = getStyleTemplate(style);
  const terms = LOCALE_TERMS[context.locale];
  const { inText } = template;

  if (inText.mode === "note") {
    const sb = new SpanBuilder();
    items.forEach((entry, idx) => {
      if (idx > 0) sb.push(inText.itemSeparator);
      sb.pushSpans(formatChicagoNoteItem(entry, template, terms, context.locale));
    });
    sb.ensurePeriod();
    return sb.build();
  }

  if (inText.mode === "numeric") {
    const baseIndex = context.index ?? 1;
    const sb = new SpanBuilder();
    sb.push(inText.openDelimiter);
    items.forEach((entry, idx) => {
      if (idx > 0) sb.push(inText.itemSeparator);
      if (entry.prefix) {
        sb.push(entry.prefix.endsWith(" ") ? entry.prefix : `${entry.prefix} `);
      }
      const num = context.indices?.[entry.item.id] ?? baseIndex + idx;
      sb.push(String(num));
      if (entry.locator) {
        const loc = formatLocator(
          entry.locator,
          entry.label ?? "page",
          inText.omitPageLabel,
          terms
        );
        if (loc) sb.push(`${inText.locatorPrefix}${loc}`);
      }
      if (entry.suffix) {
        const trimmed = entry.suffix.trim();
        if (trimmed) {
          sb.push(/^[.,;:!?\])]/.test(trimmed) ? trimmed : ` ${trimmed}`);
        }
      }
    });
    sb.push(inText.closeDelimiter);
    return sb.build();
  }

  // author-year or author-page
  const suffixes =
    context.yearSuffixes ??
    (context.library
      ? computeDisambiguation(style, context.library, context.locale)
      : computeDisambiguation(
          style,
          items.map((entry) => entry.item),
          context.locale
        ));

  const sb = new SpanBuilder();
  sb.push(inText.openDelimiter);

  items.forEach((entry, idx) => {
    if (idx > 0) sb.push(inText.itemSeparator);
    const { item, locator, label = "page", prefix, suffix, suppressAuthor } = entry;
    if (prefix) {
      sb.push(prefix.endsWith(" ") ? prefix : `${prefix} `);
    }

    const { names } = getPrimaryContributors(item);
    const hasAuthor = names.length > 0;
    let hasLead = false;

    if (!suppressAuthor) {
      if (hasAuthor) {
        sb.push(formatInTextAuthors(names, template, terms, context.locale));
        hasLead = true;
      } else if (item.title) {
        appendInTextTitle(sb, item, template);
        hasLead = true;
      }
    }

    if (inText.mode === "author-year") {
      const yearText = formatYear(item, terms, suffixes[item.id]);
      if (hasLead) {
        sb.push(`${inText.authorYearSeparator}${yearText}`);
      } else {
        sb.push(yearText);
      }
    } else if (inText.mode === "author-page") {
      if (!hasLead && !locator && item.title) {
        appendInTextTitle(sb, item, template);
      }
    }

    if (locator) {
      const loc = formatLocator(locator, label, inText.omitPageLabel, terms);
      if (loc) {
        const needsPrefix = inText.mode === "author-year" || hasLead;
        sb.push(`${needsPrefix ? inText.locatorPrefix : ""}${loc}`);
      }
    }

    if (suffix) {
      const trimmed = suffix.trim();
      if (trimmed) {
        sb.push(/^[.,;:!?\])]/.test(trimmed) ? trimmed : ` ${trimmed}`);
      }
    }
  });

  sb.push(inText.closeDelimiter);
  return sb.build();
}

function appendPrimaryBlock(
  sb: SpanBuilder,
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  opts: {
    authorSuffix: string;
    titleAsAuthorWhenMissing: boolean;
    titleItalic: boolean;
    titleQuoted?: boolean;
  }
): { usedTitleAsAuthor: boolean } {
  const { names, isEditor } = getPrimaryContributors(item);
  if (names.length > 0) {
    const formatted = formatBibNameList(
      names,
      template.bibliography.names,
      terms,
      locale,
      isEditor
    );
    sb.push(formatted);
    if (opts.authorSuffix && !formatted.endsWith(opts.authorSuffix)) {
      sb.push(opts.authorSuffix);
    }
    return { usedTitleAsAuthor: false };
  }

  if (opts.titleAsAuthorWhenMissing && item.title) {
    if (opts.titleItalic) {
      sb.pushItalic(item.title);
      if (opts.authorSuffix) sb.push(opts.authorSuffix);
    } else if (opts.titleQuoted) {
      appendQuoted(sb, item.title, ".", terms.quotePunctuationInside);
    } else {
      sb.push(item.title);
      if (opts.authorSuffix) sb.push(opts.authorSuffix);
    }
    return { usedTitleAsAuthor: true };
  }

  return { usedTitleAsAuthor: false };
}

function formatApaEntry(
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  yearSuffix: string | undefined
): Span[] {
  const sb = new SpanBuilder();
  const kind = normalizeItemType(item.type);
  const year = formatYear(item, terms, yearSuffix);
  const titleItalic = isStandaloneItalicType(kind);

  const { usedTitleAsAuthor } = appendPrimaryBlock(sb, item, template, terms, locale, {
    authorSuffix: ".",
    titleAsAuthorWhenMissing: true,
    titleItalic
  });

  if (!sb.isEmpty()) sb.push(" ");
  sb.push(`(${year}).`);

  const title = item.title?.trim();
  const edition = formatEdition(item.edition, terms, locale);

  if (!usedTitleAsAuthor && title) {
    sb.push(" ");
    if (titleItalic) {
      sb.pushItalic(title);
      if (edition) sb.push(` (${edition})`);
      if (kind === "thesis") {
        const thesisBracket = [terms.thesisPhd, item.publisher].filter(Boolean).join(", ");
        sb.push(` [${thesisBracket}]`);
      }
      sb.ensurePeriod();
    } else {
      sb.push(title);
      sb.ensurePeriod();
    }
  } else if (usedTitleAsAuthor && titleItalic && edition) {
    sb.push(` (${edition}).`);
  }

  if (kind === "article-journal") {
    const containerParts: SpanBuilder = new SpanBuilder();
    if (item["container-title"]) {
      containerParts.pushItalic(item["container-title"]);
    }
    if (item.volume) {
      if (!containerParts.isEmpty()) containerParts.push(", ");
      containerParts.pushItalic(item.volume);
      if (item.issue) containerParts.push(`(${item.issue})`);
    } else if (item.issue) {
      if (!containerParts.isEmpty()) containerParts.push(", ");
      containerParts.push(`(${item.issue})`);
    }
    if (item.page) {
      if (!containerParts.isEmpty()) containerParts.push(", ");
      containerParts.push(formatPageRange(item.page.trim()));
    }
    if (!containerParts.isEmpty()) {
      sb.push(" ");
      sb.pushSpans(containerParts.getSpans());
      sb.ensurePeriod();
    }
  } else if (kind === "chapter" || kind === "paper-conference") {
    const inParts: SpanBuilder = new SpanBuilder();
    inParts.push(`${terms.inWord} `);
    if (item.editor && item.editor.length > 0) {
      inParts.push(
        `${formatContainerEditors(item.editor, template.bibliography.names.containerEditorMode, terms, locale)}, `
      );
    }
    if (item["container-title"]) {
      inParts.pushItalic(item["container-title"]);
    }
    const parenBits = [edition, item.page ? formatPageLabel(item.page, terms) : undefined].filter(Boolean);
    if (parenBits.length > 0) {
      inParts.push(` (${parenBits.join(", ")})`);
    }
    sb.push(" ");
    sb.pushSpans(inParts.getSpans());
    sb.ensurePeriod();
    const pub = formatPlacePublisher(item, "publisher-only");
    if (pub) {
      sb.push(` ${pub}.`);
    }
  } else if (kind === "webpage") {
    if (item["container-title"]) {
      sb.push(` ${item["container-title"]}.`);
    }
  } else if (kind !== "thesis") {
    const pub = formatPlacePublisher(item, "publisher-only");
    if (pub) {
      sb.push(` ${pub}.`);
    }
  }

  const link = formatDoiOrUrl(item, "url");
  if (link) {
    sb.push(` ${link}`);
  }

  return sb.getSpans();
}

function formatChicagoEntry(
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  yearSuffix: string | undefined,
  authorDateMode: boolean
): Span[] {
  const sb = new SpanBuilder();
  const kind = normalizeItemType(item.type);
  const year = formatYear(item, terms, authorDateMode ? yearSuffix : undefined);
  const titleItalic = kind === "book" || kind === "report";
  const title = item.title?.trim();

  const { usedTitleAsAuthor } = appendPrimaryBlock(sb, item, template, terms, locale, {
    authorSuffix: ".",
    titleAsAuthorWhenMissing: true,
    titleItalic,
    titleQuoted: !titleItalic
  });

  if (authorDateMode) {
    if (!sb.isEmpty()) sb.push(" ");
    sb.push(`${year}.`);
  }

  if (!usedTitleAsAuthor && title) {
    sb.push(" ");
    if (titleItalic) {
      sb.pushItalic(title);
      sb.ensurePeriod();
    } else {
      appendQuoted(sb, title, ".", terms.quotePunctuationInside);
    }
  }

  const edition = formatEdition(item.edition, terms, locale);

  if (kind === "article-journal") {
    if (item["container-title"]) {
      sb.push(" ");
      sb.pushItalic(item["container-title"]);
    }
    if (authorDateMode) {
      const volIssue = item.volume
        ? item.issue
          ? `${item.volume} (${item.issue})`
          : item.volume
        : item.issue
          ? `(${item.issue})`
          : "";
      if (volIssue) sb.push(` ${volIssue}`);
      if (item.page) sb.push(`: ${formatPageRange(item.page.trim())}`);
      sb.ensurePeriod();
    } else {
      const volIssue = [
        item.volume ?? undefined,
        item.issue ? `${terms.issueWord} ${item.issue}` : undefined
      ]
        .filter(Boolean)
        .join(", ");
      if (volIssue) sb.push(` ${volIssue}`);
      sb.push(` (${year})`);
      if (item.page) sb.push(`: ${formatPageRange(item.page.trim())}`);
      sb.ensurePeriod();
    }
  } else if (kind === "chapter" || kind === "paper-conference") {
    if (item["container-title"]) {
      sb.push(` ${terms.inWord} `);
      sb.pushItalic(item["container-title"]);
    }
    if (item.editor && item.editor.length > 0) {
      sb.push(`, ${formatContainerEditors(item.editor, template.bibliography.names.containerEditorMode, terms, locale)}`);
    }
    if (item.page) {
      sb.push(`, ${formatPageRange(item.page.trim())}`);
    }
    sb.ensurePeriod();
    const pub = formatPlacePublisher(item, "tight");
    if (authorDateMode) {
      if (pub) sb.push(` ${pub}.`);
    } else {
      const pubYear = [pub, year].filter(Boolean).join(", ");
      if (pubYear) sb.push(` ${pubYear}.`);
    }
  } else if (kind === "webpage") {
    const siteParts = [item["container-title"], authorDateMode ? undefined : year].filter(Boolean);
    if (siteParts.length > 0) {
      sb.push(` ${siteParts.join(", ")}.`);
    }
  } else if (kind === "thesis") {
    const parts = [terms.thesisPhdShort, item.publisher, authorDateMode ? undefined : year].filter(Boolean);
    if (parts.length > 0) {
      sb.push(` ${parts.join(", ")}.`);
    }
  } else {
    if (edition) {
      sb.push(` ${edition}`);
      sb.ensurePeriod();
    }
    const pub = formatPlacePublisher(item, "tight");
    if (authorDateMode) {
      if (pub) sb.push(` ${pub}.`);
    } else {
      const pubYear = [pub, year].filter(Boolean).join(", ");
      if (pubYear) sb.push(` ${pubYear}.`);
    }
  }

  const link = formatDoiOrUrl(item, "url");
  if (link) {
    sb.push(` ${link}.`);
  }

  return sb.getSpans();
}

function formatMlaEntry(
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale
): Span[] {
  const sb = new SpanBuilder();
  const kind = normalizeItemType(item.type);
  const year = extractYear(item);
  const titleItalic = isStandaloneItalicType(kind) && kind !== "webpage";
  const title = item.title?.trim();

  const { usedTitleAsAuthor } = appendPrimaryBlock(sb, item, template, terms, locale, {
    authorSuffix: ".",
    titleAsAuthorWhenMissing: true,
    titleItalic,
    titleQuoted: !titleItalic
  });

  if (!usedTitleAsAuthor && title) {
    if (!sb.isEmpty()) sb.push(" ");
    if (titleItalic) {
      sb.pushItalic(title);
      sb.ensurePeriod();
    } else {
      appendQuoted(sb, title, ".", terms.quotePunctuationInside);
    }
  }

  const edition = formatEdition(item.edition, terms, locale);
  const link = formatDoiOrUrl(item, "url");

  if (kind === "article-journal") {
    const tail = new SpanBuilder();
    if (item["container-title"]) tail.pushItalic(item["container-title"]);
    if (item.volume) tail.push(`, ${terms.volumeWord} ${item.volume}`);
    if (item.issue) tail.push(`, ${terms.issueWord} ${item.issue}`);
    if (year) tail.push(`, ${year}`);
    if (item.page) tail.push(`, ${formatPageLabel(item.page, terms)}`);
    if (link) tail.push(`, ${link}`);
    if (!tail.isEmpty()) {
      if (!sb.isEmpty()) sb.push(" ");
      sb.pushSpans(tail.getSpans());
      sb.ensurePeriod();
    }
  } else if (kind === "chapter" || kind === "paper-conference") {
    const tail = new SpanBuilder();
    if (item["container-title"]) tail.pushItalic(item["container-title"]);
    if (item.editor && item.editor.length > 0) {
      tail.push(`, ${formatContainerEditors(item.editor, template.bibliography.names.containerEditorMode, terms, locale)}`);
    }
    if (edition) tail.push(`, ${edition}`);
    if (item.publisher) tail.push(`, ${item.publisher}`);
    if (year) tail.push(`, ${year}`);
    if (item.page) tail.push(`, ${formatPageLabel(item.page, terms)}`);
    if (link) tail.push(`, ${link}`);
    if (!tail.isEmpty()) {
      if (!sb.isEmpty()) sb.push(" ");
      sb.pushSpans(tail.getSpans());
      sb.ensurePeriod();
    }
  } else if (kind === "webpage") {
    const tail = new SpanBuilder();
    if (item["container-title"]) tail.pushItalic(item["container-title"]);
    if (year) tail.push(tail.isEmpty() ? year : `, ${year}`);
    if (link) tail.push(tail.isEmpty() ? link : `, ${link}`);
    if (!tail.isEmpty()) {
      if (!sb.isEmpty()) sb.push(" ");
      sb.pushSpans(tail.getSpans());
      sb.ensurePeriod();
    }
  } else if (kind === "thesis") {
    const parts = [year, [item.publisher, terms.thesisPhd].filter(Boolean).join(", ")].filter(Boolean);
    if (parts.length > 0) {
      sb.push(` ${parts.join(". ")}.`);
    }
  } else {
    const parts = [edition, item.publisher, year ?? terms.noDate, link].filter(Boolean);
    if (parts.length > 0) {
      sb.push(` ${parts.join(", ")}.`);
    }
  }

  return sb.getSpans();
}

function formatHarvardEntry(
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  yearSuffix: string | undefined
): Span[] {
  const sb = new SpanBuilder();
  const kind = normalizeItemType(item.type);
  const year = formatYear(item, terms, yearSuffix);
  const titleItalic = isStandaloneItalicType(kind);
  const title = item.title?.trim();

  const { usedTitleAsAuthor } = appendPrimaryBlock(sb, item, template, terms, locale, {
    authorSuffix: "",
    titleAsAuthorWhenMissing: true,
    titleItalic
  });

  if (!sb.isEmpty()) sb.push(" ");
  sb.push(`(${year})`);

  const edition = formatEdition(item.edition, terms, locale, true);

  if (!usedTitleAsAuthor && title) {
    sb.push(" ");
    if (titleItalic) {
      sb.pushItalic(title);
      sb.ensurePeriod();
    } else {
      appendQuoted(sb, title, ",", false, "'");
    }
  }

  if (kind === "article-journal") {
    const parts = new SpanBuilder();
    if (item["container-title"]) parts.pushItalic(item["container-title"]);
    const volIssue = item.volume
      ? item.issue
        ? `${item.volume}(${item.issue})`
        : item.volume
      : item.issue
        ? `(${item.issue})`
        : "";
    if (volIssue) parts.push(`, ${volIssue}`);
    if (item.page) parts.push(`, ${formatPageLabel(item.page, terms)}`);
    if (!parts.isEmpty()) {
      sb.push(" ");
      sb.pushSpans(parts.getSpans());
      sb.ensurePeriod();
    }
  } else if (kind === "chapter" || kind === "paper-conference") {
    sb.push(` ${terms.inWord.toLowerCase()} `);
    if (item.editor && item.editor.length > 0) {
      sb.push(`${formatContainerEditors(item.editor, template.bibliography.names.containerEditorMode, terms, locale)} `);
    }
    if (item["container-title"]) {
      sb.pushItalic(item["container-title"]);
      sb.ensurePeriod();
    }
    const pub = formatPlacePublisher(item, "tight");
    const tail = [pub, item.page ? formatPageLabel(item.page, terms) : undefined].filter(Boolean).join(", ");
    if (tail) sb.push(` ${tail}.`);
  } else if (kind === "webpage") {
    if (item["container-title"]) {
      sb.push(` ${item["container-title"]}.`);
    }
  } else if (kind === "thesis") {
    const parts = [terms.thesisPhdHarvard, item.publisher].filter(Boolean);
    if (parts.length > 0) sb.push(` ${parts.join(". ")}.`);
  } else {
    if (edition) {
      sb.push(` ${edition}`);
      sb.ensurePeriod();
    }
    const pub = formatPlacePublisher(item, "tight");
    if (pub) sb.push(` ${pub}.`);
  }

  const link = formatDoiOrUrl(item, "url");
  if (link) {
    sb.push(` ${terms.availableAt} ${link}.`);
  }

  return sb.getSpans();
}

function formatIeeeEntry(
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  index: number
): Span[] {
  const sb = new SpanBuilder();
  sb.push(`[${index}] `);
  const kind = normalizeItemType(item.type);
  const year = formatYear(item, terms);
  const title = item.title?.trim();

  const { names, isEditor } = getPrimaryContributors(item);
  if (names.length > 0) {
    sb.push(formatBibNameList(names, template.bibliography.names, terms, locale, isEditor));
    sb.push(", ");
  }

  const edition = formatEdition(item.edition, terms, locale);
  const doiStr = formatDoiOrUrl(item, "doi-lower");

  if (kind === "article-journal") {
    if (title) {
      appendQuoted(sb, title, ",", terms.quotePunctuationInside);
      sb.push(" ");
    }
    if (item["container-title"]) {
      sb.pushItalic(item["container-title"]);
    }
    if (item.volume) sb.push(`, ${terms.volumeWord} ${item.volume}`);
    if (item.issue) sb.push(`, ${terms.issueWord} ${item.issue}`);
    if (item.page) sb.push(`, ${formatPageLabel(item.page, terms)}`);
    sb.push(`, ${year}`);
    if (doiStr && item.DOI) sb.push(`, ${doiStr}`);
    sb.ensurePeriod();
    if (!item.DOI && item.URL) {
      sb.push(` ${terms.onlineAvailable} ${item.URL}`);
    }
  } else if (kind === "chapter" || kind === "paper-conference") {
    if (title) {
      appendQuoted(sb, title, ",", terms.quotePunctuationInside);
      sb.push(" ");
    }
    if (item["container-title"]) {
      sb.push(`${terms.inWord.toLowerCase()} `);
      sb.pushItalic(item["container-title"]);
    }
    if (item.editor && item.editor.length > 0) {
      sb.push(`, ${formatContainerEditors(item.editor, template.bibliography.names.containerEditorMode, terms, locale)}`);
    }
    const pub = formatPlacePublisher(item, "tight");
    if (pub) {
      sb.ensurePeriod();
      sb.push(` ${pub}`);
    } else if (item.editor && item.editor.length > 0) {
      sb.ensurePeriod();
    }
    sb.push(`, ${year}`);
    if (item.page) sb.push(`, ${formatPageLabel(item.page, terms)}`);
    if (doiStr && item.DOI) sb.push(`, ${doiStr}`);
    sb.ensurePeriod();
  } else if (kind === "webpage") {
    if (title) {
      appendQuoted(sb, title, ",", terms.quotePunctuationInside);
    }
    if (item["container-title"]) sb.push(` ${item["container-title"]},`);
    sb.push(` ${year}.`);
    if (item.URL) sb.push(` ${terms.onlineAvailable} ${item.URL}`);
  } else if (kind === "thesis") {
    if (title) {
      appendQuoted(sb, title, ",", terms.quotePunctuationInside);
    }
    const tail = [terms.thesisPhdIeee, item.publisher, item["publisher-place"], year].filter(Boolean);
    if (tail.length > 0) sb.push(` ${tail.join(", ")}.`);
  } else {
    if (title) {
      sb.pushItalic(title);
    }
    if (edition) sb.push(`, ${edition}`);
    const pub = formatPlacePublisher(item, "tight");
    if (pub) {
      sb.ensurePeriod();
      sb.push(` ${pub}`);
    }
    sb.push(`, ${year}.`);
    if (doiStr && item.DOI) {
      sb.push(` ${doiStr}.`);
    } else if (item.URL) {
      sb.push(` ${terms.onlineAvailable} ${item.URL}`);
    }
  }

  return sb.getSpans();
}

function formatVancouverEntry(
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  index: number
): Span[] {
  const sb = new SpanBuilder();
  sb.push(`${index}. `);
  const kind = normalizeItemType(item.type);
  const year = formatYear(item, terms);
  const title = item.title?.trim();

  const { names, isEditor } = getPrimaryContributors(item);
  if (names.length > 0) {
    sb.push(formatBibNameList(names, template.bibliography.names, terms, locale, isEditor));
    sb.ensurePeriod();
    sb.push(" ");
  }

  const edition = formatEdition(item.edition, terms, locale);
  const doiStr = item.DOI ? formatDoiOrUrl(item, "doi-lower") : undefined;

  if (kind === "article-journal") {
    if (title) {
      sb.push(title);
      sb.ensurePeriod();
      sb.push(" ");
    }
    if (item["container-title"]) {
      sb.push(`${item["container-title"]}. `);
    }
    let meta = year;
    if (item.volume) {
      meta += `;${item.volume}`;
      if (item.issue) meta += `(${item.issue})`;
    } else if (item.issue) {
      meta += `;(${item.issue})`;
    }
    if (item.page) meta += `:${formatPageRange(item.page.trim())}`;
    sb.push(`${meta}.`);
    if (doiStr) sb.push(` ${doiStr}.`);
    else if (item.URL) sb.push(` ${terms.availableFrom} ${item.URL}`);
  } else if (kind === "chapter" || kind === "paper-conference") {
    if (title) {
      sb.push(title);
      sb.ensurePeriod();
      sb.push(" ");
    }
    sb.push(`${terms.inWord}: `);
    if (item.editor && item.editor.length > 0) {
      sb.push(`${formatContainerEditors(item.editor, template.bibliography.names.containerEditorMode, terms, locale)}. `);
    }
    if (item["container-title"]) {
      sb.push(`${item["container-title"]}. `);
    }
    const pub = formatPlacePublisher(item, "tight");
    if (pub) sb.push(`${pub}; `);
    sb.push(`${year}.`);
    if (item.page) sb.push(` ${terms.pageSingle} ${formatPageRange(item.page.trim())}.`);
    if (doiStr) sb.push(` ${doiStr}.`);
  } else if (kind === "webpage") {
    if (title) sb.push(`${title} [Internet]. `);
    if (item["container-title"]) sb.push(`${item["container-title"]}; `);
    sb.push(`${year}.`);
    if (item.URL) sb.push(` ${terms.availableFrom} ${item.URL}`);
  } else if (kind === "thesis") {
    if (title) sb.push(`${title} ${terms.thesisVancouver}. `);
    if (item.publisher) sb.push(`${item.publisher}; `);
    sb.push(`${year}.`);
  } else {
    if (title) {
      sb.push(title);
      sb.ensurePeriod();
    }
    if (edition) {
      sb.push(` ${edition}`);
      sb.ensurePeriod();
    }
    const pub = formatPlacePublisher(item, "tight");
    if (pub) sb.push(` ${pub}; ${year}.`);
    else sb.push(` ${year}.`);
    if (doiStr) sb.push(` ${doiStr}.`);
  }

  return sb.getSpans();
}

function formatDin1505Entry(
  item: CslItem,
  template: StyleTemplate,
  terms: LocaleTerms,
  locale: CitationLocale,
  yearSuffix: string | undefined
): Span[] {
  const sb = new SpanBuilder();
  const kind = normalizeItemType(item.type);
  const year = formatYear(item, terms, yearSuffix);
  const titleItalic = isStandaloneItalicType(kind);
  const title = item.title?.trim();

  const { usedTitleAsAuthor } = appendPrimaryBlock(sb, item, template, terms, locale, {
    authorSuffix: ":",
    titleAsAuthorWhenMissing: true,
    titleItalic
  });

  if (!usedTitleAsAuthor && title) {
    if (!sb.isEmpty()) sb.push(" ");
    if (titleItalic) {
      sb.pushItalic(title);
    } else {
      sb.push(title);
    }
    sb.ensurePeriod();
  }

  const edition = formatEdition(item.edition, terms, locale);
  const doiStr = item.DOI ? formatDoiOrUrl(item, "doi-upper") : undefined;

  if (kind === "article-journal") {
    sb.push(` ${terms.inWord}: `);
    if (item["container-title"]) sb.pushItalic(item["container-title"]);
    if (item.volume) sb.push(` ${terms.volumeCap} ${item.volume}`);
    sb.push(` (${year})`);
    if (item.issue) sb.push(`, ${terms.issueCap} ${item.issue}`);
    if (item.page) sb.push(`, ${formatPageLabel(item.page, terms)}`);
    sb.ensurePeriod();
    if (doiStr) sb.push(` ${doiStr}.`);
    else if (item.URL) sb.push(` URL: ${item.URL}.`);
  } else if (kind === "chapter" || kind === "paper-conference") {
    sb.push(` ${terms.inWord}: `);
    if (item.editor && item.editor.length > 0) {
      sb.push(`${formatContainerEditors(item.editor, template.bibliography.names.containerEditorMode, terms, locale)}: `);
    }
    if (item["container-title"]) {
      sb.pushItalic(item["container-title"]);
      sb.ensurePeriod();
    }
    if (edition) {
      sb.push(` ${edition}`);
      sb.ensurePeriod();
    }
    const pub = formatPlacePublisher(item, "spaced");
    const pubYear = [pub, year].filter(Boolean).join(", ");
    const tail = [pubYear, item.page ? formatPageLabel(item.page, terms) : undefined].filter(Boolean).join(", ");
    if (tail) sb.push(` ${tail}.`);
    if (doiStr) sb.push(` ${doiStr}.`);
  } else if (kind === "webpage") {
    if (item["container-title"]) sb.push(` ${item["container-title"]},`);
    if (item.URL) sb.push(` URL: ${item.URL}`);
    sb.push(` (${year}).`);
  } else if (kind === "thesis") {
    const parts = [item.publisher, terms.thesisDin, year].filter(Boolean);
    if (parts.length > 0) sb.push(` ${parts.join(", ")}.`);
  } else {
    if (edition) {
      sb.push(` ${edition}`);
      sb.ensurePeriod();
    }
    const pub = formatPlacePublisher(item, "spaced");
    const pubYear = [pub, year].filter(Boolean).join(", ");
    if (pubYear) sb.push(` ${pubYear}.`);
    if (doiStr) sb.push(` ${doiStr}.`);
    else if (item.URL) sb.push(` URL: ${item.URL}.`);
  }

  return sb.getSpans();
}

/**
 * Formats a bibliography / reference list for the given items, sorted and
 * disambiguated according to the selected citation style.
 */
export function formatBibliography(
  style: CitationStyleId,
  items: readonly CslItem[],
  locale: CitationLocale = "en"
): FormattedBibliographyEntry[] {
  if (items.length === 0) return [];
  const template = getStyleTemplate(style);
  const terms = LOCALE_TERMS[locale];
  const sorted = sortBibliographyItems(items, template, terms, locale);
  const disambiguation = computeDisambiguation(style, sorted, locale);

  return sorted.map((item, idx) => {
    const sb = new SpanBuilder();
    const index = idx + 1;
    const yearSuffix = disambiguation[item.id];
    let spans: Span[];

    switch (template.bibliography.layout) {
      case "apa":
        spans = formatApaEntry(item, template, terms, locale, yearSuffix);
        break;
      case "chicago-ad":
        spans = formatChicagoEntry(item, template, terms, locale, yearSuffix, true);
        break;
      case "chicago-nb":
        spans = formatChicagoEntry(item, template, terms, locale, yearSuffix, false);
        break;
      case "mla":
        spans = formatMlaEntry(item, template, terms, locale);
        break;
      case "harvard":
        spans = formatHarvardEntry(item, template, terms, locale, yearSuffix);
        break;
      case "ieee":
        spans = formatIeeeEntry(item, template, terms, locale, index);
        break;
      case "vancouver":
        spans = formatVancouverEntry(item, template, terms, locale, index);
        break;
      case "din1505":
        spans = formatDin1505Entry(item, template, terms, locale, yearSuffix);
        break;
    }

    sb.pushSpans(spans);
    const built = sb.build();
    return { id: item.id, ...built };
  });
}
