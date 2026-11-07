<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Search, X } from "@lucide/svelte";
  import { replaceInDocuments, type ReplaceResult } from "$lib/replace";
  import { MAX_SEARCH_HITS, searchDocuments, type SearchChapter, type SearchHit } from "$lib/search";
  import type { DocumentData } from "$lib/publish/types";

  type Props = {
    documents: DocumentData[];
    chapters: SearchChapter[];
    onOpen: (documentId: string) => void;
    onClose: () => void;
    /** Flushes pending editor edits into the documents and returns the current list. */
    onFlush: () => DocumentData[];
    /** Saves a snapshot of a document before its text is replaced. */
    onSnapshot: (document: DocumentData) => void;
    onReplace: (documents: DocumentData[], changed: ReplaceResult["changed"]) => void;
  };

  let { documents, chapters, onOpen, onClose, onFlush, onSnapshot, onReplace }: Props = $props();

  const DEBOUNCE_MS = 150;

  type PendingReplace = {
    /** Documents the confirmed replacement is applied to. */
    source: DocumentData[];
    result: ReplaceResult;
  };

  let dialog = $state<HTMLDialogElement>();
  let searchInput = $state<HTMLInputElement>();
  let replaceInput = $state<HTMLInputElement>();
  let resultList = $state<HTMLUListElement>();
  let query = $state("");
  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let debouncedQuery = $state("");
  let selectedIndex = $state(0);
  let replaceOpen = $state(false);
  let replacement = $state("");
  let replaceDocuments = $state<DocumentData[] | null>(null);
  let excludedIds = $state<Set<string>>(new Set());
  let pendingReplace = $state<PendingReplace | null>(null);
  let replaceStatus = $state("");

  let results = $derived(searchDocuments(documents, chapters, debouncedQuery, { caseSensitive, wholeWord }));
  let totalMatches = $derived(results.reduce((total, hit) => total + hit.matches, 0));
  // Results shrink while typing, so the visible selection is clamped to the list.
  let activeIndex = $derived(Math.min(selectedIndex, Math.max(0, results.length - 1)));
  let selectedIds = $derived(new Set(results.filter((hit) => !excludedIds.has(hit.documentId)).map((hit) => hit.documentId)));
  let allHitsSelected = $derived(results.length > 0 && selectedIds.size === results.length);
  // A match that is split across inline formatting can be found by the search but
  // not replaced, so the replace counts come from a dry run over the selection.
  let replacePreview = $derived(
    replaceOpen && replaceDocuments && debouncedQuery.trim()
      ? replaceInDocuments(replaceDocuments, debouncedQuery, replacement, { caseSensitive, wholeWord }, selectedIds)
      : null
  );
  let selectedMatches = $derived(results.filter((hit) => selectedIds.has(hit.documentId)).reduce((total, hit) => total + hit.matches, 0));
  let skippedMatches = $derived(replacePreview ? Math.max(0, selectedMatches - replacePreview.total) : 0);

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
      pendingReplace = null;
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
    // Arrows in the replace field move its caret instead of the result selection.
    if (event.target === replaceInput && (event.key === "ArrowDown" || event.key === "ArrowUp")) return;
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

  function toggleReplace() {
    if (replaceOpen) {
      replaceOpen = false;
      pendingReplace = null;
      return;
    }
    // Counts are computed from the text that is about to be replaced.
    replaceDocuments = onFlush();
    replaceOpen = true;
    replaceStatus = "";
    void tick().then(() => replaceInput?.focus());
  }

  function toggleHit(documentId: string, checked: boolean) {
    const next = new Set(excludedIds);
    if (checked) next.delete(documentId);
    else next.add(documentId);
    excludedIds = next;
    pendingReplace = null;
  }

  function toggleAllHits() {
    excludedIds = allHitsSelected ? new Set(results.map((hit) => hit.documentId)) : new Set();
    pendingReplace = null;
  }

  function requestReplace(all: boolean) {
    const ids = all ? new Set(results.map((hit) => hit.documentId)) : selectedIds;
    const source = onFlush();
    const result = replaceInDocuments(source, debouncedQuery, replacement, { caseSensitive, wholeWord }, ids);
    pendingReplace = result.total > 0 ? { source, result } : null;
    replaceStatus = result.total > 0 ? "" : "Nothing to replace.";
  }

  function confirmReplace() {
    const pending = pendingReplace;
    if (!pending) return;
    // A snapshot first, so “Earlier versions” can undo the whole replacement.
    for (const change of pending.result.changed) {
      const document = pending.source.find((doc) => doc.id === change.id);
      if (document) onSnapshot(document);
    }
    onReplace(pending.result.documents, pending.result.changed);
    replaceDocuments = pending.result.documents;
    excludedIds = new Set();
    pendingReplace = null;
    const matches = pending.result.total;
    const changedDocuments = pending.result.changed.length;
    replaceStatus = `Replaced ${matches} ${matches === 1 ? "match" : "matches"} in ${changedDocuments} ${changedDocuments === 1 ? "document" : "documents"}`;
    selectedIndex = 0;
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
        oninput={() => { pendingReplace = null; replaceStatus = ""; }}
      />
      <div class="search-options">
        <label class="preference-toggle"><input type="checkbox" bind:checked={caseSensitive} /> Case sensitive</label>
        <label class="preference-toggle"><input type="checkbox" bind:checked={wholeWord} /> Whole word</label>
        <button
          type="button"
          class="replace-toggle"
          class:active={replaceOpen}
          aria-pressed={replaceOpen}
          aria-expanded={replaceOpen}
          aria-controls="project-replace-panel"
          onclick={toggleReplace}
        >Replace</button>
      </div>
      {#if replaceOpen}
        <div class="replace-panel" id="project-replace-panel">
          <label class="preference-label" for="project-replace-query">Replace with</label>
          <input
            bind:this={replaceInput}
            id="project-replace-query"
            class="preference-select"
            type="text"
            placeholder="Replacement text"
            spellcheck="false"
            autocomplete="off"
            bind:value={replacement}
            oninput={() => { pendingReplace = null; replaceStatus = ""; }}
          />
        </div>
      {/if}
    </section>
    <section class="search-results-section">
      {#if replaceOpen && debouncedQuery.trim()}
        <div class="replace-bar">
          <div class="replace-bar-row">
            <button type="button" class="replace-link" disabled={results.length === 0} onclick={toggleAllHits}>
              {allHitsSelected ? "Select none" : "Select all"}
            </button>
            <span class="replace-count">
              {replacePreview?.total ?? 0} {replacePreview?.total === 1 ? "match" : "matches"} in {replacePreview?.changed.length ?? 0} {replacePreview?.changed.length === 1 ? "document" : "documents"}
            </span>
          </div>
          {#if skippedMatches > 0}
            <p class="replace-note">{skippedMatches} {skippedMatches === 1 ? "match spans" : "matches span"} formatting and {skippedMatches === 1 ? "is" : "are"} skipped.</p>
          {/if}
          {#if pendingReplace}
            <div class="replace-confirm">
              <span>Replace {pendingReplace.result.total} {pendingReplace.result.total === 1 ? "match" : "matches"} in {pendingReplace.result.changed.length} {pendingReplace.result.changed.length === 1 ? "document" : "documents"}? A snapshot of each changed scene is saved first.</span>
              <div class="replace-actions">
                <button type="button" class="replace-button" onclick={confirmReplace}>Confirm</button>
                <button type="button" class="replace-button" onclick={() => (pendingReplace = null)}>Cancel</button>
              </div>
            </div>
          {:else}
            <div class="replace-actions">
              <button type="button" class="replace-button" disabled={(replacePreview?.total ?? 0) === 0} onclick={() => requestReplace(false)}>Replace selected</button>
              <button type="button" class="replace-button" disabled={results.length === 0} onclick={() => requestReplace(true)}>Replace all</button>
            </div>
          {/if}
          {#if replaceStatus}<p class="replace-status" role="status">{replaceStatus}</p>{/if}
        </div>
      {/if}
      {#if !debouncedQuery.trim()}
        <p class="search-hint">Type to search scene text, wiki pages, and titles.</p>
      {:else if results.length === 0}
        <p class="search-hint">No matches for “{debouncedQuery.trim()}”.</p>
      {:else}
        <ul class="search-results" bind:this={resultList} aria-label="Search results">
          {#each results as hit, index (hit.documentId)}
            <li data-index={index} class="search-hit-row">
              {#if replaceOpen}
                <input
                  class="search-hit-check"
                  type="checkbox"
                  aria-label={`Include ${hit.title || "Untitled"} in replace`}
                  checked={selectedIds.has(hit.documentId)}
                  onchange={(event) => toggleHit(hit.documentId, event.currentTarget.checked)}
                />
              {/if}
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
  .replace-toggle { height: 22px; margin-left: auto; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; }
  .replace-toggle:hover { background: var(--control-hover); color: var(--text-primary); }
  .replace-toggle.active { border-color: var(--accent); background: var(--selected-bg); color: var(--text-heading); }
  .replace-panel { margin-top: 12px; }
  .search-results-section { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; padding: 12px 0 14px; border-bottom: 0; }
  .replace-bar { display: flex; flex-direction: column; gap: 7px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border-soft); }
  .replace-bar-row { display: flex; align-items: center; gap: 12px; }
  .replace-link { padding: 0; border: 0; background: transparent; color: var(--link); cursor: pointer; font-family: inherit; font-size: 9px; }
  .replace-link:disabled { color: var(--text-faint); cursor: default; }
  .replace-count { color: var(--text-secondary); font-size: 9px; }
  .replace-note { margin: 0; color: var(--text-muted); font-size: 9px; line-height: 1.5; }
  .replace-actions { display: flex; flex-wrap: wrap; gap: 7px; }
  .replace-button { height: 26px; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; }
  .replace-button:hover:not(:disabled) { background: var(--control-hover); color: var(--text-primary); }
  .replace-button:disabled { color: var(--text-faint); cursor: default; }
  .replace-confirm { display: flex; flex-direction: column; gap: 8px; padding: 9px 10px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-secondary); font-size: 9px; line-height: 1.5; }
  .replace-status { margin: 0; color: var(--text-secondary); font-size: 9px; }
  .search-results { display: flex; max-height: 44vh; flex-direction: column; gap: 3px; margin: 0; padding: 0; overflow-y: auto; list-style: none; scrollbar-color: var(--scrollbar) transparent; }
  .search-hit-row { display: flex; align-items: flex-start; gap: 7px; }
  .search-hit-row .search-hit { min-width: 0; flex: 1 1 auto; }
  .search-hit-check { width: 13px; height: 13px; flex: 0 0 auto; margin: 9px 0 0; accent-color: var(--accent-strong); }
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
