<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Search, X } from "@lucide/svelte";
  import { MAX_SEARCH_HITS, searchDocuments, type SearchChapter, type SearchHit } from "$lib/search";
  import type { DocumentData } from "$lib/publish/types";

  type Props = {
    documents: DocumentData[];
    chapters: SearchChapter[];
    onOpen: (documentId: string) => void;
    onClose: () => void;
  };

  let { documents, chapters, onOpen, onClose }: Props = $props();

  const DEBOUNCE_MS = 150;

  let dialog = $state<HTMLDialogElement>();
  let searchInput = $state<HTMLInputElement>();
  let resultList = $state<HTMLUListElement>();
  let query = $state("");
  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let debouncedQuery = $state("");
  let selectedIndex = $state(0);

  let results = $derived(searchDocuments(documents, chapters, debouncedQuery, { caseSensitive, wholeWord }));
  let totalMatches = $derived(results.reduce((total, hit) => total + hit.matches, 0));
  // Results shrink while typing, so the visible selection is clamped to the list.
  let activeIndex = $derived(Math.min(selectedIndex, Math.max(0, results.length - 1)));

  onMount(() => {
    if (dialog && !dialog.open) dialog.showModal();
    searchInput?.focus();
  });

  // Only the typed query is debounced; the checkboxes apply right away.
  $effect(() => {
    const text = query;
    const timer = setTimeout(() => {
      debouncedQuery = text;
      selectedIndex = 0;
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  function moveSelection(delta: number) {
    if (results.length === 0) return;
    selectedIndex = Math.min(results.length - 1, Math.max(0, activeIndex + delta));
    void scrollSelectionIntoView();
  }

  async function scrollSelectionIntoView() {
    await tick();
    resultList?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function openSelection() {
    const hit: SearchHit | undefined = results[activeIndex];
    if (hit) onOpen(hit.documentId);
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    // Result buttons already open on Enter; only the input needs the shortcut.
    if (event.key === "Enter" && event.target === searchInput) {
      event.preventDefault();
      openSelection();
    }
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === dialog) onClose();
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    onClose();
  }
</script>

<dialog
  class="search-dialog"
  bind:this={dialog}
  aria-labelledby="project-search-title"
  onclick={handleBackdrop}
  oncancel={handleCancel}
  onkeydown={handleDialogKeydown}
>
  <div class="settings-header">
    <div><span class="settings-kicker">PROJECT</span><h2 id="project-search-title">Search</h2></div>
    <button class="close-settings" aria-label="Close search" type="button" onclick={onClose}><X size={15} aria-hidden="true" /></button>
  </div>
  <div class="settings-body">
    <section class="preference-section">
      <label class="preference-label" for="project-search-query">Find in scenes and wiki pages</label>
      <input
        bind:this={searchInput}
        id="project-search-query"
        class="preference-select"
        type="text"
        placeholder="Search titles and text"
        spellcheck="false"
        autocomplete="off"
        bind:value={query}
      />
      <div class="search-options">
        <label class="preference-toggle"><input type="checkbox" bind:checked={caseSensitive} /> Case sensitive</label>
        <label class="preference-toggle"><input type="checkbox" bind:checked={wholeWord} /> Whole word</label>
      </div>
    </section>
    <section class="search-results-section">
      {#if !debouncedQuery.trim()}
        <p class="search-hint">Type to search scene text, wiki pages, and titles.</p>
      {:else if results.length === 0}
        <p class="search-hint">No matches for “{debouncedQuery.trim()}”.</p>
      {:else}
        <ul class="search-results" bind:this={resultList} aria-label="Search results">
          {#each results as hit, index (hit.documentId)}
            <li data-index={index}>
              <button
                type="button"
                class="search-hit"
                class:active={index === activeIndex}
                aria-current={index === activeIndex ? "true" : undefined}
                onclick={() => onOpen(hit.documentId)}
                onpointerenter={() => (selectedIndex = index)}
              >
                <span class="search-hit-header">
                  <span class="search-hit-title">{hit.title || "Untitled"}</span>
                  <span class="search-kind-badge" class:wiki={hit.kind === "wiki"}>{hit.kind === "scene" ? "Scene" : "Wiki"}</span>
                  {#if hit.chapterTitle}<span class="search-hit-chapter">{hit.chapterTitle}</span>{/if}
                  <span class="search-hit-count" title={`${hit.matches} ${hit.matches === 1 ? "match" : "matches"}`}>{hit.matches}</span>
                </span>
                <span class="search-hit-snippet">{hit.snippet.slice(0, hit.matchStart)}<mark>{hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength)}</mark>{hit.snippet.slice(hit.matchStart + hit.matchLength)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
  <div class="settings-footer">
    <span role="status">{totalMatches} {totalMatches === 1 ? "hit" : "hits"} in {results.length} {results.length === 1 ? "document" : "documents"}{results.length >= MAX_SEARCH_HITS ? ` (first ${MAX_SEARCH_HITS} documents)` : ""}</span>
    <button class="done-button" type="button" onclick={onClose}>Close</button>
  </div>
</dialog>

<style>
  .search-dialog { width: min(560px, calc(100vw - 32px)); max-height: min(680px, calc(100vh - 32px)); padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-primary); box-shadow: var(--shadow-dialog); }
  .search-dialog[open] { display: flex; flex-direction: column; }
  .search-dialog::backdrop { background: var(--backdrop); backdrop-filter: blur(2px); }
  .settings-header { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 23px 25px 18px; border-bottom: 1px solid var(--border-soft); }
  .settings-kicker { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
  .settings-header h2 { margin: 7px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 25px; font-weight: 500; }
  .close-settings { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 20px; }
  .close-settings:hover { background: var(--hover-bg); color: var(--text-primary); }
  .settings-body { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; padding: 7px 25px 10px; }
  .preference-section { padding: 17px 0; border-bottom: 1px solid var(--border-soft); }
  .preference-label { display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 10px; }
  .preference-select { width: 100%; height: 35px; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 11px; }
  .preference-select:focus-visible { border-color: var(--accent); outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .search-options { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 11px; }
  .preference-toggle { display: flex; align-items: center; gap: 7px; color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .preference-toggle input { width: 13px; height: 13px; margin: 0; accent-color: var(--accent-strong); }
  .search-results-section { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; padding: 12px 0 14px; border-bottom: 0; }
  .search-results { display: flex; max-height: 44vh; flex-direction: column; gap: 3px; margin: 0; padding: 0; overflow-y: auto; list-style: none; scrollbar-color: var(--scrollbar) transparent; }
  .search-hit { display: block; width: 100%; padding: 8px 9px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-family: inherit; text-align: left; }
  .search-hit:hover { background: var(--control-hover); }
  .search-hit.active { border-color: var(--border-control); background: var(--selected-bg); }
  .search-hit-header { display: flex; align-items: center; gap: 7px; }
  .search-hit-title { overflow: hidden; color: var(--text-heading); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .search-kind-badge { flex: 0 0 auto; padding: 1px 5px; border: 1px solid var(--border-control); border-radius: 999px; color: var(--text-muted); font-size: 8px; font-weight: 650; letter-spacing: .5px; text-transform: uppercase; }
  .search-kind-badge.wiki { border-color: var(--accent-soft); color: var(--link); }
  .search-hit-chapter { overflow: hidden; color: var(--text-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .search-hit-count { flex: 0 0 auto; margin-left: auto; color: var(--text-faint); font-size: 9px; }
  .search-hit-snippet { display: block; margin-top: 4px; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .search-hit-snippet mark { padding: 0 1px; border-radius: 2px; background: var(--accent-soft); color: var(--text-heading); }
  .search-hint { margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .settings-footer { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 25px; border-top: 1px solid var(--border-soft); color: var(--text-muted); font-size: 9px; }
  .done-button { height: 30px; padding: 0 14px; border: 1px solid transparent; border-radius: 5px; background: var(--accent-strong); color: var(--accent-contrast); cursor: pointer; font-size: 10px; }
  .done-button:hover { background: var(--accent-strong-hover); }
</style>
