import {
  type CslDate,
  type CslItem,
  type CslName,
  parseMonthNumber,
  parsePersonName
} from "./csl";

export type RisParseResult = {
  items: CslItem[];
  warnings: string[];
};

const RIS_TAG_RE = /^([A-Z0-9]{2})\s{1,2}-(?:\s(.*))?$/;

const RIS_TYPE_MAP: Record<string, string> = {
  BOOK: "book",
  WHOLE: "book",
  EDBOOK: "book",
  JOUR: "article-journal",
  JFULL: "article-journal",
  EJOUR: "article-journal",
  MGZN: "article-magazine",
  NEWS: "article-newspaper",
  CHAP: "chapter",
  SECT: "chapter",
  CONF: "paper-conference",
  CPAPER: "paper-conference",
  THES: "thesis",
  RPRT: "report",
  ELEC: "webpage",
  WEB: "webpage",
  ENCYC: "entry-encyclopedia",
  DICT: "entry-dictionary",
  MANSCPT: "manuscript",
  UNPB: "manuscript",
  DATA: "dataset",
  COMP: "software",
  GEN: "document",
  MISC: "document",
  STD: "document",
  PAT: "patent"
};

function parseRisDate(raw: string): CslDate | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const segments = trimmed.split(/[/-]/);
  if (/^\d{4}$/.test(segments[0] ?? "")) {
    const year = Number.parseInt(segments[0], 10);
    const parts: number[] = [year];
    const rawMonth = (segments[1] ?? "").trim();
    const month = rawMonth ? parseMonthNumber(rawMonth) : undefined;
    if (month !== undefined) {
      parts.push(month);
      const rawDay = (segments[2] ?? "").trim();
      if (/^\d{1,2}$/.test(rawDay)) {
        const day = Number.parseInt(rawDay, 10);
        if (day >= 1 && day <= 31) parts.push(day);
      }
    }
    return { "date-parts": [parts] };
  }

  return { literal: trimmed };
}

function chooseBestRisDate(candidates: string[]): CslDate | undefined {
  let best: CslDate | undefined;
  let bestScore = -1;
  for (const raw of candidates) {
    const parsed = parseRisDate(raw);
    if (!parsed) continue;
    const score = parsed["date-parts"]?.[0]?.length ?? 0;
    if (score > bestScore) {
      best = parsed;
      bestScore = score;
    }
  }
  return best;
}

type RisRecordDraft = {
  startLine: number;
  risType: string;
  tags: Array<{ tag: string; value: string }>;
};

function recordToCslItem(
  draft: RisRecordDraft
): { item: CslItem } | { error: string } {
  const normalizedType = draft.risType.trim().toUpperCase();
  if (!normalizedType) {
    return { error: `RIS record at line ${draft.startLine} has an empty TY tag.` };
  }
  const cslType = RIS_TYPE_MAP[normalizedType] ?? "document";

  const authors: CslName[] = [];
  const editors: CslName[] = [];
  const dateCandidates: string[] = [];
  let title: string | undefined;
  let t1: string | undefined;
  let t2: string | undefined;
  let jo: string | undefined;
  let jf: string | undefined;
  let volume: string | undefined;
  let issue: string | undefined;
  let sp: string | undefined;
  let ep: string | undefined;
  let publisher: string | undefined;
  let publisherPlace: string | undefined;
  let doi: string | undefined;
  let url: string | undefined;
  let isbn: string | undefined;
  let id: string | undefined;
  let language: string | undefined;
  let edition: string | undefined;
  let abstractFree: string | undefined;

  for (const { tag, value } of draft.tags) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    switch (tag) {
      case "AU":
      case "A1": {
        const name = parsePersonName(trimmed);
        if (name) authors.push(name);
        break;
      }
      case "A2":
      case "ED": {
        const name = parsePersonName(trimmed);
        if (name) editors.push(name);
        break;
      }
      case "TI":
        if (!title) title = trimmed;
        break;
      case "T1":
        if (!t1) t1 = trimmed;
        break;
      case "T2":
      case "BT":
        if (!t2) t2 = trimmed;
        break;
      case "JO":
      case "J2":
        if (!jo) jo = trimmed;
        break;
      case "JF":
        if (!jf) jf = trimmed;
        break;
      case "PY":
      case "Y1":
      case "DA":
        dateCandidates.push(trimmed);
        break;
      case "VL":
        if (!volume) volume = trimmed;
        break;
      case "IS":
        if (!issue) issue = trimmed;
        break;
      case "SP":
        if (!sp) sp = trimmed;
        break;
      case "EP":
        if (!ep) ep = trimmed;
        break;
      case "PB":
        if (!publisher) publisher = trimmed;
        break;
      case "CY":
        if (!publisherPlace) publisherPlace = trimmed;
        break;
      case "DO":
        if (!doi) doi = trimmed;
        break;
      case "UR":
        if (!url) url = trimmed;
        break;
      case "SN":
        if (!isbn) isbn = trimmed;
        break;
      case "ID":
        if (!id) id = trimmed;
        break;
      case "LA":
        if (!language) language = trimmed;
        break;
      case "ET":
        if (!edition) edition = trimmed;
        break;
      case "AB":
      case "N2":
        if (!abstractFree) abstractFree = trimmed;
        break;
      default:
        break;
    }
  }

  const finalTitle = title ?? t1;
  const containerTitle =
    cslType === "chapter" || cslType === "paper-conference"
      ? (t2 ?? jf ?? jo)
      : (jf ?? jo ?? t2);
  const issued = chooseBestRisDate(dateCandidates);
  const page = sp && ep ? `${sp}-${ep}` : (sp ?? ep);

  const hasContent = Boolean(
    finalTitle
    || authors.length > 0
    || editors.length > 0
    || containerTitle
    || publisher
    || doi
    || url
    || isbn
    || issued
    || abstractFree
  );
  if (!hasContent) {
    return { error: `RIS record at line ${draft.startLine} has no bibliographic fields.` };
  }

  const item: CslItem = {
    id: id ?? "",
    type: cslType,
    provider: "import"
  };
  if (id) item.citeKey = id;
  if (finalTitle) item.title = finalTitle;
  if (authors.length > 0) item.author = authors;
  if (editors.length > 0) item.editor = editors;
  if (issued) item.issued = issued;
  if (containerTitle) item["container-title"] = containerTitle;
  if (publisher) item.publisher = publisher;
  if (publisherPlace) item["publisher-place"] = publisherPlace;
  if (volume) item.volume = volume;
  if (issue) item.issue = issue;
  if (page) item.page = page;
  if (doi) item.DOI = doi;
  if (url) item.URL = url;
  if (isbn) item.ISBN = isbn;
  if (edition) item.edition = edition;
  if (language) item.language = language;
  if (abstractFree) item["abstract-free"] = abstractFree;

  return { item };
}

/**
 * Parses RIS reference data into CSL-JSON items and non-fatal warnings.
 */
export function parseRis(text: string): RisParseResult {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const items: CslItem[] = [];
  const warnings: string[] = [];

  let current: RisRecordDraft | null = null;
  let outsideGarbageWarned = false;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNum = i + 1;
    const rawLine = lines[i];
    const match = RIS_TAG_RE.exec(rawLine);

    if (match) {
      outsideGarbageWarned = false;
      const tag = match[1];
      const value = (match[2] ?? "").trimEnd();

      if (tag === "TY") {
        if (current) {
          warnings.push(
            `RIS record starting at line ${current.startLine} was missing "ER  -" before line ${lineNum}; skipped.`
          );
        }
        current = {
          startLine: lineNum,
          risType: value.trim(),
          tags: []
        };
        continue;
      }

      if (tag === "ER") {
        if (!current) {
          warnings.push(`Unexpected RIS "ER" tag at line ${lineNum} outside a record.`);
          continue;
        }
        const converted = recordToCslItem(current);
        if ("error" in converted) {
          warnings.push(converted.error);
        } else {
          items.push(converted.item);
        }
        current = null;
        continue;
      }

      if (!current) {
        warnings.push(`RIS tag "${tag}" at line ${lineNum} appeared outside a TY/ER record; ignored.`);
        continue;
      }

      current.tags.push({ tag, value: value.trim() });
      continue;
    }

    const trimmedLine = rawLine.trim();
    if (!trimmedLine) continue;

    if (!current) {
      if (!outsideGarbageWarned) {
        warnings.push(`Ignored non-RIS text starting at line ${lineNum}.`);
        outsideGarbageWarned = true;
      }
      continue;
    }

    if (current.tags.length > 0) {
      const prev = current.tags[current.tags.length - 1];
      prev.value = prev.value ? `${prev.value} ${trimmedLine}` : trimmedLine;
    } else {
      warnings.push(`Unexpected continuation line at line ${lineNum} before any field tag.`);
    }
  }

  if (current) {
    warnings.push(
      `RIS record starting at line ${current.startLine} is missing closing "ER  -"; skipped.`
    );
  }

  return { items, warnings };
}
