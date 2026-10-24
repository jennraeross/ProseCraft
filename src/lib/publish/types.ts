export const SPACE_NAMES = ["Characters", "Places", "Research", "Notes"] as const;
export type SpaceName = (typeof SPACE_NAMES)[number];

export type ChapterData = { id: string; title: string; expanded: boolean; summary?: string };
export type DocumentData = {
  id: string;
  title: string;
  content: string;
  chapterId?: string;
  space?: SpaceName;
  trashed?: boolean;
};

export type ExportFormat = "pdf" | "epub" | "docx" | "markdown" | "html" | "text";
export type StylePreset = "manuscript" | "classic" | "modern" | "ebook";
export type SceneSeparator = "blank" | "asterisks" | "hash" | "line" | "none";

export type PublishOptions = {
  format: ExportFormat;
  style: StylePreset;
  includeTitlePage: boolean;
  includeChapterTitles: boolean;
  includeSceneTitles: boolean;
  pageBreakBeforeChapters: boolean;
  sceneSeparator: SceneSeparator;
  dropCaps: boolean;
  subtitle: string;
  copyright: string;
  dedication: string;
};

export type CompiledScene = {
  id: string;
  sourceId: string;
  title: string;
  html: string;
  text: string;
  words: number;
};

export type CompiledChapter = {
  id: string;
  label: string;
  title: string;
  scenes: CompiledScene[];
  words: number;
};

export type CompiledBook = {
  title: string;
  subtitle: string;
  author: string;
  copyright: string;
  dedication: string;
  chapters: CompiledChapter[];
  words: number;
  scenes: number;
};

export type ExportPayload = {
  blob: Blob;
  filename: string;
  extension: string;
  formatName: string;
};

export const FORMAT_INFO: Record<ExportFormat, {
  label: string;
  extension: string;
  formatName: string;
  description: string;
}> = {
  pdf: {
    label: "PDF",
    extension: "pdf",
    formatName: "PDF document",
    description: "Print-ready pages for reading or proofing."
  },
  epub: {
    label: "EPUB",
    extension: "epub",
    formatName: "EPUB ebook",
    description: "Reflowable ebook for e-readers and tablets."
  },
  docx: {
    label: "DOCX",
    extension: "docx",
    formatName: "Word document",
    description: "Editable manuscript for Word or Pages."
  },
  markdown: {
    label: "Markdown",
    extension: "md",
    formatName: "Markdown document",
    description: "Plain structured text for writing tools."
  },
  html: {
    label: "HTML",
    extension: "html",
    formatName: "HTML document",
    description: "A styled, self-contained web page."
  },
  text: {
    label: "Plain text",
    extension: "txt",
    formatName: "Plain text document",
    description: "Clean text with no formatting."
  }
};

export const FORMAT_ORDER: ExportFormat[] = ["pdf", "epub", "docx", "markdown", "html", "text"];

export function defaultPublishOptions(): PublishOptions {
  return {
    format: "pdf",
    style: "manuscript",
    includeTitlePage: true,
    includeChapterTitles: true,
    includeSceneTitles: false,
    pageBreakBeforeChapters: true,
    sceneSeparator: "hash",
    dropCaps: true,
    subtitle: "",
    copyright: "",
    dedication: ""
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePublishOptions(value: unknown): PublishOptions {
  const defaults = defaultPublishOptions();
  if (!isRecord(value)) return defaults;
  const formats = FORMAT_ORDER;
  const styles: StylePreset[] = ["manuscript", "classic", "modern", "ebook"];
  const separators: SceneSeparator[] = ["blank", "asterisks", "hash", "line", "none"];
  return {
    format: formats.includes(value.format as ExportFormat) ? value.format as ExportFormat : defaults.format,
    style: styles.includes(value.style as StylePreset) ? value.style as StylePreset : defaults.style,
    includeTitlePage: typeof value.includeTitlePage === "boolean" ? value.includeTitlePage : defaults.includeTitlePage,
    includeChapterTitles: typeof value.includeChapterTitles === "boolean" ? value.includeChapterTitles : defaults.includeChapterTitles,
    includeSceneTitles: typeof value.includeSceneTitles === "boolean" ? value.includeSceneTitles : defaults.includeSceneTitles,
    pageBreakBeforeChapters: typeof value.pageBreakBeforeChapters === "boolean" ? value.pageBreakBeforeChapters : defaults.pageBreakBeforeChapters,
    sceneSeparator: separators.includes(value.sceneSeparator as SceneSeparator) ? value.sceneSeparator as SceneSeparator : defaults.sceneSeparator,
    dropCaps: typeof value.dropCaps === "boolean" ? value.dropCaps : defaults.dropCaps,
    subtitle: typeof value.subtitle === "string" ? value.subtitle.slice(0, 200) : defaults.subtitle,
    copyright: typeof value.copyright === "string" ? value.copyright.slice(0, 500) : defaults.copyright,
    dedication: typeof value.dedication === "string" ? value.dedication.slice(0, 1000) : defaults.dedication
  };
}

export function slugifyFilename(value: string): string {
  const slug = value
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  // Keep the generated name within a safe filesystem component length even
  // for wide scripts such as CJK.
  const clipped = Array.from(slug).slice(0, 60).join("").replace(/-+$/g, "");
  return clipped || "untitled";
}
