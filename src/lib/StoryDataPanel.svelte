<script lang="ts">
  import { ChevronDown, Plus, X } from "@lucide/svelte";
  import { htmlToPlainText } from "./publish/content";
  import type { DocumentData, ResearchFolder } from "./publish/types";
  import { characterPages, pageKind } from "./relations";
  import { normalizeMeta, type DocumentMeta } from "./story-meta";
  import { parseStoryMeta, serializeStoryMeta } from "./story-yaml";
  import { createWikiMentionMatcher } from "./wiki-mentions";

  let {
    meta,
    content,
    pages,
    folders,
    onchange
  }: {
    meta: DocumentMeta | undefined;
    content: string;
    pages: readonly DocumentData[];
    folders: readonly ResearchFolder[];
    onchange: (meta: DocumentMeta | undefined) => void;
  } = $props();

  const openStorageKey = "prosecraft-story-data-open";

  /** The open state is remembered for the session, so every scene shares it. */
  function storedOpen(): boolean {
    if (typeof sessionStorage === "undefined") return false;
    try {
      return sessionStorage.getItem(openStorageKey) === "true";
    } catch {
      return false;
    }
  }

  function toggleOpen(): void {
    open = !open;
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(openStorageKey, String(open));
    } catch {
      // Storage can be unavailable; the panel still toggles for this mount.
    }
  }

  let open = $state(storedOpen());
  let yamlOpen = $state(false);
  let yamlText = $state("");
  let yamlError = $state("");
  let tagDraft = $state("");

  const confirmedIds = $derived(meta?.characters ?? []);
  const pageById = $derived(new Map(pages.map((page) => [page.id, page])));
  const characterPool = $derived(characterPages(pages, folders));
  const availableCharacters = $derived(
    characterPool.filter((page) => !confirmedIds.includes(page.id))
  );
  const placePages = $derived(
    pages.filter(
      (page) => page.space === "Wiki" && !page.trashed && pageKind(page, folders) === "place"
    )
  );

  const detectedIds = $derived.by(() => {
    const articles = characterPool.flatMap((page) => [
      { title: page.title, pageId: page.id },
      ...(page.meta?.aliases ?? []).map((alias) => ({ title: alias, pageId: page.id }))
    ]);
    const matcher = createWikiMentionMatcher(articles);
    const confirmed = new Set(confirmedIds);
    const ids: string[] = [];
    for (const match of matcher(htmlToPlainText(content))) {
      if (!confirmed.has(match.article.pageId) && !ids.includes(match.article.pageId)) {
        ids.push(match.article.pageId);
      }
    }
    return ids;
  });

  const placeLabel = $derived(
    meta?.place ? (pageById.get(meta.place)?.title ?? meta.place) : ""
  );

  const summary = $derived.by(() => {
    const parts: string[] = [];
    if (meta?.storyDate) parts.push(meta.storyDate);
    if (placeLabel) parts.push(placeLabel);
    if (confirmedIds.length > 0) {
      parts.push(`${confirmedIds.length} character${confirmedIds.length === 1 ? "" : "s"}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Add story date, place and characters";
  });

  function titleOf(id: string): string {
    return pageById.get(id)?.title ?? id;
  }

  function commit(patch: Partial<DocumentMeta>): void {
    const next: DocumentMeta = { ...(meta ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    onchange(normalizeMeta(next));
  }

  function addCharacter(id: string): void {
    if (!confirmedIds.includes(id)) commit({ characters: [...confirmedIds, id] });
  }

  function removeCharacter(id: string): void {
    commit({ characters: confirmedIds.filter((entry) => entry !== id) });
  }

  function commitPlace(event: Event): void {
    const raw = (event.currentTarget as HTMLInputElement).value.trim();
    const page = placePages.find((entry) => entry.title.toLowerCase() === raw.toLowerCase());
    commit({ place: page ? page.id : raw });
  }

  function addTag(): void {
    const parts = tagDraft
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    tagDraft = "";
    if (parts.length === 0) return;
    commit({ tags: [...new Set([...(meta?.tags ?? []), ...parts])] });
  }

  function onTagKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag();
    } else if (event.key === "Escape") {
      tagDraft = "";
    }
  }

  function toggleYaml(): void {
    yamlOpen = !yamlOpen;
    if (yamlOpen) {
      yamlText = serializeStoryMeta(meta);
      yamlError = "";
    }
  }

  function applyYaml(): void {
    const result = parseStoryMeta(yamlText);
    if (!result.ok) {
      yamlError = result.error;
      return;
    }
    yamlError = "";
    yamlText = serializeStoryMeta(result.meta);
    onchange(result.meta);
  }
</script>

<section class="story-data">
  <button
    type="button"
    class="story-data-toggle"
    data-testid="story-data-toggle"
    aria-expanded={open}
    onclick={toggleOpen}
  >
    <span class="chevron lead" class:open><ChevronDown size={14} /></span>
    <span class="story-data-title">Story data</span>
    <span class="story-data-summary">{summary}</span>
  </button>

  {#if open}
    <div class="story-data-body">
      <div class="story-data-row">
        <label class="story-data-label" for="story-data-date">Story date</label>
        <input
          id="story-data-date"
          class="story-data-input"
          value={meta?.storyDate ?? ""}
          placeholder="e.g. Day 14, Year 412"
          onchange={(event) => commit({ storyDate: event.currentTarget.value.trim() })}
        />
      </div>

      <div class="story-data-row">
        <label class="story-data-label" for="story-data-place">Place</label>
        <input
          id="story-data-place"
          class="story-data-input"
          list="story-data-places"
          value={pageById.get(meta?.place ?? "")?.title ?? meta?.place ?? ""}
          placeholder="Page or free text"
          onchange={commitPlace}
        />
        <datalist id="story-data-places">
          {#each placePages as page (page.id)}
            <option value={page.title}></option>
          {/each}
        </datalist>
      </div>

      <div class="story-data-row story-data-row-top">
        <span class="story-data-label">Characters</span>
        <div class="chips">
          {#each confirmedIds as id (id)}
            <span class="chip chip-confirmed">
              {titleOf(id)}
              <button
                type="button"
                class="chip-x"
                aria-label={`Remove ${titleOf(id)}`}
                onclick={() => removeCharacter(id)}
              >
                <X size={11} />
              </button>
            </span>
          {/each}
          {#each detectedIds as id (id)}
            <button
              type="button"
              class="chip chip-auto"
              title="Mentioned in this scene — click to confirm"
              onclick={() => addCharacter(id)}
            >
              {titleOf(id)}
              <span class="chip-auto-label">auto</span>
              <Plus size={11} />
            </button>
          {/each}
          {#if availableCharacters.length > 0}
            <select
              class="chip-add"
              value=""
              aria-label="Add character"
              onchange={(event) => {
                const id = event.currentTarget.value;
                if (id) addCharacter(id);
                event.currentTarget.value = "";
              }}
            >
              <option value="">+ Add character</option>
              {#each availableCharacters as page (page.id)}
                <option value={page.id}>{page.title}</option>
              {/each}
            </select>
          {/if}
        </div>
      </div>

      <div class="story-data-row story-data-row-top">
        <span class="story-data-label">Tags</span>
        <div class="chips">
          {#each meta?.tags ?? [] as tag (tag)}
            <span class="chip chip-confirmed">
              {tag}
              <button
                type="button"
                class="chip-x"
                aria-label={`Remove tag ${tag}`}
                onclick={() => commit({ tags: (meta?.tags ?? []).filter((entry) => entry !== tag) })}
              >
                <X size={11} />
              </button>
            </span>
          {/each}
          <input
            class="tag-input"
            bind:value={tagDraft}
            placeholder="+ tag"
            aria-label="Add tag"
            onkeydown={onTagKeydown}
            onblur={addTag}
          />
        </div>
      </div>

      <div class="story-data-advanced">
        <button type="button" class="foldout" aria-expanded={yamlOpen} onclick={toggleYaml}>
          <span class="chevron" class:open={yamlOpen}><ChevronDown size={13} /></span>
          Advanced: raw YAML
        </button>
        {#if yamlOpen}
          <textarea
            class="yaml-input"
            spellcheck="false"
            aria-label="Scene metadata as YAML"
            value={yamlText}
            oninput={(event) => (yamlText = event.currentTarget.value)}
            onblur={applyYaml}
          ></textarea>
          {#if yamlError}<p class="yaml-error" role="alert">{yamlError}</p>{/if}
        {/if}
      </div>

      <p class="story-data-note">Never exported</p>
    </div>
  {/if}
</section>

<style>
  .story-data { margin: 0 0 12px; border: 1px solid var(--border-soft); border-radius: 7px; background: var(--surface); }
  .story-data-toggle { display: flex; width: 100%; align-items: center; gap: 8px; padding: 7px 10px; border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: 11px; cursor: pointer; text-align: left; }
  .story-data-toggle:hover { color: var(--text-heading); }
  .story-data-title { font-weight: 600; letter-spacing: .3px; }
  .story-data-summary { min-width: 0; overflow: hidden; color: var(--text-faint); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .chevron { display: inline-flex; align-items: center; margin-left: auto; transition: transform .12s ease; }
  .chevron.lead { margin-left: 0; }
  .chevron.open { transform: rotate(180deg); }
  .story-data-body { display: flex; flex-direction: column; gap: 8px; padding: 2px 10px 10px; border-top: 1px solid var(--border-soft); }
  .story-data-row { display: flex; align-items: center; gap: 10px; padding-top: 8px; }
  .story-data-row-top { align-items: flex-start; }
  .story-data-label { width: 72px; flex: 0 0 auto; color: var(--text-muted); font-size: 10px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; }
  .story-data-row-top .story-data-label { padding-top: 5px; }
  .story-data-input { flex: 1; min-width: 0; height: 27px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 5px; outline: 0; background: var(--surface-raised); color: var(--text-heading); font: inherit; font-size: 11px; }
  .story-data-input:focus { border-color: var(--accent); }
  .story-data-input::placeholder { color: var(--text-faint); }
  .chips { display: flex; flex: 1; flex-wrap: wrap; align-items: center; gap: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; min-height: 24px; padding: 0 7px; border-radius: 12px; font-size: 10px; }
  .chip-confirmed { border: 1px solid var(--border-control); background: var(--selected-bg); color: var(--selected-text); }
  .chip-auto { border: 1px dashed var(--border-control); background: transparent; color: var(--text-muted); cursor: pointer; font: inherit; font-size: 10px; }
  .chip-auto:hover { border-color: var(--accent); color: var(--text-heading); }
  .chip-auto-label { color: var(--text-faint); font-size: 9px; }
  .chip-x { display: inline-flex; align-items: center; padding: 0; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; }
  .chip-x:hover { color: var(--danger, #b42318); }
  .chip-add { height: 24px; padding: 0 6px; border: 1px dashed var(--border-control); border-radius: 12px; background: transparent; color: var(--text-muted); font: inherit; font-size: 10px; cursor: pointer; }
  .chip-add:hover { border-color: var(--accent); color: var(--text-heading); }
  .tag-input { width: 90px; height: 24px; padding: 0 4px; border: 0; outline: 0; background: transparent; color: var(--text-heading); font: inherit; font-size: 10px; }
  .tag-input::placeholder { color: var(--text-faint); }
  .story-data-advanced { padding-top: 2px; }
  .foldout { display: inline-flex; align-items: center; gap: 4px; padding: 4px 0; border: 0; background: transparent; color: var(--text-muted); font: inherit; font-size: 10px; cursor: pointer; }
  .foldout:hover { color: var(--text-heading); }
  .foldout .chevron { margin-left: 0; }
  .yaml-input { display: block; width: 100%; min-height: 120px; margin-top: 4px; padding: 8px; border: 1px solid var(--border-control); border-radius: 5px; outline: 0; background: var(--surface-raised); color: var(--text-heading); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.5; resize: vertical; }
  .yaml-input:focus { border-color: var(--accent); }
  .yaml-error { margin: 5px 0 0; color: var(--danger, #b42318); font-size: 10px; }
  .story-data-note { margin: 0; color: var(--text-faint); font-size: 9px; letter-spacing: .3px; }
</style>
