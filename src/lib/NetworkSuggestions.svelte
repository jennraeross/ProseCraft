<script lang="ts">
  import { Lightbulb, X } from "@lucide/svelte";
  import type { PagePair } from "./relations";
  import { RELATION_TYPES, type RelationType } from "./story-meta";
  import {
    defaultSuggestionChoice,
    type SuggestionChoice,
    type SuggestionDirection
  } from "./suggestion-accept";

  type Props = {
    suggestions: readonly PagePair[];
    titles: ReadonlyMap<string, string>;
    onAccept: (pair: PagePair, choice: SuggestionChoice) => void;
    onDismiss: (key: string) => void;
    onClose: () => void;
  };

  let { suggestions, titles, onAccept, onDismiss, onClose }: Props = $props();

  const TYPE_LABELS: Record<RelationType, string> = {
    family: "Family",
    friend: "Friend",
    rival: "Rival",
    love: "Love",
    mentor: "Mentor",
    employer: "Employer",
    other: "Other"
  };

  let openKey = $state<string | null>(null);
  let type = $state<RelationType>("other");
  let label = $state("");
  let direction = $state<SuggestionDirection>("a-to-b");

  function toggleForm(pair: PagePair): void {
    if (openKey === pair.key) {
      openKey = null;
      return;
    }
    const choice = defaultSuggestionChoice();
    openKey = pair.key;
    type = choice.type;
    label = choice.label;
    direction = choice.direction;
  }

  function create(pair: PagePair): void {
    onAccept(pair, { type, label, direction });
    openKey = null;
  }

  function pairTitle(pair: PagePair): string {
    return `${titles.get(pair.a) ?? "Unknown page"} and ${titles.get(pair.b) ?? "Unknown page"}`;
  }

  function pageTitle(id: string): string {
    return titles.get(id) ?? "Unknown page";
  }

  function reason(pair: PagePair): string {
    return `Appear together in ${pair.count} ${pair.count === 1 ? "scene" : "scenes"}`;
  }
</script>

<aside class="suggestions-panel" aria-label="Relation suggestions">
  <header class="suggestions-head">
    <span class="suggestions-icon"><Lightbulb size={12} aria-hidden="true" /></span>
    <h2>Suggestions</h2>
    <span class="suggestions-badge">{suggestions.length}</span>
    <button class="suggestions-close" type="button" aria-label="Close suggestions" onclick={onClose}>
      <X size={12} aria-hidden="true" />
    </button>
  </header>

  <p class="suggestions-intro">Pages that keep appearing together without a declared relation.</p>

  {#if suggestions.length === 0}
    <p class="suggestions-empty">No suggestions right now.</p>
  {:else}
    <ul class="suggestions-list">
      {#each suggestions as pair (pair.key)}
        <li class="suggestion">
          <p class="suggestion-title">{pairTitle(pair)}</p>
          <p class="suggestion-reason">{reason(pair)} · no relation yet</p>
          <div class="suggestion-actions">
            <button
              class="suggestion-accept"
              type="button"
              aria-expanded={openKey === pair.key}
              onclick={() => toggleForm(pair)}
            >
              Accept
            </button>
            <button class="suggestion-dismiss" type="button" onclick={() => onDismiss(pair.key)}>
              Dismiss
            </button>
          </div>

          {#if openKey === pair.key}
            <form
              class="suggestion-form"
              aria-label={`Create a relation for ${pairTitle(pair)}`}
              onsubmit={(event) => {
                event.preventDefault();
                create(pair);
              }}
            >
              <div class="suggestion-chips" role="group" aria-label="Relation type">
                {#each RELATION_TYPES as relationType (relationType)}
                  <button
                    class="suggestion-chip"
                    class:active={type === relationType}
                    type="button"
                    aria-pressed={type === relationType}
                    onclick={() => (type = relationType)}
                  >
                    {TYPE_LABELS[relationType]}
                  </button>
                {/each}
              </div>

              <label class="suggestion-field">
                <span>Label</span>
                <input bind:value={label} placeholder="Optional, e.g. Estranged brother" />
              </label>

              <div class="suggestion-directions" role="group" aria-label="Direction">
                <button
                  class="suggestion-direction"
                  class:active={direction === "a-to-b"}
                  type="button"
                  aria-pressed={direction === "a-to-b"}
                  onclick={() => (direction = "a-to-b")}
                >
                  {pageTitle(pair.a)} to {pageTitle(pair.b)}
                </button>
                <button
                  class="suggestion-direction"
                  class:active={direction === "b-to-a"}
                  type="button"
                  aria-pressed={direction === "b-to-a"}
                  onclick={() => (direction = "b-to-a")}
                >
                  {pageTitle(pair.b)} to {pageTitle(pair.a)}
                </button>
              </div>

              <div class="suggestion-actions">
                <button class="suggestion-accept" type="submit">Create relation</button>
                <button class="suggestion-dismiss" type="button" onclick={() => (openKey = null)}>
                  Cancel
                </button>
              </div>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .suggestions-panel {
    position: absolute;
    top: 8px;
    right: 8px;
    bottom: 8px;
    z-index: 5;
    display: flex;
    width: 300px;
    flex-direction: column;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-card);
    overflow-y: auto;
  }
  .suggestions-head { display: flex; align-items: center; gap: 7px; }
  .suggestions-icon { display: inline-flex; color: var(--accent-strong); }
  .suggestions-head h2 { margin: 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 12px; font-weight: 600; }
  .suggestions-badge { display: inline-flex; min-width: 17px; height: 16px; align-items: center; justify-content: center; padding: 0 4px; border-radius: 8px; background: var(--accent-soft); color: var(--accent-strong); font-size: 8px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .suggestions-close { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; margin-left: auto; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .suggestions-close:hover { background: var(--control-hover); color: var(--text-primary); }
  .suggestions-intro { margin: 7px 0 0; color: var(--text-muted); font-size: 8.5px; line-height: 1.5; }
  .suggestions-empty { margin: 10px 0 0; color: var(--text-faint); font-size: 9px; }
  .suggestions-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 0; padding: 0; list-style: none; }
  .suggestion { padding: 9px 10px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--surface); }
  .suggestion-title { margin: 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 10.5px; font-weight: 600; line-height: 1.4; }
  .suggestion-reason { margin: 3px 0 0; color: var(--text-muted); font-size: 8.5px; }
  .suggestion-actions { display: flex; align-items: center; gap: 7px; margin-top: 8px; }
  .suggestion-form { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-soft); }
  .suggestion-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .suggestion-chip { height: 20px; padding: 0 7px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-raised); color: var(--text-muted); cursor: pointer; font-family: inherit; font-size: 8px; }
  .suggestion-chip:hover { color: var(--text-primary); }
  .suggestion-chip.active { border-color: var(--accent-strong); background: var(--accent-soft); color: var(--accent-strong); }
  .suggestion-field { display: flex; flex-direction: column; gap: 3px; color: var(--text-muted); font-size: 8px; }
  .suggestion-field input { height: 23px; padding: 0 7px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface-raised); color: var(--text-primary); font-family: inherit; font-size: 8.5px; }
  .suggestion-directions { display: flex; flex-direction: column; gap: 3px; }
  .suggestion-direction { height: 21px; padding: 0 7px; overflow: hidden; border: 1px solid var(--border); border-radius: 5px; background: var(--surface-raised); color: var(--text-muted); cursor: pointer; font-family: inherit; font-size: 8px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
  .suggestion-direction.active { border-color: var(--accent-strong); background: var(--accent-soft); color: var(--accent-strong); }
  .suggestion-accept { height: 23px; padding: 0 11px; border: 1px solid transparent; border-radius: 5px; background: var(--accent-strong); color: var(--accent-contrast); cursor: pointer; font-size: 8.5px; font-weight: 600; }
  .suggestion-accept:hover { background: var(--accent-strong-hover); }
  .suggestion-dismiss { height: 23px; padding: 0 8px; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 8.5px; }
  .suggestion-dismiss:hover { color: var(--text-primary); text-decoration: underline; }
</style>
