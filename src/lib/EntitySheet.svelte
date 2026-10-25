<script lang="ts" module>
  import { SHEET_FIELD_LIMIT } from "$lib/publish/types";

  export type SheetField = {
    key: string;
    label: string;
    placeholder: string;
    multiline?: boolean;
  };

  export type SheetSection = {
    title: string;
    fields: SheetField[];
  };

  export const SHEET_MAX_LENGTH = SHEET_FIELD_LIMIT;
</script>

<script lang="ts">
  import { autoResize } from "$lib/auto-resize";

  type Props = {
    sections: SheetSection[];
    /** Current field values keyed by field id. */
    values: Record<string, string>;
    onchange: (key: string, value: string) => void;
    hint?: string;
  };

  let { sections, values, onchange, hint }: Props = $props();
</script>

<!--
  Shared structured form used by character and place documents. The owning
  document keeps the canonical values; this component only renders fields and
  reports edits, so it works for any sheet shape.
-->
<div class="entity-sheet">
  {#each sections as section (section.title)}
    <section class="entity-section" aria-label={section.title}>
      <h2 class="entity-section-title">{section.title}</h2>
      <div class="entity-grid">
        {#each section.fields as field (field.key)}
          <label class="entity-field" class:wide={field.multiline}>
            <span class="entity-label">{field.label}</span>
            {#if field.multiline}
              <textarea
                class="entity-input entity-textarea"
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                maxlength={SHEET_MAX_LENGTH}
                use:autoResize={values[field.key] ?? ""}
                oninput={(event) => onchange(field.key, (event.currentTarget as HTMLTextAreaElement).value)}
              ></textarea>
            {:else}
              <input
                class="entity-input"
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                maxlength={SHEET_MAX_LENGTH}
                oninput={(event) => onchange(field.key, (event.currentTarget as HTMLInputElement).value)}
              />
            {/if}
          </label>
        {/each}
      </div>
    </section>
  {/each}
  {#if hint}
    <p class="entity-hint">{hint}</p>
  {/if}
</div>

<style>
  .entity-sheet { display: flex; flex-direction: column; gap: 14px; margin: 4px 0 8px; }
  .entity-section { padding: 16px 18px 18px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .entity-section-title { margin: 0 0 13px; color: var(--text-heading); font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .entity-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px 14px; }
  .entity-field { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
  .entity-field.wide { grid-column: 1 / -1; }
  .entity-label { color: var(--text-muted); font-size: 9px; font-weight: 650; letter-spacing: .4px; text-transform: uppercase; }
  .entity-input { width: 100%; padding: 7px 9px; border: 1px solid var(--border-control); border-radius: 6px; outline: none; background: var(--surface-raised); color: var(--text-body); font-family: var(--editor-font); font-size: calc(13px * var(--editor-scale)); line-height: 1.5; }
  .entity-input::placeholder { color: var(--text-faint); }
  .entity-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
  .entity-textarea { min-height: 66px; resize: none; overflow-y: hidden; }
  .entity-hint { margin: 0 2px; color: var(--text-faint); font-size: 9px; }

  @media (max-width: 440px) {
    .entity-grid { grid-template-columns: minmax(0, 1fr); }
    .entity-section { padding: 14px 13px 15px; }
  }
</style>
