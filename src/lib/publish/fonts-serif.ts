import tinosBold from "./fonts/Tinos-Bold.ttf?font-data";
import tinosBoldItalic from "./fonts/Tinos-BoldItalic.ttf?font-data";
import tinosItalic from "./fonts/Tinos-Italic.ttf?font-data";
import tinosRegular from "./fonts/Tinos-Regular.ttf?font-data";
import type { PdfFontFiles } from "./pdf-font-data";

export const SERIF_FONT_FILES: PdfFontFiles = {
  normal: tinosRegular,
  bold: tinosBold,
  italic: tinosItalic,
  bolditalic: tinosBoldItalic
};
