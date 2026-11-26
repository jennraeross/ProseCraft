import { AVAILABLE_LOCALES, isLocale, localeName } from "./catalog";
import { translate } from "./format";
import {
  applyDocumentLocale,
  browserLanguages,
  readStoredLocale,
  resolveLocale,
  storeLocale
} from "./locale";
import type { MessageKey } from "./catalog";
import type { MessageParams } from "./format";

/**
 * The active interface language. Reading `localeState.locale` inside a Svelte
 * template or `$derived` makes the UI update when the language changes.
 */
export const localeState = $state({
  locale: resolveLocale(readStoredLocale(), browserLanguages())
});

/** Translate a message for the active interface language. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(localeState.locale, key, params);
}

/** Switch language, remember the choice and update `<html lang>`/`dir`. */
export function setLocale(next: string): void {
  if (!isLocale(next)) return;
  localeState.locale = next;
  storeLocale(next);
  applyDocumentLocale(next);
}

applyDocumentLocale(localeState.locale);

export { AVAILABLE_LOCALES, localeName, isLocale, resolveLocale };
export type { MessageKey };
