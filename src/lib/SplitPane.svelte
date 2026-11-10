<script lang="ts">
  import { ArrowLeft, ArrowLeftRight, ArrowRight, Plus, X } from "@lucide/svelte";
  import { buildChapterHtml } from "$lib/chapter-sections";
  import GraphTile from "$lib/GraphTile.svelte";
  import { markdownToHtml } from "$lib/publish/markdown";
  import type { ChapterData, DocumentData, ResearchFile, ResearchFolder, SceneSeparator } from "$lib/publish/types";
  import PdfView from "$lib/PdfView.svelte";
  import { sanitizeHtml } from "$lib/sanitize";
  import { parseSplitTarget, type SplitGroup } from "$lib/split";
  import TileEditor from "$lib/TileEditor.svelte";

  const MAX_TEXT_BYTES = 2 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_PDF_BYTES = 50 * 1024 * 1024;

  type Loaded = { html?: string; imageUrl?: string; note?: string };

  let {
    target,
    groups,
    documents,
    files,
    chapters,
    folders,
    activeDocumentId,
    sceneSeparator,
    isActiveDocument,
    canAdd,
    canMoveLeft,
    canMoveRight,
    canSwap,
    readBytes,
    openExternally,
    openUrl,
    onTarget,
    onMove,
    onSwap,
    onAdd,
    onEditTitle,
    onEditChapterTitle,
    onEditContent,
    onConfirmCharacter,
    onOpenPage,
    onClose
  }: {
    target: string;
    groups: SplitGroup[];
    documents: DocumentData[];
    files: ResearchFile[];
    chapters: ChapterData[];
    folders: ResearchFolder[];
    /** Document open in the main editor; the scene graph tile follows it. */
    activeDocumentId: string;
    sceneSeparator: SceneSeparator;
    /** True when this pane shows the document the main editor has open. */
    isActiveDocument: boolean;
    canAdd: boolean;
    canMoveLeft: boolean;
    canMoveRight: boolean;
    /** True when this pane shows a document that can take the editor's place. */
    canSwap: boolean;
    readBytes: (file: ResearchFile) => Promise<ArrayBuffer>;
    openExternally: (file: ResearchFile) => void;
    openUrl: (url: string) => void;
    onTarget: (value: string) => void;
    onMove: (delta: -1 | 1) => void;
    onSwap: () => void;
    onAdd: () => void;
    onEditTitle: (id: string, value: string) => void;
    onEditChapterTitle: (chapterId: string, value: string) => void;
    onEditContent: (id: string, html: string) => void;
    onConfirmCharacter: (sceneId: string, pageId: string) => void;
    onOpenPage: (id: string) => void;
    onClose: () => void;
  } = $props();

  const parsed = $derived(parseSplitTarget(target));
  const document = $derived(parsed?.kind === "doc"
    ? documents.find((doc) => doc.id === parsed.id && !doc.trashed) ?? null
    : null);
  const file = $derived(parsed?.kind === "file"
    ? files.find((item) => item.id === parsed.id) ?? null
    : null);
  // Scene targets render their whole chapter, scrolled to the scene.
  const chapterDocs = $derived(document?.chapterId
    ? documents.filter((doc) => doc.chapterId === document.chapterId && !doc.trashed)
    : []);
  const paneChapter = $derived(document?.chapterId
    ? chapters.find((chapter) => chapter.id === document.chapterId) ?? null
    : null);
  const inPaneChapter = $derived(paneChapter !== null && chapterDocs.length > 0);
  const paneTitle = $derived(inPaneChapter && paneChapter
    ? paneChapter.title || "Untitled chapter"
    : (document?.title || "Untitled"));
  const paneHtml = $derived(inPaneChapter
    ? sanitizeHtml(buildChapterHtml(chapterDocs.map((doc) => doc.content), sceneSeparator))
    : (document ? sanitizeHtml(document.content) : ""));
  const paneKey = $derived(inPaneChapter && paneChapter ? `chapter:${paneChapter.id}` : `doc:${document?.id ?? "none"}`);
  const scrollSection = $derived(inPaneChapter
    ? Math.max(0, chapterDocs.findIndex((doc) => doc.id === document?.id))
    : 0);
  const isPdf = $derived(Boolean(file && (file.mimeType === "application/pdf" || /\.pdf$/i.test(file.fileName))));
  const showPdf = $derived(Boolean(file && isPdf && file.size <= MAX_PDF_BYTES));

  let loaded = $state<Loaded | null>(null);
  let readScroller = $state<HTMLDivElement>();
  let lastReadScroll: string | undefined = undefined;

  // The read-only mirror follows retargets; later edits must not move it.
  $effect(() => {
    const scroller = readScroller;
    const key = target;
    const section = scrollSection;
    if (!scroller || lastReadScroll === key) return;
    lastReadScroll = key;
    if (section <= 0) {
      scroller.scrollTop = 0;
      return;
    }
    scroller.querySelectorAll(".scene-break")[section - 1]?.scrollIntoView({ block: "center" });
  });

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
      {#if parsed?.kind === "graph" && parsed.mode === "page" && !groups.some((group) => group.options.some((option) => option.value === target))}
        <option value={target}>Characters graph</option>
      {/if}
      {#each groups as group (group.label)}
        <optgroup label={group.label}>
          {#each group.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <button class="split-button" type="button" aria-label="Edit this in the main editor and show the current text here" title="Swap with the editor" disabled={!canSwap} onclick={onSwap}><ArrowLeftRight size={14} aria-hidden="true" /></button>
    <button class="split-button" type="button" aria-label="Move this pane left" title="Move left" disabled={!canMoveLeft} onclick={() => onMove(-1)}><ArrowLeft size={14} aria-hidden="true" /></button>
    <button class="split-button" type="button" aria-label="Move this pane right" title="Move right" disabled={!canMoveRight} onclick={() => onMove(1)}><ArrowRight size={14} aria-hidden="true" /></button>
    <button class="split-button" type="button" aria-label="Add another pane" title={canAdd ? "Add another pane" : "Up to five reference panes"} disabled={!canAdd} onclick={onAdd}><Plus size={14} aria-hidden="true" /></button>
    <button class="split-button" type="button" aria-label="Close this pane" title="Close this pane" onclick={onClose}><X size={14} aria-hidden="true" /></button>
  </div>
  <div class="split-pane-body" class:graph-body={parsed?.kind === "graph"} bind:this={readScroller}>
    {#if parsed?.kind === "graph"}
      <GraphTile
        {documents}
        {chapters}
        {folders}
        sceneId={activeDocumentId}
        pageId={parsed.mode === "page" ? parsed.id : null}
        onConfirm={(pageId) => onConfirmCharacter(activeDocumentId, pageId)}
        {onOpenPage}
      />
    {:else if document}
      {#if isActiveDocument}
        <h2 class="split-title">{paneTitle}</h2>
        <p class="split-note split-hint">Open in the editor</p>
        <div class="split-content" role="presentation" onclick={handleContentClick}>{@html paneHtml}</div>
      {:else}
        <!-- Keyed by chapter (or document), so a pending save can never land in another document. -->
        {#key paneKey}
          {@const documentId = document.id}
          {@const chapterId = inPaneChapter ? paneChapter?.id : null}
          <TileEditor
            title={paneTitle}
            html={paneHtml}
            scrollRequest={{ key: target, section: scrollSection }}
            onTitle={(value) => chapterId ? onEditChapterTitle(chapterId, value) : onEditTitle(documentId, value)}
            onChange={(html) => onEditContent(documentId, html)}
          />
        {/key}
      {/if}
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
  .split-pane { display: flex; width: 100%; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .split-pane-header { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .split-pane-header select { min-width: 0; flex: 1; padding: 5px 8px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); font-size: 11px; }
  @media (pointer: coarse) {
    /* iOS zooms the page when a focused control is smaller than 16px. */
    .split-pane-header select { font-size: 16px; }
  }
  .split-button { width: 26px; height: 26px; flex: none; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 16px; }
  .split-button:hover:not(:disabled) { background: var(--control-hover); color: var(--text-primary); }
  .split-button:disabled { opacity: .4; cursor: default; }
  .split-pane-body { min-height: 0; flex: 1; overflow: auto; padding: 14px 18px 20px; line-height: 1.65; }
  /* The graph tile fills the pane and scrolls internally. */
  .split-pane-body.graph-body { display: flex; overflow: hidden; padding: 0; }
  .split-title { margin: 0 0 10px; color: var(--text-heading); font-size: 15px; }
  .split-content :global(pre) { white-space: pre-wrap; word-break: break-word; }
  .split-content :global(img), .split-image { max-width: 100%; }
  .split-content :global(.scene-break) { margin: 24px auto; color: var(--text-faint); font-size: 14px; letter-spacing: 6px; text-align: center; }
  .split-content :global(.scene-break-blank:empty::before) { content: "· · ·"; opacity: .7; }
  .split-content :global(.scene-break-line::after) { display: block; width: 100px; height: 1px; margin: 0 auto; background: var(--border); content: ""; }
  .split-content :global(.scene-break-blank) { min-height: 22px; }
  .split-note { color: var(--text-muted); font-size: 11px; }
  .split-hint { margin: -4px 0 12px; }
  .split-open-button { height: 32px; padding: 0 13px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-size: 11px; }
  .split-open-button:hover { border-color: var(--accent); color: var(--text-heading); }
</style>
