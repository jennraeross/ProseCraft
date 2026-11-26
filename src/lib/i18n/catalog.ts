import en from "./messages/en.json";
import reviewStatus from "./review-status.json";

/** Every key the app may translate. Typed from the English source catalog. */
export type MessageKey = keyof typeof en;

/** A flat map of message keys to translated strings. */
export type MessageCatalog = Record<string, string>;

export const SOURCE_LOCALE = "en";

/** The English source strings. Every other catalog is validated against these. */
export const EN_MESSAGES: MessageCatalog = en;

const localeModules = import.meta.glob<{ default: MessageCatalog }>("./messages/*.json", {
  eager: true
});

function localeCodeFromPath(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");
}

/**
 * Every catalog under `messages/`. Dropping a new `<locale>.json` file in that
 * folder is all it takes to make a language available in the app.
 */
export const catalogs: Record<string, MessageCatalog> = {};
for (const [path, localeModule] of Object.entries(localeModules)) {
  catalogs[localeCodeFromPath(path)] = localeModule.default;
}
catalogs[SOURCE_LOCALE] = en;

/** English first, then the other languages ordered by their native name. */
export const AVAILABLE_LOCALES: string[] = [
  SOURCE_LOCALE,
  ...Object.keys(catalogs)
    .filter((code) => code !== SOURCE_LOCALE)
    .filter((code) => import.meta.env.DEV || !isPseudoLocale(code))
    .sort((left, right) => localeName(left).localeCompare(localeName(right)))
];

export function isLocale(code: string): boolean {
  return Object.hasOwn(catalogs, code);
}

/**
 * AI-drafted catalogs that are intentionally incomplete. They are selectable,
 * but the picker labels them as previews and missing keys fall back to English.
 */
const PREVIEW_LOCALES = new Set<string>(reviewStatus.previewLocales);

export function isPreviewLocale(code: string): boolean {
  return PREVIEW_LOCALES.has(code);
}

/** `en-XA` files are generated for QA and never shown in production. */
export function isPseudoLocale(code: string): boolean {
  return /-XA$/i.test(code);
}

/** The language's name in that language, e.g. "Deutsch" for `de`. */
export function localeName(code: string): string {
  if (isPseudoLocale(code)) return "Pseudo (en-XA)";
  try {
    const names = new Intl.DisplayNames([code], { type: "language" });
    const name = names.of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}
