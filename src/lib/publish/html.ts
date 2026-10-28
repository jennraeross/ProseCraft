import {
  defaultDarkPreviewPalette,
  defaultPreviewPalette,
  type PreviewPalette
} from "../color-schemes";
import { markDropCapParagraph } from "./content";
import { matterParagraphs } from "./matter";
import { resolveStyleTokens, type PresetTokens } from "./presets";
import { listManuscriptSections, type ManuscriptSection } from "./sections";
import { escapeXml, escapeXmlAttribute } from "./xhtml";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type CompiledChapter,
  type CompiledMatterPage,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

function separatorMarkup(separator: SceneSeparator): string {
  switch (separator) {
    case "hash":
      return '<div class="scene-break" aria-hidden="true">#</div>';
    case "asterisks":
      return '<div class="scene-break" aria-hidden="true">* * *</div>';
    case "line":
      return '<div class="scene-break scene-break-line" aria-hidden="true"><span></span></div>';
    case "blank":
      return '<div class="scene-break scene-break-blank" aria-hidden="true"></div>';
    default:
      return "";
  }
}

function coverPageHtml(book: CompiledBook): string {
  if (!book.cover) return "";
  return `<section class="cover-page" style="background:${escapeXmlAttribute(book.cover.background)}" aria-label="Cover"><img src="${escapeXmlAttribute(book.cover.dataUrl)}" alt="Cover of ${escapeXmlAttribute(book.title)}" /></section>`;
}

function titlePageHtml(book: CompiledBook, includeCopyright: boolean): string {
  const parts = [
    '<section class="title-page">',
    '  <div class="title-page-main">',
    `    <h1 class="book-title">${escapeXml(book.title)}</h1>`,
    book.subtitle ? `    <p class="book-subtitle">${escapeXml(book.subtitle)}</p>` : "",
    book.author ? `    <p class="book-author">by ${escapeXml(book.author)}</p>` : "",
    "  </div>",
    includeCopyright && book.copyright
      ? `  <p class="book-copyright">${escapeXml(book.copyright).replace(/\n/g, "<br />")}</p>`
      : "",
    "</section>"
  ];
  return parts.filter(Boolean).join("\n");
}

function copyrightPageHtml(book: CompiledBook): string {
  if (!book.copyright) return "";
  return `<section class="copyright-page"><p>${escapeXml(book.copyright).replace(/\n/g, "<br />")}</p></section>`;
}

function dedicationHtml(book: CompiledBook): string {
  if (!book.dedication) return "";
  return `<section class="dedication"><p>${escapeXml(book.dedication).replace(/\n/g, "<br />")}</p></section>`;
}

function tableOfContentsHtml(book: CompiledBook): string {
  if (book.chapters.length === 0) return "";
  const entries = book.chapters
    .map((chapter) => `  <p class="toc-entry"><a href="#chapter-${escapeXmlAttribute(chapter.id)}">${escapeXml(chapter.label)}</a></p>`)
    .join("\n");
  return `<nav class="matter-page toc-page" aria-label="Table of contents">\n  <h2 class="matter-title">Contents</h2>\n${entries}\n</nav>`;
}

function matterPageHtml(page: CompiledMatterPage, placement: "front" | "back"): string {
  if (!page.title && !page.body && !page.blank) return "";
  const title = page.title ? `  <h2 class="matter-title">${escapeXml(page.title)}</h2>\n` : "";
  const paragraphs = matterParagraphs(page.body)
    .map((paragraph) => `  <p>${escapeXml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
  return `<section class="matter-page ${placement}-matter${page.blank && !title && !paragraphs ? " blank-matter-page" : ""}">\n${title}${paragraphs}${paragraphs ? "\n" : ""}</section>`;
}

function chapterHtml(
  chapter: CompiledChapter,
  options: PublishOptions,
  first: boolean,
  dropCaps: boolean
): string {
  const scenes = chapter.scenes.map((scene, index) => {
    const sceneTitle = options.includeSceneTitles
      ? `<h3 class="scene-title">${escapeXml(scene.title)}</h3>`
      : "";
    const separator = index < chapter.scenes.length - 1
      ? separatorMarkup(options.sceneSeparator)
      : "";
    const sceneHtml = dropCaps && index === 0 ? markDropCapParagraph(scene.html) : scene.html;
    return `<div class="scene">${sceneTitle}${sceneHtml}</div>${separator}`;
  }).join("\n");

  const breakClass = !first && options.pageBreakBeforeChapters ? " chapter-break" : "";
  const heading = options.includeChapterTitles
    ? `<h2 class="chapter-title">${escapeXml(chapter.label)}</h2>`
    : "";

  return `<section class="chapter${breakClass}" id="chapter-${escapeXmlAttribute(chapter.id)}">${heading}\n${scenes}</section>`;
}

export function buildManuscriptSectionHtml(
  book: CompiledBook,
  options: PublishOptions,
  section: ManuscriptSection,
  preview = false,
  dropCaps = options.dropCaps && resolveStyleTokens(options.style, options.customStyles).dropCap
): string {
  switch (section.kind) {
    case "cover":
      return coverPageHtml(book);
    case "title-page":
      return titlePageHtml(book, !options.includeCopyrightPage);
    case "copyright-page":
      return copyrightPageHtml(book);
    case "dedication":
      return dedicationHtml(book);
    case "contents":
      return tableOfContentsHtml(book);
    case "front-matter": {
      const page = book.frontMatter.find((entry) => entry.id === section.matterId);
      return page ? matterPageHtml(page, "front") : "";
    }
    case "back-matter": {
      const page = book.backMatter.find((entry) => entry.id === section.matterId);
      return page ? matterPageHtml(page, "back") : "";
    }
    case "chapter": {
      const index = book.chapters.findIndex((chapter) => chapter.id === section.chapterId);
      const chapter = book.chapters[index];
      if (!chapter) return "";
      return chapterHtml(chapter, options, preview || index === 0, dropCaps);
    }
  }
}

export function buildManuscriptBody(book: CompiledBook, options: PublishOptions): string {
  const dropCaps = options.dropCaps && resolveStyleTokens(options.style, options.customStyles).dropCap;
  return listManuscriptSections(book, options)
    .map((section) => buildManuscriptSectionHtml(book, options, section, false, dropCaps))
    .filter(Boolean)
    .join("\n");
}

function manuscriptCss(
  tokens: PresetTokens,
  options: PublishOptions,
  preview: boolean,
  dark = false,
  paginated = false,
  palette?: PreviewPalette
): string {
  const page = tokens.page;
  const inch = (value: number) => `${(value / 72).toFixed(3)}in`;
  const dropCaps = options.dropCaps && tokens.dropCap;
  const colors = preview
    ? palette ?? (dark ? defaultDarkPreviewPalette : defaultPreviewPalette)
    : defaultPreviewPalette;
  return `
    :root {
      --body-font: ${tokens.cssFontFamily};
      --body-size: ${tokens.bodySizePt}pt;
      --line-height: ${tokens.lineHeight};
      --paragraph-indent: ${tokens.paragraphIndentEm}em;
      --paragraph-spacing: ${tokens.paragraphSpacingEm}em;
      --chapter-size: ${tokens.chapterHeadingSizePt}pt;
      --chapter-align: ${tokens.chapterHeadingAlign};
      --chapter-before: ${tokens.chapterHeadingSpaceBefore}em;
      --chapter-after: ${tokens.chapterHeadingSpaceAfter}em;
      --scene-break-space: ${tokens.sceneBreakSpacing}em;
      --page-width: ${page.widthPt}pt;
      --page-height: ${page.heightPt}pt;
      --page-margin-top: ${page.marginTopPt}pt;
      --page-margin-right: ${page.marginRightPt}pt;
      --page-margin-bottom: ${page.marginBottomPt}pt;
      --page-margin-left: ${page.marginLeftPt}pt;
      --ink: ${colors.ink};
      --muted: ${colors.muted};
      --rule: ${colors.rule};
      --preview-desk: ${colors.desk};
      --page-bg: ${colors.page};
      --page-border: ${colors.border};
      --page-shadow: ${colors.shadow};
      color-scheme: ${preview && dark ? "dark" : "light"};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: ${preview ? "var(--preview-desk)" : "#ffffff"};
      color: var(--ink);
      font-family: var(--body-font);
      font-size: var(--body-size);
      line-height: var(--line-height);
      -webkit-font-smoothing: antialiased;
    }
    .book { max-width: ${inch(page.widthPt)}; margin: 0 auto; }
    .cover-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      padding: 0;
      overflow: hidden;
      page-break-after: always;
    }
    .cover-page img {
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: calc(var(--page-height) - var(--page-margin-top) - var(--page-margin-bottom));
      object-fit: contain;
    }
    .title-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 80vh;
      padding: 1.5in 0.6in;
      text-align: center;
      page-break-after: always;
    }
    .title-page-main { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .book-title {
      margin: 0;
      font-size: calc(var(--body-size) * 2.7);
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.16;
    }
    .book-subtitle { margin: 0.65em 0 0; font-size: 1.15em; font-style: italic; color: var(--muted); }
    .book-author { margin: 2.2em 0 0; font-size: 1.05em; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .book-copyright { margin: 0; font-size: 0.72em; line-height: 1.6; color: var(--muted); }
    .dedication {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 70vh;
      padding: 1in;
      text-align: center;
      font-style: italic;
      page-break-after: always;
    }
    .dedication p { margin: 0; max-width: 22em; }
    .copyright-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 70vh;
      padding: 1in;
      text-align: center;
      page-break-after: always;
    }
    .copyright-page p {
      max-width: 26em;
      margin: 0;
      color: var(--muted);
      font-size: 0.82em;
      line-height: 1.65;
    }
    .matter-page {
      min-height: 70vh;
      padding: 0.9in 0.6in;
      page-break-after: always;
    }
    .matter-title {
      margin: 0 0 1.2em;
      color: var(--ink);
      font-size: 1.5em;
      font-weight: 600;
      line-height: 1.25;
      text-align: center;
      text-indent: 0;
    }
    .matter-page p {
      margin: 0 0 var(--paragraph-spacing);
      text-align: ${tokens.justify ? "justify" : "left"};
      text-indent: 0;
      hyphens: auto;
    }
    .back-matter { break-before: page; page-break-before: always; }
    .toc-entry { margin: 0 0 0.7em; text-indent: 0; }
    .toc-entry a {
      color: inherit;
      text-decoration: none;
      text-underline-offset: 2px;
    }
    .toc-entry a:hover { text-decoration: underline; }
    .chapter { padding: 0; }
    .chapter-break { break-before: page; page-break-before: always; }
    .chapter-title {
      margin: var(--chapter-before) 0 var(--chapter-after);
      color: var(--ink);
      font-size: var(--chapter-size);
      font-weight: 600;
      letter-spacing: ${tokens.chapterHeadingUppercase ? "0.1em" : "0"};
      line-height: 1.25;
      text-align: var(--chapter-align);
      text-transform: ${tokens.chapterHeadingUppercase ? "uppercase" : "none"};
    }
    .scene p, .scene div {
      margin: 0 0 var(--paragraph-spacing);
      text-align: ${tokens.justify ? "justify" : "left"};
      text-indent: var(--paragraph-indent);
      hyphens: auto;
    }
    .scene > :first-child { text-indent: 0; }
    .scene > .continuation { text-indent: var(--paragraph-indent); }
    .scene h1, .scene h2, .scene h3 {
      margin: 1.2em 0 0.55em;
      font-weight: 600;
      line-height: 1.3;
      text-indent: 0;
      break-after: avoid;
    }
    .scene h1 { font-size: 1.45em; }
    .scene h2 { font-size: 1.28em; }
    .scene h3 { font-size: 1.12em; }
    .scene blockquote {
      margin: 1.1em 1.4em;
      padding-left: 1em;
      border-left: 2px solid var(--rule);
      color: var(--muted);
      font-style: italic;
      text-indent: 0;
    }
    .scene ul, .scene ol { margin: 0 0 var(--paragraph-spacing); padding-left: 1.5em; }
    .scene li { text-indent: 0; }
    .scene a { color: inherit; text-decoration-color: var(--rule); text-underline-offset: 2px; }
    .scene img {
      display: block;
      max-width: 100%;
      max-height: min(4in, calc(var(--page-height) - var(--page-margin-top) - var(--page-margin-bottom) - 2em));
      height: auto;
      margin: 0.75em auto;
      object-fit: contain;
      text-indent: 0;
    }
    .scene .eyebrow {
      margin: 0 0 0.6em;
      color: var(--muted);
      font-family: ui-sans-serif, sans-serif;
      font-size: 0.62em;
      font-weight: 700;
      letter-spacing: 0.13em;
      line-height: 1.5;
      text-indent: 0;
    }
    .scene-title {
      margin: 1em 0 0.6em;
      font-size: 1em;
      font-weight: 600;
      font-style: italic;
      letter-spacing: 0.01em;
      text-indent: 0;
    }
    .scene-break {
      margin: var(--scene-break-space) 0;
      color: var(--muted);
      font-size: 0.9em;
      letter-spacing: 0.45em;
      text-align: center;
      text-indent: 0;
    }
    .scene-break-hash, .scene-break-asterisks { }
    .scene-break-blank { height: var(--scene-break-space); margin: 0; }
    .scene-break-line span {
      display: block;
      width: 3.2em;
      margin: 0 auto;
      border-top: 1px solid var(--rule);
    }
    ${dropCaps ? `
    .scene .drop-cap { text-indent: 0; }
    .scene .drop-cap::first-letter {
      float: left;
      padding: 0.06em 0.09em 0 0;
      font-size: 4.5em;
      font-weight: 600;
      line-height: 0.82;
    }
    ` : ""}
    ${preview ? `
    body { padding: 16px; }
    .book {
      margin: 0 auto 12px;
      padding: ${inch(page.marginTopPt)} ${inch(page.marginRightPt)} ${inch(page.marginBottomPt)} ${inch(page.marginLeftPt)};
      border: 1px solid var(--page-border);
      background: var(--page-bg);
      box-shadow: var(--page-shadow);
      zoom: var(--preview-scale, 1);
    }
    .scene a { pointer-events: none; }
    .book > .cover-page {
      width: calc(100% + var(--page-margin-left) + var(--page-margin-right));
      min-height: calc(var(--page-height) - var(--page-margin-top) - var(--page-margin-bottom));
      margin: calc(-1 * var(--page-margin-top)) calc(-1 * var(--page-margin-right)) calc(-1 * var(--page-margin-bottom)) calc(-1 * var(--page-margin-left));
    }
    .title-page { min-height: calc(var(--page-height) - var(--page-margin-top) - var(--page-margin-bottom)); }
    .dedication { min-height: 60vh; }
    .preview-empty { margin: 2in 1in; color: var(--muted); font-family: ui-sans-serif, sans-serif; font-size: 13px; text-align: center; }
    ${paginated ? `
    .preview-source { display: none; }
    .preview-pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 22px;
      width: max-content;
      margin: 0 auto;
      padding-bottom: 8px;
      zoom: var(--preview-scale, 1);
    }
    .page {
      position: relative;
      width: var(--page-width);
      height: var(--page-height);
      padding: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
      overflow: hidden;
      border: 1px solid var(--page-border);
      background: var(--page-bg);
      box-shadow: var(--page-shadow);
    }
    .page-content { position: relative; height: 100%; overflow: hidden; }
    .page-header, .page-footer {
      position: absolute;
      left: var(--page-margin-left);
      right: var(--page-margin-right);
      color: var(--muted);
      font-family: ui-sans-serif, sans-serif;
      font-size: 8.5pt;
      line-height: 1.2;
      text-align: center;
    }
    .page-header { top: calc(var(--page-margin-top) / 2); }
    .page-footer { bottom: calc(var(--page-margin-bottom) / 2); }
    .page.cover-preview-page { padding: 0; }
    .page.cover-preview-page .page-content { height: 100%; overflow: hidden; }
    .page .cover-page { height: 100%; min-height: 0; padding: 0; }
    .page .cover-page img { width: 100%; height: 100%; object-fit: contain; }
    .page .title-page, .page .dedication { min-height: 100%; padding: 0; }
    .page .copyright-page { min-height: 100%; padding: 0; }
    .page .matter-page, .page .toc-page { min-height: 0; padding: 0; }
    .page .chapter { padding: 0; }
    .page .preview-empty { margin: 2in 1in; }
    ` : ""}
    ` : ""}
    @page {
      size: ${inch(page.widthPt)} ${inch(page.heightPt)};
      margin: ${inch(page.marginTopPt)} ${inch(page.marginRightPt)} ${inch(page.marginBottomPt)} ${inch(page.marginLeftPt)};
    }
    @media print {
      body { background: #ffffff; }
      .book { max-width: none; }
      .chapter-break { break-before: page; }
      .cover-page, .title-page, .dedication, .copyright-page, .matter-page { break-after: page; }
      .back-matter { break-before: page; }
    }
  `;
}

type PreviewRenderOptions = {
  dark?: boolean;
  paginated?: boolean;
  palette?: PreviewPalette;
  section?: ManuscriptSection | null;
};

function documentShell(
  title: string,
  body: string,
  css: string,
  classes: string,
  bodyAttributes = ""
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeXml(title)}</title>
  <style>${css}</style>
</head>
<body class="${classes}"${bodyAttributes ? ` ${bodyAttributes}` : ""}>
${body}
</body>
</html>`;
}

export function buildPreviewHtml(
  book: CompiledBook,
  options: PublishOptions,
  render: PreviewRenderOptions = {}
): string {
  const tokens = resolveStyleTokens(options.style, options.customStyles);
  const page = tokens.page;
  const dark = render.dark ?? false;
  const paginated = render.paginated ?? false;
  const palette = render.palette ?? (dark ? defaultDarkPreviewPalette : defaultPreviewPalette);
  const section = render.section ?? listManuscriptSections(book, options)[0] ?? null;
  const content = section ? buildManuscriptSectionHtml(book, options, section, true) : "";
  const hasContent = content.length > 0;
  const renderedContent = hasContent
    ? content
    : '<p class="preview-empty">Add a scene to see a preview of your manuscript.</p>';
  const usePages = paginated && hasContent;
  const body = usePages
    ? `<div id="preview-source" class="preview-source">${renderedContent}</div>
<div id="preview-pages" class="preview-pages"></div>`
    : `<div class="book">
${renderedContent}
</div>`;
  const classes = [
    options.dropCaps && tokens.dropCap ? "drop-caps" : "",
    dark ? "preview-dark" : "",
    usePages ? "preview-paginated" : ""
  ].filter(Boolean).join(" ");
  const header = book.author ? `${book.author} / ${book.title}` : book.title;
  const attributes = [
    `data-page-width-pt="${page.widthPt}"`,
    `data-page-height-pt="${page.heightPt}"`,
    `data-page-margin-top-pt="${page.marginTopPt}"`,
    `data-page-margin-right-pt="${page.marginRightPt}"`,
    `data-page-margin-bottom-pt="${page.marginBottomPt}"`,
    `data-page-margin-left-pt="${page.marginLeftPt}"`,
    `data-paginated="${usePages ? "true" : "false"}"`,
    `data-page-numbers="${tokens.pageNumbers ? "true" : "false"}"`,
    `data-running-header="${escapeXmlAttribute(tokens.runningHeader ? header : "")}"`
  ].join(" ");
  return documentShell(
    `${book.title} preview`,
    body,
    manuscriptCss(tokens, options, true, dark, usePages, palette),
    classes,
    attributes
  );
}

export function exportHtml(book: CompiledBook, options: PublishOptions): ExportPayload {
  const tokens = resolveStyleTokens(options.style, options.customStyles);
  const body = buildManuscriptBody(book, options);
  const html = documentShell(
    book.title,
    `<div class="book">\n${body}\n</div>`,
    manuscriptCss(tokens, options, false),
    options.dropCaps && tokens.dropCap ? "drop-caps" : ""
  );
  return {
    blob: new Blob([html], { type: "text/html;charset=utf-8" }),
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.html.extension}`,
    extension: FORMAT_INFO.html.extension,
    formatName: FORMAT_INFO.html.formatName
  };
}
