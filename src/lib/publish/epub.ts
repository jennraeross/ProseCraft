import { strToU8, zipSync, type Zippable } from "fflate";
import { markDropCapParagraph } from "./content";
import { decodeEmbeddedImage } from "./embedded-image";
import { PRESETS } from "./presets";
import { escapeXml, htmlToXhtml } from "./xhtml";
import {
  FORMAT_INFO,
  slugifyFilename,
  type CompiledBook,
  type ExportPayload,
  type PublishOptions,
  type SceneSeparator
} from "./types";

function separatorXhtml(separator: SceneSeparator): string {
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

function xhtmlPage(title: string, body: string, bodyClass = ""): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css" />
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
${body}
</body>
</html>
`;
}

function titlePageXhtml(book: CompiledBook): string {
  const lines = [
    '<div class="title-page">',
    `  <h1 class="book-title">${escapeXml(book.title)}</h1>`,
    book.subtitle ? `  <p class="book-subtitle">${escapeXml(book.subtitle)}</p>` : "",
    book.author ? `  <p class="book-author">by ${escapeXml(book.author)}</p>` : "",
    book.copyright
      ? `  <p class="book-copyright">${escapeXml(book.copyright).replace(/\n/g, "<br />")}</p>`
      : "",
    "</div>"
  ];
  return xhtmlPage(book.title, lines.filter(Boolean).join("\n"), "titlepage");
}

function dedicationXhtml(book: CompiledBook): string {
  return xhtmlPage(
    "Dedication",
    `<div class="dedication"><p>${escapeXml(book.dedication).replace(/\n/g, "<br />")}</p></div>`,
    "dedication-page"
  );
}

function chapterXhtml(
  book: CompiledBook,
  options: PublishOptions,
  chapterIndex: number,
  imagePaths: Map<string, string>
): string {
  const chapter = book.chapters[chapterIndex];
  const first = chapterIndex === 0;
  const heading = options.includeChapterTitles
    ? `<h2 class="chapter-title">${escapeXml(chapter.label)}</h2>`
    : "";
  const dropCaps = options.dropCaps && PRESETS[options.style].dropCap;
  const scenes = chapter.scenes.map((scene, index) => {
    const sceneTitle = options.includeSceneTitles
      ? `<h3 class="scene-title">${escapeXml(scene.title)}</h3>`
      : "";
    const separator = index < chapter.scenes.length - 1
      ? separatorXhtml(options.sceneSeparator)
      : "";
    const sceneHtml = dropCaps && index === 0 ? markDropCapParagraph(scene.html) : scene.html;
    return `<div class="scene">${sceneTitle}${htmlToXhtml(sceneHtml, (src) => imagePaths.get(src) ?? src)}</div>${separator}`;
  }).join("\n");

  const breakClass = !first && options.pageBreakBeforeChapters ? " chapter-break" : "";
  const dropCapsClass = dropCaps ? " drop-caps" : "";
  return xhtmlPage(
    chapter.label,
    `<section class="chapter${breakClass}">${heading}\n${scenes}</section>`,
    `chapter-page${dropCapsClass}`
  );
}

function stylesheet(options: PublishOptions): string {
  const tokens = PRESETS[options.style];
  const headingEm = (tokens.chapterHeadingSizePt / tokens.bodySizePt).toFixed(2);
  return `body {
  margin: 0;
  color: #1d211d;
  font-family: ${tokens.cssFontFamily};
  font-size: 1em;
  line-height: ${tokens.lineHeight};
}
h1, h2, h3, p, div, blockquote, ul, ol, li { margin-top: 0; }
.titlepage, .dedication-page { text-align: center; }
.title-page { margin-top: 28%; }
.book-title { font-size: 2.2em; font-weight: 500; line-height: 1.2; margin-bottom: 0.4em; }
.book-subtitle { font-size: 1.1em; font-style: italic; color: #666; margin-bottom: 2.5em; }
.book-author { font-size: 1em; letter-spacing: 0.08em; text-transform: uppercase; color: #666; }
.book-copyright { margin-top: 4em; font-size: 0.72em; line-height: 1.6; color: #666; }
.dedication { margin-top: 28%; font-style: italic; }
.chapter-break { break-before: page; page-break-before: always; }
.chapter-title {
  margin: ${tokens.chapterHeadingSpaceBefore}em 0 ${tokens.chapterHeadingSpaceAfter}em;
  font-size: ${headingEm}em;
  font-weight: 600;
  letter-spacing: ${tokens.chapterHeadingUppercase ? "0.1em" : "0"};
  line-height: 1.25;
  text-align: ${tokens.chapterHeadingAlign};
  text-transform: ${tokens.chapterHeadingUppercase ? "uppercase" : "none"};
}
.scene p {
  margin: 0 0 ${tokens.paragraphSpacingEm}em;
  text-indent: ${tokens.paragraphIndentEm}em;
  text-align: ${tokens.justify ? "justify" : "left"};
}
.scene p:first-of-type { text-indent: 0; }
.scene h1, .scene h2, .scene h3 {
  margin: 1.2em 0 0.55em;
  font-weight: 600;
  line-height: 1.3;
  text-indent: 0;
}
.scene h1 { font-size: 1.45em; }
.scene h2 { font-size: 1.28em; }
.scene h3 { font-size: 1.12em; }
.scene blockquote {
  margin: 1.1em 1.4em;
  padding-left: 1em;
  border-left: 2px solid #d9dbd4;
  color: #666;
  font-style: italic;
  text-indent: 0;
}
.scene ul, .scene ol { margin: 0 0 ${tokens.paragraphSpacingEm}em; padding-left: 1.5em; }
.scene li { text-indent: 0; }
.scene a { color: inherit; text-decoration-color: #b9bdb5; text-underline-offset: 2px; }
.scene img { display: block; max-width: 100%; max-height: min(4in, 60vh); height: auto; margin: 0.75em auto; object-fit: contain; }
.scene .eyebrow {
  margin: 0 0 0.6em;
  color: #777;
  font-family: sans-serif;
  font-size: 0.62em;
  font-weight: 700;
  letter-spacing: 0.13em;
  line-height: 1.5;
  text-indent: 0;
}
.scene-title {
  margin: 1em 0 0.6em;
  font-size: 1em;
  font-style: italic;
  font-weight: 600;
  text-indent: 0;
}
.scene-break {
  margin: ${tokens.sceneBreakSpacing}em 0;
  color: #777;
  font-size: 0.9em;
  letter-spacing: 0.45em;
  text-align: center;
  text-indent: 0;
}
.scene-break-blank { height: ${tokens.sceneBreakSpacing}em; margin: 0; }
.scene-break-line span {
  display: block;
  width: 3.2em;
  margin: 0 auto;
  border-top: 1px solid #d9dbd4;
}
${options.dropCaps && tokens.dropCap ? `
.scene .drop-cap { text-indent: 0; }
.drop-caps .scene .drop-cap::first-letter {
  float: left;
  padding: 0.06em 0.09em 0 0;
  font-size: 4.5em;
  font-weight: 600;
  line-height: 0.82;
}
` : ""}
`;
}

function navXhtml(book: CompiledBook, chapterItems: Array<{ href: string; label: string }>): string {
  const items = chapterItems
    .map((item) => `      <li><a href="${item.href}">${escapeXml(item.label)}</a></li>`)
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>
`;
}

function bookIdentifier(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `urn:uuid:${crypto.randomUUID()}`;
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ncx(book: CompiledBook, identifier: string, chapterItems: Array<{ href: string; label: string }>): string {
  const points = chapterItems
    .map((item, index) => `    <navPoint id="nav-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(item.label)}</text></navLabel>
      <content src="${item.href}" />
    </navPoint>`)
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(book.title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`;
}

export async function exportEpub(book: CompiledBook, options: PublishOptions): Promise<ExportPayload> {
  const identifier = bookIdentifier();
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const files: Zippable = {};
  files["mimetype"] = [strToU8("application/epub+zip"), { level: 0 }];
  const imagePaths = new Map<string, string>();
  const imageManifest: string[] = [];
  let imageIndex = 0;
  for (const chapter of book.chapters) {
    for (const scene of chapter.scenes) {
      const parsed = new DOMParser().parseFromString(scene.html, "text/html");
      for (const image of Array.from(parsed.body.querySelectorAll("img"))) {
        const src = image.getAttribute("src") ?? "";
        if (!src || imagePaths.has(src)) continue;
        const asset = await decodeEmbeddedImage(src);
        imageIndex += 1;
        const filename = `image-${imageIndex}.${asset.extension}`;
        const id = `image-${imageIndex}`;
        imagePaths.set(src, `../images/${filename}`);
        files[`OEBPS/images/${filename}`] = asset.bytes;
        imageManifest.push(`    <item id="${id}" href="images/${filename}" media-type="${asset.mediaType}" />`);
      }
    }
  }

  const chapterItems = book.chapters.map((chapter, index) => ({
    href: `text/chapter-${index + 1}.xhtml`,
    label: chapter.label
  }));

  const manifest: string[] = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />',
    '    <item id="css" href="styles.css" media-type="text/css" />',
    ...imageManifest
  ];
  const spine: string[] = [];

  if (options.includeTitlePage) {
    manifest.push('    <item id="titlepage" href="text/titlepage.xhtml" media-type="application/xhtml+xml" />');
    spine.push('    <itemref idref="titlepage" />');
  }
  if (book.dedication) {
    manifest.push('    <item id="dedication" href="text/dedication.xhtml" media-type="application/xhtml+xml" />');
    spine.push('    <itemref idref="dedication" />');
  }
  book.chapters.forEach((_, index) => {
    manifest.push(`    <item id="chapter-${index + 1}" href="text/chapter-${index + 1}.xhtml" media-type="application/xhtml+xml" />`);
    spine.push(`    <itemref idref="chapter-${index + 1}" />`);
  });

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    ${book.author ? `<dc:creator>${escapeXml(book.author)}</dc:creator>` : ""}
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifest.join("\n")}
  </manifest>
  <spine toc="ncx">
${spine.join("\n")}
  </spine>
</package>
`;

  files["META-INF/container.xml"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`);
  files["OEBPS/content.opf"] = strToU8(opf);
  files["OEBPS/nav.xhtml"] = strToU8(navXhtml(book, chapterItems));
  files["OEBPS/toc.ncx"] = strToU8(ncx(book, identifier, chapterItems));
  files["OEBPS/styles.css"] = strToU8(stylesheet(options));
  if (options.includeTitlePage) files["OEBPS/text/titlepage.xhtml"] = strToU8(titlePageXhtml(book));
  if (book.dedication) files["OEBPS/text/dedication.xhtml"] = strToU8(dedicationXhtml(book));
  book.chapters.forEach((_, index) => {
    files[`OEBPS/text/chapter-${index + 1}.xhtml`] = strToU8(chapterXhtml(book, options, index, imagePaths));
  });

  const bytes = zipSync(files);
  return {
    blob: new Blob([bytes as BlobPart], { type: "application/epub+zip" }),
    filename: `${slugifyFilename(book.title)}.${FORMAT_INFO.epub.extension}`,
    extension: FORMAT_INFO.epub.extension,
    formatName: FORMAT_INFO.epub.formatName
  };
}
