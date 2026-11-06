import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  buildScrivenerProject,
  estimateScrivenerStoredChars,
  scrivenerFilesFromEntries,
  scrivenerFilesFromZip,
  type BuildScrivenerProjectOptions,
  type BuildScrivenerProjectResult,
  type ScrivenerFileEntry,
  type ScrivenerFiles
} from "./scrivener";

const EMPTY_CONTENT = "<p><br></p>";

function entriesFrom(entries: Record<string, string>): ScrivenerFileEntry[] {
  const encoder = new TextEncoder();
  return Object.entries(entries).map(([path, content]) => ({
    path,
    bytes: encoder.encode(content)
  }));
}

function filesFrom(entries: Record<string, string>): ScrivenerFiles {
  return new Map(entriesFrom(entries).map((entry) => [entry.path, entry.bytes]));
}

function rtf(text: string): string {
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0 {\\fonttbl{\\f0 Arial;}}\\pard ${text}\\par}`;
}

function binderItem(
  type: string,
  attributes: string,
  title: string,
  children: string[] = [],
  metadata = ""
): string {
  const nested = children.length > 0 ? `<Children>${children.join("")}</Children>` : "";
  return `<BinderItem ${attributes} Type="${type}"><Title>${title}</Title>${metadata}${nested}</BinderItem>`;
}

function scene(
  id: string,
  title: string,
  children: string[] = [],
  fileExtension?: string
): string {
  const metadata = fileExtension
    ? `<MetaData><FileExtension>${fileExtension}</FileExtension></MetaData>`
    : "";
  return binderItem("Text", `ID="${id}"`, title, children, metadata);
}

function folder(id: string, title: string, children: string[] = []): string {
  return binderItem("Folder", `ID="${id}"`, title, children);
}

function draft(children: string[] = []): string {
  return binderItem("DraftFolder", 'ID="1"', "Manuscript", children);
}

function research(children: string[] = []): string {
  return binderItem("ResearchFolder", 'ID="2"', "Research", children);
}

function scrivx(...items: Array<string | string[]>): string {
  return `<ScrivenerProject Version="1.0"><Binder>${items.flat().join("")}</Binder></ScrivenerProject>`;
}

function idFactory(): () => string {
  let next = 0;
  return () => `id-${(next += 1)}`;
}

function build(
  entries: Record<string, string>,
  options: BuildScrivenerProjectOptions = {}
): BuildScrivenerProjectResult {
  return buildScrivenerProject(filesFrom(entries), { createId: idFactory(), ...options });
}

describe("buildScrivenerProject", () => {
  it("reads text, synopsis and notes from a Scrivener 1/2 Files/Docs layout", () => {
    const { project, report } = build({
      "project.scrivx": scrivx(draft([scene("5", "Opening")])),
      "Files/Docs/1_synopsis.txt": "Draft overview.",
      "Files/Docs/5.rtf": rtf("First scene."),
      "Files/Docs/5_synopsis.txt": "  A short\r\nsynopsis  ",
      "Files/Docs/5_notes.rtf": rtf("Notes are not a scene.")
    });

    expect(report.layout).toBe("docs");
    expect(report.chapters).toBe(1);
    expect(report.scenes).toBe(1);
    expect(report.itemsWithNotes).toBe(1);
    expect(report.missingFiles).toBe(0);

    expect(project.chapters.map((chapter) => chapter.title)).toEqual(["Manuscript"]);
    expect(project.chapters[0].summary).toBe("Draft overview.");
    expect(project.documents.map((document) => document.title)).toEqual(["Opening"]);
    expect(project.documents[0].content).toBe("<p>First scene.</p>");
    expect(project.documents[0].chapterId).toBe(project.chapters[0].id);

    // The notes file is only counted, never imported as a document.
    expect(project.documents.length).toBe(1);
  });

  it("reads text from a Scrivener 3 Files/Data layout", () => {
    const item = binderItem("Text", 'UUID="ABC-1"', "New Scene");
    const { project, report } = build({
      "project.scrivx": scrivx(draft([item])),
      "Files/Data/ABC-1/content.rtf": rtf("Data layout."),
      "Files/Data/ABC-1/notes.rtf": rtf("Data notes."),
      "Files/Data/ABC-1/synopsis.txt": "Data synopsis."
    });

    expect(report.layout).toBe("data");
    expect(report.chapters).toBe(1);
    expect(report.scenes).toBe(1);
    expect(report.itemsWithNotes).toBe(1);
    expect(report.missingFiles).toBe(0);
    expect(project.documents[0].content).toBe("<p>Data layout.</p>");
  });

  it("ignores CRLF line breaks in the RTF header", () => {
    // Scrivener writes the header groups on separate lines; a raw CR/LF must
    // never end up as text at the start of the scene content.
    const crlfRtf = (text: string): string =>
      "{\\rtf1\\ansi\\ansicpg1252\\deff0\r\n" +
      "{\\fonttbl{\\f0\\fnil Palatino;}}\r\n" +
      "{\\colortbl;\\red0\\green0\\blue0;}\r\n" +
      `\\pard\\plain \\f0\\fs28 ${text}\\par}`;

    const { project } = build({
      "project.scrivx": scrivx(draft([scene("11", "Opening"), scene("12", "Closing")])),
      "Files/Docs/11.rtf": crlfRtf("First scene."),
      "Files/Docs/12.rtf": crlfRtf("Second scene.")
    });

    const contents = project.documents.map((document) => document.content);
    expect(contents).toEqual(["<p>First scene.</p>", "<p>Second scene.</p>"]);
    for (const content of contents) {
      expect(content.startsWith("<p>")).toBe(true);
      expect(content).not.toContain("\n");
    }
  });

  it("turns draft folders into chapters and keeps binder order", () => {
    const { project, report } = build({
      "project.scrivx": scrivx(
        draft([
          folder("10", "Chapter One", [scene("11", "Scene A"), scene("12", "Scene B")]),
          folder("20", "Chapter Two", [scene("21", "Scene C")])
        ])
      ),
      "Files/Docs/10_synopsis.txt": "Where it begins.",
      "Files/Docs/11.rtf": rtf("Alpha."),
      "Files/Docs/12.rtf": rtf("Beta."),
      "Files/Docs/21.rtf": rtf("Gamma.")
    });

    expect(report.chapters).toBe(2);
    expect(report.scenes).toBe(3);
    expect(report.flattenedFolders).toBe(0);
    expect(project.chapters.map((chapter) => chapter.title)).toEqual([
      "Chapter One",
      "Chapter Two"
    ]);
    expect(project.chapters[0].summary).toBe("Where it begins.");
    expect(project.documents.map((document) => document.title)).toEqual([
      "Scene A",
      "Scene B",
      "Scene C"
    ]);
    expect(project.documents.map((document) => document.content)).toEqual([
      "<p>Alpha.</p>",
      "<p>Beta.</p>",
      "<p>Gamma.</p>"
    ]);
    expect(project.documents[0].chapterId).toBe(project.chapters[0].id);
    expect(project.documents[1].chapterId).toBe(project.chapters[0].id);
    expect(project.documents[2].chapterId).toBe(project.chapters[1].id);
  });

  it("uses a folder's own text as its first scene", () => {
    const { project, report } = build({
      "project.scrivx": scrivx(draft([folder("10", "Prologue", [scene("11", "After")])])),
      "Files/Docs/10.rtf": rtf("Folder words."),
      "Files/Docs/11.rtf": rtf("Scene words.")
    });

    expect(report.scenes).toBe(2);
    expect(project.documents.map((document) => document.title)).toEqual(["Prologue", "After"]);
    expect(project.documents[0].content).toBe("<p>Folder words.</p>");
    expect(project.documents[0].chapterId).toBe(project.chapters[0].id);
    expect(project.documents[1].chapterId).toBe(project.chapters[0].id);
  });

  it("promotes nested folders to their own chapters", () => {
    const { project, report } = build({
      "project.scrivx": scrivx(
        draft([
          folder("10", "Part One", [
            scene("11", "Opening"),
            folder("12", "Interlude", [scene("13", "Inside")])
          ])
        ])
      ),
      "Files/Docs/11.rtf": rtf("First."),
      "Files/Docs/13.rtf": rtf("Second.")
    });

    expect(report.flattenedFolders).toBe(1);
    expect(report.chapters).toBe(2);
    expect(project.chapters.map((chapter) => chapter.title)).toEqual([
      "Part One",
      "Interlude"
    ]);
    expect(project.documents.map((document) => document.title)).toEqual(["Opening", "Inside"]);
    expect(project.documents[1].chapterId).toBe(project.chapters[1].id);
  });

  it("puts text directly in the draft into a chapter named after the draft", () => {
    const { project, report } = build({
      "project.scrivx": scrivx(draft([scene("11", "One"), scene("12", "Two")])),
      "Files/Docs/1_synopsis.txt": "Draft summary.",
      "Files/Docs/11.rtf": rtf("First."),
      "Files/Docs/12.rtf": rtf("Second.")
    });

    expect(report.chapters).toBe(1);
    expect(project.chapters[0].title).toBe("Manuscript");
    expect(project.chapters[0].summary).toBe("Draft summary.");
    expect(project.documents.map((document) => document.title)).toEqual(["One", "Two"]);
    expect(project.documents.every((document) => document.chapterId === project.chapters[0].id)).toBe(
      true
    );
  });

  it("imports the research folder as wiki pages and folders", () => {
    const { project, report } = build({
      "project.scrivx": scrivx([
        draft([scene("11", "Story")]),
        research([
          folder("30", "Characters", [
            scene("31", "Alice"),
            folder("35", "Minor", [scene("36", "Bob")])
          ]),
          scene("32", "Timeline"),
          binderItem("PDF", 'ID="33"', "Map"),
          binderItem("Image", 'ID="34"', "Photo")
        ])
      ]),
      "Files/Docs/11.rtf": rtf("Story words."),
      "Files/Docs/31.rtf": rtf("Alice notes."),
      "Files/Docs/32.rtf": rtf("Timeline notes."),
      "Files/Docs/36.rtf": rtf("Bob notes.")
    });

    expect(report.wikiPages).toBe(3);
    expect(report.wikiFolders).toBe(2);
    expect(report.skippedFiles).toBe(2);

    const researchFolders = project.researchFolders ?? [];
    expect(researchFolders.map((entry) => entry.title)).toEqual(["Characters", "Minor"]);
    expect(researchFolders[0].parentId).toBe(null);
    expect(researchFolders[1].parentId).toBe(researchFolders[0].id);

    const alice = project.documents.find((document) => document.title === "Alice");
    const bob = project.documents.find((document) => document.title === "Bob");
    const timeline = project.documents.find((document) => document.title === "Timeline");

    expect(alice?.space).toBe("Wiki");
    expect(alice?.folderId).toBe(researchFolders[0].id);
    expect(alice?.content).toBe("<p>Alice notes.</p>");
    expect(bob?.space).toBe("Wiki");
    expect(bob?.folderId).toBe(researchFolders[1].id);
    expect(timeline?.space).toBe("Wiki");
    expect(timeline?.folderId).toBeUndefined();
    expect(project.documents.filter((document) => document.space === "Wiki").length).toBe(3);
  });

  it("imports other top-level binder items as wiki folders and pages", () => {
    const { project, report } = build({
      "project.scrivx": scrivx([
        draft([scene("11", "Story")]),
        folder("50", "Characters", [
          scene("51", "Alice"),
          scene("52", "Bob"),
          folder("53", "Minor", [scene("54", "Carol")])
        ]),
        scene("60", "Loose Note"),
        research([scene("31", "Research Notes")]),
        binderItem("ResearchFolder", 'ID="70"', "Places", [scene("71", "Paris")]),
        binderItem("PDF", 'ID="90"', "Map"),
        binderItem("TrashFolder", 'ID="80"', "Trash", [scene("81", "Deleted")])
      ]),
      "Files/Docs/11.rtf": rtf("Story words."),
      "Files/Docs/51.rtf": rtf("Alice notes."),
      "Files/Docs/52.rtf": rtf("Bob notes."),
      "Files/Docs/54.rtf": rtf("Carol notes."),
      "Files/Docs/60.rtf": rtf("Loose notes."),
      "Files/Docs/31.rtf": rtf("Research notes."),
      "Files/Docs/71.rtf": rtf("Paris notes.")
    });

    // The draft and the trash are untouched by the extra top-level items.
    expect(report.chapters).toBe(1);
    expect(report.scenes).toBe(1);
    expect(project.chapters.map((chapter) => chapter.title)).toEqual(["Manuscript"]);

    expect(report.wikiPages).toBe(6);
    expect(report.wikiFolders).toBe(3);
    expect(report.skippedFiles).toBe(1);

    const manuscript = project.documents.filter((document) => document.space !== "Wiki");
    expect(manuscript.map((document) => document.title)).toEqual(["Story"]);

    const wiki = project.documents.filter((document) => document.space === "Wiki");
    expect(wiki.map((document) => document.title)).toEqual([
      "Alice",
      "Bob",
      "Carol",
      "Loose Note",
      "Research Notes",
      "Paris"
    ]);

    const folders = project.researchFolders ?? [];
    expect(folders.map((entry) => entry.title)).toEqual(["Characters", "Minor", "Places"]);
    expect(folders[0].parentId).toBe(null);
    expect(folders[1].parentId).toBe(folders[0].id);
    expect(folders[2].parentId).toBe(null);

    const byTitle = (title: string) => wiki.find((document) => document.title === title);
    expect(byTitle("Alice")?.folderId).toBe(folders[0].id);
    expect(byTitle("Bob")?.folderId).toBe(folders[0].id);
    expect(byTitle("Carol")?.folderId).toBe(folders[1].id);
    expect(byTitle("Loose Note")?.folderId).toBeUndefined();
    expect(byTitle("Research Notes")?.folderId).toBeUndefined();
    expect(byTitle("Paris")?.folderId).toBe(folders[2].id);

    expect(project.documents.some((document) => document.title === "Deleted")).toBe(false);
  });

  it("only counts a missing file when the item has a file extension", () => {
    const neverEdited = build({
      "project.scrivx": scrivx(draft([scene("11", "Never edited")]))
    });

    expect(neverEdited.report.missingFiles).toBe(0);
    expect(neverEdited.project.documents[0].title).toBe("Never edited");
    expect(neverEdited.project.documents[0].content).toBe(EMPTY_CONTENT);

    const missing = build({
      "project.scrivx": scrivx(draft([scene("12", "Missing", [], "rtf")]))
    });

    expect(missing.report.missingFiles).toBe(1);
    expect(missing.project.documents[0].content).toBe(EMPTY_CONTENT);
  });

  it("ignores the trash folder", () => {
    const { project, report } = build({
      "project.scrivx": scrivx([
        draft([
          scene("11", "Kept"),
          binderItem("TrashFolder", 'ID="40"', "Trash", [
            scene("41", "Deleted"),
            folder("42", "Deleted Folder", [scene("43", "Also deleted")])
          ])
        ])
      ]),
      "Files/Docs/11.rtf": rtf("Keep."),
      "Files/Docs/41.rtf": rtf("Gone."),
      "Files/Docs/43.rtf": rtf("Gone too.")
    });

    expect(report.chapters).toBe(1);
    expect(report.scenes).toBe(1);
    expect(report.skippedFiles).toBe(0);
    expect(report.missingFiles).toBe(0);
    expect(project.documents.map((document) => document.title)).toEqual(["Kept"]);
  });

  it("keeps importing when a text file is missing", () => {
    const { project, report } = build({
      "project.scrivx": scrivx(
        draft([scene("11", "Present"), scene("12", "Missing", [], "rtf")])
      ),
      "Files/Docs/11.rtf": rtf("Here.")
    });

    expect(report.missingFiles).toBe(1);
    expect(report.scenes).toBe(2);
    expect(project.documents.map((document) => document.title)).toEqual(["Present", "Missing"]);
    expect(project.documents[1].content).toBe(EMPTY_CONTENT);
  });

  it("returns a fallback chapter and scene for an empty draft", () => {
    const { project } = build({ "project.scrivx": scrivx(draft()) });

    expect(project.chapters.length).toBe(1);
    expect(project.documents.length).toBe(1);
    expect(project.chapters[0].title).toBe("Chapter 1");
    expect(project.documents[0].title).toBe("Scene 1");
    expect(project.documents[0].content).toBe(EMPTY_CONTENT);
    expect(project.documents[0].chapterId).toBe(project.chapters[0].id);
    expect(project.activeDocumentId).toBe(project.documents[0].id);
  });

  it("names the project from the option, the .scriv folder, or the default", () => {
    const entries = {
      "project.scrivx": scrivx(draft([scene("11", "Scene")])),
      "Files/Docs/11.rtf": rtf("Words.")
    };

    expect(build(entries, { projectName: "My Novel.scriv" }).project.name).toBe("My Novel");
    expect(build(entries).project.name).toBe("Imported Scrivener project");

    const wrapped = scrivenerFilesFromEntries(
      entriesFrom({
        "Wrapped Book.scriv/project.scrivx": entries["project.scrivx"],
        "Wrapped Book.scriv/Files/Docs/11.rtf": entries["Files/Docs/11.rtf"]
      })
    );
    expect(buildScrivenerProject(wrapped, { createId: idFactory() }).project.name).toBe(
      "Wrapped Book"
    );
  });

  it("rejects malformed project XML", () => {
    const files = filesFrom({
      "project.scrivx": '<ScrivenerProject Version="1.0"><Binder><BinderItem ID="5"'
    });

    expect(() => buildScrivenerProject(files)).toThrow(/^Scrivener import:/);
  });

  it("rejects a project without project.scrivx", () => {
    const files = filesFrom({ "Files/Docs/5.rtf": rtf("Orphan.") });

    expect(() => buildScrivenerProject(files)).toThrow(
      /^Scrivener import: project\.scrivx is missing\./
    );
  });
});

describe("scrivenerFilesFromZip", () => {
  it("reads a zipped project and ignores macOS junk", () => {
    const files = scrivenerFilesFromZip(
      zipSync({
        "My Book.scriv/project.scrivx": strToU8(scrivx(draft([scene("11", "Opening")]))),
        "My Book.scriv/Files/Docs/11.rtf": strToU8(rtf("Zip words.")),
        "My Book.scriv/.DS_Store": strToU8("junk"),
        ".DS_Store": strToU8("junk"),
        "__MACOSX/My Book.scriv/._project.scrivx": strToU8("junk")
      })
    );

    expect(
      [...files.keys()].some((path) => path.includes("__MACOSX") || path.endsWith(".DS_Store"))
    ).toBe(false);

    const { project, report } = buildScrivenerProject(files, { createId: idFactory() });
    expect(report.layout).toBe("docs");
    expect(report.scenes).toBe(1);
    expect(project.name).toBe("My Book");
    expect(project.documents[0].content).toBe("<p>Zip words.</p>");
  });

  it("rejects entries that escape the archive", () => {
    expect(() => scrivenerFilesFromZip(zipSync({ "../evil.txt": strToU8("x") }))).toThrow(
      /unsafe path/
    );
    expect(() => scrivenerFilesFromZip(zipSync({ "/abs.txt": strToU8("x") }))).toThrow(
      /absolute path/
    );
  });

  it("rejects entries that escape a folder picker", () => {
    expect(() =>
      scrivenerFilesFromEntries([{ path: "../evil.txt", bytes: strToU8("x") }])
    ).toThrow(/unsafe path/);
  });

  it("rejects files that are not a zip archive", () => {
    expect(() => scrivenerFilesFromZip(strToU8("not a zip archive"))).toThrow(
      /not a readable zip archive/
    );
  });
});

describe("estimateScrivenerStoredChars", () => {
  it("grows with the amount of imported text", () => {
    const project = scrivx(draft([scene("11", "Scene")]));

    const empty = estimateScrivenerStoredChars(
      filesFrom({ "project.scrivx": project, "Files/Docs/11.rtf": rtf("") })
    );
    const short = estimateScrivenerStoredChars(
      filesFrom({ "project.scrivx": project, "Files/Docs/11.rtf": rtf("Hi.") })
    );
    const long = estimateScrivenerStoredChars(
      filesFrom({
        "project.scrivx": project,
        "Files/Docs/11.rtf": rtf("Hi there, this is a much longer piece of text.")
      })
    );
    const withNotes = estimateScrivenerStoredChars(
      filesFrom({
        "project.scrivx": project,
        "Files/Docs/11.rtf": rtf("Hi."),
        "Files/Docs/11_notes.rtf": rtf("A very long note that must not be counted.")
      })
    );

    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(withNotes).toBe(short);
  });
});
