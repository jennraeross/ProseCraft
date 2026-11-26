<script lang="ts">
  import { Columns2, FileText, X } from "@lucide/svelte";
  import type { RelationGraphNode } from "./relation-graph-model";
  import type { AppearanceMode } from "./relations";
  import type { PageKind, RelationType } from "./story-meta";
  import type { MessageKey } from "$lib/i18n/catalog";
  import { t } from "$lib/i18n/state.svelte";

  type CardRelation = {
    id: string;
    type: RelationType;
    label: string;
    otherTitle: string;
    direction: "out" | "in";
  };

  type Props = {
    node: RelationGraphNode;
    appearanceCount: number;
    /** How the page appears in the open scene; `null` when it does not appear there. */
    sceneMode: AppearanceMode | null;
    /** False when the tile has no open scene, so no scene state can be shown. */
    hasScene: boolean;
    relations: readonly CardRelation[];
    onOpenPage: () => void;
    onOpenBeside: () => void;
    onClose: () => void;
  };

  let { node, appearanceCount, sceneMode, hasScene, relations, onOpenPage, onOpenBeside, onClose }: Props =
    $props();

  const kindColors: Record<PageKind, string> = {
    character: "var(--accent)",
    place: "var(--link)",
    organisation: "var(--warning)",
    item: "var(--quote)",
    other: "var(--text-muted)"
  };

  const kindNames: Record<PageKind, MessageKey> = {
    character: "pageKind.character",
    place: "pageKind.place",
    organisation: "pageKind.organisation",
    item: "pageKind.item",
    other: "pageKind.other"
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

  const relationNames: Record<RelationType, MessageKey> = {
    family: "relation.family",
    friend: "relation.friend",
    rival: "relation.rival",
    love: "relation.love",
    mentor: "relation.mentor",
    employer: "relation.employer",
    other: "relation.other"
  };

  const sceneLabel = $derived(
    sceneMode === "confirmed"
      ? t("graph.inScene")
      : sceneMode === "auto"
        ? t("graph.inSceneAuto")
        : t("graph.notInScene")
  );

  const appearanceLabel = $derived(t("common.sceneCount", { count: appearanceCount }));
</script>

<aside class="graph-node-card" data-testid="graph-node-card" aria-label={t("graph.nodeSummary", { name: node.label })}>
  <div class="card-head">
    <span class="card-avatar" style:color={kindColors[node.kind]} aria-hidden="true">{node.initials}</span>
    <span class="card-ident">
      <span class="card-name">{node.label}</span>
      <span class="card-meta">
        <span class="card-kind" style:color={kindColors[node.kind]}>{t(kindNames[node.kind])}</span>
        <span class="card-sep" aria-hidden="true">·</span>
        <span>{appearanceLabel}</span>
        {#if hasScene}
          <span class="card-sep" aria-hidden="true">·</span>
          <span class="card-scene" class:auto={sceneMode === "auto"} class:absent={sceneMode === null}>{sceneLabel}</span>
        {/if}
      </span>
    </span>
    <button type="button" class="card-close" aria-label={t("common.close")} title={t("common.close")} onclick={onClose}>
      <X size={12} />
    </button>
  </div>

  {#if relations.length > 0}
    <ul class="card-relations" aria-label={t("graph.relations")}>
      {#each relations as relation (relation.id)}
        <li class="card-chip" style:--relation-color={relationColors[relation.type]}>
          <span class="chip-type">{relation.direction === "out" ? "→" : "←"} {relation.label || t(relationNames[relation.type])}</span>
          <span class="chip-name" title={relation.otherTitle}>{relation.otherTitle}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="card-actions">
    <button type="button" class="card-action" onclick={onOpenPage}>
      <FileText size={11} />
      {t("graph.openPage")}
    </button>
    <button type="button" class="card-action" onclick={onOpenBeside}>
      <Columns2 size={11} />
      {t("ctx.openBeside")}
    </button>
  </div>
</aside>

<style>
  .graph-node-card {
    position: absolute;
    right: 10px;
    bottom: 10px;
    left: 10px;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 7px;
    max-width: 520px;
    max-height: calc(100% - 20px);
    padding: 9px 10px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-card);
    font-family: var(--interface-font);
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-avatar {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    background: var(--surface);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
  }

  .card-ident {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .card-name {
    overflow: hidden;
    color: var(--text-heading);
    font-size: 11.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    color: var(--text-muted);
    font-size: 9px;
  }

  .card-kind {
    font-weight: 600;
  }

  .card-sep {
    opacity: 0.6;
  }

  .card-scene {
    color: var(--success);
  }

  .card-scene.auto {
    color: var(--text-muted);
  }

  .card-scene.absent {
    color: var(--text-muted);
  }

  .card-close {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .card-close:hover {
    background: var(--control-hover);
    color: var(--text-primary);
  }

  .card-relations {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--relation-color) 40%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--relation-color) 10%, transparent);
    font-size: 8.5px;
    line-height: 1.3;
  }

  .chip-type {
    flex: 0 0 auto;
    color: var(--relation-color);
    font-weight: 600;
  }

  .chip-name {
    overflow: hidden;
    color: var(--text-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-actions {
    display: flex;
    gap: 6px;
  }

  .card-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--border-control);
    border-radius: 6px;
    background: var(--control-bg);
    color: var(--text-body);
    font-family: var(--interface-font);
    font-size: 9px;
    cursor: pointer;
  }

  .card-action:hover {
    background: var(--control-hover);
    border-color: var(--accent);
    color: var(--text-heading);
  }
</style>
