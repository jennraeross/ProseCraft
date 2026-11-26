import { describe, expect, it } from "vitest";
import {
  SHORTCUT_GROUPS,
  buildShortcutsPdf,
  formatKey,
  formatShortcut,
  localizedShortcutGroups,
  shortcutsToPlainText
} from "./shortcuts";

describe("shortcut list", () => {
  it("fills every entry with an action and at least one key", () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.entries.length).toBeGreaterThan(0);
      for (const entry of group.entries) {
        expect(entry.action.trim().length).toBeGreaterThan(0);
        expect(entry.keys.length).toBeGreaterThan(0);
        expect(entry.keys.every((key) => key.trim().length > 0)).toBe(true);
      }
    }
  });

  it("carries a translation key for every group and action", () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(group.titleKey).toBeTruthy();
      for (const entry of group.entries) expect(entry.actionKey).toBeTruthy();
    }
  });

  it("localizes groups and actions through the provided translator", () => {
    const groups = localizedShortcutGroups((key) => `[${key}]`);
    expect(groups[0].title).toBe("[shortcuts.group.general]");
    expect(groups[0].entries[0].action).toBe("[shortcuts.action.newDocument]");
    expect(groups[0].entries[0].keys).toEqual(["Mod", "N"]);
  });

  it("lists no key combination twice", () => {
    const combos = SHORTCUT_GROUPS.flatMap((group) => group.entries.map((entry) => entry.keys.join("+")));
    expect(new Set(combos).size).toBe(combos.length);
    const normalized = SHORTCUT_GROUPS.flatMap((group) =>
      group.entries.map((entry) =>
        entry.keys.map((key) => key.trim().toLowerCase()).sort().join("+")
      )
    );
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("includes Mod+Alt+F for Insert footnote", () => {
    const entry = SHORTCUT_GROUPS.flatMap((group) => group.entries)
      .find((item) => item.action === "Insert footnote");
    expect(entry?.keys).toEqual(["Mod", "Alt", "F"]);
    expect(formatShortcut(entry!.keys, true)).toBe("⌘⌥F");
    expect(formatShortcut(entry!.keys, false)).toBe("Ctrl+Alt+F");
  });

  it("includes Mod+Alt+C for Insert citation", () => {
    const entry = SHORTCUT_GROUPS.flatMap((group) => group.entries)
      .find((item) => item.action === "Insert citation");
    expect(entry?.keys).toEqual(["Mod", "Alt", "C"]);
    expect(formatShortcut(entry!.keys, true)).toBe("⌘⌥C");
    expect(formatShortcut(entry!.keys, false)).toBe("Ctrl+Alt+C");
  });
});

describe("formatShortcut", () => {
  it("uses symbols without separators on macOS", () => {
    expect(formatShortcut(["Mod", "Shift", "F"], true)).toBe("⌘⇧F");
    expect(formatShortcut(["Mod", "Shift", "Enter"], true)).toBe("⌘⇧↩");
    expect(formatShortcut(["Alt", "Click"], true)).toBe("⌥Click");
  });

  it("uses written modifiers and plus signs elsewhere", () => {
    expect(formatShortcut(["Mod", "Shift", "F"], false)).toBe("Ctrl+Shift+F");
    expect(formatShortcut(["Mod", "Shift", "Enter"], false)).toBe("Ctrl+Shift+Enter");
    expect(formatShortcut(["Alt", "Click"], false)).toBe("Alt+Click");
  });

  it("translates every modifier token and keeps plain keys", () => {
    expect(formatKey("Mod", true)).toBe("⌘");
    expect(formatKey("Mod", false)).toBe("Ctrl");
    expect(formatKey("Alt", true)).toBe("⌥");
    expect(formatKey("Alt", false)).toBe("Alt");
    expect(formatKey("Shift", true)).toBe("⇧");
    expect(formatKey("Shift", false)).toBe("Shift");
    expect(formatKey("Enter", true)).toBe("↩");
    expect(formatKey("Enter", false)).toBe("Enter");
    expect(formatKey("Esc", true)).toBe("⎋");
    expect(formatKey("Esc", false)).toBe("Esc");
    expect(formatKey("/", false)).toBe("/");
  });
});

describe("shortcut export", () => {
  it("writes a plain text sheet with the title and every group", () => {
    const text = shortcutsToPlainText(SHORTCUT_GROUPS, false);
    expect(text).toContain("ProseCraft keyboard shortcuts");
    expect(text).toContain("Ctrl+Shift+F");
    for (const group of SHORTCUT_GROUPS) expect(text).toContain(group.title);
  });

  it("builds a PDF document", async () => {
    const bytes = await buildShortcutsPdf(SHORTCUT_GROUPS, false);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });
});
