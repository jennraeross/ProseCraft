export type ColorScheme =
  | "prosecraft"
  | "nord"
  | "gruvbox"
  | "solarized"
  | "catppuccin"
  | "everforest"
  | "rose-pine"
  | "dracula";

export const colorSchemeOptions: Array<{ value: ColorScheme; label: string }> = [
  { value: "prosecraft", label: "ProseCraft" },
  { value: "nord", label: "Nord" },
  { value: "gruvbox", label: "Gruvbox" },
  { value: "solarized", label: "Solarized" },
  { value: "catppuccin", label: "Catppuccin" },
  { value: "everforest", label: "Everforest" },
  { value: "rose-pine", label: "Rosé Pine" },
  { value: "dracula", label: "Dracula" }
];

export type PreviewPalette = {
  desk: string;
  page: string;
  ink: string;
  muted: string;
  rule: string;
  border: string;
  shadow: string;
};

export const defaultPreviewPalette: PreviewPalette = {
  desk: "#e8e8e2",
  page: "#ffffff",
  ink: "#1d211d",
  muted: "#73776f",
  rule: "#d9dbd4",
  border: "#d8d8d1",
  shadow: "0 14px 38px rgba(28, 32, 27, 0.12)"
};

export const defaultDarkPreviewPalette: PreviewPalette = {
  desk: "#111411",
  page: "#20231f",
  ink: "#e2e5df",
  muted: "#a1a89b",
  rule: "#3d4239",
  border: "#3a3f37",
  shadow: "0 14px 38px rgba(0, 0, 0, 0.5)"
};

export function isColorScheme(value: string | null): value is ColorScheme {
  return colorSchemeOptions.some((option) => option.value === value);
}

export function readPreviewPalette(): PreviewPalette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return value || fallback;
  };
  const shadowRgb = read("--p-shadow-rgb", "");
  const shadowAlpha = read("--p-preview-shadow-alpha", "");
  const shadow = shadowRgb && shadowAlpha
    ? `0 14px 38px rgba(${shadowRgb}, ${shadowAlpha})`
    : read("--shadow-preview-page", defaultPreviewPalette.shadow);

  return {
    desk: read("--page-bg", defaultPreviewPalette.desk),
    page: read("--surface-raised", defaultPreviewPalette.page),
    ink: read("--text-primary", defaultPreviewPalette.ink),
    muted: read("--text-muted", defaultPreviewPalette.muted),
    rule: read("--border", defaultPreviewPalette.rule),
    border: read("--border-control", defaultPreviewPalette.border),
    shadow
  };
}
