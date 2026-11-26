import arimoBold from "./fonts/Arimo-Bold.ttf?font-data";
import arimoBoldItalic from "./fonts/Arimo-BoldItalic.ttf?font-data";
import arimoItalic from "./fonts/Arimo-Italic.ttf?font-data";
import arimoRegular from "./fonts/Arimo-Regular.ttf?font-data";
import type { PdfFontFiles } from "./pdf-font-data";

export const SANS_FONT_FILES: PdfFontFiles = {
  normal: arimoRegular,
  bold: arimoBold,
  italic: arimoItalic,
  bolditalic: arimoBoldItalic
};
