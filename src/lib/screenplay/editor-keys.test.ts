import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../storage/sync/memory-fs";
import { createStoredProject } from "../storage/schema";
import {
  normalizeDocument,
  readOpenProjects,
  writeOpenProject
} from "../storage/sync/open-layout";
import type { ProjectData } from "../storage/types";
import type { DocumentData } from "../publish/types";
import {
  autoCase,
  autoDetectType,
  nextElementType
} from "./editor-keys";

describe("nextElementType", () => {
  describe("Enter", () => {
    it("starts action after a scene heading", () => {
      expect(nextElementType("scene-heading", "Enter")).toBe("action");
    });

    it("starts dialogue after a character cue", () => {
      expect(nextElementType("character", "Enter")).toBe("dialogue");
    });

    it("starts a new character cue after dialogue", () => {
      expect(nextElementType("dialogue", "Enter")).toBe("character");
    });

    it("falls back to action on a second Enter", () => {
      expect(nextElementType("character", "Enter", { empty: true })).toBe("action");
    });

    it("continues the dialogue block from a parenthetical", () => {
      expect(nextElementType("parenthetical", "Enter")).toBe("dialogue");
    });

    it("starts a new scene after a transition", () => {
      expect(nextElementType("transition", "Enter")).toBe("scene-heading");
    });

    it("keeps writing action", () => {
      expect(nextElementType("action", "Enter")).toBe("action");
    });
  });

  describe("Tab", () => {
    it("turns an empty action line into a character cue", () => {
      expect(nextElementType("action", "Tab", { empty: true })).toBe("character");
    });

    it("leaves a non-empty action line alone", () => {
      expect(nextElementType("action", "Tab", { empty: false })).toBe("action");
    });

    it("cycles character to transition and dialogue to parenthetical", () => {
      expect(nextElementType("character", "Tab")).toBe("transition");
      expect(nextElementType("dialogue", "Tab")).toBe("parenthetical");
    });
  });

  describe("ShiftTab", () => {
    it("reverses the cycle", () => {
      expect(nextElementType("character", "ShiftTab")).toBe("action");
      expect(nextElementType("transition", "ShiftTab")).toBe("character");
      expect(nextElementType("parenthetical", "ShiftTab")).toBe("dialogue");
    });

    it("keeps types without a reverse step", () => {
      expect(nextElementType("scene-heading", "ShiftTab")).toBe("scene-heading");
      expect(nextElementType("action", "ShiftTab", { empty: true })).toBe("action");
    });
  });
});

describe("autoDetectType", () => {
  it("recognises scene headings", () => {
    expect(autoDetectType("INT. LIGHTHOUSE - NIGHT")).toBe("scene-heading");
    expect(autoDetectType("ext. beach - dawn")).toBe("scene-heading");
    expect(autoDetectType("I/E. CAR - DAY")).toBe("scene-heading");
  });

  it("recognises character cues in all caps", () => {
    expect(autoDetectType("MARA")).toBe("character");
    expect(autoDetectType("MARA (V.O.)")).toBe("character");
  });

  it("recognises transitions ending in TO:", () => {
    expect(autoDetectType("CUT TO:")).toBe("transition");
  });

  it("returns null when the line gives no hint", () => {
    expect(autoDetectType("She crosses the room.")).toBeNull();
    expect(autoDetectType("Mara enters.")).toBeNull();
    expect(autoDetectType("cut to:")).toBeNull();
    expect(autoDetectType("   ")).toBeNull();
  });
});

describe("autoCase", () => {
  it("upper-cases scene headings, character cues and transitions", () => {
    expect(autoCase("scene-heading", "int. lighthouse - night")).toBe("INT. LIGHTHOUSE - NIGHT");
    expect(autoCase("character", "Mara (V.O.)")).toBe("MARA (V.O.)");
    expect(autoCase("transition", "cut to:")).toBe("CUT TO:");
  });

  it("leaves action, dialogue and parentheticals untouched", () => {
    expect(autoCase("action", "She crosses the room.")).toBe("She crosses the room.");
    expect(autoCase("dialogue", "I can't stay.")).toBe("I can't stay.");
    expect(autoCase("parenthetical", "(whispering)")).toBe("(whispering)");
  });
});

describe("document format", () => {
  it("drops an unknown format during normalization", () => {
    const document = normalizeDocument({
      id: "doc-1",
      title: "Scene",
      content: "<p>Text</p>",
      format: "novel"
    } as unknown as DocumentData);

    expect(document.format).toBeUndefined();
  });

  it("keeps the format through the open folder layout", async () => {
    const project = {
      id: "project-1",
      name: "Screenplay",
      author: "",
      activeDocumentId: "doc-1",
      projectGoal: 0,
      chapterGoals: {},
      activity: {},
      chapters: [{ id: "chapter-1", title: "One", expanded: true }],
      documents: [
        { id: "doc-1", title: "Scene", content: "<p>Text</p>", chapterId: "chapter-1", format: "screenplay" },
        { id: "doc-2", title: "Notes", content: "<p>Prose</p>", chapterId: "chapter-1" },
        { id: "doc-3", title: "Broken", content: "<p>?</p>", chapterId: "chapter-1", format: "novel" }
      ]
    } as unknown as ProjectData;

    const fs = new MemoryFileSystem();
    await writeOpenProject(fs, createStoredProject(project, "device-a", 1_000));
    const [read] = await readOpenProjects(fs, 2_000);

    expect(read.project.documents.find((doc) => doc.id === "doc-1")?.format).toBe("screenplay");
    expect(read.project.documents.find((doc) => doc.id === "doc-2")?.format).toBeUndefined();
    expect(read.project.documents.find((doc) => doc.id === "doc-3")?.format).toBeUndefined();
  });
});
