import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "./storage/sync/memory-fs";
import { createStoredProject } from "./storage/schema";
import { readOpenProjects, writeOpenProject } from "./storage/sync/open-layout";
import type { ProjectData } from "./storage/types";
import type { LabelDef } from "./publish/types";
import {
  normalizeLabels,
  DEFAULT_LABELS,
  LABEL_COLORS,
  addLabel,
  renameLabel,
  recolorLabel,
  removeLabel,
  setLabel,
  labelById,
  countByLabel,
  projectLabels
} from "./labels";

describe("labels.ts pure functions", () => {
  describe("LABEL_COLORS", () => {
    it("has 8 named colours with css values", () => {
      expect(LABEL_COLORS.length).toBe(8);
      expect(LABEL_COLORS).toContainEqual({ key: "grey", css: "#8a8f98" });
      expect(LABEL_COLORS).toContainEqual({ key: "green", css: "#a8d593" });
    });
  });

  describe("DEFAULT_LABELS", () => {
    it("has draft, revised, final labels with fixed ids", () => {
      expect(DEFAULT_LABELS).toHaveLength(3);
      expect(DEFAULT_LABELS[0]).toEqual({ id: "label-draft", name: "Draft", color: "grey" });
      expect(DEFAULT_LABELS[1]).toEqual({ id: "label-revised", name: "Revised", color: "amber" });
      expect(DEFAULT_LABELS[2]).toEqual({ id: "label-final", name: "Final", color: "green" });
    });
  });

  describe("normalizeLabels", () => {
    it("validates unknown stored data and drops bad entries", () => {
      const result = normalizeLabels(undefined);
      expect(result).toBeUndefined();

      const result2 = normalizeLabels(null as unknown as unknown[]);
      expect(result2).toBeUndefined();

      const result3 = normalizeLabels("not an object");
      expect(result3).toBeUndefined();
    });

    it("drops entries with missing or duplicate ids", () => {
      const result = normalizeLabels([
        { id: "a", name: "A", color: "grey" as const },
        { name: "NoId", color: "amber" as const }, // missing id -> dropped
        { id: "a", name: "Duplicate", color: "green" as const }, // duplicate id -> dropped
        { id: "b", name: "B", color: "invalid" as const } // invalid color -> normalized to grey
      ]);
      expect(result).toHaveLength(2);
      expect(result![0].id).toBe("a");
      expect(result![1].id).toBe("b");
      expect(result![1].color).toBe("grey");
    });

    it("keeps max 24 labels", () => {
      const many: LabelDef[] = [];
      for (let i = 0; i < 30; i++) {
        many.push({ id: `id-${i}`, name: `Label ${i}`, color: "grey" as const });
      }
      const result = normalizeLabels(many);
      expect(result).toHaveLength(24);
    });

    it("preserves valid labels", () => {
      const result = normalizeLabels([
        { id: "label-1", name: "First", color: "blue" as const },
        { id: "label-2", name: "Second", color: "amber" as const }
      ]);
      expect(result).toHaveLength(2);
      expect(result![0].name).toBe("First");
      expect(result![1].color).toBe("amber");
    });
  });

  describe("projectLabels", () => {
    it("returns stored labels when project has them", () => {
      const project = { labels: [{ id: "custom-1", name: "Custom", color: "purple" as const }] };
      expect(projectLabels(project)).toEqual([{ id: "custom-1", name: "Custom", color: "purple" }]);
    });

    it("falls back to DEFAULT_LABELS when project has no labels", () => {
      expect(projectLabels({})).toEqual(DEFAULT_LABELS);
    });

    it("falls back to DEFAULT_LABELS when project has empty labels", () => {
      expect(projectLabels({ labels: [] })).toEqual(DEFAULT_LABELS);
    });
  });

  describe("addLabel", () => {
    it("adds a new label when id does not exist", () => {
      const result = addLabel(DEFAULT_LABELS, "label-test", "Test", "orange" as const);
      expect(result).toHaveLength(4);
      expect(result![3]).toEqual({ id: "label-test", name: "Test", color: "orange" });
    });

    it("does not add label when id already exists", () => {
      const result = addLabel(DEFAULT_LABELS, "label-draft", "New Draft", "blue" as const);
      expect(result).toHaveLength(3);
    });

    it("does not add label when at max 24", () => {
      const many: LabelDef[] = [];
      for (let i = 0; i < 24; i++) {
        many.push({ id: `id-${i}`, name: `Label ${i}`, color: "grey" as const });
      }
      const result = addLabel(many, "label-overflow", "Overflow", "green" as const);
      expect(result).toHaveLength(24);
    });
  });

  describe("renameLabel", () => {
    it("renames a label by id", () => {
      const result = renameLabel(DEFAULT_LABELS, "label-draft", "Draft v2");
      expect(result![0].name).toBe("Draft v2");
      expect(result![1].name).toBe("Revised");
      expect(result![2].name).toBe("Final");
    });

    it("does nothing when id does not exist", () => {
      const result = renameLabel(DEFAULT_LABELS, "nonexistent", "New Name");
      expect(result).toEqual(DEFAULT_LABELS);
    });
  });

  describe("recolorLabel", () => {
    it("recolors a label by id", () => {
      const result = recolorLabel(DEFAULT_LABELS, "label-revised", "blue" as const);
      expect(result![1].color).toBe("blue");
      expect(result![0].color).toBe("grey");
      expect(result![2].color).toBe("green");
    });

    it("does nothing when id does not exist", () => {
      const result = recolorLabel(DEFAULT_LABELS, "nonexistent", "blue" as const);
      expect(result).toEqual(DEFAULT_LABELS);
    });
  });

  describe("removeLabel", () => {
    it("removes a label and clears assignments", () => {
      const labels = [{ id: "label-draft", name: "Draft", color: "grey" as const }];
      const documents = [{ id: "doc-1", labelId: "label-draft" }];
      const chapters = [{ id: "chap-1", labelId: "label-draft" }];

      const result = removeLabel(labels, "label-draft", documents, chapters);
      expect(result.labels).toHaveLength(0);
      expect(result.documents[0].labelId).toBeUndefined();
      expect(result.chapters[0].labelId).toBeUndefined();
    });

    it("does not affect other labels", () => {
      const labels = [{ id: "label-draft", name: "Draft", color: "grey" as const }, { id: "label-final", name: "Final", color: "green" as const }];
      const documents = [{ id: "doc-1", labelId: "label-draft" }, { id: "doc-2", labelId: "label-final" }];
      const chapters = [{ id: "chap-1", labelId: "label-draft" }];

      const result = removeLabel(labels, "label-draft", documents, chapters);
      expect(result.labels).toHaveLength(1);
      expect(result.labels![0].id).toBe("label-final");
      expect(result.documents[0].labelId).toBeUndefined();
      expect(result.documents[1].labelId).toBe("label-final");
      expect(result.chapters[0].labelId).toBeUndefined();
    });
  });

  describe("setLabel", () => {
    it("sets labelId on a document", () => {
      const doc = { id: "doc-1", title: "Test" } as { labelId?: string };
      const result = setLabel(doc, "label-draft");
      expect(result.labelId).toBe("label-draft");
    });

    it("clears labelId when undefined is passed", () => {
      const doc = { id: "doc-1", title: "Test", labelId: "label-draft" } as { labelId?: string };
      const result = setLabel(doc, undefined);
      expect(result.labelId).toBeUndefined();
    });
  });

  describe("labelById", () => {
    it("finds a label by id", () => {
      const labels = [{ id: "label-draft", name: "Draft", color: "grey" as const }];
      expect(labelById(labels, "label-draft")).toEqual({ id: "label-draft", name: "Draft", color: "grey" });
      expect(labelById(labels, "nonexistent")).toBeUndefined();
    });
  });

  describe("countByLabel", () => {
    it("counts scenes per label, ignoring trashed", () => {
      const documents = [
        { id: "doc-1", labelId: "label-draft", trashed: false },
        { id: "doc-2", labelId: "label-draft", trashed: false },
        { id: "doc-3", labelId: "label-final", trashed: false },
        { id: "doc-4", labelId: "label-final", trashed: true }
      ];
      const result = countByLabel(documents);
      expect(result["label-draft"]).toBe(2);
      expect(result["label-final"]).toBe(1);
    });

    it("returns empty object when no labels", () => {
      const documents = [
        { id: "doc-1", trashed: false },
        { id: "doc-2", trashed: true }
      ];
      const result = countByLabel(documents);
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});

describe("labels in the open folder layout", () => {
  it("keeps scene labels, chapter labels and project labels through write and read", async () => {
    const labels: LabelDef[] = [
      { id: "label-a", name: "Needs work", color: "red" },
      { id: "label-b", name: "Done", color: "green" }
    ];
    const project = {
      id: "project-1",
      name: "Novel",
      author: "",
      activeDocumentId: "doc-1",
      projectGoal: 0,
      chapterGoals: {},
      activity: {},
      chapters: [{ id: "chapter-1", title: "One", expanded: true, labelId: "label-a" }],
      documents: [
        { id: "doc-1", title: "Scene", content: "<p>Text</p>", chapterId: "chapter-1", labelId: "label-b" },
        { id: "doc-2", title: "Plain", content: "<p>No label</p>", chapterId: "chapter-1" }
      ],
      labels
    } as unknown as ProjectData;

    const fs = new MemoryFileSystem();
    await writeOpenProject(fs, createStoredProject(project, "device-a", 1_000));
    const [read] = await readOpenProjects(fs, 2_000);

    expect(read.project.labels).toEqual(labels);
    expect(read.project.chapters?.[0].labelId).toBe("label-a");
    expect(read.project.documents.find((doc) => doc.id === "doc-1")?.labelId).toBe("label-b");
    expect(read.project.documents.find((doc) => doc.id === "doc-2")?.labelId).toBeUndefined();
  });
});
