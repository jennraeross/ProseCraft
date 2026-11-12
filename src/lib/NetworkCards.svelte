<script lang="ts">
  import type { DocumentData } from "./publish/types";
  import type { PageAppearances, SourcedRelation } from "./relations";
  import type { Relation, RelationType } from "./story-meta";

  type Props = {
    pages: readonly DocumentData[];
    sourcedRelations: readonly SourcedRelation[];
    titles: ReadonlyMap<string, string>;
    appearances: ReadonlyMap<string, PageAppearances>;
    onOpenCard: (pageId: string) => void;
  };

  let { pages, sourcedRelations, titles, appearances, onOpenCard }: Props = $props();

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

  type Chip = { key: string; pageId: string; type: RelationType; direction: "out" | "in" };

  const cards = $derived.by(() => {
    const byPage = new Map<string, Chip[]>();
    const addChip = (pageId: string, otherId: string, relation: Relation, direction: "out" | "in") => {
      const chips = byPage.get(pageId) ?? [];
      chips.push({ key: `${direction}:${relation.id}`, pageId: otherId, type: relation.type, direction });
      byPage.set(pageId, chips);
    };
    for (const { source, relation } of sourcedRelations) {
      addChip(source, relation.to, relation, "out");
      addChip(relation.to, source, relation, "in");
    }

    return pages.map((page) => {
      const entry = appearances.get(page.id);
      return {
        page,
        role: page.meta?.sheet?.role ?? "",
        sceneCount: entry?.sceneCount ?? 0,
        chips: (byPage.get(page.id) ?? []).slice(0, 2)
      };
    });
  });

  function initials(title: string): string {
    const words = title.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("");
  }
</script>

{#if cards.length === 0}
  <p class="cards-empty">No characters yet. Add a wiki page to the Characters folder first.</p>
{:else}
  <div class="cards-grid">
    {#each cards as card (card.page.id)}
      <button class="character-card" type="button" onclick={() => onOpenCard(card.page.id)}>
        <span class="card-head">
          <span class="card-initial" aria-hidden="true">{initials(card.page.title)}</span>
          <span class="card-ident">
            <span class="card-name">{card.page.title}</span>
            {#if card.role}<span class="card-role">{card.role}</span>{/if}
          </span>
        </span>
        <span class="card-meta">
          {card.sceneCount} {card.sceneCount === 1 ? "scene" : "scenes"}
        </span>
        {#if card.chips.length > 0}
          <span class="card-divider" aria-hidden="true"></span>
          {#each card.chips as chip (chip.key)}
            <span class="card-chip">
              <span class="chip-arrow" aria-hidden="true">{chip.direction === "out" ? "→" : "←"}</span>
              <span class="chip-name">{titles.get(chip.pageId) ?? "Unknown page"}</span>
              <span class="chip-type" style:color={relationColors[chip.type]}>{RELATION_LABELS[chip.type]}</span>
            </span>
          {/each}
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .cards-empty { margin: 0; padding: 22px 4px; color: var(--text-muted); font-size: 9.5px; }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(218px, 1fr)); gap: 9px; }
  .character-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 12px;
    border: 1px solid var(--border-soft);
    border-radius: 9px;
    background: var(--surface-raised);
    color: inherit;
    cursor: pointer;
    font-family: var(--interface-font);
    text-align: left;
    transition: border-color 120ms ease, background 120ms ease;
  }
  .character-card:hover { border-color: var(--border-control); background: var(--control-hover); }
  .card-head { display: flex; align-items: center; gap: 9px; }
  .card-initial { display: inline-flex; width: 30px; height: 30px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 50%; background: var(--accent-soft); color: var(--accent-strong); font-size: 10px; font-weight: 700; }
  .card-ident { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
  .card-name { overflow: hidden; color: var(--text-heading); font-size: 11.5px; font-weight: 600; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .card-role { overflow: hidden; color: var(--text-muted); font-size: 8.5px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
  .card-meta { color: var(--text-muted); font-size: 8.5px; }
  .card-divider { height: 1px; margin: 2px 0; background: var(--border-soft); }
  .card-chip { display: flex; align-items: center; gap: 5px; font-size: 8.5px; }
  .chip-arrow { color: var(--text-faint); font-size: 9px; }
  .chip-name { overflow: hidden; min-width: 0; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; }
  .chip-type { margin-left: auto; font-size: 7.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
</style>
