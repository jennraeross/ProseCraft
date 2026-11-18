import { describe, expect, it } from "vitest";
import type { DocumentMeta, SheetField, SheetTemplate } from "./story-meta";
import {
  BLANK,
  FANTASY,
  MAX_TEMPLATES,
  MAX_TEMPLATE_FIELDS,
  ROMANCE,
  THRILLER,
  addField,
  addTemplate,
  allTemplates,
  applyTemplate,
  changeFieldType,
  removeField,
  removeTemplate,
  renameField,
  renameTemplate,
  reorderField,
  setFieldOptions,
  setSheetValue,
  sheetValue,
  uniqueTemplateName,
  validateSheetValue
} from "./sheet-templates";

function idFactory(prefix = "field"): () => string {
  let next = 0;
  return () => `${prefix}-${(next += 1)}`;
}

function template(overrides: Partial<SheetTemplate> = {}): SheetTemplate {
  return { id: "custom", name: "Custom", fields: [], ...overrides };
}

function field(overrides: Partial<SheetField> = {}): SheetField {
  return { id: "field-1", label: "Field", type: "text", ...overrides };
}

describe("built-in templates", () => {
  it("matches the presets in the template picker", () => {
    expect([THRILLER.name, FANTASY.name, ROMANCE.name, BLANK.name]).toEqual([
      "Thriller",
      "Fantasy",
      "Romance",
      "Blank"
    ]);
    expect([THRILLER, FANTASY, ROMANCE, BLANK].map((entry) => entry.fields.length)).toEqual([
      7, 11, 9, 0
    ]);
  });

  it("uses unique field ids and sensible field types", () => {
    for (const entry of [THRILLER, FANTASY, ROMANCE]) {
      const ids = entry.fields.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(THRILLER.fields.find((item) => item.id === "role")?.type).toBe("text");
    expect(THRILLER.fields.find((item) => item.id === "age")?.type).toBe("number");
    expect(THRILLER.fields.find((item) => item.id === "appearance")?.type).toBe("longtext");
    expect(FANTASY.fields.find((item) => item.id === "birthplace")?.type).toBe("link");
    expect(FANTASY.fields.find((item) => item.id === "languages")?.type).toBe("text");
  });

  it("keeps the shared ids aligned so values carry over", () => {
    const shared = THRILLER.fields.map((item) => item.id);
    expect(FANTASY.fields.slice(0, shared.length).map((item) => item.id)).toEqual(shared);
    expect(ROMANCE.fields.slice(0, shared.length).map((item) => item.id)).toEqual(shared);
  });
});

describe("allTemplates", () => {
  it("returns the built-ins when the project has no custom templates", () => {
    expect(allTemplates({})).toEqual([THRILLER, FANTASY, ROMANCE, BLANK]);
    expect(allTemplates({ sheetTemplates: undefined })).toEqual([THRILLER, FANTASY, ROMANCE, BLANK]);
  });

  it("appends custom templates after the built-ins", () => {
    const custom = template();
    const result = allTemplates({ sheetTemplates: [custom] });
    expect(result).toEqual([THRILLER, FANTASY, ROMANCE, BLANK, custom]);
    expect(result[0]).toBe(THRILLER);
  });
});

describe("template CRUD", () => {
  it("adds an empty template with a generated id", () => {
    const custom = template({ id: "custom-1" });
    const createId = idFactory("template");
    const result = addTemplate([custom], "  My thriller  ", createId);
    expect(result).toEqual([custom, { id: "template-1", name: "My thriller", fields: [] }]);
  });

  it("falls back to a placeholder name for blank input", () => {
    const result = addTemplate([], "   ", idFactory());
    expect(result[0].name).toBe("Untitled template");
  });

  it("does not add more than the template limit", () => {
    const full = Array.from({ length: MAX_TEMPLATES }, (_, index) =>
      template({ id: `custom-${index}` })
    );
    let called = false;
    const createId = () => {
      called = true;
      return "unused";
    };
    const result = addTemplate(full, "One too many", createId);
    expect(result).toHaveLength(MAX_TEMPLATES);
    expect(result).toEqual(full);
    expect(called).toBe(false);
  });

  it("renames and removes only the requested template", () => {
    const first = template({ id: "first", name: "First" });
    const second = template({ id: "second", name: "Second" });
    expect(renameTemplate([first, second], "second", "  Renamed ")).toEqual([
      first,
      { ...second, name: "Renamed" }
    ]);
    expect(renameTemplate([first, second], "second", "   ")).toEqual([first, second]);
    expect(removeTemplate([first, second], "first")).toEqual([second]);
    expect(removeTemplate([first, second], "missing")).toEqual([first, second]);
  });
});

describe("field CRUD", () => {
  it("appends a field with a generated id and a trimmed label", () => {
    const custom = template();
    const createId = idFactory("new");
    const result = addField([custom], "custom", field({ label: "  Goal  " }), createId);
    expect(result[0].fields).toEqual([{ id: "new-1", label: "Goal", type: "text" }]);
    expect(custom.fields).toEqual([]);
  });

  it("cleans choice options and drops them for other types", () => {
    const createId = idFactory();
    const withChoice = addField(
      [template()],
      "custom",
      { label: "Role", type: "choice", options: ["  Hero ", "", "Hero", "Villain"] },
      createId
    );
    expect(withChoice[0].fields[0].options).toEqual(["Hero", "Villain"]);

    const withText = addField(
      [template()],
      "custom",
      { label: "Role", type: "text", options: ["Hero"] },
      idFactory()
    );
    expect("options" in withText[0].fields[0]).toBe(false);
  });

  it("ignores blank field labels and respects the field limit", () => {
    expect(addField([template()], "custom", { label: "  ", type: "text" }, idFactory())).toEqual([
      template()
    ]);

    const full = template({
      fields: Array.from({ length: MAX_TEMPLATE_FIELDS }, (_, index) =>
        field({ id: `field-${index}`, label: `Field ${index}` })
      )
    });
    const result = addField([full], "custom", { label: "One too many", type: "text" }, idFactory());
    expect(result[0].fields).toHaveLength(MAX_TEMPLATE_FIELDS);
    expect(result[0].fields).toEqual(full.fields);
  });

  it("renames a field and ignores blank labels", () => {
    const custom = template({ fields: [field(), field({ id: "field-2", label: "Other" })] });
    const result = renameField([custom], "custom", "field-2", "  Renamed ");
    expect(result[0].fields.map((item) => item.label)).toEqual(["Field", "Renamed"]);
    expect(renameField([custom], "custom", "field-2", " ")).toEqual([custom]);
  });

  it("reorders a field and clamps the target index", () => {
    const custom = template({
      fields: [
        field({ id: "a", label: "A" }),
        field({ id: "b", label: "B" }),
        field({ id: "c", label: "C" })
      ]
    });
    const order = (entry: SheetTemplate) => entry.fields.map((item) => item.id);
    expect(order(reorderField([custom], "custom", "a", 2)[0])).toEqual(["b", "c", "a"]);
    expect(order(reorderField([custom], "custom", "c", 0)[0])).toEqual(["c", "a", "b"]);
    expect(order(reorderField([custom], "custom", "a", 99)[0])).toEqual(["b", "c", "a"]);
    expect(order(reorderField([custom], "custom", "a", -5)[0])).toEqual(["a", "b", "c"]);
    expect(order(reorderField([custom], "custom", "a", Number.NaN)[0])).toEqual(["a", "b", "c"]);
    expect(order(reorderField([custom], "custom", "missing", 1)[0])).toEqual(["a", "b", "c"]);
  });

  it("removes a field without touching the others", () => {
    const custom = template({
      fields: [field({ id: "a" }), field({ id: "b" }), field({ id: "c" })]
    });
    const result = removeField([custom], "custom", "b");
    expect(result[0].fields.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("changes a field type and only keeps options on choice fields", () => {
    const choice = template({
      fields: [field({ id: "role", label: "Role", type: "choice", options: ["Hero", "Villain"] })]
    });
    const asText = changeFieldType([choice], "custom", "role", "text");
    expect(asText[0].fields[0]).toEqual({ id: "role", label: "Role", type: "text" });

    const asNumber = changeFieldType([choice], "custom", "role", "number");
    expect(asNumber[0].fields[0]).toEqual({ id: "role", label: "Role", type: "number" });
  });

  it("replaces choice options and removes an empty list", () => {
    const custom = template({
      fields: [field({ id: "role", type: "choice", options: ["Hero"] })]
    });
    const options = setFieldOptions([custom], "custom", "role", [" Hero ", "Villain", "Hero"]);
    expect(options[0].fields[0].options).toEqual(["Hero", "Villain"]);
    expect("options" in setFieldOptions([custom], "custom", "role", [])[0].fields[0]).toBe(false);
  });
});

describe("applyTemplate", () => {
  it("keeps values by field id and reports values without a field", () => {
    const meta: DocumentMeta = {
      kind: "character",
      sheet: { secret: "Signed the memo.", orphan: "Keep me", role: "Protagonist" }
    };
    const result = applyTemplate(meta, THRILLER);

    expect(result.meta).toEqual({
      kind: "character",
      sheet: { role: "Protagonist", secret: "Signed the memo.", orphan: "Keep me" }
    });
    expect(Object.keys(result.meta.sheet ?? {})).toEqual(["role", "secret", "orphan"]);
    expect(result.orphans).toEqual(["orphan"]);
    expect(meta.sheet).toEqual({
      secret: "Signed the memo.",
      orphan: "Keep me",
      role: "Protagonist"
    });
  });

  it("does not invent empty entries for unfilled fields", () => {
    const result = applyTemplate({ sheet: { role: "Protagonist" } }, THRILLER);
    expect(result.meta.sheet).toEqual({ role: "Protagonist" });
    expect(result.meta.sheet).not.toHaveProperty("age");
    expect(result.orphans).toEqual([]);
  });

  it("handles a page without metadata", () => {
    expect(applyTemplate(undefined, THRILLER)).toEqual({ meta: {}, orphans: [] });
    expect(applyTemplate(undefined, BLANK)).toEqual({ meta: {}, orphans: [] });
  });

  it("keeps orphan values even when the template has no fields", () => {
    const result = applyTemplate({ sheet: { secret: "Still here" } }, BLANK);
    expect(result.meta.sheet).toEqual({ secret: "Still here" });
    expect(result.orphans).toEqual(["secret"]);
  });
});

describe("sheetValue and setSheetValue", () => {
  it("reads a value or an empty string", () => {
    expect(sheetValue({ sheet: { role: "Protagonist" } }, "role")).toBe("Protagonist");
    expect(sheetValue({ sheet: {} }, "role")).toBe("");
    expect(sheetValue(undefined, "role")).toBe("");
  });

  it("stores a value without touching the rest of the meta", () => {
    const meta: DocumentMeta = { kind: "character", sheet: { role: "Protagonist" } };
    const result = setSheetValue(meta, "age", "41");
    expect(result).toEqual({
      kind: "character",
      sheet: { role: "Protagonist", age: "41" }
    });
    expect(meta.sheet).toEqual({ role: "Protagonist" });
  });

  it("removes empty values and drops an empty sheet", () => {
    expect(setSheetValue({ sheet: { role: "Protagonist" } }, "role", "")).toBeUndefined();
    expect(setSheetValue({ kind: "character", sheet: { role: "Protagonist" } }, "role", "")).toEqual({
      kind: "character"
    });
    expect(setSheetValue(undefined, "role", "")).toBeUndefined();
  });

  it("ignores a blank field id", () => {
    const meta: DocumentMeta = { sheet: { role: "Protagonist" } };
    expect(setSheetValue(meta, "", "ignored")).toBe(meta);
  });
});

describe("validateSheetValue", () => {
  const numberField = field({ type: "number" });
  const choiceField = field({ type: "choice", options: ["Hero", "Villain"] });

  it("accepts plain numbers and rejects anything else", () => {
    for (const value of ["41", " 41 ", "-3.5", ".5", "+2", "3.0"]) {
      expect(validateSheetValue(numberField, value)).toBeUndefined();
    }
    for (const value of ["41a", "1,5", "Infinity", "NaN", "1e3"]) {
      expect(validateSheetValue(numberField, value)).toBe("number");
    }
  });

  it("accepts listed choice options only", () => {
    expect(validateSheetValue(choiceField, "Hero")).toBeUndefined();
    expect(validateSheetValue(choiceField, " Hero ")).toBeUndefined();
    expect(validateSheetValue(choiceField, "Sidekick")).toBe("choice");
    expect(validateSheetValue(field({ type: "choice" }), "Hero")).toBe("choice");
  });

  it("treats empty values as valid and leaves free-text fields alone", () => {
    expect(validateSheetValue(numberField, "")).toBeUndefined();
    expect(validateSheetValue(choiceField, "   ")).toBeUndefined();
    expect(validateSheetValue(field({ type: "text" }), "anything")).toBeUndefined();
    expect(validateSheetValue(field({ type: "longtext" }), "line one\nline two")).toBeUndefined();
    expect(validateSheetValue(field({ type: "link" }), "page-id")).toBeUndefined();
  });
});

describe("uniqueTemplateName", () => {
  it("keeps a name that is still free", () => {
    expect(uniqueTemplateName([], "My sheet")).toBe("My sheet");
    expect(uniqueTemplateName([template({ name: "Other" })], "  My sheet  ")).toBe("My sheet");
  });

  it("falls back to a placeholder for a blank name", () => {
    expect(uniqueTemplateName([], "   ")).toBe("Untitled template");
  });

  it("numbers copies, ignoring case", () => {
    const templates = [template({ id: "a", name: "My sheet" })];
    expect(uniqueTemplateName(templates, "my sheet")).toBe("my sheet copy");
    templates.push(template({ id: "b", name: "my sheet COPY" }));
    expect(uniqueTemplateName(templates, "My sheet")).toBe("My sheet copy 2");
  });
});
