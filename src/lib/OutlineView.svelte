<script lang="ts">
  import { tick } from "svelte";
  import { autoResize } from "./auto-resize";
  import { chapterLabel } from "./publish/chapters";
  import type { ChapterData } from "./publish/types";

  type Props = {
    chapters: ChapterData[];
    chapterWordCounts: Record<string, number>;
    chapterSceneCounts: Record<string, number>;
    onAddChapter: () => string;
    onSummaryChange: (chapterId: string, summary: string) => void;
  };

  let {
    chapters,
    chapterWordCounts,
    chapterSceneCounts,
    onAddChapter,
    onSummaryChange
  }: Props = $props();

  let summaryInputs: Record<string, HTMLTextAreaElement> = {};

  let totalWords = $derived(chapters.reduce(
    (total, chapter) => total + (chapterWordCounts[chapter.id] ?? 0),
    0
  ));

  async function addChapter() {
    const chapterId = onAddChapter();
    await tick();
    const input = summaryInputs[chapterId];
    input?.focus();
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
</script>

<section class="outline-view" aria-label="Chapter outline">
  <header class="outline-header">
    <div>
      <span class="outline-eyebrow">PLAN YOUR BOOK</span>
      <h1>Outline</h1>
      <p>Sketch each chapter before you write it. Summaries also appear on chapter cards in Storyboard.</p>
    </div>
    <div class="outline-header-actions">
      <span class="outline-count">
        {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} · {totalWords.toLocaleString()} words
      </span>
      <button class="outline-add" type="button" onclick={addChapter}>+ Add chapter</button>
    </div>
  </header>

  {#if chapters.length === 0}
    <div class="outline-empty">
      <span class="outline-empty-mark">▱</span>
      <h2>No chapters yet</h2>
      <p>Add your first chapter to start planning the shape of your story.</p>
      <button class="outline-add" type="button" onclick={addChapter}>+ Add chapter</button>
    </div>
  {:else}
    <div class="outline-list">
      {#each chapters as chapter, index (chapter.id)}
        <article class="outline-card">
          <div class="outline-rail" aria-hidden="true">
            <span class="outline-number">{String(index + 1).padStart(2, "0")}</span>
            <span class="outline-rail-line"></span>
            <span class="outline-kind">CH</span>
          </div>
          <div class="outline-body">
            <header class="outline-card-header">
              <h2>{chapterLabel(chapter, chapters)}</h2>
              <span class="outline-meta">
                {chapterSceneCounts[chapter.id] ?? 0} {(chapterSceneCounts[chapter.id] ?? 0) === 1 ? "scene" : "scenes"}
                <span class="outline-meta-divider">·</span>
                {(chapterWordCounts[chapter.id] ?? 0).toLocaleString()} words
              </span>
            </header>
            <textarea
              bind:this={summaryInputs[chapter.id]}
              class="outline-summary"
              aria-label="Summary for {chapterLabel(chapter, chapters)}"
              placeholder="What happens in this chapter?"
              maxlength="4000"
              value={chapter.summary ?? ""}
              use:autoResize={chapter.summary ?? ""}
              oninput={(event) => onSummaryChange(chapter.id, (event.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
          </div>
        </article>
      {/each}

      <button class="outline-add-card" type="button" onclick={addChapter}>
        <span class="outline-add-symbol">+</span>
        <span><strong>Add chapter</strong><small>Create another card in your outline.</small></span>
      </button>
    </div>
  {/if}
</section>

<style>
  .outline-view { width: min(100%, 860px); flex: 1; padding-bottom: 10px; }
  .outline-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 17px; padding-bottom: 14px; border-bottom: 1px solid var(--border-soft); }
  .outline-eyebrow { color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: 1.2px; }
  .outline-header h1 { margin: 6px 0 5px; color: var(--text-heading); font-family: var(--interface-font); font-size: 28px; font-weight: 500; letter-spacing: -.5px; }
  .outline-header p { max-width: 560px; margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.6; }
  .outline-header-actions { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; padding-bottom: 2px; }
  .outline-count { color: var(--text-muted); font-size: 8px; white-space: nowrap; }
  .outline-add { height: 29px; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 9px; white-space: nowrap; }
  .outline-add:hover { background: var(--control-hover); color: var(--selected-text); }
  .outline-list { display: flex; flex-direction: column; gap: 12px; }
  .outline-card { display: grid; grid-template-columns: 48px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-card); transition: border-color .12s, box-shadow .12s; scroll-margin: 24px; }
  .outline-card:focus-within { border-color: var(--accent-soft); box-shadow: 0 0 0 2px var(--accent-ring), var(--shadow-card); }
  .outline-rail { display: flex; min-height: 126px; align-items: center; flex-direction: column; gap: 8px; padding: 16px 8px 13px; border-right: 1px solid var(--border-soft); background: var(--surface-raised); }
  .outline-number { color: var(--text-heading); font-size: 10px; font-variant-numeric: tabular-nums; font-weight: 650; }
  .outline-rail-line { width: 1px; flex: 1; background: var(--border-soft); }
  .outline-kind { color: var(--eyebrow); font-size: 7px; font-weight: 700; letter-spacing: .8px; }
  .outline-body { min-width: 0; padding: 15px 17px 13px; }
  .outline-card-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .outline-card-header h2 { overflow: hidden; margin: 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 19px; font-weight: 500; letter-spacing: -.2px; text-overflow: ellipsis; white-space: nowrap; }
  .outline-meta { flex: 0 0 auto; color: var(--text-muted); font-size: 8px; white-space: nowrap; }
  .outline-meta-divider { margin: 0 4px; color: var(--border-control); }
  .outline-summary { display: block; width: 100%; min-height: 82px; padding: 3px 0; resize: none; overflow-y: hidden; border: 0; outline: none; background: transparent; color: var(--text-body); font-family: var(--interface-font); font-size: 13px; line-height: 1.72; }
  .outline-summary::placeholder { color: var(--text-muted); font-family: Inter, ui-sans-serif, sans-serif; font-size: 10px; }
  .outline-add-card { display: flex; align-items: center; gap: 11px; min-height: 68px; padding: 13px 16px; border: 1px dashed var(--border-control); border-radius: 9px; background: transparent; color: var(--text-muted); cursor: pointer; text-align: left; }
  .outline-add-card:hover { border-color: var(--accent-soft); background: var(--surface); color: var(--text-secondary); }
  .outline-add-symbol { display: grid; width: 27px; height: 27px; flex: 0 0 auto; place-items: center; border: 1px solid var(--border); border-radius: 50%; color: var(--eyebrow); font-size: 18px; line-height: 1; }
  .outline-add-card strong { display: block; color: var(--text-nav); font-size: 10px; font-weight: 600; }
  .outline-add-card small { display: block; margin-top: 3px; color: var(--text-muted); font-size: 8px; }
  .outline-empty { display: flex; min-height: 310px; align-items: center; flex-direction: column; justify-content: center; gap: 6px; padding: 30px; border: 1px dashed var(--border-control); border-radius: 10px; background: var(--surface); text-align: center; }
  .outline-empty-mark { color: var(--eyebrow); font-family: Georgia, serif; font-size: 34px; line-height: 1; }
  .outline-empty h2 { margin: 5px 0 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 21px; font-weight: 500; }
  .outline-empty p { margin: 0 0 8px; color: var(--text-muted); font-size: 10px; }
  .outline-add:focus-visible, .outline-add-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  @media (max-width: 760px) {
    .outline-header { align-items: flex-start; flex-direction: column; gap: 12px; }
    .outline-header-actions { width: 100%; justify-content: space-between; }
    .outline-count { white-space: normal; }
    .outline-card { grid-template-columns: 39px minmax(0, 1fr); }
    .outline-rail { padding-right: 5px; padding-left: 5px; }
    .outline-body { padding-right: 13px; padding-left: 13px; }
  }

  @media (max-width: 440px) {
    .outline-header-actions { align-items: flex-start; flex-direction: column; gap: 7px; }
    .outline-meta { white-space: normal; }
    .outline-card-header { align-items: flex-start; flex-direction: column; gap: 3px; }
    .outline-summary { font-size: 12px; }
  }
</style>
