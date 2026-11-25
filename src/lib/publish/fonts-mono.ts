import cousineBold from "./fonts/Cousine-Bold.ttf?font-data";
import cousineBoldItalic from "./fonts/Cousine-BoldItalic.ttf?font-data";
import cousineItalic from "./fonts/Cousine-Italic.ttf?font-data";
import cousineRegular from "./fonts/Cousine-Regular.ttf?font-data";
import type { PdfFontFiles } from "./pdf-font-data";

export const MONO_FONT_FILES: PdfFontFiles = {
  normal: cousineRegular,
  bold: cousineBold,
  italic: cousineItalic,
  bolditalic: cousineBoldItalic
};
