<script lang="ts">
  import { Plus, X } from "@lucide/svelte";
  import AppearanceStrip from "./AppearanceStrip.svelte";
  import { layoutGraph } from "./graph-layout";
  import type { ChapterData, DocumentData, ResearchFolder } from "./publish/types";
  import { buildRelationGraph } from "./relation-graph-model";
  import { appearances, pageKind, relationsOf, reverseView } from "./relations";
  import SheetTemplateEditor from "./SheetTemplateEditor.svelte";
  import {
    BLANK,
    allTemplates,
    applyTemplate,
    setSheetValue,
    sheetValue,
    validateSheetValue
  } from "./sheet-templates";
  import {
    normalizeMeta,
    type DocumentMeta,
    type Relation,
    type RelationType,
    type SheetField,
    type SheetTemplate
  } from "./story-meta";

  let {
    document,
    pages,
    folders,
    chapters = [],
    projectTemplates = [],
    onchange,
    onsavetemplates,
    onOpenGraphBeside,
    onOpenScene
  }: {
    document: DocumentData;
    pages: readonly DocumentData[];
    folders: readonly ResearchFolder[];
    chapters?: readonly ChapterData[];
    projectTemplates?: readonly SheetTemplate[];
    onchange: (meta: DocumentMeta | undefined) => void;
    onsavetemplates: (templates: SheetTemplate[]) => void;
    onOpenGraphBeside?: (pageId: string) => void;
    onOpenScene?: (id: string) => void;
  } = $props();

  type Tab = "profile" | "relations" | "appearances" | "notes";

  const TABS: readonly { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "relations", label: "Relations" },
    { id: "appearances", label: "Appearances" },
    { id: "notes", label: "Notes" }
  ];

  const KIND_LABELS = {
    character: "Character",
    place: "Place",
    organisation: "Organisation",
    item: "Item",
    other: "Page"
  } as const;

  const uid = $props.id();
  let tab = $state<Tab>("profile");
  let aliasDraft = $state("");
  let fieldError = $state<{ fieldId: string; message: string } | null>(null);
  let editorOpen = $state(false);

  const meta = $derived(document.meta);
  const kind = $derived(pageKind(document, folders));
  const templates = $derived(allTemplates({ sheetTemplates: projectTemplates }));
  const template = $derived(templates.find((entry) => entry.id === meta?.sheetTemplate));
  const fields = $derived(template?.fields ?? []);
  const knownFieldIds = $derived(new Set(fields.map((field) => field.id)));
  const orphanedValues = $derived(
    Object.entries(meta?.sheet ?? {}).filter(([key]) => !knownFieldIds.has(key))
  );
  const aliases = $derived(meta?.aliases ?? []);
  const hasSheet = $derived(
    kind === "character" ||
      Boolean(meta?.sheetTemplate) ||
      orphanedValues.length > 0 ||
      aliases.length > 0
  );
  const initial = $derived((document.title.trim()[0] ?? "?").toUpperCase());
  const linkPages = $derived(
    pages.filter((page) => page.space === "Wiki" && !page.trashed && page.id !== document.id)
  );
  const fieldLabels = $derived(
    new Map(templates.flatMap((entry) => entry.fields).map((field) => [field.id, field.label]))
  );

  const RELATION_LABELS: Record<RelationType, string> = {
    family: "Family",
    friend: "Friend",
    rival: "Rival",
    love: "Love",
    mentor: "Mentor",
    employer: "Employer",
    other: "Other"
  };

  const relationColors: Record<RelationType, string> = {
    family: "var(--accent)",
    friend: "var(--success)",
    rival: "var(--danger)",
    love: "var(--quote)",
    mentor: "var(--link)",
    employer: "var(--warning)",
    other: "var(--text-muted)"
  };

  const MINI_WIDTH = 260;
  const MINI_HEIGHT = 140;
  const MINI_PADDING = 22;

  const sourced = $derived(relationsOf(pages));
  const pageAppearances = $derived(appearances(pages, chapters, folders));

  /** Outgoing relations of this page plus the incoming ones derived from other pages. */
  const relationRows = $derived.by(() => {
    const titles = new Map(pages.filter((page) => !page.trashed).map((page) => [page.id, page.title]));
    const outgoing = sourced.filter((entry) => entry.source === document.id);
    const incoming = reverseView(sourced).filter((entry) => entry.source === document.id);
    return [...outgoing, ...incoming]
      .filter((entry) => titles.has(entry.relation.to))
      .map((entry) => ({
        key: entry.relation.id,
        incoming: entry.relation.id.startsWith("reverse:"),
        relation: entry.relation,
        title: titles.get(entry.relation.to) ?? ""
      }));
  });

  /** The page and its direct neighbours, laid out for the compact graph. */
  const miniGraph = $derived.by(() => {
    const wikiPages = pages.filter((page) => page.space === "Wiki" && !page.trashed);
    const model = buildRelationGraph({
      pages: wikiPages.map((page) => ({ id: page.id, title: page.title, kind: pageKind(page, folders) })),
      relations: sourced,
      appearances: pageAppearances,
      suggestions: [],
      chapters
    });
    const neighbours = new Set<string>([document.id]);
    for (const edge of model.edges) {
      if (edge.from === document.id) neighbours.add(edge.to);
      if (edge.to === document.id) neighbours.add(edge.from);
    }
    const nodes = model.nodes.filter((node) => neighbours.has(node.id));
    const edges = model.edges.filter((edge) => neighbours.has(edge.from) && neighbours.has(edge.to));
    if (nodes.length === 0) return { nodes: [], edges: [] };

    const points = layoutGraph(
      nodes.map((node) => ({ id: node.id })),
      edges.map((edge) => ({ from: edge.from, to: edge.to })),
      { width: MINI_WIDTH, height: MINI_HEIGHT, iterations: 160, minDistance: 46, seed: 7 }
    );
    const xs = nodes.map((node) => points[node.id]?.x ?? 0);
    const ys = nodes.map((node) => points[node.id]?.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const place = (id: string) => {
      const point = points[id] ?? { x: 0, y: 0 };
      const x =
        maxX === minX
          ? MINI_WIDTH / 2
          : MINI_PADDING + ((point.x - minX) / (maxX - minX)) * (MINI_WIDTH - MINI_PADDING * 2);
      const y =
        maxY === minY
          ? MINI_HEIGHT / 2
          : MINI_PADDING + ((point.y - minY) / (maxY - minY)) * (MINI_HEIGHT - MINI_PADDING * 2);
      return { x, y };
    };
    return {
      nodes: nodes.map((node) => ({ ...node, ...place(node.id) })),
      edges: edges.map((edge) => ({ ...edge, from: place(edge.from), to: place(edge.to) }))
    };
  });

  /** "Ch 2–5", "From Ch 3", "Until Ch 4" or "All chapters". */
  function chapterRange(relation: Relation): string {
    const indexOf = (id?: string) => (id ? chapters.findIndex((chapter) => chapter.id === id) : -1);
    const from = indexOf(relation.from);
    const until = indexOf(relation.until);
    if (from < 0 && until < 0) return "All chapters";
    if (from >= 0 && until >= 0) return from === until ? `Ch ${from + 1}` : `Ch ${from + 1}–${until + 1}`;
    return from >= 0 ? `From Ch ${from + 1}` : `Until Ch ${until + 1}`;
  }

  /** Writes one metadata patch and lets normalisation drop empty values. */
  function commit(patch: Partial<DocumentMeta>): void {
    const next: DocumentMeta = { ...(meta ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    onchange(normalizeMeta(next));
  }

  function addAlias(): void {
    const alias = aliasDraft.trim();
    aliasDraft = "";
    if (!alias) return;
    if (aliases.some((entry) => entry.toLowerCase() === alias.toLowerCase())) return;
    commit({ aliases: [...aliases, alias] });
  }

  function removeAlias(index: number): void {
    commit({ aliases: aliases.filter((_, entryIndex) => entryIndex !== index) });
  }

  function onAliasKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      addAlias();
    } else if (event.key === "Escape") {
      aliasDraft = "";
    }
  }

  function addSheet(): void {
    commit({ sheetTemplate: BLANK.id });
  }

  function chooseTemplate(event: Event): void {
    const id = (event.currentTarget as HTMLSelectElement).value;
    fieldError = null;
    if (!id) {
      commit({ sheetTemplate: undefined });
      return;
    }
    const chosen = templates.find((entry) => entry.id === id);
    if (!chosen) return;
    applyChosenTemplate(chosen);
  }

  /** Applies a template to this page, keeping values whose field ids survive. */
  function applyChosenTemplate(chosen: SheetTemplate): void {
    fieldError = null;
    const applied = applyTemplate(meta, chosen);
    onchange(normalizeMeta({ ...applied.meta, sheetTemplate: chosen.id }));
  }

  function reportFieldError(field: SheetField, error: "number" | "choice"): void {
    fieldError = {
      fieldId: field.id,
      message: error === "number" ? "Enter a number." : "Choose one of the listed options."
    };
  }

  function onFieldChange(field: SheetField, event: Event): void {
    const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const value = input.value;
    const error = validateSheetValue(field, value);
    if (error) {
      reportFieldError(field, error);
      input.value = sheetValue(meta, field.id);
      return;
    }
    fieldError = null;
    onchange(normalizeMeta(setSheetValue(meta, field.id, value)));
  }

  /** Links store a page id when the typed title matches a wiki page. */
  function onLinkChange(field: SheetField, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const text = input.value.trim();
    const page = linkPages.find((entry) => entry.title.trim().toLowerCase() === text.toLowerCase());
    if (page) {
      fieldError = null;
      onchange(normalizeMeta(setSheetValue(meta, field.id, page.id)));
      return;
    }
    const error = validateSheetValue(field, text);
    if (error) {
      reportFieldError(field, error);
      return;
    }
    fieldError = null;
    onchange(normalizeMeta(setSheetValue(meta, field.id, text)));
  }

  function linkValue(field: SheetField): string {
    const value = sheetValue(meta, field.id);
    return pages.find((entry) => entry.id === value)?.title ?? value;
  }

  function orphanLabel(key: string): string {
    return fieldLabels.get(key) ?? key;
  }

  function onOrphanChange(key: string, event: Event): void {
    onchange(normalizeMeta(setSheetValue(meta, key, (event.currentTarget as HTMLInputElement).value)));
  }
</script>

{#if !hasSheet}
  <div class="character-sheet sheet-add-row">
    <button type="button" class="sheet-add" onclick={addSheet}>
      <Plus size={12} />
      Add sheet
    </button>
    <span class="sheet-hint">Profile fields for this page.</span>
  </div>
{:else}
  <section class="character-sheet" aria-label="Character sheet">
    <header class="sheet-head">
      <div class="sheet-portrait" aria-hidden="true">{initial}</div>
      <div class="sheet-identity">
        <div class="sheet-title-row">
          <span class="sheet-name">{document.title || "Untitled"}</span>
          <span class="sheet-subtitle">
            {KIND_LABELS[kind]}
            {#if template}<span class="sheet-dot">·</span>{template.name} template{/if}
          </span>
        </div>
        <div class="sheet-aliases">
          <span class="sheet-alias-label">Aliases</span>
          {#each aliases as alias, index (index)}
            <span class="sheet-chip">
              {alias}
              <button
                type="button"
                class="sheet-chip-x"
                title={`Remove ${alias}`}
                aria-label={`Remove ${alias}`}
                onclick={() => removeAlias(index)}
              >
                <X size={9} />
              </button>
            </span>
          {/each}
          <input
            class="sheet-alias-input"
            bind:value={aliasDraft}
            placeholder="+ alias"
            aria-label="Add alias"
            onkeydown={onAliasKeydown}
            onblur={addAlias}
          />
        </div>
      </div>
    </header>

    <div class="sheet-tabs" role="tablist" aria-label="Character sheet sections">
      {#each TABS as entry (entry.id)}
        <button
          type="button"
          role="tab"
          id={`${uid}-tab-${entry.id}`}
          aria-controls={`${uid}-panel-${entry.id}`}
          aria-selected={tab === entry.id}
          class="sheet-tab"
          class:active={tab === entry.id}
          onclick={() => (tab = entry.id)}
        >
          {entry.label}
        </button>
      {/each}
    </div>

    {#if tab === "profile"}
      <div
        class="sheet-body"
        role="tabpanel"
        id={`${uid}-panel-profile`}
        aria-labelledby={`${uid}-tab-profile`}
      >
        <div class="sheet-template-row">
          <label class="sheet-label" for={`${uid}-template`}>Template</label>
          <select
            id={`${uid}-template`}
            class="sheet-select"
            value={template?.id ?? ""}
            onchange={chooseTemplate}
          >
            <option value="">No template</option>
            {#each templates as entry (entry.id)}
              <option value={entry.id}>{entry.name}</option>
            {/each}
          </select>
          <button type="button" class="sheet-manage" onclick={() => (editorOpen = true)}>
            Manage templates
          </button>
        </div>

        {#if editorOpen}
          <SheetTemplateEditor
            templates={projectTemplates}
            templateId={template?.id}
            preview={{ title: document.title, values: meta?.sheet ?? {} }}
            ontemplates={onsavetemplates}
            onapply={applyChosenTemplate}
            onclose={() => (editorOpen = false)}
          />
        {/if}

        {#if fields.length > 0}
          <p class="sheet-section-label">Profile fields</p>
          <div class="sheet-fields">
            {#each fields as field, index (field.id)}
              <div class="sheet-field" class:wide={field.type === "longtext"}>
                <label class="sheet-label" for={`${uid}-field-${index}`}>{field.label}</label>
                {#if field.type === "longtext"}
                  <textarea
                    id={`${uid}-field-${index}`}
                    class="sheet-textarea"
                    rows="3"
                    value={sheetValue(meta, field.id)}
                    onchange={(event) => onFieldChange(field, event)}
                  ></textarea>
                {:else if field.type === "choice"}
                  <select
                    id={`${uid}-field-${index}`}
                    class="sheet-select"
                    value={sheetValue(meta, field.id)}
                    onchange={(event) => onFieldChange(field, event)}
                  >
                    <option value="">Choose…</option>
                    {#each field.options ?? [] as option (option)}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                {:else if field.type === "link"}
                  <input
                    id={`${uid}-field-${index}`}
                    class="sheet-input"
                    list={`${uid}-pages`}
                    value={linkValue(field)}
                    onchange={(event) => onLinkChange(field, event)}
                  />
                {:else if field.type === "number"}
                  <input
                    id={`${uid}-field-${index}`}
                    class="sheet-input"
                    type="number"
                    step="any"
                    value={sheetValue(meta, field.id)}
                    onchange={(event) => onFieldChange(field, event)}
                  />
                {:else}
                  <input
                    id={`${uid}-field-${index}`}
                    class="sheet-input"
                    type="text"
                    value={sheetValue(meta, field.id)}
                    onchange={(event) => onFieldChange(field, event)}
                  />
                {/if}
                {#if fieldError?.fieldId === field.id}
                  <p class="sheet-error" role="alert">{fieldError.message}</p>
                {/if}
              </div>
            {/each}
          </div>
          <datalist id={`${uid}-pages`}>
            {#each linkPages as page (page.id)}
              <option value={page.title}></option>
            {/each}
          </datalist>
        {:else if template}
          <p class="sheet-hint">This template has no fields yet. Pick another template or edit it in the template editor.</p>
        {:else}
          <p class="sheet-hint">Pick a template to add profile fields.</p>
        {/if}

        {#if orphanedValues.length > 0}
          <div class="sheet-orphans">
            <p class="sheet-section-label">Other fields</p>
            <p class="sheet-hint">Values without a field in this template are kept here.</p>
            <div class="sheet-fields">
              {#each orphanedValues as [key, value], index (key)}
                <div class="sheet-field wide">
                  <label class="sheet-label" for={`${uid}-orphan-${index}`}>{orphanLabel(key)}</label>
                  <input
                    id={`${uid}-orphan-${index}`}
                    class="sheet-input"
                    type="text"
                    value={value}
                    onchange={(event) => onOrphanChange(key, event)}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else if tab === "relations"}
      <div
        class="sheet-body sheet-relations"
        role="tabpanel"
        id={`${uid}-panel-relations`}
        aria-labelledby={`${uid}-tab-relations`}
      >
        {#if relationRows.length === 0}
          <p class="sheet-hint">No relations yet. Add them in the network view.</p>
        {:else}
          <ul class="relation-list">
            {#each relationRows as row (row.key)}
              <li class="relation-row">
                <span class="relation-chip" style:color={relationColors[row.relation.type]}>
                  <span class="relation-dot"></span>{RELATION_LABELS[row.relation.type]}
                </span>
                <span class="relation-arrow" aria-hidden="true">{row.incoming ? "←" : "→"}</span>
                <span class="relation-target">{row.title}</span>
                {#if row.relation.label}
                  <span class="relation-label">{row.relation.label}</span>
                {/if}
                <span class="relation-range">{chapterRange(row.relation)}</span>
              </li>
            {/each}
          </ul>
        {/if}

        <div class="relation-mini">
          <p class="sheet-section-label">Neighbourhood</p>
          {#if miniGraph.nodes.length === 0}
            <p class="sheet-hint">No connected pages yet.</p>
          {:else}
            <svg
              class="relation-mini-graph"
              viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
              role="img"
              aria-label="This page and its relations"
            >
              {#each miniGraph.edges as edge (edge.id)}
                <line
                  x1={edge.from.x}
                  y1={edge.from.y}
                  x2={edge.to.x}
                  y2={edge.to.y}
                  stroke={relationColors[edge.type]}
                  stroke-width="1.5"
                  stroke-dasharray={edge.status === "suggested" ? "3 3" : undefined}
                />
              {/each}
              {#each miniGraph.nodes as node (node.id)}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.id === document.id ? 10 : 8}
                  fill={node.id === document.id ? "var(--accent)" : "var(--surface-raised)"}
                  stroke={node.id === document.id ? "var(--accent)" : "var(--border-control)"}
                />
                <text
                  class="relation-mini-initials"
                  class:current={node.id === document.id}
                  x={node.x}
                  y={node.y + 3}
                  text-anchor="middle">{node.initials}</text
                >
                <text class="relation-mini-label" x={node.x} y={node.y + 22} text-anchor="middle"
                  >{node.label}</text
                >
              {/each}
            </svg>
          {/if}
          <button
            type="button"
            class="sheet-manage"
            onclick={() => onOpenGraphBeside?.(document.id)}
          >
            Open graph beside
          </button>
        </div>
      </div>
    {:else if tab === "appearances"}
      <div
        class="sheet-body"
        role="tabpanel"
        id={`${uid}-panel-appearances`}
        aria-labelledby={`${uid}-tab-appearances`}
      >
        <AppearanceStrip
          appearances={pageAppearances.get(document.id)}
          chapters={chapters}
          scenes={pages}
          onOpenScene={onOpenScene}
        />
      </div>
    {:else}
      <div
        class="sheet-body sheet-placeholder"
        role="tabpanel"
        id={`${uid}-panel-notes`}
        aria-labelledby={`${uid}-tab-notes`}
      >
        <p class="sheet-placeholder-title">Notes</p>
        <p class="sheet-hint">Notes are the text below.</p>
      </div>
    {/if}
  </section>
{/if}

<style>
  .character-sheet {
    margin: 0 0 12px;
    border: 1px solid var(--border-soft);
    border-radius: 8px;
    background: var(--surface);
  }

  .sheet-head {
    display: flex;
    gap: 12px;
    padding: 12px;
  }

  .sheet-portrait {
    display: flex;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-control);
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-size: 16px;
    font-weight: 600;
  }

  .sheet-identity {
    min-width: 0;
    flex: 1;
  }

  .sheet-title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .sheet-name {
    color: var(--text-heading);
    font-size: 13px;
    font-weight: 600;
  }

  .sheet-subtitle {
    color: var(--text-faint);
    font-size: 10px;
  }

  .sheet-dot {
    margin: 0 4px;
  }

  .sheet-aliases {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
  }

  .sheet-alias-label {
    margin-right: 2px;
    color: var(--text-muted);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .sheet-chip {
    display: inline-flex;
    min-height: 20px;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border: 1px solid var(--border-control);
    border-radius: 10px;
    background: var(--selected-bg);
    color: var(--selected-text);
    font-size: 10px;
  }

  .sheet-chip-x {
    display: inline-flex;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
  }

  .sheet-chip-x:hover {
    opacity: 1;
  }

  .sheet-alias-input {
    width: 90px;
    height: 22px;
    padding: 0 4px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--text-heading);
    font: inherit;
    font-size: 10px;
  }

  .sheet-tabs {
    display: flex;
    gap: 2px;
    padding: 0 12px;
    border-top: 1px solid var(--border-soft);
    border-bottom: 1px solid var(--border-soft);
  }

  .sheet-tab {
    padding: 7px 8px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }

  .sheet-tab:hover {
    color: var(--text-heading);
  }

  .sheet-tab.active {
    border-bottom-color: var(--accent);
    color: var(--text-heading);
  }

  .sheet-body {
    padding: 10px 12px 12px;
  }

  .sheet-template-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .sheet-template-row .sheet-select {
    flex: 0 1 200px;
  }

  .sheet-manage {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-family: inherit;
    font-size: 9px;
    letter-spacing: 0.3px;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .sheet-manage:hover {
    color: var(--text-primary);
  }

  .sheet-manage:focus-visible {
    outline: 2px solid var(--accent-ring);
    outline-offset: 2px;
  }

  .sheet-label {
    color: var(--text-muted);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .sheet-section-label {
    margin: 0 0 8px;
    color: var(--text-muted);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .sheet-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 9px 12px;
  }

  .sheet-field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .sheet-field.wide {
    grid-column: 1 / -1;
  }

  .sheet-input,
  .sheet-select,
  .sheet-textarea {
    width: 100%;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--surface-raised);
    color: var(--text-heading);
    font: inherit;
    font-size: 11px;
  }

  .sheet-input,
  .sheet-select {
    height: 27px;
    padding: 0 7px;
  }

  .sheet-textarea {
    min-height: 52px;
    padding: 6px 7px;
    resize: vertical;
  }

  .sheet-input:focus,
  .sheet-select:focus,
  .sheet-textarea:focus {
    border-color: var(--accent);
    outline: none;
  }

  .sheet-error {
    margin: 0;
    color: var(--danger, #b42318);
    font-size: 10px;
  }

  .sheet-hint {
    margin: 0;
    color: var(--text-faint);
    font-size: 10px;
  }

  .sheet-orphans {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed var(--border-soft);
  }

  .sheet-orphans .sheet-hint {
    margin-bottom: 8px;
  }

  .sheet-placeholder {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sheet-placeholder-title {
    margin: 0;
    color: var(--text-heading);
    font-size: 11px;
    font-weight: 600;
  }

  .sheet-add-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
  }

  .sheet-add {
    display: inline-flex;
    height: 24px;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border: 1px dashed var(--border-control);
    border-radius: 12px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 10px;
    cursor: pointer;
  }

  .sheet-add:hover {
    border-color: var(--accent);
    color: var(--text-heading);
  }

  .sheet-relations {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .relation-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .relation-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 5px;
    background: var(--surface-raised);
    font-size: 10px;
  }

  .relation-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  .relation-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .relation-arrow {
    color: var(--text-faint);
  }

  .relation-target {
    min-width: 0;
    overflow: hidden;
    color: var(--text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .relation-label {
    min-width: 0;
    overflow: hidden;
    color: var(--text-faint);
    font-style: italic;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .relation-range {
    margin-left: auto;
    flex: none;
    color: var(--text-muted);
    font-size: 9px;
  }

  .relation-mini {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }

  .relation-mini-graph {
    width: 100%;
    height: auto;
    border: 1px solid var(--border-soft);
    border-radius: 6px;
    background: var(--surface);
  }

  .relation-mini-initials {
    fill: var(--text-muted);
    font-size: 7px;
    font-weight: 600;
    pointer-events: none;
  }

  .relation-mini-initials.current {
    fill: var(--accent-contrast);
  }

  .relation-mini-label {
    fill: var(--text-muted);
    font-size: 8px;
    pointer-events: none;
  }
</style>
