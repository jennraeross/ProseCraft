<script lang="ts">
  import { onMount } from "svelte";
  import { Pencil, Plus, Search, Trash2, Upload, X } from "@lucide/svelte";
  import type { DocumentData } from "$lib/publish/types";
  import { normalizeCslItemsDetailed, type CslItem } from "./citations/csl";
  import { importCitations } from "./citations/import";
  import {
    countSourceCitations,
    cslTypeToManualKind,
    formatAuthorList,
    formatItemContributors,
    generateCitationKey,
    itemYearText,
    manualKindToCslType,
    matchesLibraryQuery,
    mergeImportedCitations,
    parseAuthorList,
    sourceTypeLabel,
    type ManualSourceDraft,
    type ManualSourceKind
  } from "./citations/library";
  import { classifyZoteroError, ZoteroLocal, type ZoteroErrorState } from "./citations/zotero";

  type Props = {
    items: CslItem[];
    documents: DocumentData[];
    onChange: (items: CslItem[]) => void;
    onClose: () => void;
  };

  let { items, documents, onChange, onClose }: Props = $props();

  let dialog = $state<HTMLDialogElement>();
  let fileInput = $state<HTMLInputElement>();
  let searchQuery = $state("");
  let importStatus = $state<{ message: string; warnings: string[] } | null>(null);
  let formMode = $state<"closed" | "add" | "edit">("closed");
  let editingId = $state<string | null>(null);
  let formError = $state("");
  let pendingDelete = $state<{ id: string; documentCount: number } | null>(null);

  const zotero = new ZoteroLocal();
  let isDesktop = $state(false);
  let zoteroChecking = $state(false);
  let zoteroAvailable = $state<boolean | null>(null);
  let zoteroQuery = $state("");
  let zoteroSearching = $state(false);
  let zoteroResults = $state<CslItem[]>([]);
  let zoteroHasSearched = $state(false);
  let zoteroError = $state<ZoteroErrorState | null>(null);
  let zoteroNotice = $state<string | null>(null);
  let zoteroBbtSupported = $state(true);

  function emptyDraft(kind: ManualSourceKind = "book"): ManualSourceDraft {
    return {
      kind,
      title: "",
      authors: "",
      editors: "",
      year: "",
      containerTitle: "",
      publisher: "",
      publisherPlace: "",
      edition: "",
      volume: "",
      issue: "",
      page: "",
      isbn: "",
      doi: "",
      url: ""
    };
  }

  let draft = $state<ManualSourceDraft>(emptyDraft());

  let filteredItems = $derived(items.filter((item) => matchesLibraryQuery(item, searchQuery)));

  let citationCountById = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const { documentCount } = countSourceCitations(item, documents);
      if (documentCount > 0) counts.set(item.id, documentCount);
    }
    return counts;
  });

  let existingIds = $derived(new Set(items.map((item) => item.id)));

  onMount(() => {
    if (dialog && !dialog.open) dialog.showModal();
    void import("@tauri-apps/api/core")
      .then(({ isTauri }) => {
        isDesktop = isTauri();
        if (isDesktop) {
          void checkZoteroConnection();
        }
      })
      .catch(() => {
        isDesktop = false;
      });
  });

  async function checkZoteroConnection() {
    zoteroChecking = true;
    const status = await zotero.checkStatus();
    zoteroChecking = false;
    zoteroAvailable = status.available;
    if (status.available) {
      if (zoteroError?.code === "not-running") {
        zoteroError = null;
      }
    } else if (status.error) {
      zoteroError = status.error;
    }
  }

  async function searchZotero(event: SubmitEvent) {
    event.preventDefault();
    zoteroSearching = true;
    zoteroError = null;
    zoteroNotice = null;
    zoteroHasSearched = true;
    try {
      const results = await zotero.search(zoteroQuery);
      zoteroResults = results;
      zoteroAvailable = true;
    } catch (error) {
      const state = classifyZoteroError(error);
      zoteroError = state;
      if (state.code === "not-running") {
        zoteroAvailable = false;
      }
      zoteroResults = [];
    } finally {
      zoteroSearching = false;
    }
  }

  async function pickFromZotero() {
    zoteroSearching = true;
    zoteroError = null;
    zoteroNotice = null;
    try {
      const picked = await zotero.tryPick();
      if (!picked.supported) {
        zoteroBbtSupported = false;
        return;
      }
      zoteroAvailable = true;
      if (picked.items.length > 0) {
        zoteroResults = picked.items;
        zoteroHasSearched = true;
      }
    } finally {
      zoteroSearching = false;
    }
  }

  function addZoteroItem(item: CslItem) {
    const merged = mergeImportedCitations(items, [item]);
    if (merged.addedCount > 0) {
      onChange(merged.items);
      zoteroNotice = `Added “${item.title || item.id}” to this project.`;
    }
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    onClose();
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === dialog) onClose();
  }

  function startAdd() {
    formMode = "add";
    editingId = null;
    formError = "";
    pendingDelete = null;
    draft = emptyDraft("book");
  }

  function startEdit(item: CslItem) {
    const mappedKind = cslTypeToManualKind(item.type);
    formMode = "edit";
    editingId = item.id;
    formError = "";
    pendingDelete = null;
    draft = {
      kind: mappedKind ?? "book",
      customType: mappedKind ? undefined : item.type,
      title: item.title ?? "",
      authors: formatAuthorList(item.author),
      editors: formatAuthorList(item.editor),
      year: itemYearText(item),
      containerTitle: item["container-title"] ?? "",
      publisher: item.publisher ?? "",
      publisherPlace: item["publisher-place"] ?? "",
      edition: item.edition ?? "",
      volume: item.volume ?? "",
      issue: item.issue ?? "",
      page: item.page ?? "",
      isbn: item.ISBN ?? "",
      doi: item.DOI ?? "",
      url: item.URL ?? ""
    };
  }

  function cancelForm() {
    formMode = "closed";
    editingId = null;
    formError = "";
  }

  function buildIssuedDate(rawYear: string): CslItem["issued"] | undefined {
    const trimmed = rawYear.trim();
    if (!trimmed) return undefined;
    const numeric = Number.parseInt(trimmed, 10);
    if (/^\d{1,4}$/.test(trimmed) && Number.isInteger(numeric)) {
      return { "date-parts": [[numeric]] };
    }
    return { literal: trimmed };
  }

  function saveManualSource(event: SubmitEvent) {
    event.preventDefault();
    formError = "";

    const author = parseAuthorList(draft.authors);
    const editor = draft.kind === "chapter" ? parseAuthorList(draft.editors) : undefined;
    const title = draft.title.trim();
    const year = draft.year.trim();
    const cslType = draft.customType ?? manualKindToCslType(draft.kind);

    const existingItem = editingId ? items.find((item) => item.id === editingId) : undefined;
    const id = existingItem
      ? existingItem.id
      : generateCitationKey({ author, editor, title, year }, items);

    const candidate: Record<string, unknown> = {
      id,
      type: cslType,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(editor ? { editor } : {}),
      ...(buildIssuedDate(year) ? { issued: buildIssuedDate(year) } : {}),
      ...(draft.containerTitle.trim() ? { "container-title": draft.containerTitle.trim() } : {}),
      ...(draft.publisher.trim() ? { publisher: draft.publisher.trim() } : {}),
      ...(draft.publisherPlace.trim() ? { "publisher-place": draft.publisherPlace.trim() } : {}),
      ...(draft.edition.trim() ? { edition: draft.edition.trim() } : {}),
      ...(draft.volume.trim() ? { volume: draft.volume.trim() } : {}),
      ...(draft.issue.trim() ? { issue: draft.issue.trim() } : {}),
      ...(draft.page.trim() ? { page: draft.page.trim() } : {}),
      ...(draft.isbn.trim() ? { ISBN: draft.isbn.trim() } : {}),
      ...(draft.doi.trim() ? { DOI: draft.doi.trim() } : {}),
      ...(draft.url.trim() ? { URL: draft.url.trim() } : {}),
      citeKey: existingItem?.citeKey ?? id,
      provider: existingItem?.provider ?? "manual"
    };

    const normalized = normalizeCslItemsDetailed([candidate]);
    if (normalized.items.length === 0) {
      formError = normalized.warnings[0] ?? "Please enter at least a title, author, or URL.";
      return;
    }

    const savedItem = { ...normalized.items[0], id };
    if (formMode === "edit" && existingItem) {
      onChange(items.map((item) => (item.id === existingItem.id ? savedItem : item)));
    } else {
      onChange([...items, savedItem]);
    }
    cancelForm();
  }

  async function handleFileImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const text = await file.text();
    const imported = importCitations(text, file.name);
    const merged = mergeImportedCitations(items, imported.items);
    if (merged.addedCount > 0) {
      onChange(merged.items);
    }
    importStatus = {
      message: `Imported ${merged.addedCount} source${merged.addedCount === 1 ? "" : "s"} from ${file.name}.`,
      warnings: [...imported.warnings, ...merged.warnings]
    };
  }

  function requestDelete(item: CslItem) {
    const { documentCount } = countSourceCitations(item, documents);
    if (documentCount > 0) {
      pendingDelete = { id: item.id, documentCount };
      return;
    }
    confirmDelete(item.id);
  }

  function confirmDelete(id: string) {
    pendingDelete = null;
    if (editingId === id) cancelForm();
    onChange(items.filter((item) => item.id !== id));
  }
</script>

<dialog
  class="settings-dialog citation-library-dialog"
  data-testid="citation-library"
  bind:this={dialog}
  aria-labelledby="citation-library-title"
  oncancel={handleCancel}
  onclick={handleBackdrop}
>
  <div class="settings-header">
    <div>
      <span class="settings-kicker">PROJECT</span>
      <h2 id="citation-library-title">Sources</h2>
    </div>
    <button
      class="close-settings"
      type="button"
      aria-label="Close sources"
      onclick={onClose}
    ><X size={15} aria-hidden="true" /></button>
  </div>

  <div class="settings-body library-body">
    <div class="library-toolbar">
      <div class="library-search-wrap">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          class="preference-select library-search"
          placeholder="Search sources by title, author, year, type…"
          aria-label="Search sources"
          bind:value={searchQuery}
        />
      </div>
      <div class="library-toolbar-actions">
        <button
          type="button"
          class="data-button"
          onclick={() => fileInput?.click()}
        ><Upload size={13} aria-hidden="true" /> Import file…</button>
        <input
          bind:this={fileInput}
          class="sr-only-input"
          type="file"
          accept=".bib,.bibtex,.ris,.json,.csljson"
          aria-label="Import citation file"
          onchange={handleFileImport}
        />
        <button
          type="button"
          class="data-button primary-action"
          onclick={startAdd}
        ><Plus size={13} aria-hidden="true" /> Add manually</button>
      </div>
    </div>

    {#if importStatus}
      <div class="import-banner" role="status">
        <div class="import-banner-head">
          <strong>{importStatus.message}</strong>
          <button
            type="button"
            class="banner-dismiss"
            aria-label="Dismiss import message"
            onclick={() => (importStatus = null)}
          ><X size={13} aria-hidden="true" /></button>
        </div>
        {#if importStatus.warnings.length > 0}
          <ul class="import-warnings">
            {#each importStatus.warnings as warning, idx (idx)}
              <li>{warning}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    {#if formMode !== "closed"}
      <form class="source-form" onsubmit={saveManualSource}>
        <div class="source-form-head">
          <strong>{formMode === "edit" ? "Edit source" : "Add source manually"}</strong>
          <button type="button" class="banner-dismiss" aria-label="Cancel source form" onclick={cancelForm}>
            <X size={13} aria-hidden="true" />
          </button>
        </div>

        <div class="source-form-grid">
          <label class="source-field">
            <span>Type</span>
            <select
              class="preference-select"
              bind:value={draft.kind}
              onchange={() => (draft.customType = undefined)}
            >
              <option value="book">Book</option>
              <option value="article">Article</option>
              <option value="chapter">Chapter</option>
              <option value="website">Website</option>
            </select>
          </label>
          <label class="source-field">
            <span>Year</span>
            <input
              type="text"
              class="preference-select"
              placeholder="2020"
              bind:value={draft.year}
            />
          </label>
          <label class="source-field source-field-wide">
            <span>Title</span>
            <input
              type="text"
              class="preference-select"
              placeholder="Title of the work"
              bind:value={draft.title}
            />
          </label>
          <label class="source-field source-field-wide">
            <span>Authors <small>(Last, First; separated by semicolons)</small></span>
            <input
              type="text"
              class="preference-select"
              placeholder="Müller, Hans; Schmidt, Anna"
              bind:value={draft.authors}
            />
          </label>

          {#if draft.kind === "book"}
            <label class="source-field">
              <span>Publisher</span>
              <input type="text" class="preference-select" bind:value={draft.publisher} />
            </label>
            <label class="source-field">
              <span>Place</span>
              <input type="text" class="preference-select" bind:value={draft.publisherPlace} />
            </label>
            <label class="source-field">
              <span>Edition</span>
              <input type="text" class="preference-select" placeholder="2" bind:value={draft.edition} />
            </label>
            <label class="source-field">
              <span>ISBN</span>
              <input type="text" class="preference-select" bind:value={draft.isbn} />
            </label>
            <label class="source-field">
              <span>DOI</span>
              <input type="text" class="preference-select" bind:value={draft.doi} />
            </label>
            <label class="source-field">
              <span>URL</span>
              <input type="url" class="preference-select" placeholder="https://…" bind:value={draft.url} />
            </label>
          {:else if draft.kind === "article"}
            <label class="source-field source-field-wide">
              <span>Journal</span>
              <input type="text" class="preference-select" bind:value={draft.containerTitle} />
            </label>
            <label class="source-field">
              <span>Volume</span>
              <input type="text" class="preference-select" bind:value={draft.volume} />
            </label>
            <label class="source-field">
              <span>Issue</span>
              <input type="text" class="preference-select" bind:value={draft.issue} />
            </label>
            <label class="source-field">
              <span>Pages</span>
              <input type="text" class="preference-select" placeholder="45-67" bind:value={draft.page} />
            </label>
            <label class="source-field">
              <span>DOI</span>
              <input type="text" class="preference-select" bind:value={draft.doi} />
            </label>
            <label class="source-field source-field-wide">
              <span>URL</span>
              <input type="url" class="preference-select" placeholder="https://…" bind:value={draft.url} />
            </label>
          {:else if draft.kind === "chapter"}
            <label class="source-field source-field-wide">
              <span>Book title</span>
              <input type="text" class="preference-select" bind:value={draft.containerTitle} />
            </label>
            <label class="source-field source-field-wide">
              <span>Editors <small>(Last, First; separated by semicolons)</small></span>
              <input type="text" class="preference-select" bind:value={draft.editors} />
            </label>
            <label class="source-field">
              <span>Publisher</span>
              <input type="text" class="preference-select" bind:value={draft.publisher} />
            </label>
            <label class="source-field">
              <span>Place</span>
              <input type="text" class="preference-select" bind:value={draft.publisherPlace} />
            </label>
            <label class="source-field">
              <span>Pages</span>
              <input type="text" class="preference-select" placeholder="45-67" bind:value={draft.page} />
            </label>
            <label class="source-field">
              <span>ISBN / DOI</span>
              <input type="text" class="preference-select" bind:value={draft.isbn} />
            </label>
          {:else}
            <label class="source-field source-field-wide">
              <span>Website</span>
              <input type="text" class="preference-select" bind:value={draft.containerTitle} />
            </label>
            <label class="source-field source-field-wide">
              <span>URL</span>
              <input type="url" class="preference-select" placeholder="https://…" bind:value={draft.url} />
            </label>
          {/if}
        </div>

        {#if formError}
          <p class="form-error" role="alert">{formError}</p>
        {/if}

        <div class="source-form-actions">
          <button type="button" class="data-button" onclick={cancelForm}>Cancel</button>
          <button type="submit" class="done-button">
            {formMode === "edit" ? "Save changes" : "Add source"}
          </button>
        </div>
      </form>
    {/if}

    {#if items.length === 0}
      <p class="empty-state">
        No sources in this project yet. Import a <code>.bib</code>, <code>.ris</code>, or CSL <code>.json</code> file, or add a source manually.
      </p>
    {:else if filteredItems.length === 0}
      <p class="empty-state">No sources match “{searchQuery}”.</p>
    {:else}
      <ul class="source-list">
        {#each filteredItems as item (item.id)}
          {@const citedCount = citationCountById.get(item.id) ?? 0}
          <li class="source-row">
            <div class="source-main">
              <div class="source-title-row">
                <strong class="source-title">{item.title || "(Untitled)"}</strong>
                <span class="source-type-badge">{sourceTypeLabel(item.type)}</span>
              </div>
              <div class="source-meta">
                <span>{formatItemContributors(item) || "Unknown author"}</span>
                <span>·</span>
                <span>{itemYearText(item) || "n.d."}</span>
                <span>·</span>
                <code>@{item.citeKey ?? item.id}</code>
                {#if citedCount > 0}
                  <span>·</span>
                  <span class="source-cited">Cited in {citedCount} document{citedCount === 1 ? "" : "s"}</span>
                {/if}
              </div>

              {#if pendingDelete?.id === item.id}
                <div class="delete-warning" role="alert">
                  <span>
                    Cited in {pendingDelete.documentCount} document{pendingDelete.documentCount === 1 ? "" : "s"}. Deleting this source will leave unresolved citations in your text.
                  </span>
                  <div class="delete-warning-actions">
                    <button type="button" class="data-button danger-button" onclick={() => confirmDelete(item.id)}>
                      Delete anyway
                    </button>
                    <button type="button" class="data-button" onclick={() => (pendingDelete = null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              {/if}
            </div>

            <div class="source-actions">
              <button
                type="button"
                class="icon-action"
                aria-label={`Edit ${item.title || item.id}`}
                title="Edit source"
                onclick={() => startEdit(item)}
              ><Pencil size={13} aria-hidden="true" /></button>
              <button
                type="button"
                class="icon-action icon-action-danger"
                aria-label={`Delete ${item.title || item.id}`}
                title="Delete source"
                onclick={() => requestDelete(item)}
              ><Trash2 size={13} aria-hidden="true" /></button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if isDesktop}
      <section class="zotero-section" aria-labelledby="zotero-section-title" data-testid="zotero-section">
        <div class="zotero-header">
          <div class="zotero-title-group">
            <h3 id="zotero-section-title">Zotero</h3>
            {#if zoteroChecking}
              <span class="zotero-status">Checking…</span>
            {:else if zoteroAvailable === true}
              <span class="zotero-status zotero-status-ok">Connected</span>
            {:else if zoteroAvailable === false}
              <span class="zotero-status zotero-status-off">Not reachable</span>
            {/if}
          </div>
          <button
            type="button"
            class="data-button"
            disabled={zoteroChecking}
            onclick={() => void checkZoteroConnection()}
          >Check again</button>
        </div>

        {#if zoteroAvailable === false}
          <p class="zotero-hint">
            Zotero is not reachable on this computer. Start Zotero, and make sure “Allow other applications on this computer to communicate with Zotero” is enabled in Zotero Settings → Advanced → Files and Folders.
          </p>
        {/if}

        <form class="zotero-search-row" onsubmit={searchZotero}>
          <div class="library-search-wrap">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              class="preference-select library-search"
              placeholder="Search Zotero library…"
              aria-label="Search Zotero"
              bind:value={zoteroQuery}
            />
          </div>
          <button
            type="submit"
            class="data-button"
            disabled={zoteroSearching}
          >{zoteroSearching ? "Searching…" : "Search"}</button>
          {#if zoteroBbtSupported}
            <button
              type="button"
              class="data-button"
              disabled={zoteroSearching}
              onclick={() => void pickFromZotero()}
            >Pick in Zotero…</button>
          {/if}
        </form>

        {#if zoteroError && (zoteroAvailable !== false || zoteroError.code === "forbidden" || zoteroError.code === "timeout")}
          <p class="form-error" role="alert">{zoteroError.message}</p>
        {/if}

        {#if zoteroNotice}
          <p class="zotero-notice" role="status">{zoteroNotice}</p>
        {/if}

        {#if zoteroResults.length > 0}
          <ul class="source-list">
            {#each zoteroResults as zItem (zItem.id)}
              {@const alreadyAdded = existingIds.has(zItem.id)}
              <li class="source-row">
                <div class="source-main">
                  <div class="source-title-row">
                    <strong class="source-title">{zItem.title || "(Untitled)"}</strong>
                    <span class="source-type-badge">{sourceTypeLabel(zItem.type)}</span>
                  </div>
                  <div class="source-meta">
                    <span>{formatItemContributors(zItem) || "Unknown author"}</span>
                    <span>·</span>
                    <span>{itemYearText(zItem) || "n.d."}</span>
                    <span>·</span>
                    <code>@{zItem.citeKey ?? zItem.id}</code>
                  </div>
                </div>
                <div class="source-actions">
                  {#if alreadyAdded}
                    <span class="zotero-added-badge">In project</span>
                  {:else}
                    <button
                      type="button"
                      class="data-button primary-action"
                      onclick={() => addZoteroItem(zItem)}
                    >Add to this project</button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else if zoteroHasSearched && !zoteroSearching && !zoteroError}
          <p class="zotero-empty">No Zotero items matched “{zoteroQuery}”.</p>
        {/if}
      </section>
    {/if}
  </div>

  <div class="settings-footer">
    <span>{items.length} source{items.length === 1 ? "" : "s"} in project</span>
    <button class="done-button" type="button" onclick={onClose}>Done</button>
  </div>
</dialog>

<style>
  .citation-library-dialog {
    width: min(680px, calc(100vw - 32px));
    max-height: min(760px, calc(100vh - 32px));
    max-height: min(760px, calc(100dvh - 32px));
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-primary);
    box-shadow: var(--shadow-dialog);
  }
  .citation-library-dialog[open] {
    display: flex;
    flex-direction: column;
  }
  .citation-library-dialog::backdrop {
    background: var(--backdrop);
    backdrop-filter: blur(2px);
  }
  .settings-header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 24px 15px;
    border-bottom: 1px solid var(--border-soft);
  }
  .settings-kicker {
    color: var(--text-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.2px;
  }
  .settings-header h2 {
    margin: 5px 0 0;
    color: var(--text-heading);
    font-family: Georgia, serif;
    font-size: 24px;
    font-weight: 500;
  }
  .close-settings {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .close-settings:hover {
    background: var(--hover-bg);
    color: var(--text-primary);
  }
  .library-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .library-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .library-search-wrap {
    position: relative;
    flex: 1 1 220px;
    display: flex;
    align-items: center;
  }
  .library-search-wrap :global(svg) {
    position: absolute;
    left: 9px;
    color: var(--text-muted);
    pointer-events: none;
  }
  .library-search {
    padding-left: 28px !important;
  }
  .library-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sr-only-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .preference-select {
    width: 100%;
    height: 33px;
    padding: 0 9px;
    border: 1px solid var(--border-control);
    border-radius: 6px;
    background: var(--control-bg);
    color: var(--text-primary);
    font-size: 11px;
    box-sizing: border-box;
  }
  .data-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 31px;
    padding: 0 11px;
    border: 1px solid var(--border-control);
    border-radius: 6px;
    background: var(--control-bg);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
  }
  .data-button:hover {
    border-color: var(--accent);
    color: var(--text-heading);
  }
  .primary-action {
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .danger-button {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border-control));
    color: var(--danger);
  }
  .done-button {
    height: 31px;
    padding: 0 14px;
    border: 0;
    border-radius: 6px;
    background: var(--accent);
    color: var(--accent-contrast, #fff);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }
  .import-banner {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-raised);
    font-size: 11px;
  }
  .import-banner-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .import-warnings {
    margin: 6px 0 0;
    padding-left: 16px;
    color: var(--warning, var(--text-secondary));
    font-size: 10px;
    line-height: 1.45;
  }
  .banner-dismiss {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .banner-dismiss:hover {
    background: var(--hover-bg);
    color: var(--text-primary);
  }
  .source-form {
    padding: 13px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-raised);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .source-form-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-heading);
  }
  .source-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
  }
  .source-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  .source-field small {
    color: var(--text-muted);
  }
  .source-field-wide {
    grid-column: 1 / -1;
  }
  .form-error {
    margin: 0;
    color: var(--danger);
    font-size: 11px;
  }
  .source-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .empty-state {
    margin: 20px 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
    text-align: center;
  }
  .source-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .source-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-raised);
  }
  .source-main {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .source-title-row {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .source-title {
    color: var(--text-heading);
    font-size: 12px;
    font-weight: 600;
  }
  .source-type-badge {
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    color: var(--accent-strong);
    font-size: 10px;
    font-weight: 600;
  }
  .source-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    color: var(--text-muted);
    font-size: 11px;
  }
  .source-meta code {
    font-size: 10px;
  }
  .source-cited {
    color: var(--accent-strong);
  }
  .source-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }
  .icon-action {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .icon-action:hover {
    background: var(--hover-bg);
    color: var(--text-heading);
  }
  .icon-action-danger:hover {
    color: var(--danger);
  }
  .delete-warning {
    margin-top: 6px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--danger) 7%, transparent);
    color: var(--text-primary);
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .delete-warning-actions {
    display: flex;
    gap: 6px;
  }
  .zotero-section {
    margin-top: 6px;
    padding-top: 14px;
    border-top: 1px solid var(--border-soft);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .zotero-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .zotero-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .zotero-title-group h3 {
    margin: 0;
    color: var(--text-heading);
    font-size: 13px;
    font-weight: 600;
  }
  .zotero-status {
    padding: 1px 7px;
    border-radius: 4px;
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
  }
  .zotero-status-ok {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-strong);
  }
  .zotero-status-off {
    color: var(--text-secondary);
  }
  .zotero-hint,
  .zotero-empty {
    margin: 0;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.5;
  }
  .zotero-notice {
    margin: 0;
    color: var(--accent-strong);
    font-size: 11px;
  }
  .zotero-search-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .zotero-added-badge {
    padding: 0 8px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 500;
  }
  .settings-footer {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    padding: 13px 24px;
    border-top: 1px solid var(--border-soft);
    color: var(--text-muted);
    font-size: 11px;
  }
</style>
