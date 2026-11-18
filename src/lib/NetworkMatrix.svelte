<script lang="ts">
  import type { ChapterData, DocumentData } from "./publish/types";
  import type { SourcedRelation } from "./relations";
  import { relationActiveAt } from "./relations";
  import type { RelationType } from "./story-meta";

  type Props = {
    pages: readonly DocumentData[];
    sourcedRelations: readonly SourcedRelation[];
    chapters: readonly ChapterData[];
    /** Chapter whose relations are shown; `null` shows every chapter. */
    chapterId: string | null;
    onOpenPage: (pageId: string) => void;
  };

  let { pages, sourcedRelations, chapters, chapterId, onOpenPage }: Props = $props();

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

  type Dot = { key: string; type: RelationType; label: string };

  const cells = $derived.by(() => {
    const active = chapterId
      ? sourcedRelations.filter(({ relation }) => relationActiveAt(relation, chapterId, chapters))
      : sourcedRelations;
    const map = new Map<string, Dot[]>();
    for (const { source, relation } of active) {
      const key = `${source}\u0000${relation.to}`;
      const dots = map.get(key) ?? [];
      dots.push({ key: relation.id, type: relation.type, label: relation.label ?? "" });
      map.set(key, dots);
    }
    return map;
  });

  const legend = $derived.by(() => {
    const types = new Set<RelationType>();
    for (const { relation } of sourcedRelations) types.add(relation.type);
    return [...types].sort((left, right) => RELATION_LABELS[left].localeCompare(RELATION_LABELS[right]));
  });

  function cellDots(from: string, to: string): Dot[] {
    return cells.get(`${from}\u0000${to}`) ?? [];
  }

  function initials(title: string): string {
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");
  }
</script>

{#if pages.length === 0}
  <p class="matrix-empty">No pages to compare yet.</p>
{:else}
  <div class="matrix-scroll">
    <div
      class="matrix"
      style:grid-template-columns={`minmax(120px, 172px) repeat(${pages.length}, 24px)`}
    >
      <span class="matrix-corner">Page</span>
      {#each pages as page (page.id)}
        <span class="matrix-col" title={page.title}>{initials(page.title)}</span>
      {/each}
      {#each pages as row (row.id)}
        <button class="matrix-row" type="button" title={row.title} onclick={() => onOpenPage(row.id)}>
          {row.title}
        </button>
        {#each pages as column (column.id)}
          {@const dots = cellDots(row.id, column.id)}
          <span class="matrix-cell" class:matrix-diagonal={row.id === column.id}>
            {#each dots as dot (dot.key)}
              <span
                class="matrix-dot"
                style:background={relationColors[dot.type]}
                title={`${row.title} → ${column.title}: ${dot.label || RELATION_LABELS[dot.type]}`}
              ></span>
            {/each}
          </span>
        {/each}
      {/each}
    </div>
  </div>
  <p class="matrix-hint">Rows are the relation source, columns the target. Hover a dot for its label.</p>
  {#if legend.length > 0}
    <ul class="matrix-legend">
      {#each legend as type (type)}
        <li><span class="legend-dot" style:background={relationColors[type]}></span>{RELATION_LABELS[type]}</li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .matrix-empty { margin: 0; padding: 22px 4px; color: var(--text-muted); font-size: 9.5px; }
  .matrix-scroll { max-height: 540px; overflow: auto; border: 1px solid var(--border-soft); border-radius: 9px; background: var(--surface-raised); }
  .matrix { display: grid; align-items: stretch; width: max-content; min-width: 100%; }
  .matrix-corner { position: sticky; top: 0; left: 0; z-index: 2; display: flex; align-items: flex-end; padding: 7px 9px; background: var(--surface-raised); border-bottom: 1px solid var(--border-soft); color: var(--text-faint); font-size: 7.5px; letter-spacing: 0.06em; text-transform: uppercase; }
  .matrix-col { position: sticky; top: 0; z-index: 1; display: flex; align-items: flex-end; justify-content: center; height: 34px; padding-bottom: 6px; background: var(--surface-raised); border-bottom: 1px solid var(--border-soft); color: var(--text-muted); font-size: 7.5px; font-weight: 600; }
  .matrix-row { position: sticky; left: 0; z-index: 1; overflow: hidden; padding: 0 9px; border: 0; border-bottom: 1px solid var(--border-soft); background: var(--surface-raised); color: var(--text-primary); cursor: pointer; font-family: var(--interface-font); font-size: 9px; line-height: 22px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
  .matrix-row:hover { color: var(--accent-strong); text-decoration: underline; }
  .matrix-cell { display: flex; align-items: center; justify-content: center; gap: 2px; height: 22px; border-bottom: 1px solid var(--border-soft); }
  .matrix-diagonal { background: var(--surface); }
  .matrix-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; }
  .matrix-hint { margin: 7px 0 0; color: var(--text-faint); font-size: 8px; }
  .matrix-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 7px 0 0; padding: 0; list-style: none; }
  .matrix-legend li { display: flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: 8px; }
  .legend-dot { width: 6px; height: 6px; border-radius: 50%; }
</style>
