import { isLocale, SOURCE_LOCALE } from "./catalog";

export const LOCALE_STORAGE_KEY = "prosecraft-locale";

/** Languages written right-to-left. Used to set the document direction. */
const RTL_LANGUAGES = new Set([
  "ar",
  "arc",
  "ckb",
  "dv",
  "fa",
  "he",
  "ks",
  "ku",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi"
]);

export function baseLanguage(code: string): string {
  return code.toLowerCase().split("-")[0] || code;
}

export function isRtl(code: string): boolean {
  return RTL_LANGUAGES.has(baseLanguage(code));
}

/**
 * Pick the first supported language. An exact catalog match (`pt-BR.json`) wins
 * over a base-language match (`pt.json`); unsupported languages fall back to
 * English.
 */
export function resolveLocale(
  stored: string | null | undefined,
  languages: readonly string[] = []
): string {
  for (const tag of [stored, ...languages]) {
    if (!tag) continue;
    if (isLocale(tag)) return tag;
    const base = baseLanguage(tag);
    if (isLocale(base)) return base;
  }
  return SOURCE_LOCALE;
}

export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLocale(code: string): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    // The language still applies for this session.
  }
}

export function browserLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  const languages = navigator.languages?.length > 0 ? navigator.languages : [navigator.language];
  return Array.from(languages);
}

/** Keep `<html lang>` and `<html dir>` in sync with the active language. */
export function applyDocumentLocale(code: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = isRtl(code) ? "rtl" : "ltr";
}
