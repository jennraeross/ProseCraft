<script lang="ts">
  import type { AppearanceBar } from "./appearance-strip";
  import { chapterBars } from "./appearance-strip";
  import { t, localeState } from "$lib/i18n/state.svelte";
  import type { ChapterData, DocumentData } from "./publish/types";
  import type { PageAppearances } from "./relations";

  let {
    appearances,
    chapters,
    scenes,
    onOpenScene
  }: {
    appearances?: PageAppearances;
    chapters: readonly ChapterData[];
    scenes: readonly DocumentData[];
    onOpenScene?: (id: string) => void;
  } = $props();

  const bars = $derived(chapterBars(appearances, chapters, scenes));
  const peak = $derived(Math.max(1, ...bars.map((bar) => bar.total)));
  const visited = $derived(bars.filter((bar) => bar.total > 0));
  const summary = $derived(
    visited.length === 0
      ? t("appearance.summaryNone")
      : t("appearance.summary", { count: visited.length, total: bars.length })
  );

  function barLabel(bar: AppearanceBar, index: number): string {
    const list = new Intl.ListFormat(localeState.locale, { style: "long", type: "conjunction" });
    const marks: string[] = [];
    if (bar.first) marks.push(t("appearance.firstAppearance"));
    if (bar.last) marks.push(t("appearance.lastAppearance"));
    const scenes = t("appearance.scenes", { count: bar.total });
    const titles =
      bar.sceneTitles.length === 0 ? t("appearance.noScenes") : list.format(bar.sceneTitles);
    const markSuffix = marks.length > 0 ? `, ${list.format(marks)}` : "";
    return t("appearance.barLabel", {
      chapter: index + 1,
      scenes,
      marks: markSuffix,
      titles
    });
  }

  function openScene(bar: AppearanceBar): void {
    if (bar.firstSceneId) onOpenScene?.(bar.firstSceneId);
  }
</script>

<div class="appearance-strip">
  <div class="strip-head">
    <span class="strip-label">{t("appearance.title")}</span>
    <span class="strip-summary">{summary}</span>
  </div>

  {#if bars.length === 0}
    <p class="strip-hint">{t("appearance.empty")}</p>
  {:else}
    <div class="strip-bars" role="group" aria-label={t("appearance.groupLabel")}>
      {#each bars as bar, index (bar.chapterId)}
        <button
          type="button"
          class="strip-slot"
          class:empty={bar.total === 0}
          aria-label={barLabel(bar, index)}
          title={barLabel(bar, index)}
          disabled={!bar.firstSceneId}
          onclick={() => openScene(bar)}
        >
          <span class="strip-bar" style:height={`${(bar.total / peak) * 100}%`}>
            {#if bar.auto > 0}
              <span class="strip-part auto" style:height={`${(bar.auto / bar.total) * 100}%`}></span>
            {/if}
            {#if bar.confirmed > 0}
              <span
                class="strip-part confirmed"
                style:height={`${(bar.confirmed / bar.total) * 100}%`}
              ></span>
            {/if}
          </span>
          {#if bar.first || bar.last}
            <span class="strip-mark" aria-hidden="true"></span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="strip-legend">
      <span class="strip-key"><span class="strip-swatch confirmed"></span>{t("appearance.confirmed")}</span>
      <span class="strip-key"><span class="strip-swatch auto"></span>{t("appearance.auto")}</span>
      <span class="strip-key"><span class="strip-dot"></span>{t("appearance.firstAndLast")}</span>
    </div>
  {/if}
</div>

<style>
  .appearance-strip {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .strip-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .strip-label {
    color: var(--text-muted);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .strip-summary {
    color: var(--text-faint);
    font-size: 10px;
  }

  .strip-bars {
    display: flex;
    height: 64px;
    align-items: flex-end;
    gap: 3px;
    padding-bottom: 9px;
    border-bottom: 1px solid var(--border-soft);
  }

  .strip-slot {
    position: relative;
    display: flex;
    height: 100%;
    min-width: 0;
    flex: 1 1 0;
    align-items: flex-end;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .strip-slot:disabled {
    cursor: default;
  }

  .strip-bar {
    display: flex;
    width: 100%;
    min-height: 2px;
    flex-direction: column;
    justify-content: flex-end;
    overflow: hidden;
    border-radius: 3px 3px 0 0;
    background: var(--border-soft);
  }

  .strip-part {
    display: block;
    width: 100%;
  }

  .strip-part.confirmed {
    background: var(--accent);
  }

  .strip-part.auto {
    background: repeating-linear-gradient(
      45deg,
      var(--accent) 0 2px,
      transparent 2px 4px
    );
    opacity: 0.55;
  }

  .strip-slot:not(:disabled):hover .strip-bar {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }

  .strip-slot.empty .strip-bar {
    background: var(--border-soft);
    opacity: 0.7;
  }

  .strip-mark {
    position: absolute;
    bottom: -7px;
    left: 50%;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--accent);
    transform: translateX(-50%);
  }

  .strip-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .strip-key {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-faint);
    font-size: 9px;
  }

  .strip-swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .strip-swatch.confirmed {
    background: var(--accent);
  }

  .strip-swatch.auto {
    background: repeating-linear-gradient(
      45deg,
      var(--accent) 0 2px,
      transparent 2px 4px
    );
    opacity: 0.55;
  }

  .strip-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--accent);
  }

  .strip-hint {
    margin: 0;
    color: var(--text-faint);
    font-size: 10px;
  }
</style>
