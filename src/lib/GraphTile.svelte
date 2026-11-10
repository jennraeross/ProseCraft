<script lang="ts">
  import { untrack } from "svelte";
  import type { ChapterData, DocumentData, ResearchFolder } from "./publish/types";
  import { graphTileModel } from "./graph-tile";
  import { layoutGraph, type GraphPoint } from "./graph-layout";
  import RelationGraph from "./RelationGraph.svelte";
  import { buildRelationGraph } from "./relation-graph-model";
  import { appearances } from "./relations";

  let {
    documents,
    chapters,
    folders,
    sceneId = null,
    pageId = null,
    onConfirm,
    onOpenPage
  }: {
    documents: DocumentData[];
    chapters: ChapterData[];
    folders: ResearchFolder[];
    sceneId?: string | null;
    pageId?: string | null;
    onConfirm: (pageId: string) => void;
    onOpenPage: (id: string) => void;
  } = $props();

  const tile = $derived(graphTileModel({ documents, chapters, folders, sceneId, pageId }));
  const pageAppearances = $derived(appearances(documents, chapters, folders));
  const graph = $derived(buildRelationGraph({
    pages: tile.pages,
    relations: tile.relations,
    appearances: pageAppearances,
    suggestions: [],
    chapters,
    chapterId: null
  }));
  const highlightIds = $derived(tile.characters.map((entry) => entry.id));
  const title = $derived(pageId
    ? `Graph: ${documents.find((doc) => doc.id === pageId)?.title ?? "page"}`
    : "Graph: characters in this scene");
  const emptyText = $derived(pageId
    ? "This page has no relations yet."
    : tile.sceneId
      ? "No characters detected in this scene yet."
      : "Open a scene to see its character graph.");

  const structureKey = $derived(
    `${graph.nodes.map((node) => node.id).join("\u0000")}|${graph.edges.map((edge) => edge.id).join("\u0000")}`
  );

  let positions = $state<Record<string, GraphPoint>>({});
  let lastLayoutKey = "";
  let selectedId = $state<string | null>(null);

  $effect(() => {
    const key = structureKey;
    if (key === lastLayoutKey) return;
    lastLayoutKey = key;
    const previous = untrack(() => positions);
    positions = layoutGraph(
      graph.nodes.map((node) => ({ id: node.id })),
      graph.edges.map((edge) => ({ from: edge.from, to: edge.to })),
      { previous }
    );
  });

  function moveNode(id: string, position: GraphPoint): void {
    positions = { ...positions, [id]: position };
  }
</script>

<section class="graph-tile" aria-label={title}>
  <h2 class="graph-tile-title">{title}</h2>
  {#if graph.nodes.length > 0}
    <div class="graph-area">
      <RelationGraph
        nodes={graph.nodes}
        edges={graph.edges}
        {positions}
        {selectedId}
        {highlightIds}
        dimOthers
        compact
        onSelectNode={(id) => (selectedId = id)}
        onSelectEdge={() => {}}
        onMoveNode={moveNode}
        {onOpenPage}
      />
    </div>
  {:else}
    <p class="graph-tile-empty">{emptyText}</p>
  {/if}
  {#if tile.suggestions.length > 0}
    <ul class="graph-suggestions" aria-label="Suggested characters">
      {#each tile.suggestions as character (character.id)}
        <li>
          <span class="graph-suggestion-text">Suggested: {character.label} appears here (add?)</span>
          <button type="button" onclick={() => onConfirm(character.id)}>Confirm</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .graph-tile { display: flex; height: 100%; min-height: 0; flex-direction: column; }
  .graph-tile-title { margin: 0; padding: 10px 14px 8px; color: var(--text-heading); font-size: 13px; }
  .graph-area { min-height: 0; flex: 1; }
  .graph-tile-empty { margin: 0; padding: 8px 14px 14px; color: var(--text-muted); font-size: 12px; }
  .graph-suggestions { display: flex; max-height: 40%; flex: 0 0 auto; flex-direction: column; gap: 6px; margin: 0; padding: 8px 14px 12px; overflow: auto; list-style: none; border-top: 1px solid var(--border-soft); }
  .graph-suggestions li { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: 1px solid var(--border-soft); border-radius: 7px; background: var(--surface-raised); }
  .graph-suggestion-text { min-width: 0; flex: 1; color: var(--text-secondary); font-size: 11px; }
  .graph-suggestions button { height: 24px; flex: none; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-size: 11px; }
  .graph-suggestions button:hover { border-color: var(--accent); color: var(--text-heading); }
</style>
