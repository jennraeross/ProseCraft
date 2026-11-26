<script lang="ts">
  import { Lightbulb, X } from "@lucide/svelte";
  import type { PagePair } from "./relations";
  import { RELATION_TYPES, type RelationType } from "./story-meta";
  import type { MessageKey } from "$lib/i18n/catalog";
  import { t } from "$lib/i18n/state.svelte";
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

  const TYPE_LABELS: Record<RelationType, MessageKey> = {
    family: "relation.family",
    friend: "relation.friend",
    rival: "relation.rival",
    love: "relation.love",
    mentor: "relation.mentor",
    employer: "relation.employer",
    other: "relation.other"
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
    return t("suggestions.pair", { a: pageTitle(pair.a), b: pageTitle(pair.b) });
  }

  function pageTitle(id: string): string {
    return titles.get(id) ?? t("network.unknownPage");
  }

  function reason(pair: PagePair): string {
    return t("suggestions.reason", { count: pair.count });
  }
</script>

<aside class="suggestions-panel" aria-label={t("suggestions.aria")}>
  <header class="suggestions-head">
    <span class="suggestions-icon"><Lightbulb size={12} aria-hidden="true" /></span>
    <h2>{t("suggestions.title")}</h2>
    <span class="suggestions-badge">{suggestions.length}</span>
    <button class="suggestions-close" type="button" aria-label={t("suggestions.close")} onclick={onClose}>
      <X size={12} aria-hidden="true" />
    </button>
  </header>

  <p class="suggestions-intro">{t("suggestions.intro")}</p>

  {#if suggestions.length === 0}
    <p class="suggestions-empty">{t("suggestions.empty")}</p>
  {:else}
    <ul class="suggestions-list">
      {#each suggestions as pair (pair.key)}
        <li class="suggestion">
          <p class="suggestion-title">{pairTitle(pair)}</p>
          <p class="suggestion-reason">{reason(pair)}</p>
          <div class="suggestion-actions">
            <button
              class="suggestion-accept"
              type="button"
              aria-expanded={openKey === pair.key}
              onclick={() => toggleForm(pair)}
            >
              {t("suggestions.accept")}
            </button>
            <button class="suggestion-dismiss" type="button" onclick={() => onDismiss(pair.key)}>
              {t("suggestions.dismiss")}
            </button>
          </div>

          {#if openKey === pair.key}
            <form
              class="suggestion-form"
              aria-label={t("suggestions.createAria", { pair: pairTitle(pair) })}
              onsubmit={(event) => {
                event.preventDefault();
                create(pair);
              }}
            >
              <div class="suggestion-chips" role="group" aria-label={t("suggestions.relationType")}>
                {#each RELATION_TYPES as relationType (relationType)}
                  <button
                    class="suggestion-chip"
                    class:active={type === relationType}
                    type="button"
                    aria-pressed={type === relationType}
                    onclick={() => (type = relationType)}
                  >
                    {t(TYPE_LABELS[relationType])}
                  </button>
                {/each}
              </div>

              <label class="suggestion-field">
                <span>{t("suggestions.label")}</span>
                <input bind:value={label} placeholder={t("suggestions.labelPlaceholder")} />
              </label>

              <div class="suggestion-directions" role="group" aria-label={t("suggestions.direction")}>
                <button
                  class="suggestion-direction"
                  class:active={direction === "a-to-b"}
                  type="button"
                  aria-pressed={direction === "a-to-b"}
                  onclick={() => (direction = "a-to-b")}
                >
                  {t("suggestions.directionTo", { from: pageTitle(pair.a), to: pageTitle(pair.b) })}
                </button>
                <button
                  class="suggestion-direction"
                  class:active={direction === "b-to-a"}
                  type="button"
                  aria-pressed={direction === "b-to-a"}
                  onclick={() => (direction = "b-to-a")}
                >
                  {t("suggestions.directionTo", { from: pageTitle(pair.b), to: pageTitle(pair.a) })}
                </button>
              </div>

              <div class="suggestion-actions">
                <button class="suggestion-accept" type="submit">{t("suggestions.create")}</button>
                <button class="suggestion-dismiss" type="button" onclick={() => (openKey = null)}>
                  {t("common.cancel")}
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
