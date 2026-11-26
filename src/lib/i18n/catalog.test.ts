import { describe, expect, it } from "vitest";
import {
  AVAILABLE_LOCALES,
  catalogs,
  EN_MESSAGES,
  localeName,
  SOURCE_LOCALE
} from "./catalog";
import { validateCatalog } from "./validate.js";

describe("message catalogs", () => {
  it("uses English as the source locale", () => {
    expect(AVAILABLE_LOCALES[0]).toBe(SOURCE_LOCALE);
    expect(Object.keys(EN_MESSAGES).length).toBeGreaterThan(0);
  });

  it("keeps the English source well formed", () => {
    const result = validateCatalog(SOURCE_LOCALE, SOURCE_LOCALE, EN_MESSAGES, EN_MESSAGES);
    expect(result.errors).toEqual([]);
    expect(result.missingKeys).toEqual([]);
  });

  for (const locale of AVAILABLE_LOCALES.filter((code) => code !== SOURCE_LOCALE)) {
    it(`keeps ${localeName(locale)} (${locale}) compatible with the English source`, () => {
      const result = validateCatalog(SOURCE_LOCALE, locale, EN_MESSAGES, catalogs[locale] ?? {});
      expect(result.errors).toEqual([]);
      expect(result.unknownKeys).toEqual([]);
    });
  }

  it("reports missing messages separately from errors", () => {
    const result = validateCatalog(SOURCE_LOCALE, "de", EN_MESSAGES, {});
    expect(result.errors).toEqual([]);
    expect(result.missingKeys.length).toBe(result.total);
  });
});
