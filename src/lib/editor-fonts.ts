export type RichTextFontPreference =
  | "serif"
  | "sans"
  | "mono"
  | "bitter"
  | "literata"
  | "ibm-plex-serif"
  | "ibm-plex-sans";

export type MarkdownFontPreference = "sf-mono" | "menlo" | "monaco" | "courier";

export type SystemFontFamily = {
  family: string;
  monospaced: boolean;
};

export type EditorFontOption<T extends string> = {
  id: T;
  label: string;
};

export type EditorFontSelection =
  | { source: "builtin"; id: string }
  | { source: "system"; family: string };

export const RICH_TEXT_FONT_OPTIONS: ReadonlyArray<EditorFontOption<RichTextFontPreference>> = [
  { id: "serif", label: "Georgia" },
  { id: "bitter", label: "Bitter" },
  { id: "literata", label: "Literata" },
  { id: "ibm-plex-serif", label: "IBM Plex Serif" },
  { id: "ibm-plex-sans", label: "IBM Plex Sans" },
  { id: "sans", label: "System Sans Serif" },
  { id: "mono", label: "SF Mono" }
];

export const MARKDOWN_FONT_OPTIONS: ReadonlyArray<EditorFontOption<MarkdownFontPreference>> = [
  { id: "sf-mono", label: "SF Mono" },
  { id: "menlo", label: "Menlo" },
  { id: "monaco", label: "Monaco" },
  { id: "courier", label: "Courier New" }
];

export const RICH_TEXT_FONT_STACKS: Record<RichTextFontPreference, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  bitter: '"Bitter Variable", Georgia, serif',
  literata: '"Literata Variable", Georgia, serif',
  "ibm-plex-serif": '"IBM Plex Serif", Georgia, serif',
  "ibm-plex-sans": '"IBM Plex Sans", Inter, sans-serif'
};

export const MARKDOWN_FONT_STACKS: Record<MarkdownFontPreference, string> = {
  "sf-mono": '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  menlo: 'Menlo, "SFMono-Regular", monospace',
  monaco: 'Monaco, "SFMono-Regular", monospace',
  courier: '"Courier New", Courier, monospace'
};

export function isRichTextFontPreference(value: string | null): value is RichTextFontPreference {
  return value !== null && Object.prototype.hasOwnProperty.call(RICH_TEXT_FONT_STACKS, value);
}

export function isMarkdownFontPreference(value: string | null): value is MarkdownFontPreference {
  return value !== null && Object.prototype.hasOwnProperty.call(MARKDOWN_FONT_STACKS, value);
}

function quoteFontFamily(family: string): string {
  return `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ")}"`;
}

export function richTextFontStack(
  preference: RichTextFontPreference,
  systemFamily: string
): string {
  const family = systemFamily.trim();
  if (!family) return RICH_TEXT_FONT_STACKS[preference];
  return `${quoteFontFamily(family)}, ${RICH_TEXT_FONT_STACKS[preference]}`;
}

export function markdownFontStack(
  preference: MarkdownFontPreference,
  systemFamily: string
): string {
  const family = systemFamily.trim();
  if (!family) return MARKDOWN_FONT_STACKS[preference];
  return `${quoteFontFamily(family)}, ${MARKDOWN_FONT_STACKS[preference]}`;
}

let systemFontsPromise: Promise<SystemFontFamily[]> | undefined;

/**
 * Lists installed font families for the editor pickers. This is intentionally
 * device-local: no font files or family names are written to project data.
 */
export function listSystemFontFamilies(): Promise<SystemFontFamily[]> {
  if (!systemFontsPromise) {
    systemFontsPromise = readSystemFontFamilies().catch((error: unknown) => {
      systemFontsPromise = undefined;
      throw error;
    });
  }
  return systemFontsPromise;
}

async function readSystemFontFamilies(): Promise<SystemFontFamily[]> {
  const { invoke, isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) return [];

  const fonts = await invoke<SystemFontFamily[]>("list_system_font_families");
  const seen = new Set<string>();
  return fonts
    .filter((font) => typeof font.family === "string" && font.family.trim().length > 0)
    .map((font) => ({
      family: font.family.trim(),
      monospaced: Boolean(font.monospaced)
    }))
    .filter((font) => {
      const key = font.family.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.family.localeCompare(b.family, undefined, { sensitivity: "base" }));
}
