export const MATTER_PAGE_LIMIT = 12;
export const MATTER_TITLE_LIMIT = 120;
export const MATTER_BODY_LIMIT = 20_000;

export type MatterPage = {
  id: string;
  title: string;
  body: string;
  blank?: boolean;
};

export type MatterPreset = {
  label: string;
  title: string;
  blank?: boolean;
};

export const FRONT_MATTER_PRESETS: ReadonlyArray<MatterPreset> = [
  { label: "Epigraph", title: "Epigraph" },
  { label: "Foreword", title: "Foreword" },
  { label: "Preface", title: "Preface" },
  { label: "Introduction", title: "Introduction" },
  { label: "Blank page", title: "", blank: true }
];

export const BACK_MATTER_PRESETS: ReadonlyArray<MatterPreset> = [
  { label: "Acknowledgments", title: "Acknowledgments" },
  { label: "About the Author", title: "About the Author" },
  { label: "Also By", title: "Also By" },
  { label: "Afterword", title: "Afterword" },
  { label: "Appendix", title: "Appendix" },
  { label: "Glossary", title: "Glossary" },
  { label: "Blank page", title: "", blank: true }
];

export function newMatterPageId(): string {
  const unique = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `matter-${unique}`;
}

export function createMatterPage(title = "", blank = false): MatterPage {
  return {
    id: newMatterPageId(),
    title: title.slice(0, MATTER_TITLE_LIMIT),
    body: "",
    ...(blank ? { blank: true } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerces persisted matter pages into a safe, ordered list. Older projects have
 * no matter pages, so missing values simply become an empty list.
 */
export function normalizeMatterPages(value: unknown): MatterPage[] {
  if (!Array.isArray(value)) return [];
  const pages: MatterPage[] = [];
  const ids = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry)) continue;
    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : newMatterPageId();
    if (ids.has(id)) id = newMatterPageId();
    ids.add(id);
    pages.push({
      id,
      title: typeof entry.title === "string" ? entry.title.slice(0, MATTER_TITLE_LIMIT) : "",
      body: typeof entry.body === "string" ? entry.body.slice(0, MATTER_BODY_LIMIT) : "",
      ...(entry.blank === true ? { blank: true } : {})
    });
    if (pages.length >= MATTER_PAGE_LIMIT) break;
  }

  return pages;
}

export function matterPageLabel(page: MatterPage): string {
  if (page.title.trim()) return page.title.trim();
  return page.blank ? "Blank page" : "Untitled page";
}

/** Splits plain-text matter into paragraphs while preserving line breaks inside them. */
export function matterParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
