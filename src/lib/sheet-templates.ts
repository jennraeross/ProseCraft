/**
 * Character-sheet templates: the built-in presets plus the pure helpers the
 * template editor and the character sheet use to edit and apply them.
 *
 * Built-in templates live in code; templates the author creates are stored on
 * the project (`ProjectData.sheetTemplates`). Field ids are stable, so values
 * carry over when a character switches to a template that shares them.
 * Applying a template never removes data: values of fields the template does
 * not define stay in `meta.sheet` and are reported as orphans.
 */

import type { DocumentMeta, SheetField, SheetFieldType, SheetTemplate } from "./story-meta";

export const MAX_TEMPLATES = 20;
export const MAX_TEMPLATE_FIELDS = 40;

export const THRILLER: SheetTemplate = {
  id: "thriller",
  name: "Thriller",
  fields: [
    { id: "role", label: "Role", type: "text" },
    { id: "age", label: "Age", type: "number" },
    { id: "appearance", label: "Appearance", type: "longtext" },
    { id: "voice", label: "Voice", type: "longtext" },
    { id: "goals", label: "Goals", type: "longtext" },
    { id: "flaws", label: "Flaws", type: "longtext" },
    { id: "secret", label: "Secret", type: "longtext" }
  ]
};

export const FANTASY: SheetTemplate = {
  id: "fantasy",
  name: "Fantasy",
  fields: [
    { id: "role", label: "Role", type: "text" },
    { id: "age", label: "Age", type: "number" },
    { id: "appearance", label: "Appearance", type: "longtext" },
    { id: "voice", label: "Voice", type: "longtext" },
    { id: "goals", label: "Goals", type: "longtext" },
    { id: "flaws", label: "Flaws", type: "longtext" },
    { id: "secret", label: "Secret", type: "longtext" },
    { id: "languages", label: "Languages", type: "text" },
    { id: "birthplace", label: "Birthplace", type: "link" },
    { id: "occupation", label: "Occupation", type: "text" },
    { id: "abilities", label: "Abilities", type: "longtext" }
  ]
};

export const ROMANCE: SheetTemplate = {
  id: "romance",
  name: "Romance",
  fields: [
    { id: "role", label: "Role", type: "text" },
    { id: "age", label: "Age", type: "number" },
    { id: "appearance", label: "Appearance", type: "longtext" },
    { id: "voice", label: "Voice", type: "longtext" },
    { id: "goals", label: "Goals", type: "longtext" },
    { id: "flaws", label: "Flaws", type: "longtext" },
    { id: "secret", label: "Secret", type: "longtext" },
    { id: "occupation", label: "Occupation", type: "text" },
    { id: "birthplace", label: "Birthplace", type: "link" }
  ]
};

export const BLANK: SheetTemplate = { id: "blank", name: "Blank", fields: [] };

const BUILT_IN_TEMPLATES: readonly SheetTemplate[] = [THRILLER, FANTASY, ROMANCE, BLANK];

/** Built-in templates followed by the templates stored on the project. */
export function allTemplates(project: {
  sheetTemplates?: readonly SheetTemplate[];
}): SheetTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...(project.sheetTemplates ?? [])];
}

export type AppliedTemplate = {
  meta: DocumentMeta;
  /** Field ids that have a stored value but no field in the template. */
  orphans: string[];
};

/**
 * Applies one template to a page's metadata. Sheet entries are reordered to
 * match the template and values are kept by field id. Fields the template no
 * longer defines stay in `meta.sheet` and are reported as orphans, so the UI
 * can offer to keep or clean them up. Existing data is never deleted.
 */
export function applyTemplate(
  meta: DocumentMeta | undefined,
  template: SheetTemplate
): AppliedTemplate {
  const sheet = meta?.sheet ?? {};
  const known = new Set(template.fields.map((field) => field.id));
  const entries: [string, string][] = [];

  for (const field of template.fields) {
    if (Object.prototype.hasOwnProperty.call(sheet, field.id)) {
      entries.push([field.id, sheet[field.id]]);
    }
  }

  const orphans: string[] = [];
  for (const [key, value] of Object.entries(sheet)) {
    if (known.has(key)) continue;
    entries.push([key, value]);
    orphans.push(key);
  }

  const next: DocumentMeta = { ...meta };
  if (entries.length > 0) next.sheet = Object.fromEntries(entries);
  else delete next.sheet;
  return { meta: next, orphans };
}

/** Value of a template field; empty when the page has not filled it in. */
export function sheetValue(meta: DocumentMeta | undefined, fieldId: string): string {
  return meta?.sheet?.[fieldId] ?? "";
}

/**
 * Stores one template value. Empty values are removed again so the sheet does
 * not fill up with blanks; an empty sheet (or meta) is dropped entirely.
 */
export function setSheetValue(
  meta: DocumentMeta | undefined,
  fieldId: string,
  value: string
): DocumentMeta | undefined {
  if (!fieldId) return meta;
  const sheet: Record<string, string> = { ...(meta?.sheet ?? {}) };
  if (value) sheet[fieldId] = value;
  else delete sheet[fieldId];

  const next: DocumentMeta = { ...meta };
  if (Object.keys(sheet).length > 0) next.sheet = sheet;
  else delete next.sheet;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Why a value does not fit its field; `undefined` means it is valid. */
export type SheetValueError = "number" | "choice";

const NUMBER_VALUE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Validates a value against the field type. Empty values are always allowed
 * because every field is optional. Text, long text and links accept anything.
 */
export function validateSheetValue(
  field: SheetField,
  value: string
): SheetValueError | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (field.type === "number") return NUMBER_VALUE.test(text) ? undefined : "number";
  if (field.type === "choice" && !(field.options ?? []).includes(text)) return "choice";
  return undefined;
}

function cleanOptions(options: readonly string[] | undefined): string[] | undefined {
  if (!options) return undefined;
  const cleaned: string[] = [];
  for (const option of options) {
    const text = option.trim();
    if (text && !cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function updateTemplate(
  templates: readonly SheetTemplate[],
  templateId: string,
  update: (template: SheetTemplate) => SheetTemplate | undefined
): SheetTemplate[] {
  return templates.map((template) => {
    if (template.id !== templateId) return template;
    return update(template) ?? template;
  });
}

/** Creates an empty custom template, unless the custom list is full. */
export function addTemplate(
  templates: readonly SheetTemplate[],
  name: string,
  createId: () => string
): SheetTemplate[] {
  if (templates.length >= MAX_TEMPLATES) return [...templates];
  const template: SheetTemplate = {
    id: createId(),
    name: name.trim() || "Untitled template",
    fields: []
  };
  return [...templates, template];
}

/** Renames one custom template; blank names are ignored. */
export function renameTemplate(
  templates: readonly SheetTemplate[],
  templateId: string,
  name: string
): SheetTemplate[] {
  const next = name.trim();
  if (!next) return [...templates];
  return updateTemplate(templates, templateId, (template) => ({ ...template, name: next }));
}

/** Removes one custom template. Built-ins are constants and never stored. */
export function removeTemplate(
  templates: readonly SheetTemplate[],
  templateId: string
): SheetTemplate[] {
  return templates.filter((template) => template.id !== templateId);
}

/**
 * Appends a field with a generated id. The list is capped at
 * `MAX_TEMPLATE_FIELDS` and blank labels are ignored; choice options are
 * trimmed, de-duplicated and only kept for choice fields.
 */
export function addField(
  templates: readonly SheetTemplate[],
  templateId: string,
  field: Omit<SheetField, "id">,
  createId: () => string
): SheetTemplate[] {
  return updateTemplate(templates, templateId, (template) => {
    if (template.fields.length >= MAX_TEMPLATE_FIELDS) return undefined;
    const label = field.label.trim();
    if (!label) return undefined;
    const next: SheetField = { id: createId(), label, type: field.type };
    if (field.type === "choice") {
      const options = cleanOptions(field.options);
      if (options) next.options = options;
    }
    return { ...template, fields: [...template.fields, next] };
  });
}

/** Renames one field; blank labels are ignored. */
export function renameField(
  templates: readonly SheetTemplate[],
  templateId: string,
  fieldId: string,
  label: string
): SheetTemplate[] {
  const next = label.trim();
  if (!next) return [...templates];
  return updateTemplate(templates, templateId, (template) => ({
    ...template,
    fields: template.fields.map((field) =>
      field.id === fieldId ? { ...field, label: next } : field
    )
  }));
}

/** Moves a field to a new index, clamped to the field list. */
export function reorderField(
  templates: readonly SheetTemplate[],
  templateId: string,
  fieldId: string,
  toIndex: number
): SheetTemplate[] {
  return updateTemplate(templates, templateId, (template) => {
    if (!Number.isFinite(toIndex)) return undefined;
    const from = template.fields.findIndex((field) => field.id === fieldId);
    if (from === -1) return undefined;
    const to = Math.min(template.fields.length - 1, Math.max(0, Math.trunc(toIndex)));
    if (from === to) return undefined;
    const fields = [...template.fields];
    const [moved] = fields.splice(from, 1);
    fields.splice(to, 0, moved);
    return { ...template, fields };
  });
}

/** Removes one field from a template. Stored page values are left untouched. */
export function removeField(
  templates: readonly SheetTemplate[],
  templateId: string,
  fieldId: string
): SheetTemplate[] {
  return updateTemplate(templates, templateId, (template) => ({
    ...template,
    fields: template.fields.filter((field) => field.id !== fieldId)
  }));
}

/** Changes a field's type; options only survive on choice fields. */
export function changeFieldType(
  templates: readonly SheetTemplate[],
  templateId: string,
  fieldId: string,
  type: SheetFieldType
): SheetTemplate[] {
  return updateTemplate(templates, templateId, (template) => ({
    ...template,
    fields: template.fields.map((field) => {
      if (field.id !== fieldId) return field;
      const next: SheetField = { ...field, type };
      if (type !== "choice") delete next.options;
      return next;
    })
  }));
}

/** Replaces the option list of a field; blanks and duplicates are dropped. */
export function setFieldOptions(
  templates: readonly SheetTemplate[],
  templateId: string,
  fieldId: string,
  options: readonly string[]
): SheetTemplate[] {
  return updateTemplate(templates, templateId, (template) => ({
    ...template,
    fields: template.fields.map((field) => {
      if (field.id !== fieldId) return field;
      const next: SheetField = { ...field };
      const cleaned = cleanOptions(options);
      if (cleaned) next.options = cleaned;
      else delete next.options;
      return next;
    })
  }));
}

/** A name no template uses yet: the given one, else a numbered copy of it. */
export function uniqueTemplateName(templates: readonly SheetTemplate[], name: string): string {
  const base = name.trim() || "Untitled template";
  const taken = new Set(templates.map((template) => template.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let candidate = `${base} copy`;
  let index = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} copy ${index}`;
    index += 1;
  }
  return candidate;
}
