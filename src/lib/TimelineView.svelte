<script lang="ts">
  import { tick } from "svelte";
  import { autoResize } from "./auto-resize";
  import {
    TIMELINE_DESCRIPTION_LIMIT,
    TIMELINE_TITLE_LIMIT,
    TIMELINE_WHEN_LIMIT
  } from "./timeline";
  import type { TimelineNode } from "./storage/types";

  type Props = {
    nodes: TimelineNode[];
    onAdd: () => string;
    onUpdate: (id: string, patch: Partial<Omit<TimelineNode, "id">>) => void;
    onRemove: (id: string) => void;
    onMove: (id: string, offset: number) => void;
    onReorder: (orderedIds: string[]) => void;
  };

  let { nodes, onAdd, onUpdate, onRemove, onMove, onReorder }: Props = $props();

  let titleInputs: Record<string, HTMLInputElement> = {};
  let dragState = $state<{ id: string; pointerId: number } | null>(null);
  let dropTarget = $state<{ id: string; after: boolean } | null>(null);

  function nodeLabel(node: TimelineNode, index: number): string {
    return node.title.trim() || `timeline moment ${index + 1}`;
  }

  function dropPosition(id: string): "before" | "after" | null {
    const target = dropTarget;
    if (!target || target.id !== id) return null;
    return target.after ? "after" : "before";
  }

  async function addNode() {
    const id = onAdd();
    await tick();
    const input = titleInputs[id];
    if (!input) return;
    input.focus();
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function reorderToTarget(id: string, target: { id: string; after: boolean }) {
    const fromIndex = nodes.findIndex((node) => node.id === id);
    const targetIndex = nodes.findIndex((node) => node.id === target.id);
    if (fromIndex < 0 || targetIndex < 0) return;
    let insertIndex = target.after ? targetIndex + 1 : targetIndex;
    if (insertIndex > fromIndex) insertIndex -= 1;
    if (insertIndex === fromIndex) return;
    const next = [...nodes];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(insertIndex, 0, moved);
    onReorder(next.map((node) => node.id));
  }

  function startDrag(event: PointerEvent, id: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragState = { id, pointerId: event.pointerId };
    dropTarget = null;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function updateDrag(event: PointerEvent) {
    const drag = dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-timeline-node-id]");
    const targetId = element?.dataset.timelineNodeId;
    if (!element || !targetId || targetId === drag.id) {
      dropTarget = null;
      return;
    }
    const rect = element.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    if (dropTarget?.id === targetId && dropTarget.after === after) return;
    dropTarget = { id: targetId, after };
  }

  function releasePointer(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  }

  function finishDrag(event: PointerEvent) {
    const drag = dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (dropTarget) reorderToTarget(drag.id, dropTarget);
    releasePointer(event);
    dragState = null;
    dropTarget = null;
  }

  function cancelDrag(event: PointerEvent) {
    if (dragState?.pointerId !== event.pointerId) return;
    releasePointer(event);
    dragState = null;
    dropTarget = null;
  }
</script>

<section class="timeline-view" aria-label="Story timeline">
  <header class="timeline-header">
    <div>
      <span class="timeline-eyebrow">FOLLOW YOUR STORY</span>
      <h1>Timeline</h1>
      <p>Map the moments that move your story forward. Drag nodes to change their order.</p>
    </div>
    <div class="timeline-header-actions">
      <span class="timeline-count">
        {nodes.length} {nodes.length === 1 ? "moment" : "moments"}
      </span>
      <button class="timeline-add" type="button" onclick={addNode}>+ Add moment</button>
    </div>
  </header>

  {#if nodes.length === 0}
    <div class="timeline-empty">
      <span class="timeline-empty-mark" aria-hidden="true">◷</span>
      <h2>No moments yet</h2>
      <p>Add your first event to begin charting the sequence of your story.</p>
      <button class="timeline-add" type="button" onclick={addNode}>+ Add moment</button>
    </div>
  {:else}
    <div class="timeline-list">
      {#each nodes as node, index (node.id)}
        {@const drop = dropPosition(node.id)}
        <article
          class="timeline-node"
          class:dragging={dragState?.id === node.id}
          class:drop-before={drop === "before"}
          class:drop-after={drop === "after"}
          data-timeline-node-id={node.id}
        >
          <span class="timeline-marker" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div class="timeline-node-head">
            <button
              class="timeline-drag"
              type="button"
              aria-label="Drag {nodeLabel(node, index)} to reorder"
              title="Drag to reorder"
              onpointerdown={(event) => startDrag(event, node.id)}
              onpointermove={updateDrag}
              onpointerup={finishDrag}
              onpointercancel={cancelDrag}
              onlostpointercapture={cancelDrag}
            >⠿</button>
            <input
              bind:this={titleInputs[node.id]}
              class="timeline-title"
              aria-label="Title for timeline moment {index + 1}"
              placeholder="What happens here?"
              maxlength={TIMELINE_TITLE_LIMIT}
              value={node.title}
              oninput={(event) => onUpdate(node.id, { title: (event.currentTarget as HTMLInputElement).value })}
            />
            <div class="timeline-node-actions">
              <button
                class="timeline-action"
                type="button"
                aria-label="Move {nodeLabel(node, index)} earlier"
                title="Move earlier"
                disabled={index === 0}
                onclick={() => onMove(node.id, -1)}
              >↑</button>
              <button
                class="timeline-action"
                type="button"
                aria-label="Move {nodeLabel(node, index)} later"
                title="Move later"
                disabled={index === nodes.length - 1}
                onclick={() => onMove(node.id, 1)}
              >↓</button>
              <button
                class="timeline-remove"
                type="button"
                aria-label="Remove {nodeLabel(node, index)}"
                title="Remove moment"
                onclick={() => onRemove(node.id)}
              >×</button>
            </div>
          </div>
          <div class="timeline-when">
            <label class="timeline-field">
              <span>Date</span>
              <input
                type="text"
                aria-label="Date for {nodeLabel(node, index)}"
                placeholder="Day 12, Third Age, 14 May 1842…"
                maxlength={TIMELINE_WHEN_LIMIT}
                value={node.date}
                oninput={(event) => onUpdate(node.id, { date: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
            <label class="timeline-field timeline-time">
              <span>Time</span>
              <input
                type="text"
                aria-label="Time for {nodeLabel(node, index)}"
                placeholder="4:30 PM, dawn, midnight…"
                maxlength={TIMELINE_WHEN_LIMIT}
                value={node.time}
                oninput={(event) => onUpdate(node.id, { time: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
          </div>
          <textarea
            class="timeline-description"
            aria-label="Description for {nodeLabel(node, index)}"
            placeholder="Describe the moment, who is involved, and what changes…"
            maxlength={TIMELINE_DESCRIPTION_LIMIT}
            value={node.description}
            use:autoResize={node.description}
            oninput={(event) => onUpdate(node.id, { description: (event.currentTarget as HTMLTextAreaElement).value })}
          ></textarea>
        </article>
      {/each}
    </div>
    <button class="timeline-add-card" type="button" onclick={addNode}>
      <span class="timeline-add-symbol" aria-hidden="true">+</span>
      <span><strong>Add moment</strong><small>Place another event on your timeline.</small></span>
    </button>
  {/if}
</section>

<style>
  .timeline-view { width: min(100%, 860px); flex: 1; padding-bottom: 10px; }
  .timeline-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 17px; padding-bottom: 14px; border-bottom: 1px solid var(--border-soft); }
  .timeline-eyebrow { color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: 1.2px; }
  .timeline-header h1 { margin: 6px 0 5px; color: var(--text-heading); font-family: var(--interface-font); font-size: 28px; font-weight: 500; letter-spacing: -.5px; }
  .timeline-header p { max-width: 560px; margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.6; }
  .timeline-header-actions { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; padding-bottom: 2px; }
  .timeline-count { color: var(--text-muted); font-size: 8px; white-space: nowrap; }
  .timeline-add { height: 29px; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 9px; white-space: nowrap; }
  .timeline-add:hover { background: var(--control-hover); color: var(--selected-text); }
  .timeline-list { position: relative; display: flex; flex-direction: column; gap: 13px; padding-left: 46px; }
  .timeline-list::before { content: ""; position: absolute; top: 14px; bottom: 14px; left: 17px; width: 1px; background: var(--border); }
  .timeline-node { position: relative; padding: 14px 16px 13px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-card); transition: border-color .12s, box-shadow .12s, opacity .12s; scroll-margin: 24px; }
  .timeline-node:focus-within { border-color: var(--accent-soft); box-shadow: 0 0 0 2px var(--accent-ring), var(--shadow-card); }
  .timeline-node.dragging { opacity: .55; }
  .timeline-node.drop-before::after, .timeline-node.drop-after::after { content: ""; position: absolute; right: 0; left: -46px; height: 2px; border-radius: 2px; background: var(--accent); }
  .timeline-node.drop-before::after { top: -8px; }
  .timeline-node.drop-after::after { bottom: -8px; }
  .timeline-marker { position: absolute; top: 17px; left: -42px; display: grid; width: 25px; height: 25px; place-items: center; border: 1px solid var(--border-control); border-radius: 50%; background: var(--surface); box-shadow: 0 0 0 5px var(--surface); color: var(--eyebrow); font-size: 7px; font-variant-numeric: tabular-nums; font-weight: 700; }
  .timeline-node:focus-within .timeline-marker { border-color: var(--accent-soft); color: var(--accent-strong); }
  .timeline-node-head { display: flex; min-width: 0; align-items: center; gap: 7px; }
  .timeline-drag, .timeline-action, .timeline-remove { display: grid; width: 23px; height: 24px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .timeline-drag { cursor: grab; font-size: 15px; touch-action: none; }
  .timeline-drag:active { cursor: grabbing; }
  .timeline-action, .timeline-remove { font-size: 12px; }
  .timeline-action:disabled { opacity: .3; cursor: default; }
  .timeline-drag:hover, .timeline-action:hover:not(:disabled), .timeline-remove:hover { background: var(--control-hover); color: var(--text-primary); }
  .timeline-node-actions { display: flex; align-items: center; gap: 1px; }
  .timeline-title { min-width: 0; flex: 1; padding: 4px 0 6px; border: 0; border-bottom: 1px solid var(--border-soft); outline: none; background: transparent; color: var(--text-heading); font-family: var(--interface-font); font-size: 17px; font-weight: 500; }
  .timeline-title:focus { border-color: var(--accent); }
  .timeline-when { display: grid; grid-template-columns: minmax(0, 1fr) minmax(110px, .7fr); gap: 9px; margin-top: 10px; }
  .timeline-field { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 4px 8px; border: 1px solid var(--border-soft); border-radius: 5px; background: var(--surface-raised); }
  .timeline-field span { flex: 0 0 auto; color: var(--eyebrow); font-size: 7px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
  .timeline-field input { min-width: 0; flex: 1; padding: 1px 0; border: 0; outline: none; background: transparent; color: var(--text-body); font-family: var(--interface-font); font-size: 10px; }
  .timeline-field input::placeholder, .timeline-description::placeholder { color: var(--text-muted); }
  .timeline-field:focus-within { border-color: var(--accent-soft); }
  .timeline-description { display: block; width: 100%; min-height: 62px; margin-top: 9px; padding: 3px 0; resize: none; overflow-y: hidden; border: 0; outline: none; background: transparent; color: var(--text-body); font-family: var(--interface-font); font-size: 13px; line-height: 1.65; }
  .timeline-add-card { display: flex; width: calc(100% - 46px); min-height: 62px; align-items: center; gap: 11px; margin: 13px 0 0 46px; padding: 12px 15px; border: 1px dashed var(--border-control); border-radius: 9px; background: transparent; color: var(--text-muted); cursor: pointer; text-align: left; }
  .timeline-add-card:hover { border-color: var(--accent-soft); background: var(--surface); color: var(--text-secondary); }
  .timeline-add-symbol { display: grid; width: 27px; height: 27px; flex: 0 0 auto; place-items: center; border: 1px solid var(--border); border-radius: 50%; color: var(--eyebrow); font-size: 18px; line-height: 1; }
  .timeline-add-card strong { display: block; color: var(--text-nav); font-size: 10px; font-weight: 600; }
  .timeline-add-card small { display: block; margin-top: 3px; color: var(--text-muted); font-size: 8px; }
  .timeline-empty { display: flex; min-height: 310px; align-items: center; flex-direction: column; justify-content: center; gap: 6px; padding: 30px; border: 1px dashed var(--border-control); border-radius: 10px; background: var(--surface); text-align: center; }
  .timeline-empty-mark { color: var(--eyebrow); font-size: 32px; line-height: 1; }
  .timeline-empty h2 { margin: 5px 0 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 21px; font-weight: 500; }
  .timeline-empty p { margin: 0 0 8px; color: var(--text-muted); font-size: 10px; }
  .timeline-add:focus-visible, .timeline-add-card:focus-visible, .timeline-drag:focus-visible, .timeline-action:focus-visible, .timeline-remove:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  @media (max-width: 760px) {
    .timeline-header { align-items: flex-start; flex-direction: column; gap: 12px; }
    .timeline-header-actions { width: 100%; justify-content: space-between; }
    .timeline-count { white-space: normal; }
    .timeline-when { grid-template-columns: 1fr; }
  }

  @media (max-width: 440px) {
    .timeline-list { padding-left: 34px; }
    .timeline-list::before { left: 11px; }
    .timeline-marker { left: -34px; width: 23px; height: 23px; }
    .timeline-node { padding: 12px 12px 11px; }
    .timeline-node.drop-before::after, .timeline-node.drop-after::after { left: -34px; }
    .timeline-node-head { flex-wrap: wrap; }
    .timeline-title { flex-basis: calc(100% - 30px); }
    .timeline-node-actions { margin-left: auto; }
    .timeline-add-card { width: calc(100% - 34px); margin-left: 34px; }
  }
</style>
