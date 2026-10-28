<script lang="ts">
  import { tick } from "svelte";
  import {
    defaultPreviewPalette,
    readPreviewPalette,
    type ColorScheme,
    type PreviewPalette
  } from "./color-schemes";
  import { compileBook, estimatedPages } from "./publish/compile";
  import {
    COVER_ACCEPT,
    COVER_DESIGNS,
    COVER_PALETTES,
    imageFileToCoverDataUrl,
    resolveCoverImage
  } from "./publish/cover";
  import { renderExport } from "./publish/export";
  import { buildPreviewHtml } from "./publish/html";
  import {
    BACK_MATTER_PRESETS,
    createMatterPage,
    FRONT_MATTER_PRESETS,
    MATTER_BODY_LIMIT,
    MATTER_PAGE_LIMIT,
    MATTER_TITLE_LIMIT,
    type MatterPage
  } from "./publish/matter";
  import { fitPreviewFrame, paginatePreview } from "./publish/preview-pagination";
  import {
    createCustomStyle,
    MAX_CUSTOM_STYLES,
    normalizeCustomDraft,
    resolveStyleTokens,
    styleSummaries,
    type CustomExportStyle
  } from "./publish/presets";
  import { saveExport } from "./publish/save";
  import { listManuscriptSections } from "./publish/sections";
  import StyleEditorDialog from "./publish/StyleEditorDialog.svelte";
  import {
    FORMAT_INFO,
    FORMAT_ORDER,
    slugifyFilename,
    type ChapterData,
    type CompiledCover,
    type CoverMode,
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
  let styleDraft = $state<CustomExportStyle | null>(null);
  let styleDraftIsNew = $state(false);
  let styleDraftDeleteArmed = $state(false);
  let frontMatterPreset = $state(FRONT_MATTER_PRESETS[0].label);
  let backMatterPreset = $state(BACK_MATTER_PRESETS[0].label);
  let coverImageInput = $state<HTMLInputElement>();
  let coverAsset = $state<CompiledCover | null>(null);
  let coverBusy = $state(false);
  let coverError = $state("");
  let coverRequest = 0;
  let previewFrame = $state<HTMLIFrameElement>();
  let previewNav = $state<HTMLElement>();
  let previewSectionId = $state("");
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
    frontMatter: options.frontMatter,
    backMatter: options.backMatter,
    chapters,
    documents
  }));
  let styleEntries = $derived(styleSummaries(options.customStyles));
  let selectedStyle = $derived(resolveStyleTokens(options.style, options.customStyles));
  let canAddStyle = $derived(options.customStyles.length < MAX_CUSTOM_STYLES);
  let canAddFrontMatter = $derived(options.frontMatter.length < MATTER_PAGE_LIMIT);
  let canAddBackMatter = $derived(options.backMatter.length < MATTER_PAGE_LIMIT);
  let styleExistingLabels = $derived(
    styleEntries
      .filter((entry) => entry.id !== styleDraft?.id)
      .map((entry) => entry.label)
  );
  let previewOptions = $derived.by(() => {
    if (!styleDraft) return options;
    const draft = normalizeCustomDraft(styleDraft);
    const customStyles = options.customStyles.some((style) => style.id === draft.id)
      ? options.customStyles.map((style) => style.id === draft.id ? draft : style)
      : [...options.customStyles, draft];
    return { ...options, style: draft.id, customStyles };
  });
  let previewStyle = $derived(resolveStyleTokens(previewOptions.style, previewOptions.customStyles));
  let previewBook = $derived(coverAsset ? { ...compiled, cover: coverAsset } : compiled);
  let coverDesign = $derived(
    COVER_DESIGNS.find((design) => design.id === options.cover.design) ?? COVER_DESIGNS[0]
  );
  let coverSummary = $derived(
    options.cover.mode === "none"
      ? "None"
      : coverBusy
        ? "Preparing…"
        : options.cover.mode === "image"
          ? "Image"
          : coverDesign.label
  );
  let previewSections = $derived(listManuscriptSections(previewBook, options));
  let activePreviewSection = $derived(
    previewSections.find((section) => section.id === previewSectionId) ?? previewSections[0] ?? null
  );
  let previewSectionIndex = $derived(
    activePreviewSection
      ? previewSections.findIndex((section) => section.id === activePreviewSection.id)
      : -1
  );
  let previewGroups = $derived([
    {
      id: "front",
      label: "Front Matter",
      sections: previewSections.filter((section) => section.group === "front")
    },
    {
      id: "chapters",
      label: "Chapters",
      sections: previewSections.filter((section) => section.group === "chapters")
    },
    {
      id: "back",
      label: "Back Matter",
      sections: previewSections.filter((section) => section.group === "back")
    }
  ].filter((group) => group.sections.length > 0));
  let hasPreviewableContent = $derived(
    compiled.chapters.length > 0
    || compiled.frontMatter.length > 0
    || compiled.backMatter.length > 0
  );
  let paginatedPreview = $derived(options.format === "pdf" || options.format === "docx");
  let previewHtml = $derived(buildPreviewHtml(previewBook, previewOptions, {
    dark: theme === "dark",
    paginated: paginatedPreview,
    palette: previewPalette,
    section: activePreviewSection
  }));
  let frontMatterPageEstimate = $derived(
    (previewSections.some((section) => section.kind === "cover")
      && (options.format === "pdf" || options.format === "docx")
      ? 1
      : 0)
    + (options.includeTitlePage ? 1 : 0)
    + (options.includeCopyrightPage && compiled.copyright ? 1 : 0)
    + (compiled.dedication ? 1 : 0)
    + (options.includeTableOfContents && compiled.chapters.length > 0
      ? Math.max(1, Math.ceil(compiled.chapters.length / 24))
      : 0)
    + compiled.frontMatter.length
  );
  let backMatterPageEstimate = $derived(compiled.backMatter.length);
  let pageEstimate = $derived.by(() => {
    const bodyPages = estimatedPages(compiled.words, previewStyle.wordsPerPage);
    return bodyPages === null ? null : bodyPages + frontMatterPageEstimate + backMatterPageEstimate;
  });
  let filename = $derived(`${slugifyFilename(projectName)}.${FORMAT_INFO[options.format].extension}`);
  let canExport = $derived(compiled.scenes > 0 && !exporting);

  $effect(() => {
    const activeTheme = theme;
    const activeScheme = colorScheme;
    if (!activeTheme || !activeScheme) return;
    previewPalette = readPreviewPalette();
  });

  $effect(() => {
    const request = ++coverRequest;
    const currentOptions = previewOptions;
    const book = compiled;
    let cancelled = false;

    if (currentOptions.cover.mode === "none") {
      coverAsset = null;
      coverBusy = false;
      coverError = "";
      return () => {
        cancelled = true;
      };
    }

    coverBusy = true;
    resolveCoverImage(book, currentOptions)
      .then((asset) => {
        if (cancelled || request !== coverRequest) return;
        coverAsset = asset;
        coverError = "";
      })
      .catch((error) => {
        if (cancelled || request !== coverRequest) return;
        coverAsset = null;
        coverError = error instanceof Error ? error.message : "Could not prepare that cover.";
      })
      .finally(() => {
        if (!cancelled && request === coverRequest) coverBusy = false;
      });

    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const frame = previewFrame;
    if (!frame) return;
    const observer = new ResizeObserver(() => fitPreviewFrame(frame));
    observer.observe(frame);
    return () => observer.disconnect();
  });

  $effect(() => {
    const activeId = activePreviewSection?.id;
    const nav = previewNav;
    if (!activeId || !nav) return;
    tick().then(() => {
      if (previewNav !== nav) return;
      const items = Array.from(nav.querySelectorAll<HTMLElement>("[data-preview-section]"));
      const item = items.find((entry) => entry.dataset.previewSection === activeId);
      item?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  });

  async function handlePreviewFrameLoad() {
    const frame = previewFrame;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    await doc.fonts?.ready;
    if (previewFrame !== frame || frame.contentDocument !== doc) return;
    paginatePreview(doc);
    wirePreviewContents(doc);
    fitPreviewFrame(frame);
  }

  function selectPreviewSection(id: string) {
    previewSectionId = id;
  }

  function movePreviewSection(offset: number) {
    const next = previewSections[previewSectionIndex + offset];
    if (next) previewSectionId = next.id;
  }

  /**
   * Makes the Contents page jump between chapters without reloading the whole
   * book. The preview sandbox enables scripts so these handlers can run; its
   * srcdoc is generated entirely from escaped book content.
   */
  function wirePreviewContents(doc: Document) {
    for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href^="#chapter-"]'))) {
      anchor.addEventListener("click", (event) => {
        const href = anchor.getAttribute("href");
        if (!href) return;
        const anchorId = href.slice(1);
        const section = previewSections.find((entry) =>
          entry.kind === "chapter"
          && entry.chapterId
          && `chapter-${entry.chapterId}` === anchorId
        );
        if (!section) return;
        event.preventDefault();
        previewSectionId = section.id;
      });
    }
  }

  function update<K extends keyof PublishOptions>(key: K, value: PublishOptions[K]) {
    onOptionsChange({ ...options, [key]: value });
  }

  function updateText(key: "subtitle" | "copyright" | "dedication", value: string) {
    onOptionsChange({ ...options, [key]: value });
  }

  function updateCover(patch: Partial<PublishOptions["cover"]>) {
    onOptionsChange({ ...options, cover: { ...options.cover, ...patch } });
  }

  function setCoverMode(mode: CoverMode) {
    coverError = "";
    updateCover({
      mode,
      image: mode === "image" ? options.cover.image : ""
    });
  }

  function removeCoverImage() {
    coverError = "";
    updateCover({ mode: "none", image: "" });
  }

  async function handleCoverFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    coverBusy = true;
    coverError = "";
    try {
      const image = await imageFileToCoverDataUrl(file);
      updateCover({ mode: "image", image });
    } catch (error) {
      coverError = error instanceof Error ? error.message : "Could not prepare that cover image.";
    } finally {
      coverBusy = false;
    }
  }

  function matterPages(placement: "front" | "back"): MatterPage[] {
    return placement === "front" ? options.frontMatter : options.backMatter;
  }

  function setMatterPages(placement: "front" | "back", pages: MatterPage[]) {
    const key = placement === "front" ? "frontMatter" : "backMatter";
    onOptionsChange({ ...options, [key]: pages });
  }

  function addMatterPage(placement: "front" | "back", presetLabel: string) {
    const pages = matterPages(placement);
    if (pages.length >= MATTER_PAGE_LIMIT) return;
    const presets = placement === "front" ? FRONT_MATTER_PRESETS : BACK_MATTER_PRESETS;
    const preset = presets.find((entry) => entry.label === presetLabel) ?? presets[0];
    setMatterPages(placement, [...pages, createMatterPage(preset.title, preset.blank === true)]);
  }

  function updateMatterPage(
    placement: "front" | "back",
    id: string,
    patch: Partial<Pick<MatterPage, "title" | "body">>
  ) {
    setMatterPages(
      placement,
      matterPages(placement).map((page) => page.id === id ? { ...page, ...patch } : page)
    );
  }

  function removeMatterPage(placement: "front" | "back", id: string) {
    setMatterPages(placement, matterPages(placement).filter((page) => page.id !== id));
  }

  function moveMatterPage(placement: "front" | "back", id: string, offset: -1 | 1) {
    const pages = [...matterPages(placement)];
    const index = pages.findIndex((page) => page.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    setMatterPages(placement, pages);
  }

  function startNewStyle() {
    if (!canAddStyle || styleDraft) return;
    styleDraftIsNew = true;
    styleDraftDeleteArmed = false;
    styleDraft = createCustomStyle(options.style, options.customStyles);
  }

  function startEditStyle(id: string, armDelete = false) {
    if (styleDraft) return;
    const style = options.customStyles.find((entry) => entry.id === id);
    if (!style) return;
    styleDraftIsNew = false;
    styleDraftDeleteArmed = armDelete;
    styleDraft = { ...style };
  }

  function updateStyleDraft(draft: CustomExportStyle) {
    styleDraft = draft;
  }

  function saveStyleDraft(draft: CustomExportStyle) {
    const normalized = normalizeCustomDraft(draft);
    const label = normalized.label.trim();
    if (!label) return;
    const duplicate = styleEntries.some((entry) =>
      entry.id !== normalized.id && entry.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (duplicate) return;
    const saved = { ...normalized, label };
    const exists = options.customStyles.some((style) => style.id === saved.id);
    if (!exists && options.customStyles.length >= MAX_CUSTOM_STYLES) return;
    const customStyles = exists
      ? options.customStyles.map((style) => style.id === saved.id ? saved : style)
      : [...options.customStyles, saved];
    onOptionsChange({ ...options, customStyles, style: saved.id });
    closeStyleEditor();
  }

  function deleteStyleDraft() {
    const draft = styleDraft;
    if (!draft || styleDraftIsNew) return;
    const customStyles = options.customStyles.filter((style) => style.id !== draft.id);
    onOptionsChange({
      ...options,
      customStyles,
      style: options.style === draft.id ? "manuscript" : options.style
    });
    closeStyleEditor();
  }

  function closeStyleEditor() {
    styleDraft = null;
    styleDraftDeleteArmed = false;
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
        frontMatter: exportOptions.frontMatter,
        backMatter: exportOptions.backMatter,
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
          <span>{selectedStyle.label}</span>
        </div>
        <div class="style-list">
          {#each styleEntries as entry (entry.id)}
            <div class="style-card" class:selected={options.style === entry.id} class:custom={entry.custom}>
              <button
                type="button"
                class="style-select"
                aria-pressed={options.style === entry.id}
                onclick={() => update("style", entry.id)}
              >
                <span class="style-name">
                  <span class="style-label">{entry.label}</span>
                  {#if entry.custom}<span class="style-badge">Custom</span>{/if}
                </span>
                <span class="style-detail">{entry.detail}</span>
              </button>
              {#if entry.custom}
                <div class="style-actions">
                  <button
                    type="button"
                    class="style-action"
                    title="Edit style"
                    aria-label={`Edit ${entry.label}`}
                    onclick={() => startEditStyle(entry.id)}
                  >✎</button>
                  <button
                    type="button"
                    class="style-action style-action-delete"
                    title="Delete style"
                    aria-label={`Delete ${entry.label}`}
                    onclick={() => startEditStyle(entry.id, true)}
                  >×</button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <button type="button" class="new-style-button" disabled={!canAddStyle} onclick={startNewStyle}>
          + New style
        </button>
        <p class="style-hint">
          {#if canAddStyle}
            Custom styles are saved with this project.
          {:else}
            You’ve reached the limit of {MAX_CUSTOM_STYLES} custom styles.
          {/if}
        </p>
      </section>

      <section class="publish-section">
        <div class="section-heading">
          <h2>Cover</h2>
          <span>{coverSummary}</span>
        </div>
        <div class="cover-mode-tabs" role="group" aria-label="Cover mode">
          <button
            type="button"
            class:selected={options.cover.mode === "none"}
            aria-pressed={options.cover.mode === "none"}
            onclick={() => setCoverMode("none")}
          >None</button>
          <button
            type="button"
            class:selected={options.cover.mode === "image"}
            aria-pressed={options.cover.mode === "image"}
            onclick={() => setCoverMode("image")}
          >Image</button>
          <button
            type="button"
            class:selected={options.cover.mode === "generated"}
            aria-pressed={options.cover.mode === "generated"}
            onclick={() => setCoverMode("generated")}
          >Generated</button>
        </div>

        {#if options.cover.mode === "image"}
          <div class="cover-image-panel">
            <div class="cover-thumb" class:empty={!coverAsset}>
              {#if coverAsset}
                <img src={coverAsset.dataUrl} alt="Cover preview" />
              {:else}
                <span>No image</span>
              {/if}
            </div>
            <div class="cover-image-copy">
              <div class="cover-action-row">
                <button
                  type="button"
                  class="cover-action"
                  onclick={() => coverImageInput?.click()}
                >{options.cover.image ? "Replace" : "Choose image"}</button>
                {#if options.cover.image}
                  <button
                    type="button"
                    class="cover-action cover-action-quiet"
                    onclick={removeCoverImage}
                  >Remove</button>
                {/if}
              </div>
              <p>PNG, JPG, or WebP. Cropped to a 2:3 cover.</p>
            </div>
          </div>
          <input
            bind:this={coverImageInput}
            class="cover-file-input"
            type="file"
            accept={COVER_ACCEPT}
            onchange={handleCoverFile}
          />
        {:else if options.cover.mode === "generated"}
          <div class="cover-generated-panel">
            <div class="cover-thumb" class:empty={!coverAsset}>
              {#if coverAsset}
                <img src={coverAsset.dataUrl} alt="Generated cover preview" />
              {:else}
                <span>Generating…</span>
              {/if}
            </div>
            <div class="cover-generated-copy">
              <div class="cover-design-list">
                {#each COVER_DESIGNS as design (design.id)}
                  <button
                    type="button"
                    class="cover-design"
                    class:selected={options.cover.design === design.id}
                    aria-pressed={options.cover.design === design.id}
                    title={design.detail}
                    onclick={() => updateCover({ design: design.id })}
                  >
                    <span class="cover-design-name">{design.label}</span>
                    <span class="cover-design-detail">{design.detail}</span>
                  </button>
                {/each}
              </div>
              <div class="cover-palette-row" aria-label="Cover palette">
                {#each COVER_PALETTES as palette (palette.id)}
                  <button
                    type="button"
                    class="cover-palette"
                    class:selected={options.cover.palette === palette.id}
                    style={`--swatch:${palette.background};--swatch-ink:${palette.ink}`}
                    aria-label={`${palette.label} palette`}
                    aria-pressed={options.cover.palette === palette.id}
                    title={palette.label}
                    onclick={() => updateCover({ palette: palette.id })}
                  ></button>
                {/each}
              </div>
            </div>
          </div>
          <p class="cover-hint">Uses your title, subtitle, and author. Updates automatically.</p>
        {/if}
        {#if coverError}
          <p class="cover-error" role="alert">{coverError}</p>
        {/if}
        <p class="cover-hint">Included in PDF, EPUB, DOCX, and HTML exports.</p>
      </section>

      <section class="publish-section">
        <div class="section-heading"><h2>Manuscript</h2></div>
        <div class="option-list">
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
          <span>Front matter</span>
          <span class="details-hint">Title page, copyright, contents</span>
        </summary>
        <div class="details-body">
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
          <label class="option-row">
            <input
              type="checkbox"
              checked={options.includeCopyrightPage}
              onchange={(event) => update("includeCopyrightPage", (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong>Copyright on its own page</strong>
              <small>Move the copyright text off the title page.</small>
            </span>
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
          <label class="option-row">
            <input
              type="checkbox"
              checked={options.includeTableOfContents}
              onchange={(event) => update("includeTableOfContents", (event.currentTarget as HTMLInputElement).checked)}
            />
            <span>
              <strong>Table of contents</strong>
              <small>List chapter titles at the front of the book.</small>
            </span>
          </label>
          <div class="matter-editor">
            <div class="matter-editor-heading">
              <strong>Additional pages</strong>
              <span>{options.frontMatter.length}/{MATTER_PAGE_LIMIT}</span>
            </div>
            <div class="matter-add-row">
              <select bind:value={frontMatterPreset}>
                {#each FRONT_MATTER_PRESETS as preset (preset.label)}
                  <option value={preset.label}>{preset.label}</option>
                {/each}
              </select>
              <button
                type="button"
                disabled={!canAddFrontMatter}
                onclick={() => addMatterPage("front", frontMatterPreset)}
              >Add page</button>
            </div>
            {#each options.frontMatter as page, index (page.id)}
              <div class="matter-page-card">
                <div class="matter-page-toolbar">
                  <input
                    class="matter-page-title"
                    type="text"
                    value={page.title}
                    maxlength={MATTER_TITLE_LIMIT}
                    placeholder={page.blank && !page.title ? "Blank page" : "Page title"}
                    aria-label="Front matter page title"
                    oninput={(event) => updateMatterPage("front", page.id, { title: (event.currentTarget as HTMLInputElement).value })}
                  />
                  <button
                    type="button"
                    title="Move page up"
                    aria-label={`Move ${page.title || "front matter page"} up`}
                    disabled={index === 0}
                    onclick={() => moveMatterPage("front", page.id, -1)}
                  >↑</button>
                  <button
                    type="button"
                    title="Move page down"
                    aria-label={`Move ${page.title || "front matter page"} down`}
                    disabled={index === options.frontMatter.length - 1}
                    onclick={() => moveMatterPage("front", page.id, 1)}
                  >↓</button>
                  <button
                    type="button"
                    class="matter-page-remove"
                    title="Remove page"
                    aria-label={`Remove ${page.title || "front matter page"}`}
                    onclick={() => removeMatterPage("front", page.id)}
                  >×</button>
                </div>
                <textarea
                  value={page.body}
                  maxlength={MATTER_BODY_LIMIT}
                  rows="3"
                  placeholder="Page text…"
                  aria-label={`${page.title || "Front matter"} text`}
                  oninput={(event) => updateMatterPage("front", page.id, { body: (event.currentTarget as HTMLTextAreaElement).value })}
                ></textarea>
              </div>
            {/each}
          </div>
        </div>
      </details>

      <details class="publish-section details-section">
        <summary>
          <span>Back matter</span>
          <span class="details-hint">Acknowledgments, author notes, appendices</span>
        </summary>
        <div class="details-body">
          <div class="matter-editor">
            <div class="matter-editor-heading">
              <strong>Additional pages</strong>
              <span>{options.backMatter.length}/{MATTER_PAGE_LIMIT}</span>
            </div>
            <div class="matter-add-row">
              <select bind:value={backMatterPreset}>
                {#each BACK_MATTER_PRESETS as preset (preset.label)}
                  <option value={preset.label}>{preset.label}</option>
                {/each}
              </select>
              <button
                type="button"
                disabled={!canAddBackMatter}
                onclick={() => addMatterPage("back", backMatterPreset)}
              >Add page</button>
            </div>
            {#each options.backMatter as page, index (page.id)}
              <div class="matter-page-card">
                <div class="matter-page-toolbar">
                  <input
                    class="matter-page-title"
                    type="text"
                    value={page.title}
                    maxlength={MATTER_TITLE_LIMIT}
                    placeholder={page.blank && !page.title ? "Blank page" : "Page title"}
                    aria-label="Back matter page title"
                    oninput={(event) => updateMatterPage("back", page.id, { title: (event.currentTarget as HTMLInputElement).value })}
                  />
                  <button
                    type="button"
                    title="Move page up"
                    aria-label={`Move ${page.title || "back matter page"} up`}
                    disabled={index === 0}
                    onclick={() => moveMatterPage("back", page.id, -1)}
                  >↑</button>
                  <button
                    type="button"
                    title="Move page down"
                    aria-label={`Move ${page.title || "back matter page"} down`}
                    disabled={index === options.backMatter.length - 1}
                    onclick={() => moveMatterPage("back", page.id, 1)}
                  >↓</button>
                  <button
                    type="button"
                    class="matter-page-remove"
                    title="Remove page"
                    aria-label={`Remove ${page.title || "back matter page"}`}
                    onclick={() => removeMatterPage("back", page.id)}
                  >×</button>
                </div>
                <textarea
                  value={page.body}
                  maxlength={MATTER_BODY_LIMIT}
                  rows="3"
                  placeholder="Page text…"
                  aria-label={`${page.title || "Back matter"} text`}
                  oninput={(event) => updateMatterPage("back", page.id, { body: (event.currentTarget as HTMLTextAreaElement).value })}
                ></textarea>
              </div>
            {/each}
          </div>
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
        <span class="preview-badge">{previewStyle.label} · {FORMAT_INFO[options.format].label}</span>
      </header>
      {#if !hasPreviewableContent || !activePreviewSection}
        <div class="publish-empty">
          <strong>Nothing to publish yet</strong>
          <p>Add a scene to a chapter and it will appear here, ready to export.</p>
        </div>
      {:else}
        <div class="preview-workspace">
          <nav class="preview-nav" aria-label="Document navigator" bind:this={previewNav}>
            <div class="preview-nav-head">
              <span>Navigate</span>
              <div class="preview-nav-steps">
                <button
                  type="button"
                  aria-label="Previous section"
                  title="Previous section"
                  disabled={previewSectionIndex <= 0}
                  onclick={() => movePreviewSection(-1)}
                >‹</button>
                <span>{previewSectionIndex + 1} / {previewSections.length}</span>
                <button
                  type="button"
                  aria-label="Next section"
                  title="Next section"
                  disabled={previewSectionIndex >= previewSections.length - 1}
                  onclick={() => movePreviewSection(1)}
                >›</button>
              </div>
            </div>
            <div class="preview-nav-groups">
              {#each previewGroups as group (group.id)}
                <section class="preview-nav-group" aria-labelledby={`preview-nav-${group.id}`}>
                  <h3 id={`preview-nav-${group.id}`}>{group.label}</h3>
                  <div class="preview-nav-items">
                    {#each group.sections as section, index (section.id)}
                      <button
                        type="button"
                        class="preview-nav-item"
                        class:active={activePreviewSection.id === section.id}
                        aria-current={activePreviewSection.id === section.id ? "page" : undefined}
                        data-preview-section={section.id}
                        title={section.label}
                        onclick={() => selectPreviewSection(section.id)}
                      >
                        {#if group.id === "chapters"}
                          <span class="preview-nav-number">{String(index + 1).padStart(2, "0")}</span>
                        {/if}
                        <span class="preview-nav-label">{section.label}</span>
                      </button>
                    {/each}
                  </div>
                </section>
              {/each}
            </div>
          </nav>
          <div class="preview-stage">
            <iframe
              class="preview-frame"
              class:dark={theme === "dark"}
              title={`${activePreviewSection.label} preview`}
              sandbox="allow-same-origin allow-scripts"
              bind:this={previewFrame}
              onload={handlePreviewFrameLoad}
              srcdoc={previewHtml}
            ></iframe>
          </div>
        </div>
        <p class="preview-caption">
          {#if paginatedPreview}
            Paginated preview of {activePreviewSection.label}.
          {:else}
            Previewing {activePreviewSection.label}.
          {/if}
          Section {previewSectionIndex + 1} of {previewSections.length}.
          {#if pageEstimate !== null}Estimated {pageEstimate} {pageEstimate === 1 ? "page" : "pages"} for the full book.{/if}
        </p>
      {/if}
    </section>
  </div>
</section>

{#if styleDraft}
  <StyleEditorDialog
    initial={styleDraft}
    isNew={styleDraftIsNew}
    existingLabels={styleExistingLabels}
    deleteArmed={styleDraftDeleteArmed}
    onChange={updateStyleDraft}
    onSave={saveStyleDraft}
    onCancel={closeStyleEditor}
    onDelete={deleteStyleDraft}
  />
{/if}

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
  .publish-heading h1 { margin: 7px 0 6px; color: var(--text-heading); font-family: var(--interface-font); font-size: 23px; font-weight: 500; letter-spacing: -.35px; }
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
  .style-card { position: relative; display: flex; min-width: 0; flex-direction: column; border: 1px solid var(--border-control); border-radius: 7px; background: var(--control-bg); color: var(--text-primary); transition: border-color .12s, background .12s, box-shadow .12s; }
  .style-card:hover { border-color: var(--accent-soft); background: var(--control-hover); }
  .style-card.selected { border-color: var(--accent); background: var(--selected-bg); box-shadow: 0 0 0 1px var(--accent-ring); }
  .style-select { display: flex; width: 100%; min-width: 0; flex-direction: column; gap: 3px; padding: 9px 10px; border: 0; border-radius: inherit; background: transparent; color: inherit; cursor: pointer; text-align: left; }
  .style-card.custom .style-select { padding-right: 48px; }
  .style-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; }
  .style-action { width: 19px; height: 19px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; line-height: 1; }
  .style-action:hover { background: var(--surface-raised); color: var(--text-heading); }
  .style-action-delete:hover { color: var(--danger); }
  .style-name { display: flex; align-items: center; gap: 4px; min-width: 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 12px; font-weight: 600; }
  .style-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .style-badge { flex: 0 0 auto; padding: 1px 3px; border-radius: 2px; background: var(--accent); color: var(--accent-contrast); font-family: ui-sans-serif, sans-serif; font-size: 6px; font-weight: 700; letter-spacing: .35px; text-transform: uppercase; }
  .style-detail { color: var(--text-muted); font-size: 8px; line-height: 1.35; }
  .new-style-button { width: 100%; height: 29px; margin-top: 8px; border: 1px dashed var(--border-control); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; font-weight: 550; transition: border-color .12s, background .12s, color .12s; }
  .new-style-button:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); color: var(--text-heading); }
  .new-style-button:disabled { cursor: default; opacity: .45; }
  .style-hint { margin: 6px 0 0; color: var(--text-muted); font-size: 8px; line-height: 1.4; }
  .cover-mode-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); }
  .cover-mode-tabs button { height: 25px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; font-weight: 550; }
  .cover-mode-tabs button:hover { background: var(--control-hover); color: var(--text-heading); }
  .cover-mode-tabs button.selected { background: var(--selected-bg); color: var(--text-heading); box-shadow: 0 0 0 1px var(--accent-ring); }
  .cover-image-panel, .cover-generated-panel { display: flex; align-items: flex-start; gap: 10px; margin-top: 9px; }
  .cover-thumb { display: flex; width: 64px; height: 96px; flex: 0 0 auto; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border-control); border-radius: 4px; background: var(--surface-raised); color: var(--text-muted); font-size: 8px; line-height: 1.35; text-align: center; }
  .cover-thumb.empty { border-style: dashed; }
  .cover-thumb img { display: block; width: 100%; height: 100%; background: #fff; object-fit: contain; }
  .cover-image-copy, .cover-generated-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 6px; }
  .cover-action-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .cover-action { height: 26px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; font-weight: 550; }
  .cover-action:hover { border-color: var(--accent-soft); background: var(--control-hover); color: var(--text-heading); }
  .cover-action-quiet { color: var(--text-muted); }
  .cover-image-copy p { margin: 0; color: var(--text-muted); font-size: 8px; line-height: 1.4; }
  .cover-hint { margin: 7px 0 0; color: var(--text-muted); font-size: 8px; line-height: 1.4; }
  .cover-error { margin: 7px 0 0; color: var(--danger); font-size: 8px; line-height: 1.4; }
  .cover-file-input { display: none; }
  .cover-design-list { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .cover-design { display: flex; min-width: 0; flex-direction: column; gap: 2px; padding: 6px 7px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-family: inherit; text-align: left; }
  .cover-design:hover { border-color: var(--accent-soft); background: var(--control-hover); }
  .cover-design.selected { border-color: var(--accent); background: var(--selected-bg); box-shadow: 0 0 0 1px var(--accent-ring); }
  .cover-design-name { color: var(--text-heading); font-size: 9px; font-weight: 600; }
  .cover-design-detail { overflow: hidden; color: var(--text-muted); font-size: 7px; line-height: 1.35; text-overflow: ellipsis; }
  .cover-palette-row { display: flex; align-items: center; gap: 6px; margin-top: 7px; }
  .cover-palette { position: relative; width: 19px; height: 19px; padding: 0; border: 2px solid transparent; border-radius: 50%; background: var(--swatch); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .22); cursor: pointer; }
  .cover-palette.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-ring); }
  .cover-mode-tabs button:focus-visible, .cover-design:focus-visible, .cover-action:focus-visible, .cover-palette:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
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
  .matter-editor { display: flex; flex-direction: column; gap: 7px; padding-top: 2px; }
  .matter-editor-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: var(--text-secondary); font-size: 9px; }
  .matter-editor-heading strong { color: var(--text-heading); font-size: 9px; font-weight: 600; }
  .matter-editor-heading span { color: var(--text-muted); font-size: 8px; }
  .matter-add-row { display: flex; gap: 6px; }
  .matter-add-row select { min-width: 0; height: 28px; flex: 1; padding: 0 6px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 9px; }
  .matter-add-row button { height: 28px; flex: 0 0 auto; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; font-weight: 550; }
  .matter-add-row button:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); color: var(--text-heading); }
  .matter-add-row button:disabled { cursor: default; opacity: .45; }
  .matter-page-card { display: flex; flex-direction: column; gap: 5px; padding: 7px; border: 1px solid var(--border-soft); border-radius: 6px; background: var(--surface); }
  .matter-page-toolbar { display: flex; gap: 3px; align-items: center; }
  .matter-page-title { min-width: 0; height: 26px; flex: 1; padding: 0 6px; border: 1px solid var(--border-control); border-radius: 4px; outline: none; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 9px; font-weight: 550; }
  .matter-page-title:focus { border-color: var(--accent); }
  .matter-page-toolbar button { width: 22px; height: 22px; flex: 0 0 auto; padding: 0; border: 1px solid var(--border-control); border-radius: 4px; background: var(--control-bg); color: var(--text-muted); cursor: pointer; font-size: 10px; line-height: 1; }
  .matter-page-toolbar button:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); color: var(--text-heading); }
  .matter-page-toolbar button:disabled { cursor: default; opacity: .35; }
  .matter-page-remove:hover:not(:disabled) { color: var(--danger); }
  .matter-page-card textarea { width: 100%; padding: 6px 7px; border: 1px solid var(--border-control); border-radius: 4px; outline: none; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 9px; line-height: 1.45; resize: vertical; }
  .matter-page-card textarea:focus { border-color: var(--accent); }
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
  .preview-header h2 { margin: 5px 0 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 22px; font-weight: 500; }
  .preview-badge { padding: 4px 7px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text-muted); font-size: 8px; letter-spacing: .35px; white-space: nowrap; }
  .preview-workspace { display: grid; grid-template-columns: 174px minmax(0, 1fr); gap: 10px; align-items: stretch; }
  .preview-nav { display: flex; min-width: 0; max-height: min(84vh, 900px); flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .preview-nav-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 9px 8px; border-bottom: 1px solid var(--border-soft); color: var(--text-muted); font-size: 7px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
  .preview-nav-steps { display: flex; align-items: center; gap: 3px; letter-spacing: 0; text-transform: none; }
  .preview-nav-steps button { display: grid; width: 19px; height: 19px; place-items: center; padding: 0; border: 1px solid var(--border-control); border-radius: 4px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-size: 10px; line-height: 1; }
  .preview-nav-steps button:hover:not(:disabled) { border-color: var(--accent-soft); background: var(--control-hover); color: var(--text-heading); }
  .preview-nav-steps button:disabled { cursor: default; opacity: .35; }
  .preview-nav-steps > span { min-width: 29px; color: var(--text-muted); font-size: 7px; font-variant-numeric: tabular-nums; text-align: center; }
  .preview-nav-groups { min-height: 0; flex: 1; overflow-y: auto; padding: 4px 5px 7px; }
  .preview-nav-group { padding: 6px 1px 1px; }
  .preview-nav-group + .preview-nav-group { margin-top: 4px; border-top: 1px solid var(--border-soft); }
  .preview-nav-group h3 { margin: 0 4px 4px; color: var(--eyebrow); font-size: 7px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
  .preview-nav-items { display: flex; flex-direction: column; gap: 2px; }
  .preview-nav-item { display: flex; width: 100%; min-width: 0; align-items: center; gap: 5px; padding: 6px 7px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 9px; line-height: 1.35; text-align: left; }
  .preview-nav-item:hover { background: var(--control-hover); color: var(--text-heading); }
  .preview-nav-item.active { border-color: var(--accent-soft); background: var(--selected-bg); color: var(--text-heading); }
  .preview-nav-number { flex: 0 0 auto; color: var(--eyebrow); font-family: ui-monospace, monospace; font-size: 7px; font-variant-numeric: tabular-nums; }
  .preview-nav-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview-nav-item:focus-visible, .preview-nav-steps button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .preview-stage { min-width: 0; }
  .preview-frame { display: block; width: 100%; height: min(84vh, 900px); border: 1px solid var(--border); border-radius: 9px; background: var(--page-bg); box-shadow: var(--shadow-preview-frame); }
  .preview-caption { margin: 8px 2px 0; color: var(--text-muted); font-size: 8px; line-height: 1.45; }
  .publish-empty { display: flex; min-height: 320px; flex-direction: column; align-items: center; justify-content: center; padding: 30px; border: 1px dashed var(--border-control); border-radius: 9px; background: var(--surface); color: var(--text-muted); text-align: center; }
  .publish-empty strong { color: var(--text-heading); font-family: var(--interface-font); font-size: 18px; font-weight: 500; }
  .publish-empty p { max-width: 280px; margin: 8px 0 0; font-size: 10px; line-height: 1.55; }

  @container (max-width: 980px) {
    .preview-workspace { grid-template-columns: 1fr; gap: 8px; }
    .preview-nav { max-height: none; }
    .preview-nav-groups { display: flex; gap: 12px; overflow-x: auto; overflow-y: hidden; padding: 5px 6px 7px; }
    .preview-nav-group { flex: 0 0 auto; min-width: 0; padding: 0; }
    .preview-nav-group + .preview-nav-group { margin-top: 0; border-top: 0; border-left: 1px solid var(--border-soft); padding-left: 12px; }
    .preview-nav-group h3 { margin-bottom: 3px; }
    .preview-nav-items { flex-direction: row; gap: 4px; }
    .preview-nav-item { width: auto; max-width: 180px; white-space: nowrap; }
  }
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
    .format-grid, .style-list, .cover-design-list { grid-template-columns: 1fr; }
    .publish-summary { grid-template-columns: 1fr 1fr; row-gap: 10px; }
  }
</style>
