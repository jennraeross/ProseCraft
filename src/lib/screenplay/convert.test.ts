import { describe, expect, it } from "vitest";
import type { DocumentData } from "../publish/types";
import { convertDocumentToScreenplay, proseToScreenplayElements } from "./convert";
import { htmlToElements } from "./layout";

describe("proseToScreenplayElements", () => {
  it("always starts with a scene-heading placeholder", () => {
    expect(proseToScreenplayElements("")).toEqual([
      { type: "scene-heading", text: "INT./EXT. LOCATION - DAY" }
    ]);
    expect(proseToScreenplayElements("<p>Rain falls on the harbor.</p>")).toEqual([
      { type: "scene-heading", text: "INT./EXT. LOCATION - DAY" },
      { type: "action", text: "Rain falls on the harbor." }
    ]);
  });

  it("converts speaker-colon lines into character and dialogue", () => {
    const elements = proseToScreenplayElements(
      "<p>Mara: We have to leave before dawn.</p><p>Jon (V.O.): \"Not without the map.\"</p>"
    );
    expect(elements).toEqual([
      { type: "scene-heading", text: "INT./EXT. LOCATION - DAY" },
      { type: "character", text: "MARA" },
      { type: "dialogue", text: "We have to leave before dawn." },
      { type: "character", text: "JON (V.O.)" },
      { type: "dialogue", text: "Not without the map." }
    ]);
  });

  it("converts dash-prefixed speech lines into character and dialogue", () => {
    const elements = proseToScreenplayElements(
      "<p>— Did you hear that?</p><p>– Just the wind, — he whispered.</p>"
    );
    expect(elements).toEqual([
      { type: "scene-heading", text: "INT./EXT. LOCATION - DAY" },
      { type: "character", text: "CHARACTER" },
      { type: "dialogue", text: "Did you hear that?" },
      { type: "character", text: "CHARACTER" },
      { type: "dialogue", text: "Just the wind," },
      { type: "action", text: "he whispered." }
    ]);
  });

  it("converts quoted speech lines into character and dialogue without losing narrative text", () => {
    const elements = proseToScreenplayElements(
      '<p>"Stop right there!"</p><p>Mara turned. “It is too late.” She sighed.</p>'
    );
    expect(elements).toEqual([
      { type: "scene-heading", text: "INT./EXT. LOCATION - DAY" },
      { type: "character", text: "CHARACTER" },
      { type: "dialogue", text: "Stop right there!" },
      { type: "action", text: "Mara turned." },
      { type: "character", text: "CHARACTER" },
      { type: "dialogue", text: "It is too late." },
      { type: "action", text: "She sighed." }
    ]);
  });

  it("keeps ordinary prose containing colons or em-dashes as action and never loses text", () => {
    const html = "<p>The clock—old and rusted—struck 10:30.</p><p>She looked around: nothing moved.</p>";
    const elements = proseToScreenplayElements(html);
    expect(elements).toEqual([
      { type: "scene-heading", text: "INT./EXT. LOCATION - DAY" },
      { type: "action", text: "The clock—old and rusted—struck 10:30." },
      { type: "action", text: "She looked around: nothing moved." }
    ]);

    const joined = elements.slice(1).map((el) => el.text).join(" ");
    expect(joined).toContain("The clock—old and rusted—struck 10:30.");
    expect(joined).toContain("She looked around: nothing moved.");
  });
});

describe("convertDocumentToScreenplay", () => {
  it("sets format to screenplay, converts HTML with data-sp, and drops stale markdownSource", () => {
    const doc: DocumentData = {
      id: "scene-1",
      title: "Harbor",
      content: "<p>Fog rolls in.</p><p>Mara: Ready?</p>",
      markdownSource: "Fog rolls in.\n\nMara: Ready?",
      chapterId: "ch-1",
      labelId: "label-draft"
    };

    const converted = convertDocumentToScreenplay(doc);
    expect(converted.format).toBe("screenplay");
    expect(converted.markdownSource).toBeUndefined();
    expect(converted.id).toBe("scene-1");
    expect(converted.title).toBe("Harbor");
    expect(converted.chapterId).toBe("ch-1");
    expect(converted.labelId).toBe("label-draft");
    expect(converted.content).toContain('<p data-sp="scene-heading">INT./EXT. LOCATION - DAY</p>');
    expect(htmlToElements(converted.content)).toEqual([
      { type: "scene-heading", text: "INT./EXT. LOCATION - DAY" },
      { type: "action", text: "Fog rolls in." },
      { type: "character", text: "MARA" },
      { type: "dialogue", text: "Ready?" }
    ]);
  });
});
