import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { compileBook } from "../publish/compile";
import type { ProjectData } from "../storage/types";
import { createStoredProject, isLegacyProjectData, isStoredProject } from "../storage/schema";
import { MAX_EMBEDDED_IMAGE_BYTES } from "../sanitize";
import { buildEpubProject, parseEpub, type EpubManuscript } from "./epub";

type ManifestEntry = {
  id: string;
  href: string;
  type?: string;
  properties?: string;
};

type EpubSpec = {
  title?: string;
  creator?: string;
  /** Extra raw metadata markup, e.g. `<meta name="cover" content="id"/>`. */
  metadata?: string;
  manifest: ManifestEntry[];
  spine: string[];
  /** Manifest id of the NCX, which also sets `spine@toc`. */
  ncx?: string;
  guide?: string;
  files: Record<string, string | Uint8Array>;
};

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

function packageDocument(spec: EpubSpec): string {
  const metadata = [
    spec.title === undefined ? "" : `<dc:title>${spec.title}</dc:title>`,
    spec.creator === undefined ? "" : `<dc:creator>${spec.creator}</dc:creator>`,
    spec.metadata ?? ""
  ].join("");
  const manifest = spec.manifest
    .map((item) => {
      const type = item.type ?? "application/xhtml+xml";
      const properties = item.properties ? ` properties="${item.properties}"` : "";
      return `<item id="${item.id}" href="${item.href}" media-type="${type}"${properties}/>`;
    })
    .join("\n    ");
  const spine = spec.spine.map((id) => `<itemref idref="${id}"/>`).join("\n    ");
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">test-book</dc:identifier>
    ${metadata}
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine${spec.ncx ? ` toc="${spec.ncx}"` : ""}>
    ${spine}
  </spine>
  ${spec.guide ?? ""}
</package>`;
}

function makeEpub(spec: EpubSpec): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "META-INF/container.xml": strToU8(CONTAINER),
    "OEBPS/content.opf": strToU8(packageDocument(spec))
  };
  for (const [name, value] of Object.entries(spec.files)) {
    files[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(files);
}

function xhtml(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>${body}</body>
</html>`;
}

function navDocument(entries: string): string {
  return xhtml(`<nav epub:type="toc"><ol>${entries}</ol></nav>`);
}

function bytes(value: number[]): Uint8Array {
  return new Uint8Array(value);
}

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
const GIF = bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

describe("parseEpub", () => {
  it("reads an EPUB3 navigation document and package metadata", async () => {
    const data = makeEpub({
      title: "A Test Book",
      creator: "Ada Lovelace",
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "cover", href: "cover.xhtml" },
        { id: "title-page", href: "title-page.xhtml" },
        { id: "ch1", href: "ch1.xhtml" },
        { id: "ch2", href: "ch2.xhtml" }
      ],
      spine: ["nav", "cover", "title-page", "ch1", "ch2"],
      guide: `<guide><reference type="title-page" href="title-page.xhtml"/></guide>`,
      files: {
        "OEBPS/nav.xhtml": navDocument(
          '<li><a href="ch1.xhtml">Chapter One</a></li><li><a href="ch2.xhtml#start">Chapter Two</a></li>'
        ),
        "OEBPS/cover.xhtml": xhtml("<p>Cover</p>"),
        "OEBPS/title-page.xhtml": xhtml("<p>Title Page</p>"),
        "OEBPS/ch1.xhtml": xhtml("<h1>Chapter One</h1><p>First <strong>scene</strong>.</p>"),
        "OEBPS/ch2.xhtml": xhtml('<h2 id="start">Chapter Two</h2><p>Second scene.</p>')
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.title).toBe("A Test Book");
    expect(manuscript.author).toBe("Ada Lovelace");
    expect(manuscript.skippedImages).toBe(0);
    expect(manuscript.chapters.map((chapter) => chapter.title)).toEqual([
      "Chapter One",
      "Chapter Two"
    ]);
    expect(manuscript.chapters[0].scenes).toHaveLength(1);
    expect(manuscript.chapters[0].scenes[0].content).toContain("<strong>scene</strong>");
    // The chapter heading is promoted to the chapter title, not repeated.
    expect(manuscript.chapters[1].scenes[0].content).not.toContain("Chapter Two");
    expect(manuscript.chapters[1].scenes[0].content).toContain("Second scene.");
  });

  it("reads an EPUB2 NCX table of contents", async () => {
    const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="p1"><navLabel><text>Opening</text></navLabel><content src="ch1.xhtml"/></navPoint>
    <navPoint id="p2"><navLabel><text>Closing</text></navLabel><content src="ch2.xhtml"/></navPoint>
  </navMap>
</ncx>`;
    const data = makeEpub({
      manifest: [
        { id: "ncx", href: "toc.ncx", type: "application/x-dtbncx+xml" },
        { id: "ch1", href: "ch1.xhtml" },
        { id: "ch2", href: "ch2.xhtml" }
      ],
      spine: ["ch1", "ch2"],
      ncx: "ncx",
      files: {
        "OEBPS/toc.ncx": ncx,
        "OEBPS/ch1.xhtml": xhtml("<p>Opening line.</p>"),
        "OEBPS/ch2.xhtml": xhtml("<p>Closing line.</p>")
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.chapters.map((chapter) => chapter.title)).toEqual(["Opening", "Closing"]);
  });

  it("falls back to one chapter per spine document when there is no usable TOC", async () => {
    const data = makeEpub({
      manifest: [
        { id: "alpha", href: "alpha.xhtml" },
        { id: "numeric", href: "chapter1.xhtml" }
      ],
      spine: ["alpha", "numeric"],
      files: {
        "OEBPS/alpha.xhtml": xhtml("<h1>Alpha</h1><p>Alpha text.</p>"),
        "OEBPS/chapter1.xhtml": xhtml("<p>Numeric text.</p>")
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.chapters).toHaveLength(2);
    expect(manuscript.chapters[0].title).toBe("Alpha");
    expect(manuscript.chapters[0].scenes[0].content).not.toContain("Alpha</h1>");
    expect(manuscript.chapters[1].title).toBe("Chapter 2");
  });

  it("splits a chapter into scenes on thematic breaks", async () => {
    const data = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>'),
        "OEBPS/ch1.xhtml": xhtml(
          "<h1>Chapter One</h1><p>First part.</p><hr/>"
          + '<p>Second part.</p><p class="scene-break">* * *</p><p>Third part.</p>'
        )
      }
    });

    const manuscript = await parseEpub(data);
    const scenes = manuscript.chapters[0].scenes;

    expect(scenes.map((scene) => scene.title)).toEqual(["Chapter One", "Scene 2", "Scene 3"]);
    expect(scenes.map((scene) => scene.content)).toEqual([
      "<p>First part.</p>",
      "<p>Second part.</p>",
      "<p>Third part.</p>"
    ]);
  });

  it("flattens chapter wrappers, resolves anchors on wrappers, and skips TOC furniture", async () => {
    const data = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument(
          '<li><a href="ch1.xhtml#contents">Contents</a></li>'
          + '<li><a href="ch1.xhtml#one">Chapter One Begins</a></li>'
        ),
        "OEBPS/ch1.xhtml": xhtml(
          '<div id="contents"><h2>Contents</h2><p>Chapter One Begins</p></div>'
          + '<div class="chapter" id="chap01">'
          + '<h2><a id="one"/>Chapter One<br/>Begins</h2><p>Body text.</p>'
          + "</div>"
        )
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.chapters).toHaveLength(1);
    expect(manuscript.chapters[0].title).toBe("Chapter One Begins");
    expect(manuscript.chapters[0].scenes[0].content).toBe("<p>Body text.</p>");
  });

  it("drops title pages that contain only headings and a byline", async () => {
    const data = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "title", href: "title.xhtml" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "title", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument(
          '<li><a href="title.xhtml#title">Book Title</a></li>'
          + '<li><a href="ch1.xhtml">Chapter One</a></li>'
        ),
        "OEBPS/title.xhtml": xhtml('<h1 id="title">Book Title</h1><h2>by A. Writer</h2>'),
        "OEBPS/ch1.xhtml": xhtml("<h1>Chapter One</h1><p>Story text.</p>")
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.chapters).toHaveLength(1);
    expect(manuscript.chapters[0].title).toBe("Chapter One");
    expect(manuscript.chapters[0].scenes[0].content).toBe("<p>Story text.</p>");
  });

  it("drops Project Gutenberg licence pages without swallowing neighbouring chapters", async () => {
    const data = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "ch1.xhtml" },
        { id: "license", href: "backmatter.xhtml" },
        { id: "ch2", href: "ch2.xhtml" }
      ],
      spine: ["nav", "ch1", "license", "ch2"],
      files: {
        "OEBPS/nav.xhtml": navDocument(
          '<li><a href="ch1.xhtml">Chapter One</a></li>'
          + '<li><a href="backmatter.xhtml">The Full Project Gutenberg™ License</a></li>'
          + '<li><a href="ch2.xhtml">Chapter Two</a></li>'
        ),
        "OEBPS/ch1.xhtml": xhtml("<h1>Chapter One</h1><p>First story.</p>"),
        "OEBPS/backmatter.xhtml": xhtml("<h1>Licence</h1><p>Legal boilerplate.</p>"),
        "OEBPS/ch2.xhtml": xhtml("<h1>Chapter Two</h1><p>Second story.</p>")
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.chapters.map((chapter) => chapter.title)).toEqual([
      "Chapter One",
      "Chapter Two"
    ]);
    expect(JSON.stringify(manuscript.chapters)).not.toContain("Legal boilerplate.");
  });

  it("inlines supported images and counts the ones it drops", async () => {
    const oversized = new Uint8Array(MAX_EMBEDDED_IMAGE_BYTES + 1);
    oversized.fill(0x42);
    const data = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "Text/ch1.xhtml" },
        { id: "map", href: "Images/pic.png", type: "image/png" },
        { id: "anim", href: "Images/anim.gif", type: "image/gif" },
        { id: "huge", href: "Images/huge.png", type: "image/png" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="Text/ch1.xhtml">Illustrated</a></li>'),
        "OEBPS/Text/ch1.xhtml": xhtml(
          "<h1>Illustrated</h1>"
          + '<figure><img src="../Images/pic.png" alt="Map"/></figure>'
          + '<figure><svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="../Images/pic.png" alt="Diagram"/></svg></figure>'
          + '<p><img src="../Images/anim.gif" alt="Animated"/></p>'
          + '<p><img src="../Images/huge.png" alt="Huge"/></p>'
        ),
        "OEBPS/Images/pic.png": PNG,
        "OEBPS/Images/anim.gif": GIF,
        "OEBPS/Images/huge.png": oversized
      }
    });

    const manuscript = await parseEpub(data);
    const content = manuscript.chapters[0].scenes[0].content;

    expect(manuscript.skippedImages).toBe(2);
    expect(content).toContain("data:image/png;base64,");
    expect(content).toContain('alt="Map"');
    expect(content).toContain('alt="Diagram"');
    expect(content).not.toContain("anim.gif");
    expect(content).not.toContain("huge.png");
  });

  it("embeds the cover image and applies it to the imported project", async () => {
    const data = makeEpub({
      title: "Covered Book",
      metadata: '<meta name="cover" content="cover-art"/>',
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "cover-art", href: "Images/art.jpg", type: "image/jpeg" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>'),
        "OEBPS/ch1.xhtml": xhtml("<h1>Chapter One</h1><p>Text.</p>"),
        "OEBPS/Images/art.jpg": bytes([0xff, 0xd8, 0xff, 0xe0])
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.coverImage).toMatch(/^data:image\/jpeg;base64,/);
    const project = buildEpubProject(manuscript);
    expect(project.publishOptions?.cover.mode).toBe("image");
    expect(project.publishOptions?.cover.image).toBe(manuscript.coverImage);
  });

  it("finds the cover through the EPUB3 cover-image property", async () => {
    const data = makeEpub({
      title: "Property Cover",
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "art", href: "Images/cover.png", type: "image/png", properties: "cover-image" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>'),
        "OEBPS/ch1.xhtml": xhtml("<h1>Chapter One</h1><p>Text.</p>"),
        "OEBPS/Images/cover.png": PNG
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.coverImage).toMatch(/^data:image\/png;base64,/);
  });

  it("ignores covers that cannot be embedded", async () => {
    const oversized = new Uint8Array(MAX_EMBEDDED_IMAGE_BYTES + 1);
    oversized.fill(0x42);
    const data = makeEpub({
      title: "Huge Cover",
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "art", href: "Images/cover.png", type: "image/png", properties: "cover-image" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>'),
        "OEBPS/ch1.xhtml": xhtml("<h1>Chapter One</h1><p>Text.</p>"),
        "OEBPS/Images/cover.png": oversized
      }
    });

    const manuscript = await parseEpub(data);

    expect(manuscript.coverImage).toBe("");
    const project = buildEpubProject(manuscript);
    expect(project.publishOptions?.cover.mode).toBe("none");
  });

  it("rejects DRM-protected books but allows font obfuscation", async () => {
    const base = {
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>'),
        "OEBPS/ch1.xhtml": xhtml("<p>Readable text.</p>")
      }
    };

    const encrypted = makeEpub({
      ...base,
      files: {
        ...base.files,
        "META-INF/encryption.xml": `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
  xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:CipherData><enc:CipherReference URI="OEBPS/ch1.xhtml"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>`
      }
    });
    await expect(parseEpub(encrypted)).rejects.toThrow(/DRM-protected/);

    const obfuscated = makeEpub({
      ...base,
      files: {
        ...base.files,
        "META-INF/encryption.xml": `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
  xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:CipherData><enc:CipherReference URI="OEBPS/Fonts/book.otf"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>`
      }
    });
    await expect(parseEpub(obfuscated)).resolves.toMatchObject({ skippedImages: 0 });

    const rights = makeEpub({
      ...base,
      files: { ...base.files, "META-INF/rights.xml": "<rights/>" }
    });
    await expect(parseEpub(rights)).rejects.toThrow(/DRM-protected/);
  });

  it("sanitizes imported markup", async () => {
    const data = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Safe</a></li>'),
        "OEBPS/ch1.xhtml": xhtml(
          '<script>alert("x")</script><p onclick="steal()">Safe text.</p>'
          + '<p><a href="javascript:alert(1)">Bad link</a></p>'
        )
      }
    });

    const content = (await parseEpub(data)).chapters[0].scenes[0].content;

    expect(content).not.toContain("script");
    expect(content).not.toContain("onclick");
    expect(content).not.toContain("javascript:");
    expect(content).toContain("Safe text.");
  });

  it("rejects malformed archives and archives without a container", async () => {
    await expect(parseEpub(strToU8("this is not a zip"))).rejects.toThrow(/not a valid EPUB/);

    const noContainer = zipSync({ "readme.txt": strToU8("hello") });
    await expect(parseEpub(noContainer)).rejects.toThrow(/missing its container file/);
  });

  it("ignores references and entries that escape the archive root", async () => {
    const withTraversal = zipSync({
      "META-INF/container.xml": strToU8(CONTAINER),
      "OEBPS/content.opf": strToU8(packageDocument({
        manifest: [
          { id: "nav", href: "nav.xhtml", properties: "nav" },
          { id: "outside", href: "../../outside.xhtml" },
          { id: "ch1", href: "ch1.xhtml" }
        ],
        spine: ["nav", "outside", "ch1"],
        files: {}
      })),
      "OEBPS/nav.xhtml": strToU8(navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>')),
      "OEBPS/ch1.xhtml": strToU8(xhtml("<p>Inside text.</p>")),
      "../../outside.xhtml": strToU8(xhtml("<p>Outside text.</p>"))
    });

    const manuscript = await parseEpub(withTraversal);

    expect(manuscript.chapters).toHaveLength(1);
    expect(manuscript.chapters[0].scenes[0].content).toContain("Inside text.");
    expect(manuscript.chapters[0].scenes[0].content).not.toContain("Outside text.");
  });

  it("falls back to the file name and reports unreadable books", async () => {
    const data = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>'),
        "OEBPS/ch1.xhtml": xhtml("<p>Text.</p>")
      }
    });

    const manuscript = await parseEpub(data, { fallbackTitle: "my_book.epub" });
    expect(manuscript.title).toBe("my book");
    expect(manuscript.author).toBe("");

    const onlyFurniture = makeEpub({
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "cover", href: "cover.xhtml" }
      ],
      spine: ["nav", "cover"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="cover.xhtml">Cover</a></li>'),
        "OEBPS/cover.xhtml": xhtml("<p>Cover art</p>")
      }
    });
    await expect(parseEpub(onlyFurniture)).rejects.toThrow(/readable chapters/);
  });
});

describe("buildEpubProject", () => {
  function manuscriptFixture(): EpubManuscript {
    return {
      title: "Imported Tale",
      author: "Grace Hopper",
      coverImage: "",
      skippedImages: 3,
      chapters: [
        {
          title: "Chapter One",
          scenes: [
            { title: "Chapter One", content: "<p>First scene words.</p>" },
            { title: "Scene 2", content: "<p>Second scene words.</p>" }
          ]
        },
        {
          title: "Chapter Two",
          scenes: [{ title: "Chapter Two", content: "<p>Final scene words.</p>" }]
        }
      ]
    };
  }

  function deterministicIds(prefix: string): () => string {
    let index = 0;
    return () => `${prefix}-${(index += 1)}`;
  }

  it("produces an ordinary project that storage and publishing accept", () => {
    const project: ProjectData = buildEpubProject(manuscriptFixture(), {
      createId: deterministicIds("id")
    });

    expect(isLegacyProjectData(project)).toBe(true);
    const stored = createStoredProject(project, "device-1", 1_700_000_000_000);
    expect(isStoredProject(stored)).toBe(true);

    expect(project.name).toBe("Imported Tale");
    expect(project.author).toBe("Grace Hopper");
    expect(project.chapters.map((chapter) => chapter.title)).toEqual([
      "Chapter One",
      "Chapter Two"
    ]);
    expect(project.documents.map((document) => document.chapterId)).toEqual([
      project.chapters[0].id,
      project.chapters[0].id,
      project.chapters[1].id
    ]);
    expect(project.activeDocumentId).toBe(project.documents[0].id);
    expect(project.projectGoal).toBe(50_000);
    expect(project.storyboardRows).toHaveLength(1);
    expect(project.storyboardRows?.[0].title).toBe("Timeline");
    expect(new Set(project.documents.map((document) => document.id)).size).toBe(3);
    expect(project.publishOptions).toBeDefined();

    const compiled = compileBook({
      title: project.name,
      author: project.author,
      subtitle: "",
      copyright: "",
      dedication: "",
      frontMatter: [],
      backMatter: [],
      chapters: project.chapters,
      documents: project.documents
    });

    expect(compiled.chapters).toHaveLength(2);
    expect(compiled.scenes).toBe(3);
    expect(compiled.words).toBe(9);
  });

  it("round-trips a parsed EPUB into a compilable project", async () => {
    const data = makeEpub({
      title: "Round Trip",
      creator: "Author Name",
      manifest: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "ch1", href: "ch1.xhtml" }
      ],
      spine: ["nav", "ch1"],
      files: {
        "OEBPS/nav.xhtml": navDocument('<li><a href="ch1.xhtml">Chapter One</a></li>'),
        "OEBPS/ch1.xhtml": xhtml("<h1>Chapter One</h1><p>One two three.</p>")
      }
    });

    const project = buildEpubProject(await parseEpub(data));
    const compiled = compileBook({
      title: project.name,
      author: project.author,
      subtitle: "",
      copyright: "",
      dedication: "",
      frontMatter: [],
      backMatter: [],
      chapters: project.chapters,
      documents: project.documents
    });

    expect(project.name).toBe("Round Trip");
    expect(project.author).toBe("Author Name");
    expect(compiled.words).toBe(3);
    expect(compiled.chapters[0].scenes[0].html).toContain("One two three.");
  });

  it("keeps generated ids distinct for every record", () => {
    const manuscript: EpubManuscript = {
      title: "Ids",
      author: "",
      coverImage: "",
      skippedImages: 0,
      chapters: [{ title: "Only", scenes: [{ title: "Only", content: "<p>Text.</p>" }] }]
    };
    const ids = deterministicIds("id");
    const project = buildEpubProject(manuscript, { createId: ids });
    const used = [
      project.id,
      ...project.chapters.map((chapter) => chapter.id),
      ...project.documents.map((document) => document.id),
      ...(project.storyboardRows ?? []).map((row) => row.id)
    ];

    expect(new Set(used).size).toBe(used.length);
  });
});
