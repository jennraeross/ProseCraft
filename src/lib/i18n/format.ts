import { catalogs, isLocale, SOURCE_LOCALE } from "./catalog";
import type { MessageKey } from "./catalog";
import { formatNumber, parseMessage, renderNodes } from "./message";
import type { MessageParams } from "./message";

export { formatNumber };
export type { MessageParams };

/** Look up a template, falling back to English and then to the key itself. */
export function messageTemplate(locale: string, key: MessageKey | string): string | undefined {
  const localized = isLocale(locale) ? catalogs[locale]?.[key] : undefined;
  if (typeof localized === "string" && localized.trim() !== "") return localized;
  return catalogs[SOURCE_LOCALE]?.[key];
}

/** Translate a key with optional `{name}`, `{count, number}` or ICU plural params. */
export function translate(
  locale: string,
  key: MessageKey | string,
  params: MessageParams = {}
): string {
  return translateWithFallback(catalogs[locale], catalogs[SOURCE_LOCALE], locale, key, params);
}

/** Same as {@link translate}, with explicit catalogs so it is easy to test. */
export function translateWithFallback(
  catalog: Record<string, string> | undefined,
  fallback: Record<string, string> | undefined,
  locale: string,
  key: string,
  params: MessageParams = {}
): string {
  const localized = catalog?.[key];
  const template =
    typeof localized === "string" && localized.trim() !== ""
      ? localized
      : fallback?.[key];
  return template === undefined ? key : renderMessage(template, locale, params);
}

/**
 * Render a message template to plain text. Inline tags are dropped, so this is
 * safe to use in exports, PDFs and diagnostics; use `<Trans>` to render them.
 *
 * Supported syntax:
 *
 * - `{name}` — a value from `params`
 * - `{count, number}` — a locale-formatted number
 * - `{count, plural, one {# word} other {# words}}` — ICU-style plurals
 * - `{gender, select, female {her} other {their}}` — exact-match choices
 * - `<strong>`, `<em>`, `<code>`, `<kbd>` — inline markup, ignored here
 */
export function renderMessage(
  template: string,
  locale: string,
  params: MessageParams = {}
): string {
  return renderNodes(parseMessage(template), locale, params);
}
