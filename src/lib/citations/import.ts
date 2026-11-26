import { parseBibtex } from "./bibtex";
import { type CslItem, normalizeCslItemsDetailed } from "./csl";
import { parseRis } from "./ris";
import { t } from "$lib/i18n/state.svelte";

export type CitationImportFormat = "csl-json" | "bibtex" | "ris";

export type CitationImportResult = {
  format: CitationImportFormat | null;
  items: CslItem[];
  warnings: string[];
};

function detectFormatFromExtension(filename: string): CitationImportFormat | null {
  const lower = filename.trim().toLowerCase();
  if (!lower) return null;
  if (lower.endsWith(".json") || lower.endsWith(".csljson") || lower.endsWith(".csl")) {
    return "csl-json";
  }
  if (lower.endsWith(".bib") || lower.endsWith(".bibtex")) {
    return "bibtex";
  }
  if (lower.endsWith(".ris")) {
    return "ris";
  }
  return null;
}

function detectFormatFromContent(text: string): CitationImportFormat | null {
  const trimmed = text.trimStart();
  if (!trimmed) return null;
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "csl-json";
  }
  if (/^TY\s{1,2}-/m.test(trimmed)) {
    return "ris";
  }
  if (/@[A-Za-z]+\s*[{(]/.test(trimmed)) {
    return "bibtex";
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Detects the citation file format (`.json` CSL-JSON, `.bib` BibTeX/BibLaTeX,
 * or `.ris` RIS) from `filename` and `text`, parses entries into validated
 * `CslItem[]`, and collects non-fatal warnings.
 */
export function importCitations(text: string, filename = ""): CitationImportResult {
  const cleaned = text.replace(/^\uFEFF/, "");
  const extFormat = detectFormatFromExtension(filename);

  if (!cleaned.trim()) {
    return {
      format: extFormat,
      items: [],
      warnings: [t("module.citation.empty")]
    };
  }

  const format = extFormat ?? detectFormatFromContent(cleaned);
  if (!format) {
    return {
      format: null,
      items: [],
      warnings: [t("module.citation.detectFailed")]
    };
  }

  if (format === "csl-json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      const detail = error instanceof Error ? error.message : t("module.citation.invalidSyntax");
      return {
        format,
        items: [],
        warnings: [t("module.citation.invalidJson", { detail })]
      };
    }

    let rawEntries: unknown;
    if (Array.isArray(parsed)) {
      rawEntries = parsed;
    } else if (isPlainObject(parsed) && Array.isArray(parsed.items)) {
      rawEntries = parsed.items;
    } else if (isPlainObject(parsed) && typeof parsed.type === "string") {
      rawEntries = [parsed];
    } else {
      return {
        format,
        items: [],
        warnings: [t("module.citation.expectedArray")]
      };
    }

    const normalized = normalizeCslItemsDetailed(rawEntries);
    return {
      format,
      items: normalized.items,
      warnings: normalized.warnings
    };
  }

  const parsed = format === "bibtex" ? parseBibtex(cleaned) : parseRis(cleaned);
  const normalized = normalizeCslItemsDetailed(parsed.items);
  return {
    format,
    items: normalized.items,
    warnings: [...parsed.warnings, ...normalized.warnings]
  };
}
