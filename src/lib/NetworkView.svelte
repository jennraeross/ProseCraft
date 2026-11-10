<script lang="ts">
  import { Lightbulb, Plus, RotateCcw } from "@lucide/svelte";
  import { untrack } from "svelte";
  import NetworkCards from "./NetworkCards.svelte";
  import NetworkMatrix from "./NetworkMatrix.svelte";
  import NetworkSuggestions from "./NetworkSuggestions.svelte";
  import RelationDetailPanel from "./RelationDetailPanel.svelte";
  import RelationGraph from "./RelationGraph.svelte";
  import { layoutGraph, type GraphPoint } from "./graph-layout";
  import { relationBoundaryIndexes } from "./network-timeline";
  import type { ChapterData, DocumentData, ResearchFolder } from "./publish/types";
  import { buildRelationGraph } from "./relation-graph-model";
  import { appearances, characterPages, pageKind, relationsOf, suggestRelations, type PagePair } from "./relations";
  import { PAGE_KINDS, RELATION_TYPES, type PageKind, type RelationType } from "./story-meta";

  type Props = {
    documents: readonly DocumentData[];
    chapters: readonly ChapterData[];
    folders: readonly ResearchFolder[];
    onChange: (documents: DocumentData[]) => void;
    onOpenPage: (id: string) => void;
    onOpenGraphBeside?: (id: string) => void;
    dismissedSuggestions?: readonly string[];
    onDismissSuggestion: (key: string) => void;
  };

  let {
    documents,
    chapters,
    folders,
    onChange,
    onOpenPage,
    onOpenGraphBeside,
    dismissedSuggestions = [],
    onDismissSuggestion
  }: Props = $props();

  type ViewMode = "cards" | "network" | "matrix";

  const VIEWS: readonly { id: ViewMode; label: string }[] = [
    { id: "cards", label: "Cards" },
    { id: "network", label: "Network" },
    { id: "matrix", label: "Matrix" }
  ];

  const KIND_LABELS: Record<PageKind, string> = {
    character: "Characters",
    place: "Places",
    organisation: "Organisations",
    item: "Items",
    other: "Other"
  };

  const RELATION_LABELS: Record<RelationType, string> = {
    family: "Family",
    friend: "Friend",
    rival: "Rival",
    love: "Love",
    mentor: "Mentor",
    employer: "Employer",
    other: "Other"
  };

  let view = $state<ViewMode>("network");
  let kindFilter = $state<PageKind | "all">("all");
  let typeFilter = $state<RelationType | "all">("all");
  let allChapters = $state(true);
  let chapterIndex = $state(0);
  let selectedId = $state<string | null>(null);
  let selectedEdgeId = $state<string | null>(null);
  let addingRelation = $state(false);
  let showSuggestions = $state(false);
  let suggestionTargetId = $state<string | null>(null);
  let positions = $state<Record<string, GraphPoint>>({});
  let seed = $state(1);
  let lastLayoutKey = "";

  const wikiPages = $derived(documents.filter((doc) => doc.space === "Wiki" && !doc.trashed));
  const characters = $derived(characterPages(documents, folders));
  const sourcedRelations = $derived(relationsOf(documents));
  const pageAppearances = $derived(appearances(documents, chapters, folders));
  const suggestions = $derived(suggestRelations(pageAppearances, sourcedRelations, dismissedSuggestions));
  const pageTitles = $derived(new Map(wikiPages.map((page) => [page.id, page.title])));
  const matrixPages = $derived(
    wikiPages
      .filter((page) => kindFilter === "all" || pageKind(page, folders) === kindFilter)
      .sort((left, right) => left.title.localeCompare(right.title))
  );

  const sceneChapters = $derived.by(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      if (!doc.trashed && doc.space !== "Wiki" && doc.chapterId) map.set(doc.id, doc.chapterId);
    }
    return map;
  });

  const lastChapterIndex = $derived(Math.max(0, chapters.length - 1));
  const activeChapterIndex = $derived(Math.min(chapterIndex, lastChapterIndex));
  const activeChapterId = $derived(
    allChapters ? null : (chapters[activeChapterIndex]?.id ?? null)
  );

  const graph = $derived.by(() => {
    const model = buildRelationGraph({
      pages: wikiPages.map((page) => ({
        id: page.id,
        title: page.title,
        kind: pageKind(page, folders)
      })),
      relations: sourcedRelations,
      appearances: pageAppearances,
      suggestions,
      chapters,
      chapterId: activeChapterId,
      sceneChapters,
      kinds: kindFilter === "all" ? undefined : [kindFilter]
    });
    if (typeFilter === "all") return model;
    return {
      nodes: model.nodes,
      edges: model.edges.filter(
        (edge) => edge.status === "declared" && edge.type === typeFilter
      )
    };
  });

  const declaredCount = $derived(graph.edges.filter((edge) => edge.status === "declared").length);
  const boundaries = $derived(relationBoundaryIndexes(sourcedRelations, chapters));
  const structureKey = $derived(
    graph.nodes.map((node) => node.id).join("\u0000") +
      "|" +
      graph.edges.map((edge) => edge.id).join("\u0000")
  );
  const chapterLabel = $derived(
    chapters.length === 0
      ? "No chapters"
      : `Ch ${activeChapterIndex + 1} of ${chapters.length}`
  );
  const summary = $derived(
    `${graph.nodes.length} ${graph.nodes.length === 1 ? "page" : "pages"} · ` +
      `${graph.edges.length} ${graph.edges.length === 1 ? "edge" : "edges"} · ` +
      `${allChapters ? "all chapters" : chapterLabel}`
  );

  const selectedRelation = $derived.by(() => {
    if (!selectedEdgeId) return null;
    if (!graph.edges.some((edge) => edge.id === selectedEdgeId)) return null;
    return (
      sourcedRelations.find(
        (item) => `declared:${item.source}:${item.relation.id}` === selectedEdgeId
      ) ?? null
    );
  });
  const showRelationPanel = $derived(addingRelation || selectedRelation !== null);

  $effect(() => {
    const key = structureKey;
    if (key === lastLayoutKey) return;
    lastLayoutKey = key;
    const nodes = graph.nodes.map((node) => ({ id: node.id }));
    const edges = graph.edges.map((edge) => ({ from: edge.from, to: edge.to }));
    // Keep positions of pages hidden by the chapter filter so they do not jump
    // when the reader scrubs back to a chapter they appear in.
    const placed = untrack(() => layoutGraph(nodes, edges, { previous: positions }));
    positions = { ...untrack(() => positions), ...placed };
  });

  function relayout(): void {
    seed += 1;
    lastLayoutKey = structureKey;
    positions = layoutGraph(
      graph.nodes.map((node) => ({ id: node.id })),
      graph.edges.map((edge) => ({ from: edge.from, to: edge.to })),
      { seed }
    );
  }

  function moveNode(id: string, position: GraphPoint): void {
    positions = { ...positions, [id]: position };
  }

  function selectNode(id: string | null): void {
    selectedId = id;
    selectedEdgeId = null;
    addingRelation = false;
  }

  function selectEdge(id: string | null): void {
    selectedEdgeId = id;
    selectedId = null;
    addingRelation = false;
  }

  function startAddingRelation(): void {
    selectedEdgeId = null;
    suggestionTargetId = null;
    addingRelation = true;
  }

  /** Prefills relation creation for a suggested pair; the user still confirms the type. */
  function acceptSuggestion(pair: PagePair): void {
    selectedId = pair.a;
    startAddingRelation();
    suggestionTargetId = pair.b;
    showSuggestions = false;
  }

  function closeRelationPanel(): void {
    addingRelation = false;
    selectedEdgeId = null;
    suggestionTargetId = null;
  }

  function toggleSuggestions(): void {
    showSuggestions = !showSuggestions;
  }

  function selectCreatedRelation(sourceId: string, relationId: string): void {
    selectedId = null;
    addingRelation = false;
    selectedEdgeId = `declared:${sourceId}:${relationId}`;
  }

  function setChapter(value: number): void {
    chapterIndex = value;
  }
</script>

<section class="network-view" aria-label="Relationship network">
  <header class="network-header">
    <div>
      <div class="network-eyebrow">WIKI · NETWORK</div>
      <h1>Network</h1>
      <p>{summary}</p>
    </div>
    <div class="network-header-actions">
      <div class="network-legend" aria-hidden="true">
        <span class="network-legend-item"><i class="legend-line declared"></i>Declared</span>
        <span class="network-legend-item"><i class="legend-line suggested"></i>Suggested</span>
      </div>
      <button
        class="network-action network-suggestions-toggle"
        class:active={showSuggestions}
        type="button"
        aria-pressed={showSuggestions}
        onclick={toggleSuggestions}
      >
        <Lightbulb size={12} aria-hidden="true" /> Suggestions
        <span class="network-suggestions-badge">{suggestions.length}</span>
      </button>
      <button
        class="network-add"
        type="button"
        disabled={wikiPages.length < 2}
        onclick={startAddingRelation}
      >
        <Plus size={12} aria-hidden="true" /> Add relation
      </button>
      <button
        class="network-add"
        type="button"
        disabled={!selectedId}
        onclick={() => selectedId && onOpenGraphBeside?.(selectedId)}
      >
        Open graph beside
      </button>
    </div>
  </header>

  <div class="network-toolbar">
    <div class="network-switch" role="tablist" aria-label="Network view">
      {#each VIEWS as item (item.id)}
        <button
          class="network-switch-button"
          class:active={view === item.id}
          role="tab"
          aria-selected={view === item.id}
          type="button"
          onclick={() => (view = item.id)}
        >{item.label}</button>
      {/each}
    </div>
    <div class="network-filters">
      <label class="network-filter">
        <span>Kind</span>
        <select bind:value={kindFilter}>
          <option value="all">All</option>
          {#each PAGE_KINDS as kind (kind)}
            <option value={kind}>{KIND_LABELS[kind]}</option>
          {/each}
        </select>
      </label>
      <label class="network-filter">
        <span>Type</span>
        <select bind:value={typeFilter}>
          <option value="all">All</option>
          {#each RELATION_TYPES as type (type)}
            <option value={type}>{RELATION_LABELS[type]}</option>
          {/each}
        </select>
      </label>
      <button
        class="network-action"
        type="button"
        disabled={graph.nodes.length === 0}
        onclick={relayout}
      ><RotateCcw size={12} aria-hidden="true" /> Re-layout</button>
    </div>
  </div>

  {#if view === "matrix"}
    <NetworkMatrix
      pages={matrixPages}
      {sourcedRelations}
      {chapters}
      chapterId={activeChapterId}
      {onOpenPage}
    />
  {:else if characters.length === 0}
    <div class="network-empty">
      <strong>No character pages yet</strong>
      <p>Create a page in the Characters folder to start mapping relationships.</p>
    </div>
  {:else if view === "cards"}
    <NetworkCards
      pages={characters}
      {sourcedRelations}
      titles={pageTitles}
      appearances={pageAppearances}
      {onOpenPage}
    />
  {:else}
    <div class="network-body" class:with-panel={showRelationPanel}>
      <div class="network-graph">
        {#key allChapters}
          <RelationGraph
            nodes={graph.nodes}
            edges={graph.edges}
            {positions}
            {selectedId}
            {selectedEdgeId}
            mode={allChapters ? "all" : "chapter"}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onMoveNode={moveNode}
            {onOpenPage}
          />
        {/key}
        {#if showSuggestions}
          <NetworkSuggestions
            {suggestions}
            titles={pageTitles}
            onAccept={acceptSuggestion}
            onDismiss={onDismissSuggestion}
            onClose={() => (showSuggestions = false)}
          />
        {/if}
      </div>

      {#if showRelationPanel}
        <RelationDetailPanel
          {documents}
          {chapters}
          pages={wikiPages}
          selection={selectedRelation}
          adding={addingRelation}
          defaultSourceId={selectedId}
          defaultTargetId={suggestionTargetId}
          {onChange}
          {onOpenPage}
          onCreated={selectCreatedRelation}
          onClose={closeRelationPanel}
        />
      {/if}
    </div>
  {/if}

  {#if view === "matrix" || characters.length > 0}
    <div class="network-chapters">
      <div class="network-chapter-head">
        <span class="network-eyebrow">Chapter</span>
        <button
          class="network-all"
          class:active={allChapters}
          type="button"
          aria-pressed={allChapters}
          onclick={() => (allChapters = !allChapters)}
        >All chapters</button>
        <span class="network-chapter-value">{allChapters ? "All" : chapterLabel}</span>
        <span class="network-count">{declaredCount} declared</span>
      </div>
      <div class="chapter-slider">
        <input
          class="chapter-range"
          type="range"
          min="0"
          max={lastChapterIndex}
          step="1"
          value={activeChapterIndex}
          aria-label="Chapter"
          disabled={allChapters || chapters.length === 0}
          oninput={(event) => setChapter(Number(event.currentTarget.value))}
        />
        <div class="chapter-marks" aria-hidden="true">
          {#each boundaries as boundary (boundary)}
            {#if boundary > 0 && boundary <= lastChapterIndex}
              <span
                class="chapter-mark"
                style:left={`${(boundary / Math.max(1, lastChapterIndex)) * 100}%`}
                title={`Relation change at chapter ${boundary + 1}`}
              ></span>
            {/if}
          {/each}
        </div>
      </div>
      {#if view !== "matrix"}
        <p class="network-hint">
          {view === "cards"
            ? "Click a card to open its page."
            : "Drag to rearrange · scroll to zoom · double-click a page to open it"}
        </p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .network-view {
    display: flex;
    width: min(100%, 1120px);
    flex: 1;
    flex-direction: column;
    padding-bottom: 12px;
  }
  .network-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border-soft);
  }
  .network-eyebrow { color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; }
  .network-header h1 { margin: 6px 0 5px; color: var(--text-heading); font-family: var(--interface-font); font-size: 28px; font-weight: 500; letter-spacing: -.5px; }
  .network-header p { margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.6; }
  .network-header-actions { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
  .network-legend { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; padding-bottom: 2px; color: var(--text-muted); font-size: 8px; }
  .network-legend-item { display: inline-flex; align-items: center; gap: 5px; }
  .legend-line { display: inline-block; width: 16px; height: 0; border-top: 1.5px solid var(--text-muted); }
  .legend-line.suggested { border-top-style: dashed; opacity: .7; }
  .network-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .network-switch, .network-filters { display: flex; align-items: center; gap: 5px; }
  .network-switch { padding: 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); }
  .network-switch-button { height: 26px; padding: 0 11px; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; }
  .network-switch-button:hover { color: var(--text-primary); }
  .network-switch-button.active { background: var(--selected-bg); color: var(--selected-text); font-weight: 600; }
  .network-filters { gap: 8px; }
  .network-filter { display: inline-flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: 9px; }
  .network-filter select { height: 27px; padding: 0 6px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-nav); font-size: 9px; }
  .network-action { display: inline-flex; height: 27px; align-items: center; gap: 5px; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 9px; }
  .network-action:hover:not(:disabled) { background: var(--control-hover); color: var(--selected-text); }
  .network-action:disabled { opacity: .45; cursor: default; }
  .network-suggestions-toggle.active { border-color: var(--accent-soft); background: var(--selected-bg); color: var(--selected-text); }
  .network-suggestions-badge { display: inline-flex; min-width: 14px; height: 14px; align-items: center; justify-content: center; padding: 0 3px; border-radius: 7px; background: var(--accent-soft); color: var(--accent-strong); font-size: 7.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .network-add { display: inline-flex; height: 27px; align-items: center; gap: 5px; padding: 0 10px; border: 1px solid transparent; border-radius: 5px; background: var(--accent-strong); color: var(--accent-contrast); cursor: pointer; font-size: 9px; font-weight: 600; }
  .network-add:hover:not(:disabled) { background: var(--accent-strong-hover); }
  .network-add:disabled { opacity: .45; cursor: default; }
  .network-body { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 12px; }
  .network-body.with-panel { grid-template-columns: minmax(0, 1fr) 298px; }
  .network-graph { position: relative; width: 100%; min-width: 0; }
  .network-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 360px; padding: 24px; border: 1px dashed var(--border); border-radius: 9px; color: var(--text-muted); text-align: center; }
  .network-empty strong { color: var(--text-heading); font-family: var(--interface-font); font-size: 15px; font-weight: 500; }
  .network-empty p { margin: 0; font-size: 10px; line-height: 1.6; }
  .network-chapters { margin-top: 10px; padding: 10px 12px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
  .network-chapter-head { display: flex; align-items: center; gap: 9px; }
  .network-all { height: 24px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-muted); cursor: pointer; font-size: 8px; }
  .network-all:hover { color: var(--text-primary); }
  .network-all.active { border-color: var(--accent-soft); background: var(--selected-bg); color: var(--selected-text); font-weight: 600; }
  .network-chapter-value { color: var(--text-nav); font-size: 9px; font-variant-numeric: tabular-nums; }
  .network-count { margin-left: auto; color: var(--text-muted); font-size: 8px; }
  .chapter-slider { position: relative; margin-top: 8px; }
  .chapter-range { width: 100%; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
  .chapter-range:disabled { opacity: .4; cursor: default; }
  .chapter-marks { position: absolute; top: 50%; right: 7px; left: 7px; height: 0; pointer-events: none; }
  .chapter-mark { position: absolute; top: -5px; width: 2px; height: 10px; border-radius: 1px; background: var(--accent-soft); transform: translateX(-50%); }
  .network-hint { margin: 6px 0 0; color: var(--text-muted); font-size: 8px; }
</style>
