<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ChevronDown, ChevronUp, Plus, Trash2, X } from "@lucide/svelte";
  import {
    MAX_TEMPLATE_FIELDS,
    MAX_TEMPLATES,
    addField,
    allTemplates,
    changeFieldType,
    renameField,
    renameTemplate,
    reorderField,
    removeField,
    setFieldOptions,
    uniqueTemplateName
  } from "./sheet-templates";
  import type { SheetFieldType, SheetTemplate } from "./story-meta";

  let {
    templates,
    templateId,
    preview,
    ontemplates,
    onapply,
    onclose
  }: {
    /** Templates saved on the project; built-ins are added here. */
    templates: readonly SheetTemplate[];
    /** Template the page currently uses, pre-selected in the list. */
    templateId?: string;
    /** Title and stored values of the page, used for the live preview. */
    preview: { title: string; values: Record<string, string> };
    ontemplates: (templates: SheetTemplate[]) => void;
    onapply: (template: SheetTemplate) => void;
    onclose: () => void;
  } = $props();

  const FIELD_TYPES: readonly { id: SheetFieldType; label: string }[] = [
    { id: "text", label: "Text" },
    { id: "longtext", label: "Long text" },
    { id: "number", label: "Number" },
    { id: "choice", label: "Choice" },
    { id: "link", label: "Page link" }
  ];

  const SUGGESTED_FIELDS: readonly { label: string; type: SheetFieldType }[] = [
    { label: "Role", type: "text" },
    { label: "Age", type: "number" },
    { label: "Appearance", type: "longtext" },
    { label: "Voice", type: "longtext" },
    { label: "Goals", type: "longtext" },
    { label: "Flaws", type: "longtext" },
    { label: "Secret", type: "longtext" },
    { label: "Languages", type: "text" },
    { label: "Birthplace", type: "link" },
    { label: "Occupation", type: "text" }
  ];

  const uid = $props.id();
  const catalog = $derived(allTemplates({ sheetTemplates: templates }));
  const customIds = $derived(new Set(templates.map((template) => template.id)));
  const builtInCount = $derived(catalog.length - templates.length);

  // The editor opens on the page's template, or the first one, and edits a copy.
  function templateBy(id: string | undefined): SheetTemplate {
    return catalog.find((template) => template.id === id) ?? catalog[0];
  }

  let dialog = $state<HTMLDialogElement>();
  let draft = $state<SheetTemplate>(cloneTemplate(templateBy(untrack(() => templateId))));
  let status = $state("");

  const draftIsCustom = $derived(customIds.has(draft.id));
  const usedLabels = $derived(new Set(draft.fields.map((field) => field.label.trim().toLowerCase())));
  const storedDraft = $derived(catalog.find((template) => template.id === draft.id));
  const dirty = $derived(!storedDraft || JSON.stringify(draft) !== JSON.stringify(storedDraft));
  const fieldsFull = $derived(draft.fields.length >= MAX_TEMPLATE_FIELDS);
  const saveDisabled = $derived(
    (!dirty && draftIsCustom) || (!draftIsCustom && templates.length >= MAX_TEMPLATES)
  );
  const previewInitial = $derived((preview.title.trim()[0] ?? "?").toUpperCase());

  onMount(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  /** Copies a template into plain objects so edits never mutate the props. */
  function cloneTemplate(template: SheetTemplate): SheetTemplate {
    return {
      id: template.id,
      name: template.name,
      fields: template.fields.map((field) => ({
        ...field,
        ...(field.options ? { options: [...field.options] } : {})
      }))
    };
  }

  function selectTemplate(id: string): void {
    const template = catalog.find((entry) => entry.id === id);
    if (!template) return;
    draft = cloneTemplate(template);
    status = "";
  }

  /** Applies a helper result to the draft; helpers return the same object when they ignore input. */
  function updateDraft(update: (list: SheetTemplate[]) => SheetTemplate[]): void {
    const next = update([draft])[0];
    if (next !== draft) draft = next;
  }

  function changeName(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    updateDraft((list) => renameTemplate(list, draft.id, input.value));
    input.value = draft.name;
  }

  function changeLabel(fieldId: string, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    updateDraft((list) => renameField(list, draft.id, fieldId, input.value));
    input.value = draft.fields.find((field) => field.id === fieldId)?.label ?? input.value;
  }

  function changeType(fieldId: string, event: Event): void {
    const type = (event.currentTarget as HTMLSelectElement).value as SheetFieldType;
    updateDraft((list) => changeFieldType(list, draft.id, fieldId, type));
  }

  function changeOptions(fieldId: string, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    updateDraft((list) => setFieldOptions(list, draft.id, fieldId, input.value.split(",")));
    input.value = (draft.fields.find((field) => field.id === fieldId)?.options ?? []).join(", ");
  }

  function moveField(fieldId: string, toIndex: number): void {
    updateDraft((list) => reorderField(list, draft.id, fieldId, toIndex));
  }

  function dropField(fieldId: string): void {
    updateDraft((list) => removeField(list, draft.id, fieldId));
  }

  function appendField(): void {
    updateDraft((list) =>
      addField(list, draft.id, { label: "New field", type: "text" }, () => crypto.randomUUID())
    );
  }

  function addSuggestion(suggestion: { label: string; type: SheetFieldType }): void {
    if (usedLabels.has(suggestion.label.toLowerCase())) return;
    updateDraft((list) =>
      addField(list, draft.id, { label: suggestion.label, type: suggestion.type }, () =>
        crypto.randomUUID()
      )
    );
  }

  /** Writes the draft into the project templates and returns the stored template. */
  function storeDraft(): SheetTemplate | null {
    const saved = cloneTemplate(draft);
    if (draftIsCustom) {
      ontemplates(templates.map((template) => (template.id === saved.id ? saved : template)));
      status = "Template saved.";
      return saved;
    }
    if (templates.length >= MAX_TEMPLATES) {
      status = `You can save up to ${MAX_TEMPLATES} templates.`;
      return null;
    }
    const copy: SheetTemplate = {
      ...saved,
      id: crypto.randomUUID(),
      name: uniqueTemplateName(catalog, saved.name)
    };
    ontemplates([...templates, copy]);
    draft = cloneTemplate(copy);
    status = `Saved as “${copy.name}”.`;
    return cloneTemplate(copy);
  }

  function applyToPage(): void {
    const template = dirty ? storeDraft() : cloneTemplate(draft);
    if (!template) return;
    onapply(template);
    onclose();
  }

  function handleBackdrop(event: MouseEvent): void {
    if (event.target === dialog) onclose();
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    onclose();
  }

  function fieldCount(template: SheetTemplate): string {
    return `${template.fields.length} ${template.fields.length === 1 ? "field" : "fields"}`;
  }
</script>

{#snippet templateOption(template: SheetTemplate)}
  <button
    type="button"
    class="template-option"
    class:active={template.id === draft.id}
    aria-pressed={template.id === draft.id}
    onclick={() => selectTemplate(template.id)}
  >
    <span class="template-option-name">{template.name}</span>
    <span class="template-option-count">{fieldCount(template)}</span>
  </button>
{/snippet}

<dialog
  class="settings-dialog sheet-template-dialog"
  bind:this={dialog}
  aria-labelledby={`${uid}-title`}
  onclick={handleBackdrop}
  oncancel={handleCancel}
>
  <div class="settings-header">
    <div>
      <span class="settings-kicker">WIKI</span>
      <h2 id={`${uid}-title`}>Character sheet template</h2>
      <p class="template-subtitle">{draft.name} · {fieldCount(draft)}</p>
    </div>
    <button class="close-settings" type="button" aria-label="Close template editor" onclick={onclose}><X size={15} aria-hidden="true" /></button>
  </div>
  <div class="settings-body template-body">
    <aside class="template-column" aria-label="Templates">
      <p class="template-section-label">Templates</p>
      <div class="template-list">
        {#each catalog as template, index (template.id)}
          {#if templates.length > 0 && index === builtInCount}
            <p class="template-section-label">My templates</p>
          {/if}
          {@render templateOption(template)}
        {/each}
      </div>
      <p class="template-note">Built-in templates are fixed; saving one stores your own copy.</p>
    </aside>

    <section class="template-column" aria-label="Fields">
      <label class="template-section-label" for={`${uid}-name`}>Template name</label>
      <input
        id={`${uid}-name`}
        class="template-input"
        type="text"
        spellcheck="false"
        value={draft.name}
        placeholder="Untitled template"
        onchange={changeName}
      />
      <div class="template-row">
        <span class="template-section-label">Fields {draft.fields.length} of {MAX_TEMPLATE_FIELDS}</span>
        <button type="button" class="template-add" disabled={fieldsFull} onclick={appendField}><Plus size={11} aria-hidden="true" /> Add field</button>
      </div>
      <ul class="template-fields">
        {#each draft.fields as field, index (field.id)}
          <li class="template-field">
            <div class="template-field-row">
              <input
                class="template-input template-field-label"
                type="text"
                spellcheck="false"
                value={field.label}
                aria-label={`Label of field ${index + 1}`}
                onchange={(event) => changeLabel(field.id, event)}
              />
              <select
                class="template-select"
                aria-label={`Type of ${field.label}`}
                value={field.type}
                onchange={(event) => changeType(field.id, event)}
              >
                {#each FIELD_TYPES as type (type.id)}
                  <option value={type.id}>{type.label}</option>
                {/each}
              </select>
              <div class="template-field-actions">
                <button type="button" class="template-icon" title="Move up" aria-label={`Move ${field.label} up`} disabled={index === 0} onclick={() => moveField(field.id, index - 1)}><ChevronUp size={12} aria-hidden="true" /></button>
                <button type="button" class="template-icon" title="Move down" aria-label={`Move ${field.label} down`} disabled={index === draft.fields.length - 1} onclick={() => moveField(field.id, index + 1)}><ChevronDown size={12} aria-hidden="true" /></button>
                <button type="button" class="template-icon template-icon-remove" title="Remove field" aria-label={`Remove ${field.label}`} onclick={() => dropField(field.id)}><Trash2 size={12} aria-hidden="true" /></button>
              </div>
            </div>
            {#if field.type === "choice"}
              <input
                class="template-input template-field-options"
                type="text"
                spellcheck="false"
                placeholder="Options, separated by commas"
                aria-label={`Options of ${field.label}`}
                value={(field.options ?? []).join(", ")}
                onchange={(event) => changeOptions(field.id, event)}
              />
            {/if}
          </li>
        {/each}
      </ul>
      {#if draft.fields.length === 0}
        <p class="template-note">This template has no fields yet. Add one or pick a suggestion below.</p>
      {/if}
      <p class="template-section-label">Suggested fields</p>
      <div class="template-chips">
        {#each SUGGESTED_FIELDS as suggestion (suggestion.label)}
          <button
            type="button"
            class="template-chip"
            class:picked={usedLabels.has(suggestion.label.toLowerCase())}
            aria-pressed={usedLabels.has(suggestion.label.toLowerCase())}
            disabled={fieldsFull || usedLabels.has(suggestion.label.toLowerCase())}
            onclick={() => addSuggestion(suggestion)}
          ><Plus size={9} aria-hidden="true" />{suggestion.label}</button>
        {/each}
      </div>
      <p class="template-note">Removing a field keeps the values pages already stored.</p>
    </section>

    <aside class="template-column template-preview" aria-label="Live preview">
      <p class="template-section-label">Live preview {#if dirty}<span class="template-badge">unsaved</span>{/if}</p>
      <div class="preview-card">
        <div class="preview-head">
          <span class="preview-portrait" aria-hidden="true">{previewInitial}</span>
          <div class="preview-identity">
            <span class="preview-name">{preview.title.trim() || "Untitled"}</span>
            <span class="preview-template">{draft.name || "Untitled template"} template</span>
          </div>
        </div>
        {#each draft.fields as field (field.id)}
          <div class="preview-field">
            <span class="preview-label">{field.label}</span>
            <span class="preview-value" class:empty={!preview.values[field.id]}>
              {preview.values[field.id] || "—"}
            </span>
          </div>
        {/each}
        {#if draft.fields.length === 0}
          <p class="preview-empty">Empty sheet.</p>
        {/if}
      </div>
      <p class="template-note">Preview updates as you edit.</p>
    </aside>
  </div>
  <div class="settings-footer">
    <span class="template-status" role="status">{status || "Existing pages keep their values when a template changes."}</span>
    <div class="template-actions">
      <button type="button" class="template-button" disabled={saveDisabled} onclick={storeDraft}>Save as my template</button>
      <button type="button" class="template-button primary" onclick={applyToPage}>Apply to this page</button>
    </div>
  </div>
</dialog>

<style>
  .settings-dialog { width: min(980px, calc(100vw - 32px)); height: min(732px, calc(100vh - 32px)); height: min(732px, calc(100dvh - 32px)); padding: 0; overflow: hidden; overscroll-behavior: contain; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-primary); box-shadow: var(--shadow-dialog); }
  .sheet-template-dialog[open] { display: flex; flex-direction: column; }
  .sheet-template-dialog::backdrop { background: var(--backdrop); backdrop-filter: blur(2px); }
  .settings-header { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 21px 25px 16px; border-bottom: 1px solid var(--border-soft); }
  .settings-kicker { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
  .settings-header h2 { margin: 6px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 23px; font-weight: 500; }
  .template-subtitle { margin: 5px 0 0; color: var(--text-muted); font-size: 10px; }
  .close-settings { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .close-settings:hover { background: var(--hover-bg); color: var(--text-primary); }
  .close-settings:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .settings-body { min-height: 0; flex: 1 1 auto; }
  .template-body { display: grid; grid-template-columns: 186px minmax(0, 1fr) 286px; gap: 24px; padding: 18px 25px; overflow: hidden; }
  .template-column { display: flex; min-height: 0; flex-direction: column; gap: 8px; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: var(--scrollbar) transparent; }
  .template-section-label { margin: 0; color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: .9px; text-transform: uppercase; }
  .template-list { display: flex; flex-direction: column; gap: 2px; }
  .template-option { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; text-align: left; }
  .template-option:hover { background: var(--control-hover); color: var(--text-primary); }
  .template-option.active { border-color: var(--accent-soft); background: var(--selected-bg); color: var(--text-heading); box-shadow: inset 2px 0 0 var(--accent); }
  .template-option:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .template-option-name { font-size: 11px; }
  .template-option-count { color: var(--text-faint); font-size: 9px; }
  .template-note { margin: 0; color: var(--text-faint); font-size: 9px; line-height: 1.5; }
  .template-input { width: 100%; height: 30px; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 11px; }
  .template-input::placeholder { color: var(--text-faint); }
  .template-input:focus-visible { border-color: var(--accent); outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .template-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
  .template-add { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; }
  .template-add:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); color: var(--text-primary); }
  .template-add:disabled { color: var(--text-faint); cursor: default; }
  .template-add:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .template-fields { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .template-field { display: flex; flex-direction: column; gap: 5px; padding: 6px 8px; border: 1px solid var(--border-soft); border-radius: 7px; background: var(--surface-raised, var(--control-bg)); }
  .template-field-row { display: flex; align-items: center; gap: 6px; }
  .template-field-label { flex: 1 1 auto; }
  .template-select { height: 30px; flex: 0 0 auto; padding: 0 6px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-secondary); font-family: inherit; font-size: 10px; }
  .template-select:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .template-field-actions { display: flex; flex: 0 0 auto; gap: 1px; }
  .template-icon { display: grid; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .template-icon:hover:not(:disabled) { background: var(--control-hover); color: var(--text-primary); }
  .template-icon:disabled { color: var(--text-faint); cursor: default; }
  .template-icon-remove:hover:not(:disabled) { color: var(--danger, #c2503f); }
  .template-icon:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .template-field-options { height: 26px; font-size: 10px; }
  .template-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .template-chip { display: inline-flex; align-items: center; gap: 3px; height: 23px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 999px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; }
  .template-chip:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); color: var(--text-primary); }
  .template-chip.picked { border-color: var(--accent-soft); color: var(--text-faint); cursor: default; }
  .template-chip:disabled { color: var(--text-faint); }
  .template-chip:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .template-badge { margin-left: 5px; padding: 1px 5px; border: 1px solid var(--border-control); border-radius: 999px; color: var(--text-faint); font-size: 8px; letter-spacing: .3px; }
  .preview-card { display: flex; flex-direction: column; gap: 7px; padding: 12px; border: 1px solid var(--border-soft); border-radius: 9px; background: var(--surface-raised, var(--control-bg)); }
  .preview-head { display: flex; align-items: center; gap: 9px; padding-bottom: 9px; border-bottom: 1px solid var(--border-soft); }
  .preview-portrait { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 999px; background: var(--accent-soft); color: var(--text-heading); font-size: 12px; font-weight: 600; }
  .preview-identity { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
  .preview-name { overflow: hidden; color: var(--text-heading); font-family: Georgia, serif; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .preview-template { overflow: hidden; color: var(--text-faint); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .preview-field { display: flex; flex-direction: column; gap: 1px; }
  .preview-label { color: var(--text-muted); font-size: 8px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
  .preview-value { color: var(--text-body); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
  .preview-value.empty { color: var(--text-faint); }
  .preview-empty { margin: 0; color: var(--text-faint); font-size: 10px; }
  .settings-footer { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 11px 25px; border-top: 1px solid var(--border-soft); color: var(--text-muted); font-size: 9px; }
  .template-status { min-width: 0; flex: 0 1 auto; line-height: 1.5; }
  .template-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 7px; margin-left: auto; }
  .template-button { height: 30px; padding: 0 13px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-family: inherit; font-size: 10px; }
  .template-button:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); }
  .template-button:disabled { color: var(--text-faint); cursor: default; }
  .template-button.primary { border-color: transparent; background: var(--accent-strong); color: var(--accent-contrast); }
  .template-button.primary:hover:not(:disabled) { background: var(--accent-strong-hover); }
  .template-button:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  @media (max-width: 900px) {
    .settings-dialog { height: min(100dvh - 24px, 900px); }
    .template-body { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
    .template-column { overflow: visible; }
  }
  @media (max-width: 640px) {
    .settings-header { padding: 18px 16px 14px; }
    .template-body { padding: 14px 16px; }
    .settings-footer { padding: 11px 16px; }
    /* iOS zooms the page when a focused control is smaller than 16px. */
    .template-input, .template-select { font-size: 16px; }
  }
</style>
