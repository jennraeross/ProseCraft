<script lang="ts">
  import {
    defaultPreviewPalette,
    readPreviewPalette,
    type ColorScheme,
    type PreviewPalette
  } from "./color-schemes";
  import { compileBook, estimatedPages } from "./publish/compile";
  import { renderExport } from "./publish/export";
  import { buildPreviewHtml } from "./publish/html";
  import { fitPreviewFrame, paginatePreview } from "./publish/preview-pagination";
  import { PRESETS, PRESET_ORDER } from "./publish/presets";
  import { saveExport } from "./publish/save";
  import {
    FORMAT_INFO,
    FORMAT_ORDER,
    slugifyFilename,
    type ChapterData,
    type DocumentData,
    type PublishOptions,
    type SceneSeparator
  } from "./publish/types";

  type Props = {
    chapters: ChapterData[];
    documents: DocumentData[];
    projectName: string;
    authorName: string;
    options: PublishOptions;
    theme: "light" | "dark";
    colorScheme: ColorScheme;
    onOptionsChange: (options: PublishOptions) => void;
    beforeExport: () => Promise<void>;
  };

  let {
    chapters,
    documents,
    projectName,
    authorName,
    options,
    theme,
    colorScheme,
    onOptionsChange,
    beforeExport
  }: Props = $props();

  let previewPalette = $state<PreviewPalette>(
    typeof document === "undefined" ? defaultPreviewPalette : readPreviewPalette()
  );
  let exporting = $state(false);
  let previewFrame = $state<HTMLIFrameElement>();
  let status = $state<{ tone: "idle" | "success" | "error"; message: string }>({
    tone: "idle",
    message: ""
  });

  const separatorOptions: Array<{ value: SceneSeparator; label: string }> = [
    { value: "hash", label: "#" },
    { value: "asterisks", label: "* * *" },
    { value: "line", label: "A rule" },
    { value: "blank", label: "Blank space" },
    { value: "none", label: "No separator" }
  ];

  let compiled = $derived(compileBook({
    title: projectName,
    author: authorName,
    subtitle: options.subtitle,
    copyright: options.copyright,
    dedication: options.dedication,
    chapters,
    documents
  }));
  let paginatedPreview = $derived(options.format === "pdf" || options.format === "docx");
  let previewHtml = $derived(buildPreviewHtml(compiled, options, {
    dark: theme === "dark",
    paginated: paginatedPreview,
    palette: previewPalette
  }));
  let pageEstimate = $derived(estimatedPages(compiled.words, PRESETS[options.style].wordsPerPage));
  let filename = $derived(`${slugifyFilename(projectName)}.${FORMAT_INFO[options.format].extension}`);
  let canExport = $derived(compiled.scenes > 0 && !exporting);

  $effect(() => {
    const activeTheme = theme;
    const activeScheme = colorScheme;
    if (!activeTheme || !activeScheme) return;
    previewPalette = readPreviewPalette();
  });

  $effect(() => {
    const frame = previewFrame;
    if (!frame) return;
    const observer = new ResizeObserver(() => fitPreviewFrame(frame));
    observer.observe(frame);
    return () => observer.disconnect();
  });

  async function handlePreviewFrameLoad() {
    const frame = previewFrame;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    await doc.fonts?.ready;
    if (previewFrame !== frame || frame.contentDocument !== doc) return;
    paginatePreview(doc);
    fitPreviewFrame(frame);
  }

  function update<K extends keyof PublishOptions>(key: K, value: PublishOptions[K]) {
    onOptionsChange({ ...options, [key]: value });
  }

  function updateText(key: "subtitle" | "copyright" | "dedication", value: string) {
    onOptionsChange({ ...options, [key]: value });
  }

  async function handleExport() {
    if (!canExport) return;
    const exportOptions = { ...options };
    exporting = true;
    status = { tone: "idle", message: "Preparing your manuscript…" };
    try {
      await beforeExport();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      // Compile again after the active scene has been flushed to the project.
      const book = compileBook({
        title: projectName,
        author: authorName,
        subtitle: exportOptions.subtitle,
        copyright: exportOptions.copyright,
        dedication: exportOptions.dedication,
        chapters,
        documents
      });
      const payload = await renderExport(book, exportOptions);
      const result = await saveExport(payload);
      if (result.outcome === "cancelled") {
        status = { tone: "idle", message: "Export cancelled." };
      } else if (result.outcome === "downloaded") {
        status = { tone: "success", message: `Downloaded ${result.filename}.` };
      } else {
        status = { tone: "success", message: `Saved ${result.filename}.` };
      }
    } catch (error) {
      console.error("Could not export the manuscript.", error);
      status = {
        tone: "error",
        message: error instanceof Error ? error.message : "Could not export the manuscript."
      };
    } finally {
      exporting = false;
    }
  }
</script>

<section class="publish-view" aria-label="Publish manuscript">
  <div class="publish-grid">
    <aside class="publish-controls">
      <header class="publish-heading">
        <span class="publish-eyebrow">PUBLISH</span>
        <h1>Publish your manuscript</h1>
        <p>Gather every chapter into one finished book, ready to share or print.</p>
      </header>

      <div class="publish-summary" aria-label="Manuscript summary">
        <div><strong>{compiled.chapters.length}</strong><span>{compiled.chapters.length === 1 ? "chapter" : "chapters"}</span></div>
        <div><strong>{compiled.scenes}</strong><span>{compiled.scenes === 1 ? "scene" : "scenes"}</span></div>
        <div><strong>{compiled.words.toLocaleString()}</strong><span>words</span></div>
        <div><strong>{pageEstimate === null ? "—" : pageEstimate}</strong><span>{pageEstimate === null ? "reflowable" : "pages"}</span></div>
      </div>

      <section class="publish-section">
        <div class="section-heading">
          <h2>Format</h2>
          <span>{FORMAT_INFO[options.format].extension.toUpperCase()}</span>
        </div>
        <div class="format-grid">
          {#each FORMAT_ORDER as format (format)}
            <button
              type="button"
              class="format-card"
              class:selected={options.format === format}
              aria-pressed={options.format === format}
              onclick={() => update("format", format)}
            >
              <span class="format-name">{FORMAT_INFO[format].label}</span>
              <span class="format-ext">.{FORMAT_INFO[format].extension}</span>
              <span class="format-description">{FORMAT_INFO[format].description}</span>
            </button>
          {/each}
        </div>
      </section>

      <section class="publish-section">
        <div class="section-heading">
          <h2>Style</h2>
          <span>{PRESETS[options.style].label}</span>
        </div>
        <div class="style-list">
          {#each PRESET_ORDER as preset (preset)}
            <button
              type="button"
              class="style-card"
              class:selected={options.style === preset}
              aria-pressed={options.style === preset}
              onclick={() => update("style", preset)}
            >
              <span class="style-name">{PRESETS[preset].label}</span>
              <span class="style-detail">{PRESETS[preset].detail}</span>
            </button>
          {/each}
        </div>
      </section>

      <section class="publish-section">
        <div class="section-heading"><h2>Manuscript</h2></div>
        <div class="option-list">
          <label class="option-row">
            <input
              type="checkbox"
              checked={options.includeTitlePage}
              onchange={(event) => update("includeTitlePage", (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong>Title page</strong>
              <small>Project title, subtitle, author, and copyright.</small>
            </span>
          </label>
          <label class="option-row">
            <input
              type="checkbox"
              checked={options.includeChapterTitles}
              onchange={(event) => update("includeChapterTitles", (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong>Chapter headings</strong>
              <small>Use the same chapter names and numbering as the sidebar.</small>
            </span>
          </label>
          <label class="option-row">
            <input
              type="checkbox"
              checked={options.includeSceneTitles}
              onchange={(event) => update("includeSceneTitles", (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong>Scene titles</strong>
              <small>Include each scene's title above its text.</small>
            </span>
          </label>
          <label class="option-row">
            <input
              type="checkbox"
              checked={options.pageBreakBeforeChapters}
              onchange={(event) => update("pageBreakBeforeChapters", (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong>Start chapters on a new page</strong>
              <small>Give every chapter a clean opening page.</small>
            </span>
          </label>
          <label class="option-row">
            <input
              type="checkbox"
              checked={options.dropCaps}
              onchange={(event) => update("dropCaps", (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong>Drop caps</strong>
              <small>Use a large initial letter when the style supports it.</small>
            </span>
          </label>
          <label class="option-row option-row-select">
            <span>
              <strong>Scene separator</strong>
              <small>Shown between scenes inside a chapter.</small>
            </span>
            <select
              value={options.sceneSeparator}
              onchange={(event) => update("sceneSeparator", (event.currentTarget as HTMLSelectElement).value as SceneSeparator)}
            >
              {#each separatorOptions as separator (separator.value)}
                <option value={separator.value}>{separator.label}</option>
              {/each}
            </select>
          </label>
        </div>
      </section>

      <details class="publish-section details-section">
        <summary>
          <span>Publication details</span>
          <span class="details-hint">Subtitle, copyright, dedication</span>
        </summary>
        <div class="details-body">
          <label class="text-field">
            <span>Subtitle</span>
            <input
              type="text"
              value={options.subtitle}
              maxlength="200"
              placeholder="Optional subtitle"
              oninput={(event) => updateText("subtitle", (event.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="text-field">
            <span>Copyright</span>
            <textarea
              value={options.copyright}
              maxlength="500"
              rows="2"
              placeholder="© 2026 Author. All rights reserved."
              oninput={(event) => updateText("copyright", (event.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
          <label class="text-field">
            <span>Dedication</span>
            <textarea
              value={options.dedication}
              maxlength="1000"
              rows="2"
              placeholder="For the people who kept the light on."
              oninput={(event) => updateText("dedication", (event.currentTarget as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        </div>
      </details>

      <div class="export-panel">
        <div class="filename-row">
          <span>File</span>
          <code>{filename}</code>
        </div>
        <button class="export-manuscript" type="button" disabled={!canExport} onclick={handleExport}>
          {exporting ? "Preparing…" : `Export ${FORMAT_INFO[options.format].label}`}
        </button>
        {#if status.message}
          <p class="export-status" class:success={status.tone === "success"} class:error={status.tone === "error"} role="status">
            {status.message}
          </p>
        {/if}
      </div>
    </aside>

    <section class="publish-preview" aria-label="Manuscript preview">
      <header class="preview-header">
        <div>
          <span class="publish-eyebrow">LIVE PREVIEW</span>
          <h2>{projectName || "Untitled"}</h2>
        </div>
        <span class="preview-badge">{PRESETS[options.style].label} · {FORMAT_INFO[options.format].label}</span>
      </header>
      {#if compiled.scenes === 0}
        <div class="publish-empty">
          <strong>Nothing to publish yet</strong>
          <p>Add a scene to a chapter and it will appear here, ready to export.</p>
        </div>
      {:else}
        <iframe
          class="preview-frame"
          class:dark={theme === "dark"}
          title="Manuscript preview"
          sandbox="allow-same-origin"
          bind:this={previewFrame}
          onload={handlePreviewFrameLoad}
          srcdoc={previewHtml}
        ></iframe>
        <p class="preview-caption">
          {#if paginatedPreview}
            Paginated preview of {options.includeTitlePage ? "the title page and " : ""}the first chapter.
          {:else}
            Previewing {options.includeTitlePage ? "the title page and " : ""}the first chapter.
          {/if}
          {#if pageEstimate !== null}Estimated {pageEstimate} {pageEstimate === 1 ? "page" : "pages"}.{/if}
        </p>
      {/if}
    </section>
  </div>
</section>

<style>
  .publish-view {
    width: min(100%, 1120px);
    flex: 1;
    min-width: 0;
    container-type: inline-size;
  }
  .publish-grid {
    display: grid;
    grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }
  .publish-controls {
    min-width: 0;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface);
  }
  .publish-heading { padding: 1px 2px 15px; border-bottom: 1px solid var(--border-soft); }
  .publish-eyebrow { color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: 1.2px; }
  .publish-heading h1 { margin: 7px 0 6px; color: var(--text-heading); font-family: var(--editor-font); font-size: 23px; font-weight: 500; letter-spacing: -.35px; }
  .publish-heading p { margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.55; }
  .publish-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 14px 0 15px; border-bottom: 1px solid var(--border-soft); }
  .publish-summary div { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
  .publish-summary strong { overflow: hidden; color: var(--text-heading); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; text-overflow: ellipsis; }
  .publish-summary span { color: var(--text-muted); font-size: 8px; letter-spacing: .25px; text-transform: uppercase; }
  .publish-section { padding: 15px 0; border-bottom: 1px solid var(--border-soft); }
  .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
  .section-heading h2 { margin: 0; color: var(--text-heading); font-size: 10px; font-weight: 650; letter-spacing: .55px; text-transform: uppercase; }
  .section-heading > span { color: var(--text-muted); font-size: 8px; text-transform: uppercase; letter-spacing: .5px; }
  .format-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .format-card { display: flex; min-width: 0; flex-direction: column; gap: 2px; padding: 9px 10px; border: 1px solid var(--border-control); border-radius: 7px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; text-align: left; transition: border-color .12s, background .12s, box-shadow .12s; }
  .format-card:hover { border-color: var(--accent-soft); background: var(--control-hover); }
  .format-card.selected { border-color: var(--accent); background: var(--selected-bg); box-shadow: 0 0 0 1px var(--accent-ring); }
  .format-name { color: var(--text-heading); font-size: 11px; font-weight: 600; }
  .format-ext { color: var(--eyebrow); font-family: ui-monospace, monospace; font-size: 8px; }
  .format-description { overflow: hidden; color: var(--text-muted); font-size: 8px; line-height: 1.35; text-overflow: ellipsis; }
  .style-list { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .style-card { display: flex; min-width: 0; flex-direction: column; gap: 3px; padding: 9px 10px; border: 1px solid var(--border-control); border-radius: 7px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; text-align: left; transition: border-color .12s, background .12s, box-shadow .12s; }
  .style-card:hover { border-color: var(--accent-soft); background: var(--control-hover); }
  .style-card.selected { border-color: var(--accent); background: var(--selected-bg); box-shadow: 0 0 0 1px var(--accent-ring); }
  .style-name { color: var(--text-heading); font-family: var(--editor-font); font-size: 12px; font-weight: 600; }
  .style-detail { color: var(--text-muted); font-size: 8px; line-height: 1.35; }
  .option-list { display: flex; flex-direction: column; gap: 9px; }
  .option-row { display: flex; align-items: flex-start; gap: 8px; color: var(--text-nav); cursor: pointer; }
  .option-row input { width: 13px; height: 13px; flex: 0 0 auto; margin: 1px 0 0; accent-color: var(--accent-strong); }
  .option-row > span { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
  .option-row strong { color: var(--text-primary); font-size: 10px; font-weight: 550; }
  .option-row small { color: var(--text-muted); font-size: 8px; line-height: 1.4; }
  .option-row-select { align-items: center; justify-content: space-between; gap: 12px; }
  .option-row-select select { width: 105px; height: 27px; flex: 0 0 auto; padding: 0 6px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-primary); font-size: 9px; }
  .details-section { padding-bottom: 12px; }
  .details-section summary { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: var(--text-heading); cursor: pointer; font-size: 10px; font-weight: 650; letter-spacing: .55px; text-transform: uppercase; list-style: none; }
  .details-section summary::-webkit-details-marker { display: none; }
  .details-section summary::before { content: "›"; margin-right: 6px; color: var(--text-muted); transition: transform .15s; }
  .details-section[open] summary::before { transform: rotate(90deg); }
  .details-section summary > span:first-child { flex: 1; }
  .details-hint { color: var(--text-muted); font-size: 8px; font-weight: 400; letter-spacing: 0; text-transform: none; }
  .details-body { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; }
  .text-field { display: flex; flex-direction: column; gap: 4px; }
  .text-field > span { color: var(--text-secondary); font-size: 9px; }
  .text-field input, .text-field textarea { width: 100%; padding: 7px 8px; border: 1px solid var(--border-control); border-radius: 5px; outline: none; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 10px; line-height: 1.45; resize: vertical; }
  .text-field input:focus, .text-field textarea:focus { border-color: var(--accent); }
  .export-panel { padding-top: 15px; }
  .filename-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 9px; color: var(--text-muted); font-size: 8px; }
  .filename-row span { flex: 0 0 auto; letter-spacing: .5px; text-transform: uppercase; }
  .filename-row code { overflow: hidden; color: var(--text-secondary); font-family: ui-monospace, monospace; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
  .export-manuscript { width: 100%; height: 34px; border: 1px solid transparent; border-radius: 6px; background: var(--accent-strong); color: var(--accent-contrast); cursor: pointer; font-size: 11px; font-weight: 550; transition: background .12s, opacity .12s; }
  .export-manuscript:hover:not(:disabled) { background: var(--accent-strong-hover); }
  .export-manuscript:disabled { cursor: default; opacity: .45; }
  .export-status { margin: 9px 0 0; color: var(--text-muted); font-size: 9px; line-height: 1.45; }
  .export-status.success { color: var(--success); }
  .export-status.error { color: var(--danger); }
  .publish-preview { position: sticky; top: 15px; min-width: 0; min-height: 0; }
  .preview-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 2px 2px 11px; border-bottom: 1px solid var(--border-soft); }
  .preview-header h2 { margin: 5px 0 0; color: var(--text-heading); font-family: var(--editor-font); font-size: 22px; font-weight: 500; }
  .preview-badge { padding: 4px 7px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text-muted); font-size: 8px; letter-spacing: .35px; white-space: nowrap; }
  .preview-frame { display: block; width: 100%; height: min(84vh, 900px); border: 1px solid var(--border); border-radius: 9px; background: var(--page-bg); box-shadow: var(--shadow-preview-frame); }
  .preview-caption { margin: 8px 2px 0; color: var(--text-muted); font-size: 8px; line-height: 1.45; }
  .publish-empty { display: flex; min-height: 320px; flex-direction: column; align-items: center; justify-content: center; padding: 30px; border: 1px dashed var(--border-control); border-radius: 9px; background: var(--surface); color: var(--text-muted); text-align: center; }
  .publish-empty strong { color: var(--text-heading); font-family: var(--editor-font); font-size: 18px; font-weight: 500; }
  .publish-empty p { max-width: 280px; margin: 8px 0 0; font-size: 10px; line-height: 1.55; }

  @container (max-width: 820px) {
    .publish-grid { grid-template-columns: minmax(280px, 320px) minmax(0, 1fr); gap: 14px; }
  }
  @container (max-width: 660px) {
    .publish-grid { grid-template-columns: 1fr; }
    .publish-preview { position: static; }
    .preview-frame { height: 72vh; }
  }
  @container (max-width: 380px) {
    .publish-controls { padding: 14px 12px; }
    .format-grid, .style-list { grid-template-columns: 1fr; }
    .publish-summary { grid-template-columns: 1fr 1fr; row-gap: 10px; }
  }
</style>
