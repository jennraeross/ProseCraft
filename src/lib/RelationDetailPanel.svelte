<script lang="ts">
  import { Plus, Trash2, Users, X } from "@lucide/svelte";
  import { confirmDestructiveAction } from "./confirm";
  import { addRelation, removeRelation, updateRelation, type RelationInput } from "./relations";
  import { RELATION_TYPES, type Relation, type RelationTension, type RelationType } from "./story-meta";
  import type { ChapterData, DocumentData } from "./publish/types";

  type Selection = { source: string; relation: Relation };

  type Props = {
    documents: readonly DocumentData[];
    chapters: readonly ChapterData[];
    pages: readonly DocumentData[];
    selection: Selection | null;
    adding: boolean;
    defaultSourceId?: string | null;
    defaultTargetId?: string | null;
    onChange: (documents: DocumentData[]) => void;
    onOpenPage: (id: string) => void;
    onCreated: (sourceId: string, relationId: string) => void;
    onClose: () => void;
  };

  let {
    documents,
    chapters,
    pages,
    selection,
    adding,
    defaultSourceId = null,
    defaultTargetId = null,
    onChange,
    onOpenPage,
    onCreated,
    onClose
  }: Props = $props();

  const TYPE_LABELS: Record<RelationType, string> = {
    family: "Family",
    friend: "Friend",
    rival: "Rival",
    love: "Love",
    mentor: "Mentor",
    employer: "Employer",
    other: "Other"
  };

  const TENSION_LEVELS: readonly RelationTension[] = [1, 2, 3, 4, 5];

  const sortedPages = $derived([...pages].sort((left, right) => left.title.localeCompare(right.title)));
  const titles = $derived(new Map(pages.map((page) => [page.id, page.title])));

  let addSourceId = $state("");
  let addTargetId = $state("");
  let addType = $state<RelationType>("other");

  const sourceId = $derived(
    addSourceId ||
      (defaultSourceId && pages.some((page) => page.id === defaultSourceId)
        ? defaultSourceId
        : (sortedPages[0]?.id ?? ""))
  );
  const targetPages = $derived(sortedPages.filter((page) => page.id !== sourceId));
  const targetId = $derived(
    addTargetId ||
      (defaultTargetId &&
      defaultTargetId !== sourceId &&
      pages.some((page) => page.id === defaultTargetId)
        ? defaultTargetId
        : "")
  );
  const canCreate = $derived(Boolean(sourceId && targetId && sourceId !== targetId));

  const sourceTitle = $derived(selection ? (titles.get(selection.source) ?? "Unknown page") : "");
  const targetTitle = $derived(
    selection ? (titles.get(selection.relation.to) ?? "Unknown page") : ""
  );

  const validityHint = $derived.by(() => {
    if (!selection) return "";
    const from = selection.relation.from
      ? chapters.findIndex((chapter) => chapter.id === selection.relation.from)
      : -1;
    const until = selection.relation.until
      ? chapters.findIndex((chapter) => chapter.id === selection.relation.until)
      : -1;
    if (from < 0 && until < 0) return "Active in every chapter";
    if (from < 0) return `Until Ch ${until + 1}, inclusive`;
    if (until < 0) return `From Ch ${from + 1}, open-ended`;
    if (from > until) return "The end comes before the start";
    return `Ch ${from + 1} to Ch ${until + 1}`;
  });

  function blankToUndefined(value: string): string | undefined {
    return value === "" ? undefined : value;
  }

  function patch(changes: Partial<RelationInput>): void {
    if (!selection) return;
    onChange(updateRelation(documents, selection.source, selection.relation.id, changes));
  }

  function changeSource(id: string): void {
    addSourceId = id;
    if (addTargetId === id) addTargetId = "";
  }

  function create(): void {
    if (!canCreate) return;
    const relationId = crypto.randomUUID();
    const next = addRelation(
      documents,
      sourceId,
      { to: targetId, type: addType },
      () => relationId
    );
    onChange(next);
    onCreated(sourceId, relationId);
  }

  async function deleteSelected(): Promise<void> {
    if (!selection) return;
    const confirmed = await confirmDestructiveAction(
      `Delete the relation between “${sourceTitle}” and “${targetTitle}”?`
    );
    if (!confirmed) return;
    onChange(removeRelation(documents, selection.source, selection.relation.id));
    onClose();
  }

  function openBoth(): void {
    if (!selection) return;
    onOpenPage(selection.source);
    onOpenPage(selection.relation.to);
  }
</script>

{#snippet typeChips(active: RelationType, pick: (type: RelationType) => void)}
  <div class="relation-chips" role="group" aria-label="Relation type">
    {#each RELATION_TYPES as type (type)}
      <button
        type="button"
        class="relation-chip"
        class:active={active === type}
        aria-pressed={active === type}
        onclick={() => pick(type)}
      >
        {TYPE_LABELS[type]}
      </button>
    {/each}
  </div>
{/snippet}

{#if adding}
  <section class="relation-panel" aria-label="Add relation">
    <header class="relation-head">
      <div>
        <p class="relation-eyebrow">New relation</p>
        <h2>Add relation</h2>
      </div>
      <button type="button" class="relation-close" aria-label="Close" onclick={onClose}>
        <X size={13} aria-hidden="true" />
      </button>
    </header>

    {#if pages.length < 2}
      <p class="relation-empty">Create at least two wiki pages to link them.</p>
    {:else}
      <label class="relation-field">
        <span class="relation-label">From</span>
        <select
          class="relation-input"
          value={sourceId}
          onchange={(event) => changeSource(event.currentTarget.value)}
        >
          {#each sortedPages as page (page.id)}
            <option value={page.id}>{page.title}</option>
          {/each}
        </select>
      </label>

      <label class="relation-field">
        <span class="relation-label">To</span>
        <select
          class="relation-input"
          value={targetId}
          onchange={(event) => (addTargetId = event.currentTarget.value)}
        >
          <option value="">Choose a page</option>
          {#each targetPages as page (page.id)}
            <option value={page.id}>{page.title}</option>
          {/each}
        </select>
      </label>

      <div class="relation-field">
        <span class="relation-label">Type</span>
        {@render typeChips(addType, (type) => (addType = type))}
      </div>

      <div class="relation-actions">
        <button type="button" class="relation-primary" disabled={!canCreate} onclick={create}>
          <Plus size={12} aria-hidden="true" /> Add relation
        </button>
        <button type="button" class="relation-secondary" onclick={onClose}>Cancel</button>
      </div>
    {/if}
  </section>
{:else if selection}
  <section class="relation-panel" aria-label="Relation details">
    <header class="relation-head">
      <div>
        <p class="relation-eyebrow">Selected relation</p>
        <h2>
          <span class="relation-name">{sourceTitle}</span>
          <span class="relation-name"><span class="relation-arrow">→</span> {targetTitle}</span>
        </h2>
        <p class="relation-meta">Directed · type {TYPE_LABELS[selection.relation.type].toLowerCase()}</p>
      </div>
      <button type="button" class="relation-close" aria-label="Close" onclick={onClose}>
        <X size={13} aria-hidden="true" />
      </button>
    </header>

    <span class="relation-badge">Declared</span>

    <div class="relation-field">
      <span class="relation-label">Type</span>
      {@render typeChips(selection.relation.type, (type) => patch({ type }))}
    </div>

    <label class="relation-field">
      <span class="relation-label">Label</span>
      <input
        class="relation-input"
        value={selection.relation.label ?? ""}
        placeholder="e.g. Estranged brother"
        oninput={(event) => patch({ label: blankToUndefined(event.currentTarget.value) })}
      />
    </label>

    <div class="relation-field">
      <div class="relation-label-row">
        <span class="relation-label">Tension</span>
        <span class="relation-value">
          {selection.relation.tension ? `${selection.relation.tension} / 5` : "Not set"}
        </span>
        {#if selection.relation.tension}
          <button
            type="button"
            class="relation-clear"
            onclick={() => patch({ tension: undefined })}
          >
            Clear
          </button>
        {/if}
      </div>
      <div class="relation-tension" role="group" aria-label="Tension">
        {#each TENSION_LEVELS as level (level)}
          <button
            type="button"
            class="tension-segment"
            class:active={(selection.relation.tension ?? 0) >= level}
            aria-label={`Tension ${level}`}
            aria-pressed={selection.relation.tension === level}
            onclick={() => patch({ tension: level })}
          ></button>
        {/each}
      </div>
    </div>

    <div class="relation-field">
      <span class="relation-label">Valid from / until</span>
      <div class="relation-range">
        <select
          class="relation-input"
          aria-label="Valid from chapter"
          value={selection.relation.from ?? ""}
          onchange={(event) =>
            patch({ from: blankToUndefined(event.currentTarget.value) })}
        >
          <option value="">Start</option>
          {#each chapters as chapter, index (chapter.id)}
            <option value={chapter.id}>Ch {index + 1}</option>
          {/each}
        </select>
        <span class="relation-dash">–</span>
        <select
          class="relation-input"
          aria-label="Valid until chapter"
          value={selection.relation.until ?? ""}
          onchange={(event) =>
            patch({ until: blankToUndefined(event.currentTarget.value) })}
        >
          <option value="">Open</option>
          {#each chapters as chapter, index (chapter.id)}
            <option value={chapter.id}>Ch {index + 1}</option>
          {/each}
        </select>
      </div>
      <p class="relation-hint">{validityHint}</p>
    </div>

    <label class="relation-field">
      <span class="relation-label">Note</span>
      <textarea
        class="relation-input relation-note"
        rows="3"
        value={selection.relation.note ?? ""}
        placeholder="What changes between them?"
        oninput={(event) => patch({ note: blankToUndefined(event.currentTarget.value) })}
      ></textarea>
    </label>

    <div class="relation-actions">
      <button type="button" class="relation-primary" onclick={openBoth}>
        <Users size={12} aria-hidden="true" /> Open both pages
      </button>
      <button type="button" class="relation-delete" onclick={deleteSelected}>
        <Trash2 size={12} aria-hidden="true" /> Delete relation
      </button>
    </div>
    <p class="relation-save">Changes save immediately</p>
  </section>
{/if}

<style>
  .relation-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .relation-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .relation-eyebrow { margin: 0; color: var(--text-muted); font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .relation-head h2 { margin: 5px 0 0; color: var(--text-heading); font-family: var(--writing-font); font-size: 13px; font-weight: 600; line-height: 1.45; }
  .relation-name { display: block; }
  .relation-arrow { margin-right: 2px; color: var(--text-faint); font-weight: 400; }
  .relation-meta { margin: 6px 0 0; color: var(--text-muted); font-size: 8px; }

  .relation-close {
    display: flex;
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }
  .relation-close:hover { background: var(--surface-raised); color: var(--text-heading); }

  .relation-badge {
    align-self: flex-start;
    padding: 1px 6px;
    border: 1px solid var(--accent-soft);
    border-radius: 10px;
    color: var(--accent-strong);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .5px;
    text-transform: uppercase;
  }

  .relation-field { display: block; }
  .relation-label { display: block; margin-bottom: 5px; color: var(--text-muted); font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .relation-label-row { display: flex; align-items: baseline; gap: 6px; }
  .relation-label-row .relation-label { margin-bottom: 5px; }
  .relation-value { color: var(--text-muted); font-size: 9px; }
  .relation-clear {
    margin-left: auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    font-size: 8px;
    text-decoration: underline;
  }
  .relation-clear:hover { color: var(--text-heading); }

  .relation-input {
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--surface-raised);
    color: var(--text-heading);
    font: inherit;
    font-size: 10px;
  }
  .relation-input:focus { border-color: var(--accent); }
  .relation-note { height: auto; padding: 6px 8px; line-height: 1.5; resize: vertical; }

  .relation-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .relation-chip {
    height: 23px;
    padding: 0 8px;
    border: 1px solid var(--border-control);
    border-radius: 11px;
    background: var(--surface-raised);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 9px;
  }
  .relation-chip:hover { border-color: var(--accent-soft); color: var(--text-heading); }
  .relation-chip.active { border-color: var(--accent); background: var(--selected-bg); color: var(--selected-text); font-weight: 600; }

  .relation-tension { display: flex; gap: 3px; }
  .tension-segment {
    flex: 1;
    height: 8px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: var(--border);
    cursor: pointer;
  }
  .tension-segment:hover { background: var(--accent-soft); }
  .tension-segment.active { background: var(--accent); }

  .relation-range { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 5px; }
  .relation-dash { color: var(--text-faint); font-size: 9px; }
  .relation-hint { margin: 5px 0 0; color: var(--text-faint); font-size: 8px; }

  .relation-actions { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
  .relation-primary {
    display: flex;
    height: 30px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: var(--accent-strong);
    color: var(--accent-contrast);
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
  }
  .relation-primary:hover:not(:disabled) { background: var(--accent-strong-hover); }
  .relation-primary:disabled { opacity: .45; cursor: default; }
  .relation-secondary {
    height: 28px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 10px;
  }
  .relation-secondary:hover { color: var(--text-heading); border-color: var(--accent-soft); }
  .relation-delete {
    display: flex;
    height: 28px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--danger);
    cursor: pointer;
    font-size: 10px;
  }
  .relation-delete:hover { border-color: var(--danger); background: var(--surface-raised); }

  .relation-save { margin: 0; color: var(--text-faint); font-size: 8px; text-align: center; }
  .relation-empty { margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
</style>
