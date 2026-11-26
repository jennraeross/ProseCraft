<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Check, Plus, Search, Trash2, X } from "@lucide/svelte";
  import type { CiteLocatorLabel, CiteRefItem } from "./citations/cite-marker";
  import type { CslItem } from "./citations/csl";
  import { formatCitation, type CitationItemInput } from "./citations/format";
  import {
    formatItemContributors,
    itemYearText,
    matchesLibraryQuery,
    sourceTypeKey,
    sourceTypeLabel
  } from "./citations/library";
  import type { CitationLocale, CitationStyleId } from "./citations/styles";
  import { t } from "$lib/i18n/state.svelte";

  type Props = {
    items: CslItem[];
    citationStyle?: CitationStyleId;
    citationLocale?: CitationLocale;
    initialCites?: readonly CiteRefItem[];
    isEditing?: boolean;
    left: number;
    top: number;
    onCommit: (cites: CiteRefItem[]) => void;
    onRemove?: () => void;
    onClose: () => void;
    onOpenLibrary?: () => void;
  };

  let {
    items,
    citationStyle = "apa7",
    citationLocale = "en",
    initialCites = [],
    isEditing = false,
    left,
    top,
    onCommit,
    onRemove,
    onClose,
    onOpenLibrary
  }: Props = $props();

  let searchInput = $state<HTMLInputElement>();
  let searchQuery = $state("");
  let selected = $state<CiteRefItem[]>([]);
  let activeIndex = $state(0);

  $effect.pre(() => {
    const seed = initialCites.map((entry) => ({
      id: entry.id,
      locator: entry.locator ?? "",
      label: entry.label ?? "page",
      prefix: entry.prefix ?? "",
      suffix: entry.suffix ?? "",
      suppressAuthor: Boolean(entry.suppressAuthor)
    }));
    selected = seed;
    activeIndex = 0;
  });

  onMount(() => {
    void tick().then(() => searchInput?.focus());
  });

  let lookupByKey = $derived.by(() => {
    const map = new Map<string, CslItem>();
    for (const item of items) {
      if (!map.has(item.id)) map.set(item.id, item);
      if (item.citeKey && !map.has(item.citeKey)) map.set(item.citeKey, item);
    }
    return map;
  });

  let filteredLibrary = $derived(items.filter((item) => matchesLibraryQuery(item, searchQuery)));

  let activeCite = $derived(selected[activeIndex] ?? null);

  function typeLabel(type: string): string {
    const key = sourceTypeKey(type);
    return key ? t(key) : sourceTypeLabel(type);
  }

  function cleanCiteEntry(entry: CiteRefItem): CiteRefItem {
    const locator = entry.locator?.trim() ?? "";
    const prefix = entry.prefix?.replace(/^\s+/, "") ?? "";
    const suffix = entry.suffix?.trim() ?? "";
    const next: CiteRefItem = { id: entry.id };
    if (locator) {
      next.locator = locator;
      next.label = entry.label ?? "page";
    }
    if (prefix.trim()) next.prefix = prefix;
    if (suffix) next.suffix = suffix;
    if (entry.suppressAuthor) next.suppressAuthor = true;
    return next;
  }

  let preview = $derived.by(() => {
    if (selected.length === 0) return null;
    const inputs: CitationItemInput[] = [];
    const missing: string[] = [];

    for (const raw of selected) {
      const clean = cleanCiteEntry(raw);
      const item = lookupByKey.get(clean.id);
      if (!item) {
        missing.push(`@${clean.id}`);
        continue;
      }
      inputs.push({
        item,
        ...(clean.locator ? { locator: clean.locator } : {}),
        ...(clean.label ? { label: clean.label } : {}),
        ...(clean.prefix ? { prefix: clean.prefix } : {}),
        ...(clean.suffix ? { suffix: clean.suffix } : {}),
        ...(clean.suppressAuthor ? { suppressAuthor: true } : {})
      });
    }

    if (inputs.length === 0) {
      return { text: `[${missing.join("; ")}]`, html: "" };
    }
    const formatted = formatCitation(citationStyle, inputs, {
      locale: citationLocale,
      library: items,
      index: 1
    });
    if (missing.length > 0) {
      return {
        text: `${formatted.text} [${missing.join("; ")}]`,
        html: `${formatted.html} [${missing.join("; ")}]`
      };
    }
    return formatted;
  });

  function isSourceSelected(item: CslItem): boolean {
    return selected.some((entry) => entry.id === item.id || (item.citeKey && entry.id === item.citeKey));
  }

  function addSource(item: CslItem) {
    const existingIdx = selected.findIndex(
      (entry) => entry.id === item.id || (item.citeKey && entry.id === item.citeKey)
    );
    if (existingIdx >= 0) {
      activeIndex = existingIdx;
      return;
    }
    selected = [
      ...selected,
      {
        id: item.id,
        locator: "",
        label: "page",
        prefix: "",
        suffix: "",
        suppressAuthor: false
      }
    ];
    activeIndex = selected.length - 1;
  }

  function removeSelectedAt(idx: number) {
    selected = selected.filter((_, i) => i !== idx);
    if (activeIndex >= selected.length) {
      activeIndex = Math.max(0, selected.length - 1);
    }
  }

  function updateActive(patch: Partial<CiteRefItem>) {
    selected = selected.map((entry, idx) => (idx === activeIndex ? { ...entry, ...patch } : entry));
  }

  function labelForChip(entry: CiteRefItem): string {
    const item = lookupByKey.get(entry.id);
    if (!item) return `@${entry.id}`;
    const firstAuthor = item.author?.[0] ?? item.editor?.[0];
    const lead = firstAuthor?.family ?? firstAuthor?.literal ?? item.title ?? item.id;
    const year = itemYearText(item);
    return year ? `${lead} (${year})` : lead;
  }

  function commit() {
    if (selected.length === 0) return;
    onCommit(selected.map(cleanCiteEntry));
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commit();
    }
  }
</script>

<div
  class="citation-picker"
  data-testid="citation-picker"
  role="dialog"
  tabindex="-1"
  aria-label={isEditing ? t("citation.edit") : t("citation.insert")}
  style={`left: ${left}px; top: ${top}px`}
  onpointerdown={(event) => event.stopPropagation()}
  onkeydown={handleKeydown}
>
  <div class="picker-head">
    <span class="picker-title">{isEditing ? t("citation.edit") : t("citation.insert")}</span>
    {#if onOpenLibrary}
      <button type="button" class="picker-sources-link" onclick={onOpenLibrary}>{t("toolbar.sources")}</button>
    {/if}
    <button
      type="button"
      class="picker-close"
      aria-label={t("citation.closePicker")}
      title={t("common.close")}
      onclick={onClose}
    ><X size={14} aria-hidden="true" /></button>
  </div>

  <div class="picker-search-wrap">
    <Search size={13} aria-hidden="true" />
    <input
      bind:this={searchInput}
      type="search"
      class="picker-search"
      placeholder={t("citation.searchSources")}
      aria-label={t("citation.searchAria")}
      bind:value={searchQuery}
    />
  </div>

  <div class="picker-library-list" role="listbox" aria-label={t("citation.available")}>
    {#if items.length === 0}
      <div class="picker-empty">
        <p>{t("citation.noSources")}</p>
        {#if onOpenLibrary}
          <button type="button" class="picker-btn" onclick={onOpenLibrary}>{t("citation.openSources")}</button>
        {/if}
      </div>
    {:else if filteredLibrary.length === 0}
      <p class="picker-empty-text">{t("citation.noMatches", { query: searchQuery })}</p>
    {:else}
      {#each filteredLibrary as item (item.id)}
        {@const chosen = isSourceSelected(item)}
        <button
          type="button"
          class="picker-source-row"
          class:chosen
          onclick={() => addSource(item)}
        >
          <span class="picker-source-info">
            <strong>{item.title || t("citation.untitledItem")}</strong>
            <small>
              {formatItemContributors(item) || t("citation.unknownAuthor")}
              · {itemYearText(item) || t("citation.noDate")}
              · {typeLabel(item.type)}
            </small>
          </span>
          <span class="picker-source-icon" aria-hidden="true">
            {#if chosen}<Check size={13} />{:else}<Plus size={13} />{/if}
          </span>
        </button>
      {/each}
    {/if}
  </div>

  {#if selected.length > 0}
    <div class="picker-selected-bar" aria-label={t("citation.selected")}>
      {#each selected as entry, idx (entry.id + ":" + idx)}
        <div class="picker-chip" class:active={idx === activeIndex}>
          <button
            type="button"
            class="picker-chip-select"
            onclick={() => (activeIndex = idx)}
          >{labelForChip(entry)}</button>
          <button
            type="button"
            class="picker-chip-remove"
            aria-label={t("citation.removeSource", { label: labelForChip(entry) })}
            onclick={() => removeSelectedAt(idx)}
          ><X size={11} aria-hidden="true" /></button>
        </div>
      {/each}
    </div>

    {#if activeCite}
      <div class="picker-fields">
        <label class="picker-field">
          <span>{t("citation.locatorType")}</span>
          <select
            value={activeCite.label ?? "page"}
            onchange={(event) => updateActive({ label: (event.currentTarget as HTMLSelectElement).value as CiteLocatorLabel })}
          >
            <option value="page">{t("citation.locator.page")}</option>
            <option value="chapter">{t("citation.locator.chapter")}</option>
            <option value="section">{t("citation.locator.section")}</option>
          </select>
        </label>
        <label class="picker-field">
          <span>{t("citation.locator")}</span>
          <input
            type="text"
            placeholder="42 or 42-44"
            value={activeCite.locator ?? ""}
            oninput={(event) => updateActive({ locator: (event.currentTarget as HTMLInputElement).value })}
          />
        </label>
        <label class="picker-field">
          <span>{t("citation.prefix")}</span>
          <input
            type="text"
            placeholder={t("citation.prefixPlaceholder")}
            value={activeCite.prefix ?? ""}
            oninput={(event) => updateActive({ prefix: (event.currentTarget as HTMLInputElement).value })}
          />
        </label>
        <label class="picker-field">
          <span>{t("citation.suffix")}</span>
          <input
            type="text"
            placeholder={t("citation.suffixPlaceholder")}
            value={activeCite.suffix ?? ""}
            oninput={(event) => updateActive({ suffix: (event.currentTarget as HTMLInputElement).value })}
          />
        </label>
        <label class="picker-check">
          <input
            type="checkbox"
            checked={Boolean(activeCite.suppressAuthor)}
            onchange={(event) => updateActive({ suppressAuthor: (event.currentTarget as HTMLInputElement).checked })}
          />
          <span>{t("citation.suppressAuthor")}</span>
        </label>
      </div>
    {/if}

    {#if preview}
      <div class="picker-preview" aria-label={t("citation.previewAria")}>
        <span class="picker-preview-label">{t("citation.preview")}</span>
        <span class="picker-preview-value">
          {#if preview.html}
            {@html preview.html}
          {:else}
            {preview.text}
          {/if}
        </span>
      </div>
    {/if}
  {/if}

  <div class="picker-foot">
    {#if isEditing && onRemove}
      <button type="button" class="picker-remove" onclick={onRemove}>
        <Trash2 size={13} aria-hidden="true" /> {t("common.remove")}
      </button>
    {:else}
      <span></span>
    {/if}
    <div class="picker-foot-actions">
      <button type="button" class="picker-btn" onclick={onClose}>{t("common.cancel")}</button>
      <button
        type="button"
        class="picker-insert"
        disabled={selected.length === 0}
        onclick={commit}
      >{isEditing ? t("citation.update") : t("citation.commit")}</button>
    </div>
  </div>
</div>

<style>
  .citation-picker {
    position: fixed;
    z-index: 24;
    width: min(370px, calc(100vw - 16px));
    max-height: min(520px, calc(100vh - 16px));
    padding: 10px 11px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-panel);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }
  .picker-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .picker-title {
    margin-right: auto;
    color: var(--text-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .picker-sources-link {
    padding: 2px 7px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--control-bg);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 10px;
  }
  .picker-sources-link:hover {
    border-color: var(--accent);
    color: var(--text-heading);
  }
  .picker-close {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .picker-close:hover {
    background: var(--hover-bg);
    color: var(--text-heading);
  }
  .picker-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .picker-search-wrap :global(svg) {
    position: absolute;
    left: 8px;
    color: var(--text-muted);
    pointer-events: none;
  }
  .picker-search {
    width: 100%;
    height: 28px;
    padding: 0 8px 0 26px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--control-bg);
    color: var(--text-primary);
    font-size: 11px;
    box-sizing: border-box;
  }
  .picker-library-list {
    max-height: 145px;
    overflow-y: auto;
    border: 1px solid var(--border-soft);
    border-radius: 6px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
  }
  .picker-source-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border: 0;
    border-bottom: 1px solid var(--border-soft);
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .picker-source-row:last-child {
    border-bottom: 0;
  }
  .picker-source-row:hover {
    background: var(--hover-bg);
  }
  .picker-source-row.chosen {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .picker-source-info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .picker-source-info strong {
    font-size: 11px;
    color: var(--text-heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .picker-source-info small {
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .picker-source-icon {
    color: var(--accent-strong);
    flex: 0 0 auto;
  }
  .picker-empty,
  .picker-empty-text {
    margin: 0;
    padding: 10px;
    text-align: center;
    font-size: 11px;
    color: var(--text-muted);
  }
  .picker-empty p {
    margin: 0 0 6px;
  }
  .picker-selected-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .picker-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--control-bg);
    font-size: 10px;
  }
  .picker-chip.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 13%, transparent);
  }
  .picker-chip-select,
  .picker-chip-remove {
    border: 0;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 10px;
  }
  .picker-chip-select {
    padding: 3px 6px;
  }
  .picker-chip-remove {
    display: grid;
    place-items: center;
    padding: 3px 5px 3px 2px;
    color: var(--text-muted);
  }
  .picker-chip-remove:hover {
    color: var(--danger);
  }
  .picker-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 8px;
  }
  .picker-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  .picker-field input,
  .picker-field select {
    height: 26px;
    padding: 0 7px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--control-bg);
    color: var(--text-primary);
    font-size: 11px;
    box-sizing: border-box;
  }
  .picker-check {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .picker-check input {
    accent-color: var(--accent-strong);
  }
  .picker-preview {
    padding: 6px 8px;
    border: 1px solid var(--border-soft);
    border-radius: 6px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .picker-preview-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .picker-preview-value {
    font-size: 12px;
    color: var(--text-heading);
    line-height: 1.4;
  }
  .picker-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-top: 2px;
  }
  .picker-foot-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .picker-remove,
  .picker-btn,
  .picker-insert {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 27px;
    padding: 0 10px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }
  .picker-remove {
    border: 0;
    background: transparent;
    color: var(--danger);
  }
  .picker-remove:hover {
    background: var(--hover-bg);
  }
  .picker-btn {
    border: 1px solid var(--border-control);
    background: var(--control-bg);
    color: var(--text-primary);
  }
  .picker-btn:hover {
    border-color: var(--accent);
  }
  .picker-insert {
    border: 0;
    background: var(--accent);
    color: var(--accent-contrast, #fff);
  }
  .picker-insert:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (max-width: 760px), (pointer: coarse) and (max-height: 520px) {
    .citation-picker {
      left: 0 !important;
      right: 0;
      top: auto !important;
      bottom: 0;
      width: 100%;
      max-height: 80dvh;
      border-radius: 14px 14px 0 0;
      padding: 12px 14px calc(14px + env(safe-area-inset-bottom));
    }
    .picker-search,
    .picker-field input,
    .picker-field select {
      font-size: 16px;
    }
  }
</style>
