<script lang="ts">
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
  import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

  let { load }: { load: () => Promise<ArrayBuffer> } = $props();

  let status = $state<"loading" | "ready" | "error">("loading");
  let message = $state("");
  let pageCount = $state(0);
  let aspect = $state(1.414);
  let width = $state(0);
  let currentPage = $state(1);
  let pagesElement = $state<HTMLDivElement | null>(null);

  let doc: PDFDocumentProxy | null = null;
  const visible = new Set<number>();
  const renderedWidth = new Map<number, number>();
  const tasks = new Map<number, RenderTask>();
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  const pageEntries = $derived(Array.from({ length: pageCount }, (_, index) => index + 1));

  function canvasFor(pageNumber: number): HTMLCanvasElement | null {
    return pagesElement?.querySelector<HTMLCanvasElement>(`canvas[data-page="${pageNumber}"]`) ?? null;
  }

  async function renderPage(pageNumber: number) {
    const pdf = doc;
    const canvas = canvasFor(pageNumber);
    const targetWidth = Math.floor(width);
    if (!pdf || !canvas || targetWidth < 50 || renderedWidth.get(pageNumber) === targetWidth) return;
    tasks.get(pageNumber)?.cancel();
    try {
      const page = await pdf.getPage(pageNumber);
      if (doc !== pdf) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (targetWidth / base.width) * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
      const task = page.render({ canvas, viewport });
      tasks.set(pageNumber, task);
      await task.promise;
      renderedWidth.set(pageNumber, targetWidth);
    } catch (error) {
      if ((error as { name?: string })?.name !== "RenderingCancelledException") {
        console.error("Could not render a PDF page.", error);
      }
    } finally {
      tasks.delete(pageNumber);
    }
  }

  // Load the document once; closing the pane or picking another file destroys it.
  $effect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const data = new Uint8Array(await load());
        if (cancelled) return;
        const task = pdfjs.getDocument({ data });
        loadingTask = task;
        const pdf = await task.promise;
        if (cancelled) return;
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        aspect = viewport.height / viewport.width;
        doc = pdf;
        pageCount = pdf.numPages;
        status = "ready";
      } catch (error) {
        if (cancelled) return;
        console.error("Could not open a PDF.", error);
        status = "error";
        message = (error as { name?: string })?.name === "PasswordException"
          ? "This PDF is password protected."
          : "This PDF could not be opened.";
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(resizeTimer);
      for (const task of tasks.values()) task.cancel();
      tasks.clear();
      renderedWidth.clear();
      visible.clear();
      doc = null;
      // Destroying the loading task also releases the document and its worker data.
      if (loadingTask) void loadingTask.destroy();
    };
  });

  // Render pages as they scroll near the viewport.
  $effect(() => {
    const container = pagesElement;
    if (status !== "ready" || !container) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.page);
        if (entry.isIntersecting) {
          visible.add(pageNumber);
          void renderPage(pageNumber);
        } else {
          visible.delete(pageNumber);
        }
      }
      if (visible.size > 0) currentPage = Math.min(...visible);
    }, { rootMargin: "600px 0px" });
    container.querySelectorAll(".pdf-page").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  });

  // Re-render the visible pages (debounced) when the pane is resized.
  $effect(() => {
    const current = width;
    if (status !== "ready" || current < 50) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const pageNumber of visible) void renderPage(pageNumber);
    }, 200);
  });
</script>

<div class="pdf-view" bind:clientWidth={width}>
  {#if status === "loading"}
    <p class="pdf-note">Opening PDF…</p>
  {:else if status === "error"}
    <p class="pdf-note">{message}</p>
  {:else}
    <p class="pdf-note pdf-position">Page {currentPage} of {pageCount}</p>
    <div class="pdf-pages" bind:this={pagesElement}>
      {#each pageEntries as pageNumber (pageNumber)}
        <div class="pdf-page" data-page={pageNumber} style={`min-height: ${Math.floor(width * aspect)}px`}>
          <canvas data-page={pageNumber}></canvas>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pdf-view { min-width: 0; }
  .pdf-note { margin: 0 0 8px; color: var(--text-muted); font-size: 11px; }
  .pdf-position { position: sticky; top: -14px; z-index: 1; padding: 4px 0; background: var(--surface); }
  .pdf-pages { display: flex; flex-direction: column; gap: 10px; }
  .pdf-page { overflow: hidden; border: 1px solid var(--border); border-radius: 3px; background: #fff; }
  canvas { display: block; }
</style>
