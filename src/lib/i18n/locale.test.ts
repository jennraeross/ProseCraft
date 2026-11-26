import { describe, expect, it } from "vitest";
import { baseLanguage, isRtl, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("prefers an exact stored choice", () => {
    expect(resolveLocale("de", ["en"])).toBe("de");
  });

  it("uses the browser languages when nothing is stored", () => {
    expect(resolveLocale(null, ["de-DE", "en-US"])).toBe("de");
  });

  it("matches a base language when the region is unsupported", () => {
    expect(resolveLocale("de-AT", [])).toBe("de");
  });

  it("falls back to English for unsupported languages", () => {
    expect(resolveLocale("nl", ["nl-NL", "sv"])).toBe("en");
  });

  it("ignores empty and malformed tags", () => {
    expect(resolveLocale("", ["", "en"])).toBe("en");
  });

  it("does not use a stored empty value", () => {
    expect(resolveLocale("   ", [])).toBe("en");
  });
});

describe("isRtl", () => {
  it("recognises right-to-left languages and their regions", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("he-IL")).toBe(true);
    expect(isRtl("fa-IR")).toBe(true);
  });

  it("treats other languages as left-to-right", () => {
    expect(isRtl("de")).toBe(false);
    expect(isRtl("en-US")).toBe(false);
  });
});

describe("baseLanguage", () => {
  it("strips the region and normalises case", () => {
    expect(baseLanguage("de-AT")).toBe("de");
    expect(baseLanguage("PT-BR")).toBe("pt");
  });
});
