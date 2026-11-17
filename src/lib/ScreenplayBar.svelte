<script lang="ts">
  import {
    EDITOR_ELEMENT_TYPES,
    type EditorElementType
  } from "./screenplay/editor-keys";

  let {
    type,
    pages,
    runtimeMinutes,
    onchange
  }: {
    type: EditorElementType;
    pages: number;
    runtimeMinutes: number;
    onchange: (type: EditorElementType) => void;
  } = $props();

  const ELEMENT_LABELS: Record<EditorElementType, string> = {
    "scene-heading": "Scene heading",
    action: "Action",
    character: "Character",
    dialogue: "Dialogue",
    parenthetical: "Parenthetical",
    transition: "Transition"
  };

  function handleChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    onchange(select.value as EditorElementType);
  }
</script>

<div class="screenplay-bar">
  <select
    class="screenplay-type"
    aria-label="Element type"
    value={type}
    onchange={handleChange}
  >
    {#each EDITOR_ELEMENT_TYPES as option (option)}
      <option value={option}>{ELEMENT_LABELS[option]}</option>
    {/each}
  </select>
  <span class="screenplay-meta">
    {pages} {pages === 1 ? "page" : "pages"} · ~{runtimeMinutes} min
  </span>
</div>

<style>
  .screenplay-bar {
    display: flex;
    min-height: 30px;
    align-items: center;
    gap: 8px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-soft);
  }

  .screenplay-type {
    height: 24px;
    padding: 0 4px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 10px;
    cursor: pointer;
  }

  .screenplay-meta {
    margin-left: auto;
    color: var(--text-faint);
    font-family: ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: .3px;
    white-space: nowrap;
  }
</style>
