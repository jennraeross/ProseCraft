<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { sanitizeHtml } from "$lib/sanitize";

  const EMIT_DELAY_MS = 300;

  let {
    title,
    html,
    onTitle,
    onChange
  }: {
    title: string;
    html: string;
    onTitle: (value: string) => void;
    onChange: (html: string) => void;
  } = $props();

  let titleInput = $state<HTMLInputElement>();
  let body = $state<HTMLDivElement>();
  // Filled from the prop on mount and whenever it changes from outside.
  let titleValue = $state(untrack(() => title));
  // The body HTML this editor last emitted, so the prop echo does not reset the caret.
  let emittedHtml = "";
  let emitTimer: ReturnType<typeof setTimeout> | undefined;

  // Content changed from outside (another tile, a rename, an undo): show it,
  // unless this is our own echo or the user is typing in this tile.
  $effect(() => {
    const element = body;
    const next = html;
    if (!element || next === emittedHtml || document.activeElement === element) return;
    const clean = sanitizeHtml(next);
    if (element.innerHTML !== clean) element.innerHTML = clean;
  });

  $effect(() => {
    const next = title;
    if (next === titleValue || document.activeElement === titleInput) return;
    titleValue = next;
  });

  function emit() {
    emitTimer = undefined;
    if (!body) return;
    emittedHtml = sanitizeHtml(body.innerHTML);
    onChange(emittedHtml);
  }

  function scheduleEmit() {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(emit, EMIT_DELAY_MS);
  }

  function flush() {
    if (!emitTimer) return;
    clearTimeout(emitTimer);
    emit();
  }

  function handlePaste(event: ClipboardEvent) {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    event.preventDefault();
    const pastedHtml = clipboard.getData("text/html");
    if (pastedHtml) {
      document.execCommand("insertHTML", false, sanitizeHtml(pastedHtml));
    } else {
      const pastedText = clipboard.getData("text/plain");
      if (pastedText) document.execCommand("insertText", false, pastedText);
    }
    scheduleEmit();
  }

  onDestroy(flush);
</script>

<div class="tile-editor">
  <input
    class="tile-title"
    bind:this={titleInput}
    aria-label="Title"
    placeholder="Untitled"
    value={titleValue}
    maxlength="120"
    oninput={(event) => {
      titleValue = event.currentTarget.value;
      onTitle(titleValue);
    }}
  />
  <div
    class="tile-body"
    bind:this={body}
    contenteditable="true"
    role="textbox"
    tabindex="0"
    aria-label="Document text"
    aria-multiline="true"
    spellcheck="true"
    oninput={scheduleEmit}
    onblur={flush}
    onpaste={handlePaste}
  ></div>
</div>

<style>
  .tile-editor { display: flex; min-width: 0; flex-direction: column; }
  .tile-title { width: 100%; margin: 0 0 10px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--text-heading); font-family: inherit; font-size: 15px; font-weight: 700; line-height: 1.3; }
  .tile-title::placeholder { color: var(--text-faint); }
  .tile-body { min-height: 120px; outline: none; color: var(--text-body); font-family: var(--writing-font, var(--interface-font)); font-size: calc(16px * var(--editor-scale)); line-height: 1.85; overflow-wrap: anywhere; }
  .tile-body :global(p) { margin: 0 0 18px; }
  .tile-body :global(h1) { color: var(--text-heading); font-size: calc(30px * var(--editor-scale)); font-weight: 500; line-height: 1.35; }
  .tile-body :global(h2) { margin: 0 0 19px; color: var(--text-heading); font-size: calc(24px * var(--editor-scale)); font-weight: 500; letter-spacing: -.5px; line-height: 1.4; }
  .tile-body :global(h3) { color: var(--text-heading); font-size: calc(19px * var(--editor-scale)); font-weight: 500; }
  .tile-body :global(blockquote) { margin: 26px 0; padding: 2px 0 2px 17px; border-left: 2px solid var(--accent-soft); color: var(--quote); font-style: italic; }
  .tile-body :global(ul), .tile-body :global(ol) { padding-left: 24px; }
  .tile-body :global(a) { color: var(--link); text-decoration-color: var(--link-underline); text-underline-offset: 3px; }
  .tile-body :global(img) { display: block; max-width: 100%; height: auto; margin: 18px 0; object-fit: contain; }
  .tile-body :global(pre) { overflow-x: auto; padding: 12px 14px; border-radius: 5px; background: var(--surface-raised); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; line-height: 1.55; }
  .tile-body :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .tile-body :global(table) { width: 100%; border-collapse: collapse; font-size: .9em; }
  .tile-body :global(th), .tile-body :global(td) { padding: 5px 8px; border: 1px solid var(--border); text-align: left; }
</style>
