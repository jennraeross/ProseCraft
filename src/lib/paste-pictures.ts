import { sanitizeHtml } from "./sanitize";

const PICTURE_RE = /<img[\s/>]/i;
// Chromium marks a copy that starts or ends at a block edge with these breaks;
// inserted at the caret they would be stray line breaks.
const INTERCHANGE_BREAK = '<br class="Apple-interchange-newline">';

/**
 * Google Docs wraps a copy in `<b style="font-weight:normal" id="docs-internal-guid-…">`,
 * and other apps use bold tags set back to normal weight. They are not bold,
 * so they are unwrapped before the sanitizer would keep them as bold.
 */
function unwrapNormalWeightBold(root: ParentNode) {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("b, strong"))) {
    const weight = element.style.fontWeight;
    if (weight === "normal" || weight === "400" || element.id.startsWith("docs-internal-guid-")) {
      element.replaceWith(...Array.from(element.childNodes));
    }
  }
}

/**
 * Pasted HTML that holds a picture, sanitized for insertion at the caret, or
 * null when the HTML has no picture and the browser's own paste can handle it.
 * Pictures the editor cannot keep (anything but embedded images) are dropped
 * here, so the result can be empty.
 */
export function pastedPictureHtml(html: string): string | null {
  if (!PICTURE_RE.test(html)) return null;
  const parsed = new DOMParser().parseFromString(html.replaceAll(INTERCHANGE_BREAK, ""), "text/html");
  // Code and page metadata from the copied page are not writing; the sanitizer
  // would keep their text, so they go with their contents here.
  for (const element of Array.from(parsed.querySelectorAll("noscript, script, style, template, title"))) element.remove();
  unwrapNormalWeightBold(parsed.body);
  return sanitizeHtml(parsed.body.innerHTML).trim();
}
