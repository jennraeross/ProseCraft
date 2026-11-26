<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { X } from "@lucide/svelte";
  import {
    CUSTOM_STYLE_LABEL_LIMIT,
    STYLE_FONTS,
    STYLE_TRIMS,
    type CustomExportStyle
  } from "./presets";
  import { t } from "$lib/i18n/state.svelte";
  import type { MessageKey } from "$lib/i18n/catalog";

  const TRIM_KEYS: Record<string, MessageKey> = {
    letter: "trim.letter",
    a4: "trim.a4",
    a5: "trim.a5",
    "trade-6x9": "trim.trade6x9",
    "trade-5.5x8.5": "trim.trade5.5x8.5",
    "trade-5.25x8": "trim.trade5.25x8",
    "trade-5x8": "trim.trade5x8"
  };

  type Props = {
    initial: CustomExportStyle;
    isNew: boolean;
    existingLabels: string[];
    deleteArmed?: boolean;
    onChange: (draft: CustomExportStyle) => void;
    onSave: (draft: CustomExportStyle) => void;
    onCancel: () => void;
    onDelete: () => void;
  };

  let {
    initial,
    isNew,
    existingLabels,
    deleteArmed = false,
    onChange,
    onSave,
    onCancel,
    onDelete
  }: Props = $props();

  // Captured once so "Reset" always returns to the style the editor opened on,
  // even though the parent's `initial` prop tracks live edits for the preview.
  const original: CustomExportStyle = untrack(() => ({ ...initial }));

  let dialog = $state<HTMLDialogElement>();
  let draft = $state<CustomExportStyle>(untrack(() => ({ ...initial })));
  let confirmingDelete = $state(untrack(() => deleteArmed));

  let nameError = $derived.by(() => {
    const label = draft.label.trim();
    if (!label) return t("styleEditor.nameRequired");
    if (existingLabels.some((existing) => existing.trim().toLowerCase() === label.toLowerCase())) {
      return t("styleEditor.nameTaken");
    }
    return "";
  });

  onMount(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  $effect(() => {
    const snapshot = { ...draft };
    untrack(() => onChange(snapshot));
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (nameError) return;
    onSave({ ...draft });
  }

  function reset() {
    draft = { ...original };
    confirmingDelete = false;
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    onCancel();
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === dialog) onCancel();
  }
</script>

<dialog
  class="style-editor-dialog"
  bind:this={dialog}
  aria-labelledby="style-editor-title"
  oncancel={handleCancel}
  onclick={handleBackdrop}
>
  <form onsubmit={submit}>
    <div class="style-editor-header">
      <div>
        <span class="style-editor-kicker">{t("styleEditor.kicker")}</span>
        <h2 id="style-editor-title">{isNew ? t("styleEditor.newTitle") : t("styleEditor.editTitle")}</h2>
      </div>
      <button type="button" class="style-editor-close" aria-label={t("styleEditor.close")} onclick={onCancel}><X size={16} aria-hidden="true" /></button>
    </div>

    <div class="style-editor-body">
      <section class="style-editor-section">
        <div class="style-editor-heading">
          <strong>{t("styleEditor.nameTitle")}</strong>
          <span>{t("styleEditor.nameHelp")}</span>
        </div>
        <label class="style-field">
          <span>{t("styleEditor.nameLabel")}</span>
          <input
            type="text"
            bind:value={draft.label}
            maxlength={CUSTOM_STYLE_LABEL_LIMIT}
            required
            placeholder={t("styleEditor.namePlaceholder")}
          />
        </label>
        {#if nameError}
          <p class="style-editor-error" role="alert">{nameError}</p>
        {/if}
      </section>

      <section class="style-editor-section">
        <div class="style-editor-heading">
          <strong>{t("styleEditor.bodyTitle")}</strong>
          <span>{t("styleEditor.bodyHelp")}</span>
        </div>
        <div class="style-field-grid">
          <label class="style-field">
            <span>{t("styleEditor.font")}</span>
            <select bind:value={draft.fontId}>
              {#each STYLE_FONTS as font (font.id)}
                <option value={font.id}>{font.label}</option>
              {/each}
            </select>
          </label>
          <label class="style-field">
            <span>{t("styleEditor.bodySize")}</span>
            <input type="number" bind:value={draft.bodySizePt} min="6" max="36" step="0.5" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.lineHeight")}</span>
            <input type="number" bind:value={draft.lineHeight} min="1" max="3" step="0.05" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.indent")}</span>
            <input type="number" bind:value={draft.paragraphIndentEm} min="0" max="4" step="0.1" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.paragraphSpacing")}</span>
            <input type="number" bind:value={draft.paragraphSpacingEm} min="0" max="3" step="0.05" />
          </label>
        </div>
        <label class="style-check">
          <input type="checkbox" bind:checked={draft.justify} />
          <span>{t("styleEditor.justify")}</span>
        </label>
      </section>

      <section class="style-editor-section">
        <div class="style-editor-heading">
          <strong>{t("styleEditor.headingTitle")}</strong>
          <span>{t("styleEditor.headingHelp")}</span>
        </div>
        <div class="style-field-grid">
          <label class="style-field">
            <span>{t("styleEditor.headingSize")}</span>
            <input type="number" bind:value={draft.chapterHeadingSizePt} min="8" max="48" step="0.5" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.alignment")}</span>
            <select bind:value={draft.chapterHeadingAlign}>
              <option value="left">{t("styleEditor.alignLeft")}</option>
              <option value="center">{t("styleEditor.alignCenter")}</option>
            </select>
          </label>
          <label class="style-field">
            <span>{t("styleEditor.spaceBefore")}</span>
            <input type="number" bind:value={draft.chapterHeadingSpaceBefore} min="0" max="6" step="0.1" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.spaceAfter")}</span>
            <input type="number" bind:value={draft.chapterHeadingSpaceAfter} min="0" max="6" step="0.1" />
          </label>
        </div>
        <label class="style-check">
          <input type="checkbox" bind:checked={draft.chapterHeadingUppercase} />
          <span>{t("styleEditor.uppercase")}</span>
        </label>
      </section>

      <section class="style-editor-section">
        <div class="style-editor-heading">
          <strong>{t("styleEditor.layoutTitle")}</strong>
          <span>{t("styleEditor.layoutHelp")}</span>
        </div>
        <label class="style-field">
          <span>{t("styleEditor.trim")}</span>
          <select bind:value={draft.trimId}>
            {#each STYLE_TRIMS as trim (trim.id)}
              <option value={trim.id}>{TRIM_KEYS[trim.id] ? t(TRIM_KEYS[trim.id]) : trim.label}</option>
            {/each}
          </select>
        </label>
        <div class="style-field-grid">
          <label class="style-field">
            <span>{t("styleEditor.marginTop")}</span>
            <input type="number" bind:value={draft.marginTopIn} min="0.25" max="1.5" step="0.01" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.marginRight")}</span>
            <input type="number" bind:value={draft.marginRightIn} min="0.25" max="1.5" step="0.01" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.marginBottom")}</span>
            <input type="number" bind:value={draft.marginBottomIn} min="0.25" max="1.5" step="0.01" />
          </label>
          <label class="style-field">
            <span>{t("styleEditor.marginLeft")}</span>
            <input type="number" bind:value={draft.marginLeftIn} min="0.25" max="1.5" step="0.01" />
          </label>
        </div>
        <label class="style-check">
          <input type="checkbox" bind:checked={draft.runningHeader} />
          <span>{t("styleEditor.runningHeader")}</span>
        </label>
        <label class="style-check">
          <input type="checkbox" bind:checked={draft.pageNumbers} />
          <span>{t("styleEditor.pageNumbers")}</span>
        </label>
      </section>

      <section class="style-editor-section">
        <div class="style-editor-heading">
          <strong>{t("styleEditor.detailsTitle")}</strong>
          <span>{t("styleEditor.detailsHelp")}</span>
        </div>
        <div class="style-field-grid">
          <label class="style-field">
            <span>{t("styleEditor.sceneBreak")}</span>
            <input type="number" bind:value={draft.sceneBreakSpacing} min="0" max="3" step="0.1" />
          </label>
        </div>
        <label class="style-check">
          <input type="checkbox" bind:checked={draft.dropCap} />
          <span>{t("styleEditor.dropCap")}</span>
        </label>
      </section>
    </div>

    <div class="style-editor-footer">
      {#if !isNew}
        {#if confirmingDelete}
          <div class="style-editor-confirm" role="group" aria-label={t("styleEditor.confirmDelete")}>
            <span>{t("styleEditor.deleteQuestion")}</span>
            <button type="button" class="style-danger-button" onclick={onDelete}>{t("styleEditor.delete")}</button>
            <button type="button" class="style-secondary-button" onclick={() => confirmingDelete = false}>{t("styleEditor.keep")}</button>
          </div>
        {:else}
          <button type="button" class="style-delete-button" onclick={() => confirmingDelete = true}>{t("styleEditor.deleteStyle")}</button>
        {/if}
      {/if}
      <div class="style-editor-actions">
        <button type="button" class="style-secondary-button" onclick={reset}>{t("styleEditor.reset")}</button>
        <button type="button" class="style-secondary-button" onclick={onCancel}>{t("common.cancel")}</button>
        <button type="submit" class="style-primary-button" disabled={Boolean(nameError)}>
          {isNew ? t("styleEditor.create") : t("styleEditor.save")}
        </button>
      </div>
    </div>
  </form>
</dialog>

<style>
  .style-editor-dialog {
    width: min(600px, calc(100vw - 32px));
    max-height: min(780px, calc(100vh - 32px));
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-primary);
    box-shadow: var(--shadow-dialog);
  }
  .style-editor-dialog::backdrop { background: var(--backdrop); backdrop-filter: blur(2px); }
  .style-editor-dialog form { display: flex; max-height: inherit; flex-direction: column; margin: 0; }
  .style-editor-header { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px 15px; border-bottom: 1px solid var(--border-soft); }
  .style-editor-kicker { color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: 1.2px; }
  .style-editor-header h2 { margin: 6px 0 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 22px; font-weight: 500; letter-spacing: -.3px; }
  .style-editor-close { width: 27px; height: 27px; flex: 0 0 auto; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 19px; line-height: 1; }
  .style-editor-close:hover { background: var(--control-hover); color: var(--text-heading); }
  .style-editor-body { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; gap: 0; padding: 0 20px; overflow-y: auto; }
  .style-editor-section { padding: 16px 0; border-bottom: 1px solid var(--border-soft); }
  .style-editor-section:last-child { border-bottom: 0; }
  .style-editor-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
  .style-editor-heading strong { color: var(--text-heading); font-size: 10px; font-weight: 650; letter-spacing: .55px; text-transform: uppercase; }
  .style-editor-heading span { color: var(--text-muted); font-size: 8px; line-height: 1.4; text-align: right; }
  .style-field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
  .style-field { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
  .style-field + .style-field { margin-top: 0; }
  .style-field > span { color: var(--text-secondary); font-size: 9px; }
  .style-field input, .style-field select { width: 100%; height: 30px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 5px; outline: none; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 10px; }
  .style-field input:focus, .style-field select:focus { border-color: var(--accent); }
  .style-check { display: flex; align-items: center; gap: 7px; margin-top: 10px; color: var(--text-nav); cursor: pointer; font-size: 10px; }
  .style-check input { width: 13px; height: 13px; margin: 0; accent-color: var(--accent-strong); }
  .style-editor-error { margin: 7px 0 0; color: var(--danger); font-size: 9px; }
  .style-editor-footer { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 20px; border-top: 1px solid var(--border-soft); background: var(--surface); }
  .style-editor-actions { display: flex; align-items: center; gap: 7px; margin-left: auto; }
  .style-secondary-button, .style-primary-button, .style-delete-button, .style-danger-button { height: 30px; padding: 0 12px; border-radius: 5px; cursor: pointer; font-family: inherit; font-size: 10px; font-weight: 550; }
  .style-secondary-button { border: 1px solid var(--border-control); background: var(--control-bg); color: var(--text-primary); }
  .style-secondary-button:hover { border-color: var(--accent-soft); background: var(--control-hover); }
  .style-primary-button { border: 1px solid transparent; background: var(--accent-strong); color: var(--accent-contrast); }
  .style-primary-button:hover:not(:disabled) { background: var(--accent-strong-hover); }
  .style-primary-button:disabled { cursor: default; opacity: .45; }
  .style-delete-button { padding: 0; border: 0; background: transparent; color: var(--text-muted); }
  .style-delete-button:hover { color: var(--danger); }
  .style-danger-button { border: 1px solid transparent; background: var(--danger); color: #fff; }
  .style-editor-confirm { display: flex; align-items: center; gap: 7px; color: var(--text-muted); font-size: 9px; }
  @media (max-width: 520px) {
    .style-editor-heading { align-items: flex-start; flex-direction: column; gap: 3px; }
    .style-editor-heading span { text-align: left; }
    .style-field-grid { grid-template-columns: 1fr; }
    .style-editor-footer { align-items: flex-start; flex-direction: column; }
    .style-editor-actions { width: 100%; justify-content: flex-end; }
  }
</style>
