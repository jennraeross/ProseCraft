<script lang="ts">
  import { ArrowLeft, ArrowRight, Plus, X } from "@lucide/svelte";
  import { markdownToHtml } from "$lib/publish/markdown";
  import type { DocumentData, ResearchFile } from "$lib/publish/types";
  import PdfView from "$lib/PdfView.svelte";
  import { sanitizeHtml } from "$lib/sanitize";
  import { parseSplitTarget, type SplitGroup } from "$lib/split";

  const MAX_TEXT_BYTES = 2 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_PDF_BYTES = 50 * 1024 * 1024;

  type Loaded = { html?: string; imageUrl?: string; note?: string };

  let {
    target,
    groups,
    documents,
    files,
    canAdd,
    canMoveLeft,
    canMoveRight,
    readBytes,
    openExternally,
    openUrl,
    onTarget,
    onMove,
    onAdd,
    onClose
  }: {
    target: string;
    groups: SplitGroup[];
    documents: DocumentData[];
    files: ResearchFile[];
    canAdd: boolean;
    canMoveLeft: boolean;
    canMoveRight: boolean;
    readBytes: (file: ResearchFile) => Promise<ArrayBuffer>;
    openExternally: (file: ResearchFile) => void;
    openUrl: (url: string) => void;
    onTarget: (value: string) => void;
    onMove: (delta: -1 | 1) => void;
    onAdd: () => void;
    onClose: () => void;
  } = $props();

  const parsed = $derived(parseSplitTarget(target));
  const document = $derived(parsed?.kind === "doc"
    ? documents.find((doc) => doc.id === parsed.id && !doc.trashed) ?? null
    : null);
  const file = $derived(parsed?.kind === "file"
    ? files.find((item) => item.id === parsed.id) ?? null
    : null);
  const documentHtml = $derived(document ? sanitizeHtml(document.content) : "");
  const isPdf = $derived(Boolean(file && (file.mimeType === "application/pdf" || /\.pdf$/i.test(file.fileName))));
  const showPdf = $derived(Boolean(file && isPdf && file.size <= MAX_PDF_BYTES));

  let loaded = $state<Loaded | null>(null);

  function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Loads the picked research file. A newer pick or closing the pane cancels
  // the older load and releases its object URL.
  $effect(() => {
    const current = file;
    loaded = null;
    if (!current) return;
    if (isPdf) {
      // PDFs are rendered by PdfView; only an oversized one needs a note here.
      if (!showPdf) loaded = { note: "This PDF is too large to show here (over 50 MB)." };
      return;
    }
    let cancelled = false;
    let imageUrl: string | undefined;
    void (async () => {
      try {
        const name = current.fileName.toLowerCase();
        const isMarkdown = current.mimeType === "text/markdown" || /\.(?:md|markdown)$/.test(name);
        const isText = isMarkdown || current.mimeType === "text/plain" || name.endsWith(".txt");
        if (isText && current.size <= MAX_TEXT_BYTES) {
          const text = new TextDecoder().decode(await readBytes(current));
          if (!cancelled) {
            loaded = { html: isMarkdown ? sanitizeHtml(markdownToHtml(text)) : `<pre>${escapeHtml(text)}</pre>` };
          }
        } else if (current.mimeType.startsWith("image/") && current.size <= MAX_IMAGE_BYTES) {
          const bytes = await readBytes(current);
          if (cancelled) return;
          imageUrl = URL.createObjectURL(new Blob([bytes], { type: current.mimeType }));
          loaded = { imageUrl };
        } else {
          loaded = { note: "This file type cannot be shown inside ProseCraft yet." };
        }
      } catch (error) {
        console.error("Could not show a file in the split view.", error);
        if (!cancelled) loaded = { note: error instanceof Error ? error.message : "Could not open that file." };
      }
    })();
    return () => {
      cancelled = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  });

  function handleContentClick(event: MouseEvent) {
    const anchor = (event.target as Element | null)?.closest("a");
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) openUrl(href);
  }
</script>

<aside class="split-pane" aria-label="Reference pane">
  <div class="split-pane-header">
    <select aria-label="Show in this pane" value={target} onchange={(event) => onTarget((event.currentTarget as HTMLSelectElement).value)}>
      <option value="">Choose something to show…</option>
      {#each groups as group (group.label)}
        <optgroup label={group.label}>
          {#each group.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <button class="split-button" type="button" aria-label="Move this pane left" title="Move left" disabled={!canMoveLeft} onclick={() => onMove(-1)}><ArrowLeft size={14} aria-hidden="true" /></button>
    <button class="split-button" type="button" aria-label="Move this pane right" title="Move right" disabled={!canMoveRight} onclick={() => onMove(1)}><ArrowRight size={14} aria-hidden="true" /></button>
    <button class="split-button" type="button" aria-label="Add another pane" title={canAdd ? "Add another pane" : "Up to five reference panes"} disabled={!canAdd} onclick={onAdd}><Plus size={14} aria-hidden="true" /></button>
    <button class="split-button" type="button" aria-label="Close this pane" title="Close this pane" onclick={onClose}><X size={14} aria-hidden="true" /></button>
  </div>
  <div class="split-pane-body">
    {#if document}
      <h2 class="split-title">{document.title || "Untitled"}</h2>
      <div class="split-content" role="presentation" onclick={handleContentClick}>{@html documentHtml}</div>
    {:else if file}
      <h2 class="split-title">{file.title || file.fileName}</h2>
      {#if showPdf}{#key file.id}<PdfView load={() => readBytes(file)} />{/key}{/if}
      {#if loaded?.html}<div class="split-content" role="presentation" onclick={handleContentClick}>{@html loaded.html}</div>{/if}
      {#if loaded?.imageUrl}<img class="split-image" src={loaded.imageUrl} alt={file.title || file.fileName} />{/if}
      {#if loaded?.note}
        <p class="split-note">{loaded.note}</p>
        <button class="split-open-button" type="button" onclick={() => openExternally(file)}>Open externally</button>
      {/if}
    {:else}
      <p class="split-note">Pick a scene, wiki page or file above to read it next to your text.</p>
    {/if}
  </div>
</aside>

<style>
  .split-pane { display: flex; width: 100%; min-width: 0; max-height: calc(100vh - 88px); max-height: calc(100dvh - 88px); flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .split-pane-header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .split-pane-header select { min-width: 0; flex: 1; padding: 5px 8px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); font-size: 11px; }
  .split-button { width: 26px; height: 26px; flex: none; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 16px; }
  .split-button:hover:not(:disabled) { background: var(--control-hover); color: var(--text-primary); }
  .split-button:disabled { opacity: .4; cursor: default; }
  .split-pane-body { min-height: 0; flex: 1; overflow: auto; padding: 14px 18px 20px; line-height: 1.65; }
  .split-title { margin: 0 0 10px; color: var(--text-heading); font-size: 15px; }
  .split-content :global(pre) { white-space: pre-wrap; word-break: break-word; }
  .split-content :global(img), .split-image { max-width: 100%; }
  .split-note { color: var(--text-muted); font-size: 11px; }
  .split-open-button { height: 32px; padding: 0 13px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-size: 11px; }
  .split-open-button:hover { border-color: var(--accent); color: var(--text-heading); }
</style>
