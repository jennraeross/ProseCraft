import { jsPDF } from "jspdf";
import type { MessageKey } from "$lib/i18n/catalog";

export type ShortcutEntry = { keys: string[]; action: string; actionKey?: MessageKey };
export type ShortcutGroup = { title: string; entries: ShortcutEntry[]; titleKey?: MessageKey };

const SHORTCUTS_TITLE = "ProseCraft keyboard shortcuts";

/**
 * Mirrors the key handlers in `src/routes/+page.svelte`, the native menu
 * accelerators in `src-tauri/src/lib.rs` and the browser formatting commands
 * used by the editor toolbar. The sheet, project search, focus mode and
 * "open beside" rows are the ones this list introduces.
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    titleKey: "shortcuts.group.general",
    entries: [
      { keys: ["Mod", "N"], action: "New document", actionKey: "shortcuts.action.newDocument" },
      { keys: ["Mod", ","], action: "Settings", actionKey: "shortcuts.action.settings" },
      { keys: ["Mod", "Shift", "E"], action: "Export scene", actionKey: "shortcuts.action.exportScene" },
      { keys: ["Mod", "Shift", "P"], action: "Publish manuscript", actionKey: "shortcuts.action.publishManuscript" },
      { keys: ["Mod", "/"], action: "Keyboard shortcuts", actionKey: "shortcuts.action.keyboardShortcuts" }
    ]
  },
  {
    title: "Writing",
    titleKey: "shortcuts.group.writing",
    entries: [
      { keys: ["Mod", "B"], action: "Bold", actionKey: "shortcuts.action.bold" },
      { keys: ["Mod", "I"], action: "Italic", actionKey: "shortcuts.action.italic" },
      { keys: ["Mod", "U"], action: "Underline", actionKey: "shortcuts.action.underline" },
      { keys: ["Mod", "Alt", "F"], action: "Insert footnote", actionKey: "shortcuts.action.insertFootnote" },
      { keys: ["Mod", "Alt", "C"], action: "Insert citation", actionKey: "shortcuts.action.insertCitation" },
      { keys: ["Mod", "Z"], action: "Undo", actionKey: "shortcuts.action.undo" },
      { keys: ["Mod", "Shift", "Z"], action: "Redo", actionKey: "shortcuts.action.redo" },
      { keys: ["Mod", "Y"], action: "Redo (alternate)", actionKey: "shortcuts.action.redoAlternate" }
    ]
  },
  {
    title: "Search",
    titleKey: "shortcuts.group.search",
    entries: [
      { keys: ["Mod", "Shift", "F"], action: "Search the project", actionKey: "shortcuts.action.searchProject" }
    ]
  },
  {
    title: "Layout",
    titleKey: "shortcuts.group.layout",
    entries: [
      { keys: ["Mod", "Shift", "Enter"], action: "Toggle focus mode", actionKey: "shortcuts.action.toggleFocusMode" },
      { keys: ["Esc"], action: "Leave focus mode", actionKey: "shortcuts.action.leaveFocusMode" },
      { keys: ["Alt", "Click"], action: "Open scene, wiki page or file beside", actionKey: "shortcuts.action.openBeside" }
    ]
  }
];

/** Translate the sheet for the active interface language. */
export function localizedShortcutGroups(
  translate: (key: MessageKey) => string
): ShortcutGroup[] {
  return SHORTCUT_GROUPS.map((group) => ({
    title: group.titleKey ? translate(group.titleKey) : group.title,
    titleKey: group.titleKey,
    entries: group.entries.map((entry) => ({
      keys: entry.keys,
      action: entry.actionKey ? translate(entry.actionKey) : entry.action,
      actionKey: entry.actionKey
    }))
  }));
}

const KEY_LABELS = {
  Mod: { mac: "⌘", other: "Ctrl" },
  Alt: { mac: "⌥", other: "Alt" },
  Shift: { mac: "⇧", other: "Shift" },
  Enter: { mac: "↩", other: "Enter" },
  Esc: { mac: "⎋", other: "Esc" }
};

export function formatKey(token: string, isMac: boolean): string {
  const label = KEY_LABELS[token as keyof typeof KEY_LABELS];
  return label ? label[isMac ? "mac" : "other"] : token;
}

export function formatShortcut(keys: string[], isMac: boolean): string {
  return keys.map((key) => formatKey(key, isMac)).join(isMac ? "" : "+");
}

/** The PDF built-in fonts have no glyphs for ⌘, ⌥, ⇧, ↩ or ⎋, so the sheet spells every key out. */
function formatPdfShortcut(keys: string[], isMac: boolean): string {
  return keys
    .map((key) => (isMac && key === "Mod" ? "Cmd" : isMac && key === "Alt" ? "Option" : formatKey(key, false)))
    .join("+");
}

export function shortcutsToPlainText(
  groups: ShortcutGroup[],
  isMac: boolean,
  title: string = SHORTCUTS_TITLE
): string {
  const lines = [title, ""];
  for (const group of groups) {
    lines.push(group.title, "-".repeat(group.title.length));
    const width = Math.max(0, ...group.entries.map((entry) => entry.action.length)) + 2;
    for (const entry of group.entries) {
      lines.push(`${entry.action.padEnd(width)}${formatShortcut(entry.keys, isMac)}`.trimEnd());
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export type ShortcutPdfLabels = {
  title?: string;
  macLayout?: string;
  windowsLayout?: string;
};

/**
 * Builds a printable sheet with the action on the left and the keys on the
 * right. Long sheets continue on a second page without repeating headings.
 */
export async function buildShortcutsPdf(
  groups: ShortcutGroup[],
  isMac: boolean,
  labels: ShortcutPdfLabels = {}
): Promise<Uint8Array> {
  const title = labels.title ?? SHORTCUTS_TITLE;
  const layout = isMac
    ? (labels.macLayout ?? "macOS key layout")
    : (labels.windowsLayout ?? "Windows and Linux key layout");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  doc.setProperties({ title, creator: "ProseCraft" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const right = pageWidth - margin;
  const ink: [number, number, number] = [32, 36, 33];
  const muted: [number, number, number] = [110, 114, 108];
  let y = margin + 18;

  const setText = (size: number, style: "normal" | "bold", color: [number, number, number]) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  setText(20, "bold", ink);
  doc.text(title, margin, y);
  y += 16;
  setText(9.5, "normal", muted);
  doc.text(layout, margin, y);
  y += 12;
  doc.setDrawColor(206, 206, 200);
  doc.setLineWidth(0.8);
  doc.line(margin, y, right, y);
  y += 16;

  for (const group of groups) {
    ensureSpace(50);
    y += 16;
    setText(12, "bold", ink);
    doc.text(group.title, margin, y);
    y += 10;
    doc.setDrawColor(226, 226, 220);
    doc.line(margin, y, right, y);
    y += 17;

    for (const entry of group.entries) {
      ensureSpace(19);
      setText(10, "normal", ink);
      doc.text(entry.action, margin, y);
      setText(10, "bold", muted);
      doc.text(formatPdfShortcut(entry.keys, isMac), right, y, { align: "right" });
      y += 19;
    }
    y += 8;
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
