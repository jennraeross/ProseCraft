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
    replaceDocuments && debouncedQuery.trim()
      ? replaceInDocuments(replaceDocuments, debouncedQuery, replacement, { caseSensitive, wholeWord }, selectedIds)
      : null
  );
  let selectedMatches = $derived(results.filter((hit) => selectedIds.has(hit.documentId)).reduce((total, hit) => total + hit.matches, 0));
  let skippedMatches = $derived(replacePreview ? Math.max(0, selectedMatches - replacePreview.total) : 0);
  // Before the replace field is used the summary counts come from the search itself.
  let summaryMatches = $derived(replacePreview ? replacePreview.total : selectedMatches);
  let summaryDocuments = $derived(replacePreview ? replacePreview.changed.length : selectedIds.size);

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

  /** Counts are computed from the text that is about to be replaced. */
  function ensureReplaceSource() {
    if (!replaceDocuments) replaceDocuments = onFlush();
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
    <div><span class="settings-kicker">PROJECT</span><h2 id="project-search-title">Find and replace</h2></div>
    <button class="close-settings" aria-label="Close find and replace" type="button" onclick={onClose}><X size={15} aria-hidden="true" /></button>
  </div>
  <div class="settings-body">
    <div class="search-fields">
      <div class="search-field">
        <label class="search-field-label" for="project-search-query">Find</label>
        <div class="search-field-control">
          <input
            bind:this={searchInput}
            id="project-search-query"
            class="search-input search-find"
            type="text"
            placeholder="Search titles and text"
            spellcheck="false"
            autocomplete="off"
            bind:value={query}
            oninput={() => { pendingReplace = null; replaceStatus = ""; }}
          />
          <div class="search-modes" role="group" aria-label="Search options">
            <button type="button" class="search-mode" class:active={caseSensitive} aria-pressed={caseSensitive} aria-label="Match case" title="Match case" onclick={() => (caseSensitive = !caseSensitive)}>Aa</button>
            <button type="button" class="search-mode" class:active={wholeWord} aria-pressed={wholeWord} aria-label="Whole word" title="Whole word" onclick={() => (wholeWord = !wholeWord)}><span class="search-mode-word" aria-hidden="true">ab</span></button>
          </div>
        </div>
      </div>
      <div class="search-field">
        <label class="search-field-label" for="project-replace-query">Replace</label>
        <input
          bind:this={replaceInput}
          id="project-replace-query"
          class="search-input"
          type="text"
          placeholder="Replace with…"
          spellcheck="false"
          autocomplete="off"
          bind:value={replacement}
          oninput={() => { pendingReplace = null; replaceStatus = ""; }}
          onfocus={ensureReplaceSource}
        />
      </div>
    </div>
    {#if results.length > 0}
      <div class="search-summary">
        <span class="search-summary-count">{summaryMatches} {summaryMatches === 1 ? "match" : "matches"} in {summaryDocuments} {summaryDocuments === 1 ? "document" : "documents"}</span>
        <button type="button" class="search-select-link" onclick={toggleAllHits}>
          {allHitsSelected ? "Select none" : "Select all"}
        </button>
      </div>
      {#if skippedMatches > 0}
        <p class="search-skip-note">{skippedMatches} {skippedMatches === 1 ? "match spans" : "matches span"} formatting and {skippedMatches === 1 ? "is" : "are"} skipped.</p>
      {/if}
    {/if}
    <section class="search-results-section">
      {#if !debouncedQuery.trim()}
        <p class="search-hint">Type to search scene text, wiki pages, and titles.</p>
      {:else if results.length === 0}
        <p class="search-hint">No matches for “{debouncedQuery.trim()}”.</p>
      {:else}
        <ul class="search-results" bind:this={resultList} aria-label="Search results">
          {#each results as hit, index (hit.documentId)}
            <li data-index={index} class="search-hit-row" class:active={index === activeIndex}>
              <input
                class="search-hit-check"
                type="checkbox"
                aria-label={`Include ${hit.title || "Untitled"} in replace`}
                checked={selectedIds.has(hit.documentId)}
                onchange={(event) => toggleHit(hit.documentId, event.currentTarget.checked)}
              />
              <button
                type="button"
                class="search-hit"
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
    <span class="search-footer-status" role="status">
      {#if replaceStatus}
        {replaceStatus}
      {:else}
        {totalMatches} {totalMatches === 1 ? "hit" : "hits"} in {results.length} {results.length === 1 ? "document" : "documents"}{results.length >= MAX_SEARCH_HITS ? ` (first ${MAX_SEARCH_HITS} documents)` : ""}
      {/if}
    </span>
    {#if pendingReplace}
      <div class="search-confirm" role="group" aria-label="Confirm replace">
        <span>Replace {pendingReplace.result.total} {pendingReplace.result.total === 1 ? "match" : "matches"} in {pendingReplace.result.changed.length} {pendingReplace.result.changed.length === 1 ? "document" : "documents"}? A snapshot of each changed scene is saved first.</span>
        <button type="button" class="search-button" onclick={() => (pendingReplace = null)}>Cancel</button>
        <button type="button" class="search-button primary" onclick={confirmReplace}>Replace</button>
      </div>
    {:else}
      <div class="search-actions">
        <button type="button" class="search-button" disabled={summaryMatches === 0} onclick={() => requestReplace(false)}>Replace selected</button>
        <button type="button" class="search-button primary" disabled={results.length === 0} onclick={() => requestReplace(true)}>{replacement ? "Replace all" : "Delete matches"}</button>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .search-dialog { width: min(720px, calc(100vw - 32px)); max-height: min(80vh, calc(100vh - 32px)); padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-primary); box-shadow: var(--shadow-dialog); }
  .search-dialog[open] { display: flex; flex-direction: column; }
  .search-dialog::backdrop { background: var(--backdrop); backdrop-filter: blur(2px); }
  .settings-header { display: flex; flex: 0 0 auto; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 21px 25px 16px; border-bottom: 1px solid var(--border-soft); }
  .settings-kicker { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
  .settings-header h2 { margin: 6px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 23px; font-weight: 500; }
  .close-settings { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 20px; }
  .close-settings:hover { background: var(--hover-bg); color: var(--text-primary); }
  .close-settings:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .settings-body { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; padding: 0 25px; }
  .search-fields { display: grid; flex: 0 0 auto; gap: 7px; padding: 15px 0 0; }
  .search-field { display: grid; grid-template-columns: 52px minmax(0, 1fr); align-items: center; gap: 10px; }
  .search-field-label { color: var(--text-secondary); font-size: 10px; }
  .search-field-control { position: relative; min-width: 0; }
  .search-input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 11px; }
  .search-input::placeholder { color: var(--text-faint); }
  .search-input:focus-visible { border-color: var(--accent); outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .search-find { padding-right: 66px; }
  .search-modes { position: absolute; top: 50%; right: 4px; display: flex; gap: 2px; transform: translateY(-50%); }
  .search-mode { display: grid; width: 27px; height: 24px; place-items: center; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-family: inherit; font-size: 10px; font-weight: 650; letter-spacing: .2px; }
  .search-mode:hover { background: var(--control-hover); color: var(--text-primary); }
  .search-mode.active { border-color: var(--accent-soft); background: var(--selected-bg); color: var(--text-heading); }
  .search-mode:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .search-mode-word { text-decoration: underline; text-underline-offset: 2px; }
  .search-summary { display: flex; flex: 0 0 auto; align-items: baseline; gap: 12px; padding-top: 12px; }
  .search-summary-count { color: var(--text-secondary); font-size: 10px; }
  .search-select-link { margin-left: auto; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--link); cursor: pointer; font-family: inherit; font-size: 10px; }
  .search-select-link:hover { text-decoration: underline; }
  .search-select-link:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
  .search-skip-note { margin: 5px 0 0; color: var(--text-muted); font-size: 9px; line-height: 1.5; }
  .search-results-section { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; padding: 10px 0 14px; }
  .search-results { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 2px; margin: 0; padding: 0; overflow-y: auto; list-style: none; scrollbar-color: var(--scrollbar) transparent; }
  .search-hit-row { display: flex; align-items: flex-start; gap: 9px; padding: 0 9px 0 8px; border-radius: 7px; }
  .search-hit-row:hover { background: var(--control-hover); }
  .search-hit-row.active { background: var(--selected-bg); box-shadow: inset 2px 0 0 var(--accent); }
  .search-hit-check { display: grid; width: 14px; height: 14px; flex: 0 0 auto; margin: 10px 0 0; place-items: center; appearance: none; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); cursor: pointer; }
  .search-hit-check:hover { border-color: var(--accent); }
  .search-hit-check:checked { border-color: var(--accent-strong); background: var(--accent-strong); }
  .search-hit-check:checked::after { content: ""; width: 3px; height: 6px; margin-top: -1px; border: solid var(--accent-contrast); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
  .search-hit-check:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .search-hit { display: block; min-width: 0; flex: 1 1 auto; padding: 8px 0; border: 0; background: transparent; color: inherit; cursor: pointer; font-family: inherit; text-align: left; }
  .search-hit:focus-visible { border-radius: 5px; outline: 2px solid var(--accent-ring); outline-offset: -2px; }
  .search-hit-header { display: flex; align-items: center; gap: 7px; }
  .search-hit-title { overflow: hidden; color: var(--text-heading); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .search-kind-badge { flex: 0 0 auto; padding: 1px 5px; border: 1px solid var(--border-control); border-radius: 999px; color: var(--text-muted); font-size: 8px; font-weight: 650; letter-spacing: .5px; text-transform: uppercase; }
  .search-kind-badge.wiki { border-color: var(--accent-soft); color: var(--link); }
  .search-hit-chapter { overflow: hidden; color: var(--text-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .search-hit-count { flex: 0 0 auto; margin-left: auto; color: var(--text-faint); font-size: 9px; }
  .search-hit-snippet { display: block; margin-top: 4px; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .search-hit-snippet mark { padding: 0 1px; border-radius: 2px; background: var(--accent-soft); color: var(--text-heading); }
  .search-hint { margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .settings-footer { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 11px 25px; border-top: 1px solid var(--border-soft); color: var(--text-muted); font-size: 9px; }
  .search-footer-status { min-width: 0; flex: 0 1 auto; line-height: 1.5; }
  .search-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; margin-left: auto; }
  .search-button { height: 30px; padding: 0 13px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-family: inherit; font-size: 10px; }
  .search-button:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); }
  .search-button:disabled { color: var(--text-faint); cursor: default; }
  .search-button.primary { border-color: transparent; background: var(--accent-strong); color: var(--accent-contrast); }
  .search-button.primary:hover:not(:disabled) { background: var(--accent-strong-hover); }
  .search-button.primary:disabled { border-color: var(--border-soft); background: var(--control-bg); color: var(--text-faint); }
  .search-button:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
  .search-confirm { display: flex; min-width: 0; flex: 1 1 320px; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px 9px; padding: 7px 9px; border: 1px solid var(--border-control); border-radius: 7px; background: var(--control-bg); color: var(--text-secondary); font-size: 9px; line-height: 1.5; }
  .search-confirm span { flex: 1 1 200px; }
  @media (max-width: 640px) {
    .settings-header { padding: 18px 16px 14px; }
    .settings-body { padding: 0 16px; }
    .settings-footer { padding: 11px 16px; }
    .search-field { grid-template-columns: minmax(0, 1fr); gap: 4px; }
    .search-results-section { padding: 8px 0 12px; }
  }
</style>
