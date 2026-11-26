import { describe, expect, it } from "vitest";
import { formatNumber, renderMessage, translate, translateWithFallback } from "./format";

describe("renderMessage", () => {
  it("interpolates named values", () => {
    expect(renderMessage("Version {version}", "en", { version: "0.6.1" })).toBe(
      "Version 0.6.1"
    );
  });

  it("formats numbers for the locale", () => {
    expect(renderMessage("of {goal, number} words", "en", { goal: 50000 })).toBe(
      "of 50,000 words"
    );
    expect(renderMessage("von {goal, number} Wörtern", "de", { goal: 50000 })).toBe(
      "von 50.000 Wörtern"
    );
  });

  it("renders the right plural category", () => {
    const message = "{count, plural, one {# word written} other {# words written}}";
    expect(renderMessage(message, "en", { count: 1 })).toBe("1 word written");
    expect(renderMessage(message, "en", { count: 2 })).toBe("2 words written");
    expect(renderMessage(message, "en", { count: 1234 })).toBe("1,234 words written");
  });

  it("uses the plural categories of the target language", () => {
    const message = "{count, plural, one {# Wort} few {# Wörter} many {# Wörter} other {# Wörter}}";
    expect(renderMessage(message, "pl", { count: 1 })).toBe("1 Wort");
    expect(renderMessage(message, "pl", { count: 3 })).toBe("3 Wörter");
    expect(renderMessage(message, "pl", { count: 5 })).toBe("5 Wörter");
  });

  it("supports select branches", () => {
    const message = "{role, select, editor {edited by} other {by}}";
    expect(renderMessage(message, "en", { role: "editor" })).toBe("edited by");
    expect(renderMessage(message, "en", { role: "author" })).toBe("by");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderMessage("Hello {name}", "en")).toBe("Hello {name}");
  });
});

describe("translate", () => {
  it("returns the key when there is no message", () => {
    expect(translate("en", "does.not.exist")).toBe("does.not.exist");
  });

  it("falls back to the source catalog for missing or empty translations", () => {
    expect(translateWithFallback({ hello: "Hallo" }, { hello: "Hello" }, "de", "hello")).toBe(
      "Hallo"
    );
    expect(translateWithFallback({}, { hello: "Hello" }, "de", "hello")).toBe("Hello");
    expect(translateWithFallback({ hello: "  " }, { hello: "Hello" }, "de", "hello")).toBe(
      "Hello"
    );
  });
});

describe("formatNumber", () => {
  it("uses the locale's separators", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber(1234567, "de")).toBe("1.234.567");
  });
});
