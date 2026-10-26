<script lang="ts">
  import type {
    EditorFontOption,
    EditorFontSelection,
    SystemFontFamily
  } from "$lib/editor-fonts";

  let {
    id,
    builtinOptions,
    builtinValue,
    systemValue,
    families,
    loading,
    error,
    supported,
    monospaceOnly = false,
    onselect
  }: {
    id: string;
    builtinOptions: ReadonlyArray<EditorFontOption<string>>;
    builtinValue: string;
    systemValue: string;
    families: SystemFontFamily[];
    loading: boolean;
    error: string;
    supported: boolean;
    monospaceOnly?: boolean;
    onselect: (selection: EditorFontSelection) => void;
  } = $props();

  let showAll = $state(false);

  const selectedFamily = $derived(systemValue.trim());
  const selectedValue = $derived(
    selectedFamily ? `system:${selectedFamily}` : `builtin:${builtinValue}`
  );
  const installedReady = $derived(supported && !loading && !error);
  const visibleFamilies = $derived(
    families.filter((font) => !monospaceOnly || showAll || font.monospaced)
  );
  const currentFamilyVisible = $derived(
    visibleFamilies.some((font) => font.family === selectedFamily)
  );

  function selectValue(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value.startsWith("system:")) {
      onselect({ source: "system", family: value.slice("system:".length) });
      return;
    }
    if (value.startsWith("builtin:")) {
      onselect({ source: "builtin", id: value.slice("builtin:".length) });
    }
  }
</script>

<div class="font-picker">
  {#if installedReady && monospaceOnly}
    <label class="font-picker-toggle">
      <input type="checkbox" bind:checked={showAll} />
      Show all fonts
    </label>
  {/if}

  <select {id} class="font-select" value={selectedValue} onchange={selectValue}>
    <optgroup label="ProseCraft fonts">
      {#each builtinOptions as option (option.id)}
        <option value={`builtin:${option.id}`}>{option.label}</option>
      {/each}
    </optgroup>
    <optgroup label="Installed fonts">
      {#if selectedFamily && !(installedReady && currentFamilyVisible)}
        <option value={`system:${selectedFamily}`}>{selectedFamily} (current)</option>
      {/if}
      {#if !supported}
        <option disabled>Available in the desktop app</option>
      {:else if loading}
        <option disabled>Loading installed fonts…</option>
      {:else if error}
        <option disabled>Installed fonts unavailable</option>
      {:else}
        {#each visibleFamilies as font (font.family)}
          <option value={`system:${font.family}`}>{font.family}</option>
        {/each}
      {/if}
    </optgroup>
  </select>

  {#if !supported}
    <p class="font-picker-note">Installed font selection is available in the desktop app.</p>
  {:else if loading}
    <p class="font-picker-note">Loading installed fonts…</p>
  {:else if error}
    <p class="font-picker-error">{error}</p>
  {:else if visibleFamilies.length === 0 && !selectedFamily}
    <p class="font-picker-note">
      {monospaceOnly && !showAll
        ? "No monospaced fonts match. Show all fonts to see other families."
        : "No installed fonts match."}
    </p>
  {/if}
</div>

<style>
  .font-picker { display: grid; gap: 7px; }
  .font-select {
    width: 100%;
    height: 35px;
    padding: 0 9px;
    border: 1px solid var(--border-control);
    border-radius: 6px;
    background: var(--control-bg);
    color: var(--text-primary);
    font-size: 11px;
  }
  .font-select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .font-picker-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 10px;
  }
  .font-picker-toggle input { accent-color: var(--accent-strong); }
  .font-picker-note {
    margin: 0;
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.5;
  }
  .font-picker-error {
    margin: 0;
    color: var(--danger);
    font-size: 10px;
    line-height: 1.5;
  }
</style>
