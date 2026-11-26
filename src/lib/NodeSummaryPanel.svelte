<script lang="ts">
  import { FileText, Plus, X } from "@lucide/svelte";
  import type { PageKind, RelationType } from "./story-meta";
  import type { MessageKey } from "$lib/i18n/catalog";
  import { t } from "$lib/i18n/state.svelte";

  type SummaryRelation = {
    id: string;
    type: RelationType;
    label: string;
    otherTitle: string;
    direction: "out" | "in";
  };

  type Props = {
    title: string;
    kind: PageKind;
    aliases: readonly string[];
    appearanceCount: number;
    relations: readonly SummaryRelation[];
    onOpenPage: () => void;
    onOpenCard: () => void;
    onAddRelation: () => void;
    onClose: () => void;
  };

  let {
    title,
    kind,
    aliases,
    appearanceCount,
    relations,
    onOpenPage,
    onOpenCard,
    onAddRelation,
    onClose
  }: Props = $props();

  const KIND_LABELS: Record<PageKind, MessageKey> = {
    character: "pageKind.character",
    place: "pageKind.place",
    organisation: "pageKind.organisation",
    item: "pageKind.item",
    other: "pageKind.other"
  };

  const KIND_COLORS: Record<PageKind, string> = {
    character: "var(--accent)",
    place: "var(--link)",
    organisation: "var(--warning)",
    item: "var(--quote)",
    other: "var(--text-muted)"
  };

  const TYPE_LABELS: Record<RelationType, MessageKey> = {
    family: "relation.family",
    friend: "relation.friend",
    rival: "relation.rival",
    love: "relation.love",
    mentor: "relation.mentor",
    employer: "relation.employer",
    other: "relation.other"
  };

  const TYPE_COLORS: Record<RelationType, string> = {
    family: "var(--accent)",
    friend: "var(--success)",
    rival: "var(--danger)",
    love: "var(--quote)",
    mentor: "var(--link)",
    employer: "var(--warning)",
    other: "var(--text-muted)"
  };

  const appearanceLabel = $derived(t("common.sceneCount", { count: appearanceCount }));
</script>

<aside class="node-summary" data-testid="node-summary" aria-label={t("graph.nodeSummary", { name: title })}>
  <header class="node-summary-head">
    <div>
      <p class="node-summary-eyebrow">{t("nodeSummary.selected")}</p>
      <h2>{title}</h2>
      <p class="node-summary-meta">
        <span class="node-summary-kind" style={`--kind-color: ${KIND_COLORS[kind]}`}>
          {t(KIND_LABELS[kind])}
        </span>
        <span class="node-summary-divider">·</span>
        <span>{appearanceLabel}</span>
      </p>
    </div>
    <button type="button" class="node-summary-close" aria-label={t("common.close")} onclick={onClose}>
      <X size={13} aria-hidden="true" />
    </button>
  </header>

  {#if aliases.length > 0}
    <div class="node-summary-field">
      <span class="node-summary-label">{t("nodeSummary.aliases")}</span>
      <div class="node-summary-aliases">
        {#each aliases as alias (alias)}
          <span class="node-summary-alias">{alias}</span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="node-summary-field">
    <span class="node-summary-label">{t("nodeSummary.relations", { count: relations.length })}</span>
    {#if relations.length === 0}
      <p class="node-summary-empty">{t("nodeSummary.noRelations")}</p>
    {:else}
      <ul class="node-summary-relations">
        {#each relations as relation (relation.id)}
          <li class="node-summary-relation">
            <span
              class="node-summary-dot"
              style={`--relation-color: ${TYPE_COLORS[relation.type]}`}
            ></span>
            <span class="node-summary-relation-text">
              <span class="node-summary-relation-name">{relation.otherTitle}</span>
              <span class="node-summary-relation-type" style={`color: ${TYPE_COLORS[relation.type]}`}>
                {relation.direction === "out" ? "→" : "←"}
                {relation.label || t(TYPE_LABELS[relation.type])}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="node-summary-actions">
    <button type="button" class="node-summary-primary" onclick={onOpenPage}>
      <FileText size={12} aria-hidden="true" /> {t("graph.openPage")}
    </button>
    <button type="button" class="node-summary-secondary" onclick={onOpenCard}>
      {t("ctx.openCharacterCard")}
    </button>
    <button type="button" class="node-summary-secondary" onclick={onAddRelation}>
      <Plus size={12} aria-hidden="true" /> {t("nodeSummary.addRelation")}
    </button>
  </div>
</aside>

<style>
  .node-summary {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .node-summary-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .node-summary-eyebrow { margin: 0; color: var(--text-muted); font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .node-summary-head h2 { margin: 5px 0 0; color: var(--text-heading); font-family: var(--writing-font); font-size: 13px; font-weight: 600; line-height: 1.45; }
  .node-summary-meta { display: flex; align-items: baseline; gap: 5px; margin: 6px 0 0; color: var(--text-muted); font-size: 8px; }
  .node-summary-kind { color: var(--kind-color); font-weight: 700; }
  .node-summary-divider { color: var(--text-faint); }

  .node-summary-close {
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
  .node-summary-close:hover { background: var(--surface-raised); color: var(--text-heading); }

  .node-summary-field { display: block; }
  .node-summary-label { display: block; margin-bottom: 5px; color: var(--text-muted); font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }

  .node-summary-aliases { display: flex; flex-wrap: wrap; gap: 4px; }
  .node-summary-alias {
    padding: 1px 7px;
    border: 1px solid var(--border-control);
    border-radius: 10px;
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: 9px;
  }

  .node-summary-relations { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .node-summary-relation { display: flex; align-items: flex-start; gap: 6px; padding: 4px 6px; border-radius: 5px; background: var(--surface-raised); }
  .node-summary-dot { flex: 0 0 auto; width: 6px; height: 6px; margin-top: 4px; border-radius: 50%; background: var(--relation-color); }
  .node-summary-relation-text { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
  .node-summary-relation-name { overflow: hidden; color: var(--text-heading); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .node-summary-relation-type { font-size: 8px; }

  .node-summary-empty { margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; }

  .node-summary-actions { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
  .node-summary-primary {
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
  .node-summary-primary:hover { background: var(--accent-strong-hover); }
  .node-summary-secondary {
    display: flex;
    height: 28px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 10px;
  }
  .node-summary-secondary:hover { color: var(--text-heading); border-color: var(--accent-soft); }
</style>
