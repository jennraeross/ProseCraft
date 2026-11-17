import { describe, expect, it } from "vitest";
import { parseFountain, serializeFountain, type ScreenplayElement } from "./fountain";

const SAMPLE = `Title: The Last Lighthouse
Credit: Written by
Author: Sascha
Draft date: 12/11/2026

EXT. LIGHTHOUSE - NIGHT

Waves crash against the rocks.

MARA
(quietly)
Is anyone there?

CUT TO:

INT. LIGHTHOUSE - NIGHT

MARA
(into the dark)
Hello?

> THE END <

===
`;

describe("parseFountain", () => {
  it("reads the title page and a multi-scene sample", () => {
    const { title, elements } = parseFountain(SAMPLE);
    expect(title).toEqual({
      Title: "The Last Lighthouse",
      Credit: "Written by",
      Author: "Sascha",
      "Draft date": "12/11/2026"
    });
    expect(elements.map((element) => element.type)).toEqual([
      "scene-heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
      "scene-heading",
      "character",
      "parenthetical",
      "dialogue",
      "centered",
      "page-break"
    ]);
    expect(elements[0]).toEqual({ type: "scene-heading", text: "EXT. LIGHTHOUSE - NIGHT" });
    expect(elements[4]).toEqual({ type: "dialogue", text: "Is anyone there?" });
    expect(elements[10]).toEqual({ type: "centered", text: "THE END" });
  });

  it("keeps multiline title page values", () => {
    const { title, elements } = parseFountain(
      "Title: A Very\n    Long Title\nAuthor: Mara\n\nINT. ROOM - DAY\n"
    );
    expect(title).toEqual({ Title: "A Very\nLong Title", Author: "Mara" });
    expect(elements).toEqual([{ type: "scene-heading", text: "INT. ROOM - DAY" }]);
  });

  it("only reads a scene heading after a blank line", () => {
    const { elements } = parseFountain("A door opens.\nINT. NOT A HEADING\n");
    expect(elements).toEqual([
      { type: "action", text: "A door opens." },
      { type: "action", text: "INT. NOT A HEADING" }
    ]);
  });

  it("recognises every scene heading prefix regardless of case", () => {
    const source = [
      "INT. HOUSE - DAY",
      "",
      "ext. garden - night",
      "",
      "INT./EXT. CAR - DAY",
      "",
      "I/E. CAR - NIGHT",
      "",
      "EST. HILLTOP - DAY"
    ].join("\n");
    expect(parseFountain(source).elements.map((element) => element.text)).toEqual([
      "INT. HOUSE - DAY",
      "ext. garden - night",
      "INT./EXT. CAR - DAY",
      "I/E. CAR - NIGHT",
      "EST. HILLTOP - DAY"
    ]);
  });

  it("treats only uppercase transitions as transitions", () => {
    const { elements } = parseFountain("INT. ROOM - DAY\n\nCUT TO:\n\ncut to:\n");
    expect(elements.map((element) => element.type)).toEqual([
      "scene-heading",
      "transition",
      "action"
    ]);
  });

  it("marks dual dialogue with a caret", () => {
    const { elements } = parseFountain("INT. KITCHEN - DAY\n\nALICE\nLeft.\n\nBOB ^\nRight.\n");
    expect(elements).toEqual([
      { type: "scene-heading", text: "INT. KITCHEN - DAY" },
      { type: "character", text: "ALICE" },
      { type: "dialogue", text: "Left." },
      { type: "character", text: "BOB", dual: true },
      { type: "dialogue", text: "Right." }
    ]);
  });

  it("honours every forcing marker", () => {
    const source = `.SNOWY FIELD - DAY

!INT. THIS IS ACTION

@McAvoy
Still a character.

>Fade out.

# Act One

## The Arrival

= Mara reaches the shore.

[[A block note]]
`;
    expect(parseFountain(source).elements).toEqual([
      { type: "scene-heading", text: "SNOWY FIELD - DAY", forced: true },
      { type: "action", text: "INT. THIS IS ACTION", forced: true },
      { type: "character", text: "McAvoy", forced: true },
      { type: "dialogue", text: "Still a character." },
      { type: "transition", text: "Fade out.", forced: true },
      { type: "section", text: "Act One", level: 1 },
      { type: "section", text: "The Arrival", level: 2 },
      { type: "synopsis", text: "Mara reaches the shore." },
      { type: "note", text: "A block note" }
    ]);
  });

  it("keeps notes, drops boneyard and leaves emphasis marks alone", () => {
    const source = `INT. ROOM - DAY

Action with a [[quiet note]] inside.

[[block note]]

/* boneyard
INT. DROPPED - DAY
*/

MARA
Still *here* and _there_.
`;
    expect(parseFountain(source).elements).toEqual([
      { type: "scene-heading", text: "INT. ROOM - DAY" },
      { type: "action", text: "Action with a inside." },
      { type: "note", text: "quiet note" },
      { type: "note", text: "block note" },
      { type: "character", text: "MARA" },
      { type: "dialogue", text: "Still *here* and _there_." }
    ]);
  });

  it("reads notes that span several lines", () => {
    const { elements } = parseFountain("INT. ROOM - DAY\n\n[[first\nsecond]]\n\nAction.\n");
    expect(elements).toEqual([
      { type: "scene-heading", text: "INT. ROOM - DAY" },
      { type: "note", text: "first\nsecond" },
      { type: "action", text: "Action." }
    ]);
  });

  it("reads scene numbers into their own field", () => {
    const source = "INT. HOUSE - DAY #12#\n\nEXT. GARDEN - NIGHT #12A#\n\nINT. HALL - DAY\n";
    expect(parseFountain(source).elements).toEqual([
      { type: "scene-heading", text: "INT. HOUSE - DAY", sceneNumber: "12" },
      { type: "scene-heading", text: "EXT. GARDEN - NIGHT", sceneNumber: "12A" },
      { type: "scene-heading", text: "INT. HALL - DAY" }
    ]);
  });

  it("treats Windows and Mac line endings like Unix ones", () => {
    const unix = parseFountain(SAMPLE);
    expect(parseFountain(SAMPLE.replace(/\n/g, "\r\n"))).toEqual(unix);
    expect(parseFountain(SAMPLE.replace(/\n/g, "\r"))).toEqual(unix);
  });

  it("parses empty input to an empty screenplay", () => {
    expect(parseFountain("")).toEqual({ title: {}, elements: [] });
    expect(parseFountain("  \n\n\t\n")).toEqual({ title: {}, elements: [] });
  });

  it("parses ten thousand lines well under a second", () => {
    const lines: string[] = [];
    for (let index = 0; index < 2_000; index++) {
      lines.push(`INT. ROOM ${index} - DAY`, "", "GUARD", "Move along.", "");
    }
    const source = lines.join("\n");
    expect(source.split("\n")).toHaveLength(10_000);

    const started = performance.now();
    const { elements } = parseFountain(source);
    const elapsed = performance.now() - started;

    expect(elements).toHaveLength(6_000);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("serializeFountain", () => {
  it("round trips a realistic sample through its own output", () => {
    const parsed = parseFountain(SAMPLE);
    const serialized = serializeFountain(parsed.title, parsed.elements);

    expect(serialized).toContain("Title: The Last Lighthouse");
    expect(serialized).toContain("MARA\n(quietly)\nIs anyone there?");
    expect(parseFountain(serialized)).toEqual(parsed);
  });

  it("round trips sections, notes and scene numbers", () => {
    const source = `# Act One

.SNOWY FIELD - DAY #7#

[[A note]]

MARA
Hello.
`;
    const parsed = parseFountain(source);
    expect(parseFountain(serializeFountain(parsed.title, parsed.elements))).toEqual(parsed);
  });

  it("adds forcing markers only where the plain text would read differently", () => {
    const elements: ScreenplayElement[] = [
      { type: "action", text: "INT. AMBUSH" },
      { type: "action", text: "A door slams." },
      { type: "scene-heading", text: "SNOWY FIELD" },
      { type: "character", text: "mcAvoy" }
    ];
    expect(serializeFountain({}, elements)).toBe(
      "!INT. AMBUSH\n\nA door slams.\n\n.SNOWY FIELD\n\n@mcAvoy\n"
    );
  });

  it("serializes an empty screenplay to an empty string", () => {
    expect(serializeFountain({}, [])).toBe("");
  });
});
