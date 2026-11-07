import { jsPDF } from "jspdf";

export type ShortcutEntry = { keys: string[]; action: string };
export type ShortcutGroup = { title: string; entries: ShortcutEntry[] };

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
    entries: [
      { keys: ["Mod", "N"], action: "New document" },
      { keys: ["Mod", ","], action: "Settings" },
      { keys: ["Mod", "Shift", "E"], action: "Export scene" },
      { keys: ["Mod", "Shift", "P"], action: "Publish manuscript" },
      { keys: ["Mod", "/"], action: "Keyboard shortcuts" }
    ]
  },
  {
    title: "Writing",
    entries: [
      { keys: ["Mod", "B"], action: "Bold" },
      { keys: ["Mod", "I"], action: "Italic" },
      { keys: ["Mod", "U"], action: "Underline" },
      { keys: ["Mod", "Z"], action: "Undo" },
      { keys: ["Mod", "Shift", "Z"], action: "Redo" },
      { keys: ["Mod", "Y"], action: "Redo (alternate)" }
    ]
  },
  {
    title: "Search",
    entries: [
      { keys: ["Mod", "Shift", "F"], action: "Search the project" }
    ]
  },
  {
    title: "Layout",
    entries: [
      { keys: ["Mod", "Shift", "Enter"], action: "Toggle focus mode" },
      { keys: ["Esc"], action: "Leave focus mode" },
      { keys: ["Alt", "Click"], action: "Open scene, wiki page or file beside" }
    ]
  }
];

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

export function shortcutsToPlainText(groups: ShortcutGroup[], isMac: boolean): string {
  const lines = [SHORTCUTS_TITLE, ""];
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

/**
 * Builds a printable sheet with the action on the left and the keys on the
 * right. Long sheets continue on a second page without repeating headings.
 */
export async function buildShortcutsPdf(groups: ShortcutGroup[], isMac: boolean): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: SHORTCUTS_TITLE, creator: "ProseCraft" });

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
  doc.text(SHORTCUTS_TITLE, margin, y);
  y += 16;
  setText(9.5, "normal", muted);
  doc.text(isMac ? "macOS key layout" : "Windows and Linux key layout", margin, y);
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
