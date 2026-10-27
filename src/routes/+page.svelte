<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { markdown } from "@codemirror/lang-markdown";
  import { EditorState, StateEffect, type Range as DecorationRange } from "@codemirror/state";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { tags } from "@lezer/highlight";
  import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate, WidgetType } from "@codemirror/view";
  import "@fontsource-variable/bitter/wght.css";
  import "@fontsource-variable/literata/wght.css";
  import "@fontsource/ibm-plex-serif/latin-400.css";
  import "@fontsource/ibm-plex-serif/latin-700.css";
  import "@fontsource/ibm-plex-sans/latin-400.css";
  import "@fontsource/ibm-plex-sans/latin-700.css";
  import "$lib/color-schemes.css";
  import { autoResize } from "$lib/auto-resize";
  import { centerCaretInViewport } from "$lib/typewriter";
  import EditorFontPicker from "$lib/EditorFontPicker.svelte";
  import EntitySheet, { type SheetSection } from "$lib/EntitySheet.svelte";
  import OutlineView from "$lib/OutlineView.svelte";
  import PublishView from "$lib/PublishView.svelte";
  import { colorSchemeOptions, isColorScheme, type ColorScheme } from "$lib/color-schemes";
  import {
    isMarkdownFontPreference,
    isRichTextFontPreference,
    listSystemFontFamilies,
    MARKDOWN_FONT_OPTIONS,
    markdownFontStack,
    RICH_TEXT_FONT_OPTIONS,
    richTextFontStack,
    type EditorFontSelection,
    type MarkdownFontPreference,
    type RichTextFontPreference,
    type SystemFontFamily
  } from "$lib/editor-fonts";
  import { sanitizeHtml as cleanHtml } from "$lib/sanitize";
  import {
    chapterLabel as formatChapterLabel,
    isAutomaticallyNumberedChapter as isAutoNumberedChapter
  } from "$lib/publish/chapters";
  import { htmlToMarkdown, markdownToHtml } from "$lib/publish/markdown";
  import {
    defaultPublishOptions,
    emptyCharacterSheet,
    emptyPlaceSheet,
    normalizeCharacterSheet,
    normalizePlaceSheet,
    normalizePublishOptions,
    SHEET_FIELD_LIMIT,
    SPACE_NAMES,
    type ChapterData,
    type CharacterSheet,
    type DocumentData,
    type NoteFolder,
    type PlaceSheet,
    type PublishOptions,
    type SpaceName
  } from "$lib/publish/types";
  import { saveExport } from "$lib/publish/save";
  import {
    createBundleText,
    createEncryptedBundleText,
    currentDeviceId,
    importBundleText,
    importEncryptedBundleText,
    loadVault,
    readStoredProjectRecords,
    saveVault,
    writeStored
  } from "$lib/storage/repository";
  import { readEncryptedBundleHint } from "$lib/storage/encrypted-bundle";
  import { clearSyncState, loadSyncState, saveSyncState } from "$lib/storage/sync/state";
  import type { FolderSyncProvider } from "$lib/storage/sync/folder-provider";
  import type {
    ActivityRecord,
    ProjectData,
    StoryboardCard,
    StoryboardKind,
    StoryboardRow
  } from "$lib/storage/types";

  const storageKey = "prosecraft-documents";
  const activeStorageKey = "prosecraft-active-document";
  const chaptersStorageKey = "prosecraft-chapters";
  const legacyStorageKey = "prosecraft-document";
  const themeStorageKey = "prosecraft-theme";
  const colorSchemeStorageKey = "prosecraft-color-scheme";
  const fontStorageKey = "prosecraft-editor-font";
  const markdownFontStorageKey = "prosecraft-markdown-editor-font";
  const richTextSystemFontStorageKey = "prosecraft-editor-system-font";
  const markdownSystemFontStorageKey = "prosecraft-markdown-editor-system-font";
  const scaleStorageKey = "prosecraft-editor-scale";
  const markdownEditorStorageKey = "prosecraft-markdown-editor-enabled";
  const typewriterStorageKey = "prosecraft-typewriter-mode";
  const fadeParagraphsStorageKey = "prosecraft-fade-other-paragraphs";
  const zenModeStorageKey = "prosecraft-zen-mode";
  const goalsStorageKey = "prosecraft-writing-goals";
  const activityStorageKey = "prosecraft-writing-activity";
  const projectSettingsStorageKey = "prosecraft-project-settings";
  const starterContent = `<p class="eyebrow">A NOTE TO BEGIN</p>
<h2>The shape of a first draft</h2>
<p>Every good piece of writing begins somewhere. Not with the perfect sentence, but with a willingness to put one honest thought after another.</p>
<p>This is your space to think on the page. Follow an idea, find its edges, and see where it takes you. The only thing a first draft has to do is exist.</p>
<blockquote>“You can always edit a bad page. You can’t edit a blank page.”</blockquote>
<p>Start wherever you are. The words will meet you there.</p>`;

  const spaces = SPACE_NAMES;
  type ThemePreference = "system" | "light" | "dark";
  const spaceNouns: Record<SpaceName, string> = {
    Characters: "character",
    Places: "place",
    Research: "research note",
    Notes: "note"
  };

  /**
   * Structured forms are rendered from config so adding a field is a one-line
   * change. Single-line inputs suit short facts; multiline fields use the
   * auto-growing textarea action for longer prose.
   */
  const characterSections: SheetSection[] = [
    {
      title: "Basics",
      fields: [
        { key: "role", label: "Role", placeholder: "Protagonist, antagonist, supporting…" },
        { key: "age", label: "Age", placeholder: "e.g. 34, or early 40s" },
        { key: "gender", label: "Gender", placeholder: "e.g. woman, man, non-binary" },
        { key: "pronouns", label: "Pronouns", placeholder: "she/her, they/them…" },
        { key: "ethnicity", label: "Ethnicity / heritage", placeholder: "e.g. Irish-American" },
        { key: "occupation", label: "Occupation", placeholder: "What do they do?" }
      ]
    },
    {
      title: "Appearance & voice",
      fields: [
        { key: "appearance", label: "Appearance", placeholder: "Build, features, clothing, distinguishing marks…", multiline: true },
        { key: "voice", label: "Voice & mannerisms", placeholder: "How they speak and carry themselves…", multiline: true }
      ]
    },
    {
      title: "Personality & background",
      fields: [
        { key: "personality", label: "Personality", placeholder: "Temperament, habits, the way they treat people…", multiline: true },
        { key: "background", label: "Background", placeholder: "Where they come from and what shaped them…", multiline: true },
        { key: "motivations", label: "Motivations & goals", placeholder: "What do they want, and why now?", multiline: true },
        { key: "flaws", label: "Flaws & fears", placeholder: "What holds them back or trips them up?", multiline: true }
      ]
    },
    {
      title: "Life & relationships",
      fields: [
        { key: "hobbies", label: "Hobbies & interests", placeholder: "What do they love doing off the page?", multiline: true },
        { key: "relationships", label: "Relationships", placeholder: "Family, friends, rivals, and entanglements…", multiline: true }
      ]
    }
  ];

  const placeSections: SheetSection[] = [
    {
      title: "Overview",
      fields: [
        { key: "type", label: "Type", placeholder: "City, village, forest, ship, planet…" },
        { key: "region", label: "Region", placeholder: "Where is it? Coast, mountains, borderlands…" },
        { key: "climate", label: "Climate & weather", placeholder: "Seasons, light, what the air feels like…" },
        { key: "population", label: "Population", placeholder: "How many people, or how busy is it?" },
        { key: "government", label: "Government", placeholder: "Who rules, and how?" },
        { key: "economy", label: "Economy", placeholder: "What keeps it running?" }
      ]
    },
    {
      title: "Look & atmosphere",
      fields: [
        { key: "appearance", label: "Appearance", placeholder: "Layout, architecture, sights, sounds, smells…", multiline: true },
        { key: "atmosphere", label: "Atmosphere", placeholder: "What it feels like to arrive and stay…", multiline: true },
        { key: "landmarks", label: "Landmarks", placeholder: "Places within the place that matter…", multiline: true }
      ]
    },
    {
      title: "History & culture",
      fields: [
        { key: "history", label: "History", placeholder: "Founding, turning points, old wounds…", multiline: true },
        { key: "culture", label: "Culture & customs", placeholder: "Beliefs, food, language, festivals, taboos…", multiline: true },
        { key: "inhabitants", label: "Notable inhabitants", placeholder: "Who lives here, and who is worth knowing?", multiline: true }
      ]
    },
    {
      title: "Story",
      fields: [
        { key: "significance", label: "Role in the story", placeholder: "Why this place matters to the plot or characters…", multiline: true },
        { key: "dangers", label: "Dangers & secrets", placeholder: "Threats, hidden places, what can go wrong here…", multiline: true }
      ]
    }
  ];

  type BoardDragSource = {
    pointerId: number;
    kind: StoryboardKind | "board-card";
    sourceId: string;
  };
  type NoteTreeItem =
    | { kind: "folder"; folder: NoteFolder; depth: number }
    | { kind: "document"; document: DocumentData; depth: number };
  type WorkspaceView = "outline" | "writing" | "storyboard" | "publish";

  let editor: HTMLDivElement;
  let settingsDialog: HTMLDialogElement;
  let projectSettingsDialog: HTMLDialogElement;
  let chapterNameInput = $state<HTMLInputElement>();
  let dataImportInput = $state<HTMLInputElement>();
  let dataStatus = $state("");
  let encryptedImportInput: HTMLInputElement;
  let passphraseDialog: HTMLDialogElement;
  let passphraseMode = $state<"export" | "import">("export");
  let passphraseDraft = $state("");
  let passphraseConfirm = $state("");
  let passphraseHint = $state("");
  let passphraseError = $state("");
  let passphraseBusy = $state(false);
  let pendingEncryptedImport = "";
  let pendingEncryptedHint = $state("");
  let desktopRuntime = $state(false);
  let syncFolder = $state("");
  let syncPassphrase = $state("");
  let syncBusy = $state(false);
  let syncStatus = $state("");
  let syncProvider: FolderSyncProvider | undefined;
  let syncProviderFolder = "";
  let lastEditorWordCount = 0;
  let title = $state("The shape of a first draft");
  let saveState = $state("All changes saved");
  let themePreference = $state<ThemePreference>("system");
  let resolvedTheme = $state<"light" | "dark">("light");
  let colorScheme = $state<ColorScheme>("prosecraft");
  let richTextFontPreference = $state<RichTextFontPreference>("serif");
  let markdownFontPreference = $state<MarkdownFontPreference>("sf-mono");
  let richTextSystemFont = $state("");
  let markdownSystemFont = $state("");
  let systemFonts = $state<SystemFontFamily[]>([]);
  let systemFontsLoaded = $state(false);
  let systemFontsLoading = $state(false);
  let systemFontsError = $state("");
  let systemFontsRequest: Promise<void> | undefined;
  let editorScale = $state(100);
  let markdownEditorEnabled = $state(false);
  let typewriterMode = $state(false);
  let fadeOtherParagraphs = $state(false);
  let zenMode = $state(false);
  let zenInterfaceHidden = $state(false);
  let markdownEditorMode = $state(false);
  let markdownSource = $state("");
  let markdownEditorHost = $state<HTMLDivElement>();
  let editorColumn = $state<HTMLDivElement>();
  let markdownCodeEditor: EditorView | undefined;
  let richTextTypewriterFrame: number | undefined;
  let markdownTypewriterFrame: number | undefined;
  let richTextFadeFrame: number | undefined;
  let richTextFadeNeedsApply = false;
  let richTextFadeActiveBlocks: HTMLElement[] = [];
  const writingBlockSelector = "p, h1, h2, h3, blockquote, pre, li, td, th, div";
  let selectedEditorImage = $state<HTMLImageElement | null>(null);
  let imageFileInput = $state<HTMLInputElement>();
  let imageDropActive = $state(false);
  let imageInsertError = $state("");
  let pendingImageRange: Range | null = null;
  let pendingMarkdownImagePosition: number | null = null;
  let preferencesSaved = $state(true);
  let projectSettingsSaved = $state(true);
  let projectName = $state("Untitled Project");
  let authorName = $state("");
  let projectNameDraft = $state("Untitled Project");
  let authorNameDraft = $state("");
  let projects = $state<ProjectData[]>([]);
  let activeProjectId = $state("");
  let wordCount = $state(0);
  let characterCount = $state(0);
  const initialViewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  let leftSidebarVisible = $state(initialViewportWidth > 760);
  let rightSidebarVisible = $state(initialViewportWidth > 1050);
  let compactChapterLayout = initialViewportWidth <= 760;
  let compactProgressLayout = initialViewportWidth <= 1050;
  let leftSidebarHovered = $state(false);
  let rightSidebarHovered = $state(false);
  let editingChapterId = $state<string | null>(null);
  let chapterNameDraft = $state("");
  let noteFolderInput = $state<HTMLInputElement>();
  let editingNoteFolderId = $state<string | null>(null);
  let noteFolderNameDraft = $state("");
  let draggedChapterId = $state<string | null>(null);
  let chapterDragPointerId = $state<number | null>(null);
  let boardDragSource = $state<BoardDragSource | null>(null);
  let boardDropTarget = $state<{ rowId: string; index: number } | null>(null);
  let storyboardCards = $state<StoryboardCard[]>([]);
  let storyboardRows = $state<StoryboardRow[]>([]);
  let workspaceView = $state<WorkspaceView>("writing");
  let writingSidebarState = {
    left: initialViewportWidth > 760,
    right: initialViewportWidth > 1050
  };
  let publishOptions = $state<PublishOptions>(defaultPublishOptions());
  let dropTargetChapterId = $state<string | null>(null);
  let dropAfterChapter = $state(false);
  let projectGoal = $state(50000);
  let chapterGoals = $state<Record<string, number>>({});
  let activity = $state<Record<string, ActivityRecord>>({});
  let viewedMonth = $state(new Date());
  let documents = $state<DocumentData[]>([]);
  let chapters = $state<ChapterData[]>([]);
  let noteFolders = $state<NoteFolder[]>([]);
  let expandedNoteFolders = $state<Record<string, boolean>>({});
  let expandedSpaces = $state<Record<SpaceName | "Trash", boolean>>({
    Characters: true,
    Places: true,
    Research: true,
    Notes: true,
    Trash: true
  });
  let activeDocumentId = $state("welcome");
  let activeDocument = $derived(documents.find((doc) => doc.id === activeDocumentId));
  class EmbeddedImageWidget extends WidgetType {
    toDOM() {
      const element = document.createElement("span");
      element.className = "markdown-image-placeholder";
      element.textContent = "embedded image";
      element.setAttribute("aria-label", "Embedded image data");
      return element;
    }
  }
  const embeddedImageAbbreviation = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = this.buildDecorations(update.view);
      }

      buildDecorations(view: EditorView): DecorationSet {
        const text = view.state.doc.toString();
        const ranges: DecorationRange<Decoration>[] = [];
        const pattern = /data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}/g;
        for (const match of text.matchAll(pattern)) {
          const from = match.index;
          if (from === undefined) continue;
          ranges.push(Decoration.replace({ widget: new EmbeddedImageWidget() }).range(from, from + match[0].length));
        }
        return Decoration.set(ranges, true);
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
  const refreshMarkdownFadeEffect = StateEffect.define<null>();
  const fadedMarkdownLine = Decoration.line({ class: "cm-faded-line" });

  function markdownActiveParagraphRange(view: EditorView): [number, number] {
    const { state } = view;
    const selection = state.selection.main;
    const fromLine = state.doc.lineAt(selection.from).number;
    const toLine = state.doc.lineAt(selection.to).number;
    let start = fromLine;
    let end = toLine;

    if (state.doc.line(fromLine).text.trim() !== "") {
      while (start > 1 && state.doc.line(start - 1).text.trim() !== "") start--;
    }
    if (state.doc.line(toLine).text.trim() !== "") {
      while (end < state.doc.lines && state.doc.line(end + 1).text.trim() !== "") end++;
    }
    return [start, end];
  }

  const markdownFadePlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = untrack(() => this.buildDecorations(view));
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged
          || update.selectionSet
          || update.viewportChanged
          || update.focusChanged
          || update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refreshMarkdownFadeEffect))
          )
        ) {
          this.decorations = untrack(() => this.buildDecorations(update.view));
        }
      }

      buildDecorations(view: EditorView): DecorationSet {
        if (!fadeOtherParagraphs || !view.hasFocus) return Decoration.none;

        const [startLine, endLine] = markdownActiveParagraphRange(view);
        const ranges: DecorationRange<Decoration>[] = [];
        for (const { from, to } of view.visibleRanges) {
          const firstLine = view.state.doc.lineAt(from).number;
          const lastLine = view.state.doc.lineAt(to).number;
          for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
            if (lineNumber >= startLine && lineNumber <= endLine) continue;
            ranges.push(fadedMarkdownLine.range(view.state.doc.line(lineNumber).from));
          }
        }
        return Decoration.set(ranges, true);
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
  const markdownZenInput = EditorView.domEventHandlers({
    beforeinput(event) {
      const inputEvent = event as InputEvent;
      if (isTypingInputType(inputEvent.inputType)) hideZenInterface();
      return false;
    }
  });
  $effect(() => {
    if (!markdownEditorMode || !markdownEditorHost) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: untrack(() => markdownSource),
        extensions: [
          markdown(),
          embeddedImageAbbreviation,
          markdownFadePlugin,
          markdownZenInput,
          syntaxHighlighting(HighlightStyle.define([
            { tag: tags.heading, color: "var(--text-heading)", fontWeight: "600" },
            { tag: tags.heading1, color: "var(--accent)", fontWeight: "700" },
            { tag: tags.strong, fontWeight: "700" },
            { tag: tags.emphasis, fontStyle: "italic" },
            { tag: tags.strikethrough, textDecoration: "line-through" },
            { tag: tags.link, color: "var(--link)", textDecoration: "underline" },
            { tag: tags.url, color: "var(--text-muted)" },
            { tag: tags.quote, color: "var(--quote)", fontStyle: "italic" },
            { tag: tags.list, color: "var(--accent)" },
            {
              tag: tags.monospace,
              color: "var(--selected-text)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              backgroundColor: "var(--surface-raised)"
            }
          ])),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": {
              minHeight: "430px",
              backgroundColor: "transparent",
              color: "var(--text-body)"
            },
            "&.cm-focused": { outline: "none" },
            ".cm-scroller": { overflow: "visible", lineHeight: "1.85" },
            ".cm-content": { minHeight: "430px", padding: "37px 1px 35px" },
            ".cm-line": { padding: "0" },
            ".cm-gutters": { display: "none" },
            ".cm-cursor": { borderLeftColor: "var(--text-primary)" }
          }),
          EditorView.updateListener.of((update) => {
            const { docChanged, state } = update;
            if (docChanged) {
              markdownSource = state.doc.toString();
              handleMarkdownInput();
            }
            if (update.focusChanged && !update.view.hasFocus) showZenInterface();
            if (
              typewriterMode
              && update.view.hasFocus
              && (update.selectionSet || docChanged || update.focusChanged)
            ) {
              scheduleMarkdownTypewriter(update.view);
            }
          })
        ]
      }),
      parent: markdownEditorHost
    });
    markdownCodeEditor = view;
    return () => {
      view.destroy();
      if (markdownCodeEditor === view) markdownCodeEditor = undefined;
    };
  });
  let noteTreeItems = $derived.by(() => {
    const items: NoteTreeItem[] = [];
    const notes = documents.filter((doc) => doc.space === "Notes" && !doc.trashed);
    items.push(...notes.filter((doc) => !doc.folderId).map((document) => ({
      kind: "document" as const, document, depth: 0
    })));
    const visit = (parentId: string | null, depth: number) => {
      for (const folder of noteFolders.filter((item) => item.parentId === parentId)) {
        items.push({ kind: "folder", folder, depth });
        if (expandedNoteFolders[folder.id] === false) continue;
        items.push(...notes.filter((doc) => doc.folderId === folder.id).map((document) => ({
          kind: "document" as const, document, depth: depth + 1
        })));
        visit(folder.id, depth + 1);
      }
    };
    visit(null, 0);
    return items;
  });
  let noteFolderChoices = $derived.by(() => {
    const choices: Array<{ folder: NoteFolder; depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const folder of noteFolders.filter((item) => item.parentId === parentId)) {
        choices.push({ folder, depth });
        visit(folder.id, depth + 1);
      }
    };
    visit(null, 0);
    return choices;
  });
  let isCharacterDocument = $derived(activeDocument?.space === "Characters");
  let isPlaceDocument = $derived(activeDocument?.space === "Places");
  let characterSheet = $derived(normalizeCharacterSheet(activeDocument?.character));
  let placeSheet = $derived(normalizePlaceSheet(activeDocument?.place));
  let projectWordCount = $derived(documents
    .filter((doc) => doc.chapterId && !doc.trashed)
    .reduce((total, doc) => total + countHtmlWords(doc.content), 0));
  let chapterWordCounts = $derived.by(() => Object.fromEntries(
    chapters.map((chapter) => [
      chapter.id,
      documents
        .filter((doc) => doc.chapterId === chapter.id && !doc.space && !doc.trashed)
        .reduce((total, doc) => total + countHtmlWords(doc.content), 0)
    ])
  ));
  let chapterSceneCounts = $derived.by(() => Object.fromEntries(
    chapters.map((chapter) => [
      chapter.id,
      documents.filter((doc) => doc.chapterId === chapter.id && !doc.space && !doc.trashed).length
    ])
  ));
  let calendarCells = $derived.by(() => {
    const year = viewedMonth.getFullYear();
    const month = viewedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ key: string; day: number; record?: ActivityRecord } | null> =
      Array.from({ length: new Date(year, month, 1).getDay() }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ key, day, record: activity[key] });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  });
  let activeDaysThisMonth = $derived(calendarCells.filter((cell) => cell?.record?.edits).length);
  let themeMediaQuery: MediaQueryList | undefined;
  let locationLabel = $derived.by(() => {
    if (activeDocument?.space) return activeDocument.space;
    const chapter = chapters.find((item) => item.id === activeDocument?.chapterId);
    return chapter ? chapterLabel(chapter) : "Chapters";
  });
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let publishTimer: ReturnType<typeof setTimeout> | undefined;

  function currentProjectData(): ProjectData {
    return {
      id: activeProjectId,
      name: projectName,
      author: authorName,
      documents,
      chapters,
      activeDocumentId,
      projectGoal,
      chapterGoals,
      activity,
      storyboardCards,
      storyboardRows,
      noteFolders,
      publishOptions
    };
  }

  function persistProjectCollection() {
    if (!activeProjectId) return;
    const current = currentProjectData();
    const currentIndex = projects.findIndex((project) => project.id === activeProjectId);
    projects = currentIndex < 0
      ? [...projects, current]
      : projects.map((project) => project.id === activeProjectId ? current : project);
    saveVault(projects, activeProjectId);
    void syncNativeProjectMenu();
  }

  async function syncNativeProjectMenu() {
    try {
      const { invoke, isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return;
      await invoke("update_project_menu", {
        projects: projects.map(({ id, name }) => ({ id, name })),
        activeProjectId
      });
    } catch (error) {
      console.error("Could not update the native project menu.", error);
    }
  }

  /**
   * Normalizes structured sheets on load so partially written or legacy records
   * always render a complete form without dropping their free-form notes.
   */
  function normalizeDocumentSheets(doc: DocumentData): DocumentData {
    if (doc.space === "Characters") {
      return { ...doc, character: normalizeCharacterSheet(doc.character) };
    }
    if (doc.space === "Places") {
      return { ...doc, place: normalizePlaceSheet(doc.place) };
    }
    return doc;
  }

  function loadProject(project: ProjectData) {
    activeProjectId = project.id;
    projectName = project.name;
    authorName = project.author;
    noteFolders = normalizeNoteFolders(project.noteFolders);
    expandedNoteFolders = {};
    const folderIds = new Set(noteFolders.map((folder) => folder.id));
    documents = project.documents.map((doc) => {
      const normalized = normalizeDocumentSheets(doc);
      if (normalized.space === "Notes" && normalized.folderId && folderIds.has(normalized.folderId)) {
        return normalized;
      }
      if (!normalized.folderId) return normalized;
      const { folderId: _folderId, ...withoutFolder } = normalized;
      return withoutFolder;
    });
    chapters = project.chapters.map((chapter) => ({
      ...chapter,
      summary: (typeof chapter.summary === "string" ? chapter.summary : "").slice(0, 4000)
    }));
    activeDocumentId = project.activeDocumentId;
    projectGoal = project.projectGoal;
    chapterGoals = project.chapterGoals;
    activity = project.activity;
    publishOptions = normalizePublishOptions(project.publishOptions);
    const savedRows = Array.isArray(project.storyboardRows)
      ? project.storyboardRows.filter((row): row is StoryboardRow =>
        typeof row === "object" && row !== null && typeof row.id === "string" && typeof row.title === "string")
      : [];
    storyboardRows = savedRows.length > 0 ? savedRows : [{ id: crypto.randomUUID(), title: "Timeline" }];
    const rowIds = new Set(storyboardRows.map((row) => row.id));
    const defaultRowId = storyboardRows[0].id;
    const savedCards = Array.isArray(project.storyboardCards)
      ? project.storyboardCards.filter((card): card is StoryboardCard =>
        typeof card === "object" && card !== null
        && typeof card.id === "string"
        && typeof card.sourceId === "string"
        && ["chapter", "scene", "blank", ...spaces].includes(card.kind)
        && typeof card.title === "string"
        && typeof card.note === "string")
      : [];
    storyboardCards = savedCards.map((card) => ({
      ...card,
      rowId: typeof card.rowId === "string" && rowIds.has(card.rowId) ? card.rowId : defaultRowId
    }));
    // Older projects kept chapter notes only on Storyboard cards. Promote the
    // first non-empty note to the chapter summary, then make every chapter card
    // mirror that canonical summary.
    const chapterSummaries = new Map(chapters.map((chapter) => [chapter.id, chapter.summary ?? ""]));
    for (const card of storyboardCards) {
      if (card.kind !== "chapter") continue;
      const current = chapterSummaries.get(card.sourceId)?.trim();
      if (!current && card.note.trim()) chapterSummaries.set(card.sourceId, card.note.slice(0, 4000));
    }
    chapters = chapters.map((chapter) => ({
      ...chapter,
      summary: chapterSummaries.get(chapter.id) ?? ""
    }));
    storyboardCards = storyboardCards.map((card) => {
      if (card.kind !== "chapter") return card;
      const summary = chapterSummaries.get(card.sourceId);
      return summary === undefined ? card : { ...card, note: summary };
    });
    const active = documents.find((doc) => doc.id === activeDocumentId && !doc.trashed)
      ?? documents.find((doc) => !doc.trashed);
    if (active) {
      activeDocumentId = active.id;
      title = active.title;
      clearRichTextFade();
      editor.innerHTML = active.content;
      setMarkdownSource(active.markdownSource ?? htmlToMarkdown(active.content));
    } else {
      activeDocumentId = "";
      title = "";
      editor.innerHTML = "<p><br></p>";
      setMarkdownSource("");
    }
    refreshCounts();
    lastEditorWordCount = wordCount;
  }

  function normalizeNoteFolders(value: unknown): NoteFolder[] {
    if (!Array.isArray(value)) return [];
    const folders: NoteFolder[] = [];
    const seen = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) continue;
      const folder = entry as Partial<NoteFolder>;
      if (typeof folder.id !== "string" || !folder.id || seen.has(folder.id)
        || typeof folder.title !== "string"
        || !(folder.parentId === null || typeof folder.parentId === "string")) continue;
      seen.add(folder.id);
      folders.push({
        id: folder.id,
        title: folder.title.trim().slice(0, 60) || "Untitled folder",
        parentId: folder.parentId
      });
    }
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    for (const folder of folders) {
      if (!folder.parentId || !byId.has(folder.parentId) || folder.parentId === folder.id) {
        folder.parentId = null;
        continue;
      }
      const path = new Set<string>();
      let current: NoteFolder | undefined = folder;
      while (current?.parentId) {
        if (path.has(current.id)) {
          folder.parentId = null;
          break;
        }
        path.add(current.id);
        current = byId.get(current.parentId);
      }
    }
    return folders;
  }

  function handleViewportResize() {
    const compactChapter = window.innerWidth <= 760;
    if (compactChapter && !compactChapterLayout) {
      leftSidebarVisible = false;
      if (workspaceView !== "writing") writingSidebarState.left = false;
    }
    compactChapterLayout = compactChapter;
    const compactProgress = window.innerWidth <= 1050;
    if (compactProgress && !compactProgressLayout) {
      rightSidebarVisible = false;
      if (workspaceView !== "writing") writingSidebarState.right = false;
    }
    compactProgressLayout = compactProgress;
  }

  function handleSidebarPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;

    const viewportWidth = window.innerWidth;
    const leftWidth = viewportWidth <= 440 ? 174 : viewportWidth <= 760 ? 220 : 258;
    const rightWidth = viewportWidth <= 440
      ? Math.min(270, viewportWidth - 24)
      : viewportWidth <= 1050 ? 270 : 286;

    if (!leftSidebarVisible) {
      leftSidebarHovered = event.clientX <= (leftSidebarHovered ? leftWidth : 16);
    }
    if (!rightSidebarVisible) {
      rightSidebarHovered = event.clientX >= viewportWidth - (rightSidebarHovered ? rightWidth : 16);
    }
  }

  function applyTheme(nextTheme: "light" | "dark") {
    document.documentElement.dataset.theme = nextTheme;
    resolvedTheme = nextTheme;
  }

  function handleSystemThemeChange(event: MediaQueryListEvent) {
    if (themePreference === "system") applyTheme(event.matches ? "dark" : "light");
  }

  function applyColorScheme(nextScheme: ColorScheme) {
    document.documentElement.dataset.colorScheme = nextScheme;
    colorScheme = nextScheme;
  }

  function savePreferences() {
    try {
      localStorage.setItem(themeStorageKey, themePreference);
      localStorage.setItem(colorSchemeStorageKey, colorScheme);
      localStorage.setItem(fontStorageKey, richTextFontPreference);
      localStorage.setItem(markdownFontStorageKey, markdownFontPreference);
      localStorage.setItem(richTextSystemFontStorageKey, richTextSystemFont);
      localStorage.setItem(markdownSystemFontStorageKey, markdownSystemFont);
      localStorage.setItem(scaleStorageKey, String(editorScale));
      localStorage.setItem(markdownEditorStorageKey, String(markdownEditorEnabled));
      localStorage.setItem(typewriterStorageKey, String(typewriterMode));
      localStorage.setItem(fadeParagraphsStorageKey, String(fadeOtherParagraphs));
      localStorage.setItem(zenModeStorageKey, String(zenMode));
      preferencesSaved = true;
    } catch {
      preferencesSaved = false;
    }
  }

  function setThemePreference(value: ThemePreference) {
    themePreference = value;
    applyTheme(value === "system"
      ? (themeMediaQuery?.matches ? "dark" : "light")
      : value);
    savePreferences();
  }

  function setColorScheme(value: ColorScheme) {
    applyColorScheme(value);
    savePreferences();
  }

  function applyRichTextFont() {
    document.documentElement.style.setProperty(
      "--writing-font",
      richTextFontStack(richTextFontPreference, richTextSystemFont)
    );
  }

  function applyMarkdownFont() {
    const root = document.documentElement;
    root.dataset.markdownFont = markdownSystemFont.trim() ? "custom" : markdownFontPreference;
    root.style.setProperty(
      "--markdown-editor-font",
      markdownFontStack(markdownFontPreference, markdownSystemFont)
    );
  }

  async function syncTypewriterMenu(checked: boolean) {
    try {
      const { invoke, isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return;
      await invoke("set_typewriter_menu_checked", { checked });
    } catch (error) {
      console.error("Could not update the typewriter menu.", error);
    }
  }

  async function syncFadeParagraphsMenu(checked: boolean) {
    try {
      const { invoke, isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return;
      await invoke("set_fade_paragraphs_menu_checked", { checked });
    } catch (error) {
      console.error("Could not update the fade paragraphs menu.", error);
    }
  }

  async function syncZenModeMenu(checked: boolean) {
    try {
      const { invoke, isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return;
      await invoke("set_zen_mode_menu_checked", { checked });
    } catch (error) {
      console.error("Could not update the Zen mode menu.", error);
    }
  }

  function closestWritingBlock(node: Node | null): HTMLElement | null {
    if (!node) return null;
    const element = node.nodeType === Node.ELEMENT_NODE
      ? node as Element
      : node.parentElement;
    const block = element?.closest(writingBlockSelector);
    if (!block || block === editor || !editor.contains(block)) return null;
    return block as HTMLElement;
  }

  function writingBlockAncestors(block: HTMLElement): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    let parent = block.parentElement;
    while (parent && parent !== editor) {
      if (parent.matches(writingBlockSelector)) ancestors.push(parent);
      parent = parent.parentElement;
    }
    return ancestors;
  }

  function selectedWritingBlocks(selection: Selection): HTMLElement[] {
    if (selection.isCollapsed) {
      const block = closestWritingBlock(selection.focusNode);
      return block ? [block] : [];
    }
    if (!selection.rangeCount) return [];
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return [];
    return Array.from(editor.querySelectorAll<HTMLElement>(writingBlockSelector))
      .filter((block) => block !== editor && range.intersectsNode(block));
  }

  function sameWritingBlocks(first: HTMLElement[], second: HTMLElement[]): boolean {
    return first.length === second.length && first.every((block, index) => block === second[index]);
  }

  function removeRichTextFadeClasses() {
    if (!editor) return;
    for (const block of editor.querySelectorAll<HTMLElement>(".faded-writing-block")) {
      block.classList.remove("faded-writing-block");
    }
  }

  function clearRichTextFade() {
    if (richTextFadeFrame === undefined && richTextFadeActiveBlocks.length === 0) return;
    if (richTextFadeFrame !== undefined) {
      cancelAnimationFrame(richTextFadeFrame);
      richTextFadeFrame = undefined;
    }
    richTextFadeNeedsApply = false;
    richTextFadeActiveBlocks = [];
    removeRichTextFadeClasses();
  }

  function applyRichTextFade(force = false) {
    if (!editor) return;
    if (!fadeOtherParagraphs || markdownEditorMode || !editor.contains(document.activeElement)) {
      clearRichTextFade();
      return;
    }

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.focusNode || !editor.contains(selection.focusNode)) {
      clearRichTextFade();
      return;
    }

    const activeBlocks = selectedWritingBlocks(selection);
    if (activeBlocks.length === 0) {
      clearRichTextFade();
      return;
    }

    const unchanged = sameWritingBlocks(activeBlocks, richTextFadeActiveBlocks)
      && richTextFadeActiveBlocks.every((block) => block.isConnected && editor.contains(block));
    if (!force && unchanged) return;

    removeRichTextFadeClasses();
    richTextFadeActiveBlocks = activeBlocks;
    const keep = new Set<HTMLElement>(activeBlocks);
    for (const block of activeBlocks) {
      for (const ancestor of writingBlockAncestors(block)) keep.add(ancestor);
    }
    for (const block of editor.querySelectorAll<HTMLElement>(writingBlockSelector)) {
      if (block === editor || keep.has(block) || block.querySelector(writingBlockSelector)) continue;
      block.classList.add("faded-writing-block");
    }
  }

  function scheduleRichTextFade(force = false) {
    if (!fadeOtherParagraphs || markdownEditorMode) return;
    if (force) richTextFadeNeedsApply = true;
    if (richTextFadeFrame !== undefined) return;
    richTextFadeFrame = requestAnimationFrame(() => {
      richTextFadeFrame = undefined;
      const shouldForce = richTextFadeNeedsApply;
      richTextFadeNeedsApply = false;
      applyRichTextFade(shouldForce);
    });
  }

  function refreshMarkdownFade() {
    markdownCodeEditor?.dispatch({ effects: refreshMarkdownFadeEffect.of(null) });
  }

  function richTextCaretRect(): DOMRect | null {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !selection.focusNode) {
      return null;
    }

    const range = document.createRange();
    try {
      range.setStart(selection.focusNode, selection.focusOffset);
      range.collapse(true);
    } catch {
      return null;
    }

    const rect = range.getBoundingClientRect();
    if (rect.height > 0) return rect;

    const element = selection.focusNode.nodeType === Node.ELEMENT_NODE
      ? selection.focusNode as Element
      : selection.focusNode.parentElement;
    const block = element?.closest("p, li, blockquote, h1, h2, h3, pre, div");
    if (!block || block === editor) return null;
    const blockRect = block.getBoundingClientRect();
    return blockRect.height > 0 ? blockRect : null;
  }

  function scheduleRichTextTypewriter() {
    if (!typewriterMode || richTextTypewriterFrame !== undefined) return;
    richTextTypewriterFrame = requestAnimationFrame(() => {
      richTextTypewriterFrame = undefined;
      if (!typewriterMode || !editor || !editor.contains(document.activeElement)) return;
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount || !selection.isCollapsed || !selection.focusNode) return;
      if (!editor.contains(selection.focusNode)) return;
      const rect = richTextCaretRect();
      if (rect) centerCaretInViewport(rect);
    });
  }

  function scheduleMarkdownTypewriter(view: EditorView) {
    if (!typewriterMode || markdownTypewriterFrame !== undefined) return;
    markdownTypewriterFrame = requestAnimationFrame(() => {
      markdownTypewriterFrame = undefined;
      if (!typewriterMode || !view.dom.isConnected || !view.hasFocus) return;
      const selection = view.state.selection.main;
      if (!selection.empty) return;
      const coords = view.coordsAtPos(selection.head);
      if (coords) centerCaretInViewport(coords);
    });
  }

  function handleRichTextSelectionChange() {
    if (!editor) return;
    if (!editor.contains(document.activeElement)) {
      clearRichTextFade();
      return;
    }

    if (fadeOtherParagraphs) scheduleRichTextFade();

    if (!typewriterMode) return;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed || !selection.focusNode) return;
    if (!editor.contains(selection.focusNode)) return;
    scheduleRichTextTypewriter();
  }

  function setTypewriterMode(enabled: boolean, syncMenu = true) {
    typewriterMode = enabled;
    savePreferences();
    if (syncMenu) void syncTypewriterMenu(enabled);

    if (!enabled) {
      if (richTextTypewriterFrame !== undefined) {
        cancelAnimationFrame(richTextTypewriterFrame);
        richTextTypewriterFrame = undefined;
      }
      if (markdownTypewriterFrame !== undefined) {
        cancelAnimationFrame(markdownTypewriterFrame);
        markdownTypewriterFrame = undefined;
      }
      return;
    }

    if (markdownEditorMode && markdownCodeEditor) {
      scheduleMarkdownTypewriter(markdownCodeEditor);
    } else {
      scheduleRichTextTypewriter();
    }
  }

  function setFadeOtherParagraphs(enabled: boolean, syncMenu = true) {
    fadeOtherParagraphs = enabled;
    savePreferences();
    if (syncMenu) void syncFadeParagraphsMenu(enabled);

    if (!enabled) {
      clearRichTextFade();
      refreshMarkdownFade();
      return;
    }

    if (markdownEditorMode && markdownCodeEditor) {
      refreshMarkdownFade();
    } else {
      scheduleRichTextFade(true);
    }
  }

  function hideZenInterface() {
    if (!zenMode || workspaceView !== "writing" || zenInterfaceHidden) return;
    leftSidebarHovered = false;
    rightSidebarHovered = false;
    zenInterfaceHidden = true;
  }

  function showZenInterface() {
    if (!zenInterfaceHidden) return;
    zenInterfaceHidden = false;
  }

  function setZenMode(enabled: boolean, syncMenu = true) {
    zenMode = enabled;
    savePreferences();
    if (syncMenu) void syncZenModeMenu(enabled);
    if (!enabled) showZenInterface();
  }

  function handleEditorBeforeInput(event: InputEvent) {
    if (!zenMode) return;
    if (isTypingInputType(event.inputType)) hideZenInterface();
  }

  function isTypingInputType(inputType: string | undefined): boolean {
    if (!inputType) return false;
    return inputType.startsWith("delete")
      || inputType.startsWith("insertFrom")
      || inputType === "insertText"
      || inputType === "insertCompositionText"
      || inputType === "insertParagraph"
      || inputType === "insertLineBreak"
      || inputType === "insertReplacementText";
  }

  function handleZenPointerMove(event: PointerEvent) {
    if (!zenInterfaceHidden) return;
    const target = event.target;
    if (target instanceof Node && editorColumn?.contains(target)) return;
    showZenInterface();
  }

  function setRichTextFontPreference(value: RichTextFontPreference) {
    richTextFontPreference = value;
    richTextSystemFont = "";
    applyRichTextFont();
    savePreferences();
  }

  function setRichTextSystemFont(family: string) {
    richTextSystemFont = family;
    applyRichTextFont();
    savePreferences();
  }

  function setMarkdownFontPreference(value: MarkdownFontPreference) {
    markdownFontPreference = value;
    markdownSystemFont = "";
    applyMarkdownFont();
    savePreferences();
  }

  function setMarkdownSystemFont(family: string) {
    markdownSystemFont = family;
    applyMarkdownFont();
    savePreferences();
  }

  function selectRichTextFont(selection: EditorFontSelection) {
    if (selection.source === "system") {
      setRichTextSystemFont(selection.family);
    } else if (isRichTextFontPreference(selection.id)) {
      setRichTextFontPreference(selection.id);
    }
  }

  function selectMarkdownFont(selection: EditorFontSelection) {
    if (selection.source === "system") {
      setMarkdownSystemFont(selection.family);
    } else if (isMarkdownFontPreference(selection.id)) {
      setMarkdownFontPreference(selection.id);
    }
  }

  function ensureSystemFonts() {
    if (systemFontsLoaded || systemFontsRequest) return;
    systemFontsLoading = true;
    systemFontsError = "";
    systemFontsRequest = listSystemFontFamilies()
      .then((fonts) => {
        systemFonts = fonts;
        systemFontsLoaded = true;
      })
      .catch(() => {
        systemFontsError = "Could not load installed fonts.";
      })
      .finally(() => {
        systemFontsLoading = false;
        systemFontsRequest = undefined;
      });
  }

  function installedFontMissing(family: string): boolean {
    if (!desktopRuntime || !family.trim() || !systemFontsLoaded) return false;
    const normalized = family.trim().toLowerCase();
    return !systemFonts.some((font) => font.family.toLowerCase() === normalized);
  }

  function setEditorScale(value: number) {
    editorScale = value;
    document.documentElement.style.setProperty("--editor-scale", String(value / 100));
    savePreferences();
  }

  function setMarkdownEditorEnabled(enabled: boolean) {
    if (!enabled && markdownEditorMode) switchToRichTextEditor();
    markdownEditorEnabled = enabled;
    savePreferences();
  }

  function openSettings() {
    showZenInterface();
    if (settingsDialog && !settingsDialog.open) settingsDialog.showModal();
    void ensureSystemFonts();
  }

  function openProjectSettings() {
    showZenInterface();
    projectNameDraft = projectName;
    authorNameDraft = authorName;
    if (projectSettingsDialog && !projectSettingsDialog.open) projectSettingsDialog.showModal();
  }

  function saveProjectSettings(event: SubmitEvent) {
    event.preventDefault();
    const nextProjectName = projectNameDraft.trim();
    if (!nextProjectName) return;
    try {
      projectName = nextProjectName;
      authorName = authorNameDraft.trim();
      persistProjectCollection();
      projectSettingsSaved = true;
      projectSettingsDialog.close();
    } catch {
      projectSettingsSaved = false;
    }
  }

  function switchProject(id: string) {
    if (id === activeProjectId) return;
    showZenInterface();
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const next = projects.find((project) => project.id === id);
    if (!next) return;
    loadProject(next);
    persistProjectCollection();
  }

  function createProject() {
    showZenInterface();
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const number = projects.length + 1;
    const next: ProjectData = {
      id: crypto.randomUUID(),
      name: number === 1 ? "Untitled Project" : `Untitled Project ${number}`,
      author: "",
      documents: [],
      chapters: [{ id: crypto.randomUUID(), title: "Chapter 1", expanded: true, summary: "" }],
      activeDocumentId: "",
      projectGoal: 50000,
      chapterGoals: {},
      activity: {},
      storyboardCards: [],
      storyboardRows: [{ id: crypto.randomUUID(), title: "Timeline" }],
      noteFolders: [],
      publishOptions: defaultPublishOptions()
    };
    const chapter = next.chapters[0];
    const scene: DocumentData = {
      id: crypto.randomUUID(),
      title: "Scene 1",
      content: "<p><br></p>",
      chapterId: chapter.id
    };
    next.documents = [scene];
    next.activeDocumentId = scene.id;
    projects = [...projects, next];
    loadProject(next);
    try {
      persistProjectCollection();
      projectSettingsSaved = true;
    } catch {
      projectSettingsSaved = false;
    }
    projectNameDraft = projectName;
    authorNameDraft = authorName;
    projectSettingsDialog?.showModal();
  }

  /**
   * Renders a structured sheet as readable plain text for single-document
   * export. Empty fields are omitted so a sparse sheet stays short.
   */
  function serializeSheet(
    sections: SheetSection[],
    values: Record<string, string>,
    fallbackTitle: string
  ): string {
    const lines = [title || fallbackTitle];
    for (const section of sections) {
      const filled = section.fields
        .map((field) => [field.label, (values[field.key] ?? "").trim()] as const)
        .filter(([, value]) => value);
      if (filled.length === 0) continue;
      lines.push("", section.title.toUpperCase());
      for (const [label, value] of filled) lines.push(`${label}: ${value}`);
    }
    return lines.join("\n");
  }

  function exportDocument() {
    const notes = (editor?.innerText ?? "").trim();
    let text = notes;
    if (isCharacterDocument) {
      text = serializeSheet(characterSections, characterSheet, "Untitled character");
    } else if (isPlaceDocument) {
      text = serializeSheet(placeSections, placeSheet, "Untitled place");
    }
    if ((isCharacterDocument || isPlaceDocument) && notes) {
      text = `${text}\n\nADDITIONAL NOTES\n${notes}`;
    }
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title || "untitled").replace(/[^\w-]+/g, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handlePublishOptionsChange(next: PublishOptions) {
    publishOptions = next;
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = setTimeout(() => {
      persistProjectCollection();
    }, 400);
  }

  async function exportDataBundle() {
    try {
      if (saveTimer) clearTimeout(saveTimer);
      persistNow();
      const text = createBundleText();
      const result = await saveExport({
        blob: new Blob([text], { type: "application/json" }),
        filename: "prosecraft-backup.prosecraft",
        extension: "prosecraft",
        formatName: "ProseCraft backup"
      });
      dataStatus = result.outcome === "cancelled" ? "" : "Backup exported.";
    } catch (error) {
      console.error("Could not export a backup.", error);
      dataStatus = "Could not export a backup.";
    }
  }

  function triggerImportData() {
    dataImportInput?.click();
  }

  async function handleImportData(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const result = importBundleText(await file.text());
      dataStatus = `Imported ${result.imported} of ${result.total} project(s). Reloading…`;
      setTimeout(() => location.reload(), 400);
    } catch (error) {
      console.error("Could not import a backup.", error);
      dataStatus = error instanceof Error ? error.message : "Could not import that backup.";
    }
  }

  function openEncryptedExport() {
    passphraseMode = "export";
    passphraseDraft = "";
    passphraseConfirm = "";
    passphraseHint = "";
    passphraseError = "";
    passphraseDialog?.showModal();
  }

  function triggerEncryptedImport() {
    encryptedImportInput?.click();
  }

  async function handleEncryptedImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      pendingEncryptedImport = await file.text();
    } catch {
      dataStatus = "Could not read that file.";
      return;
    }
    passphraseMode = "import";
    passphraseDraft = "";
    passphraseConfirm = "";
    passphraseHint = "";
    passphraseError = "";
    pendingEncryptedHint = readEncryptedBundleHint(pendingEncryptedImport) ?? "";
    passphraseDialog?.showModal();
  }

  async function submitPassphrase(event: SubmitEvent) {
    event.preventDefault();
    passphraseError = "";
    const passphrase = passphraseDraft;
    if (passphrase.length < 8) {
      passphraseError = "Use at least 8 characters.";
      return;
    }
    if (passphraseMode === "export" && passphrase !== passphraseConfirm) {
      passphraseError = "The passphrases do not match.";
      return;
    }
    passphraseBusy = true;
    try {
      if (passphraseMode === "export") {
        if (saveTimer) clearTimeout(saveTimer);
        persistNow();
        const text = await createEncryptedBundleText(passphrase, passphraseHint.trim() || undefined);
        const result = await saveExport({
          blob: new Blob([text], { type: "application/json" }),
          filename: "prosecraft-encrypted.prosecraft",
          extension: "prosecraft",
          formatName: "Encrypted ProseCraft backup"
        });
        if (result.outcome === "cancelled") return;
        dataStatus = "Encrypted backup exported.";
        passphraseDraft = "";
        passphraseConfirm = "";
        passphraseHint = "";
        passphraseDialog?.close();
      } else {
        const result = await importEncryptedBundleText(pendingEncryptedImport, passphrase);
        pendingEncryptedImport = "";
        dataStatus = `Imported ${result.imported} of ${result.total} project(s). Reloading…`;
        passphraseDraft = "";
        passphraseConfirm = "";
        passphraseDialog?.close();
        setTimeout(() => location.reload(), 400);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      if (message !== "Incorrect passphrase.") {
        console.error("Encrypted backup failed.", error);
      }
      passphraseError = message;
    } finally {
      passphraseBusy = false;
    }
  }

  async function getSyncProvider(folder: string): Promise<FolderSyncProvider> {
    if (syncProvider && syncProviderFolder === folder) return syncProvider;
    const [{ FolderSyncProvider: Provider }, { TauriFileSystem }] = await Promise.all([
      import("$lib/storage/sync/folder-provider"),
      import("$lib/storage/sync/tauri-fs")
    ]);
    syncProvider = new Provider(new TauriFileSystem(folder));
    syncProviderFolder = folder;
    return syncProvider;
  }

  async function chooseSyncFolder() {
    if (syncBusy) return;
    syncStatus = "";
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false, title: "Choose a sync folder" });
      if (typeof picked !== "string" || !picked) return;
      const previous = loadSyncState();
      if (previous?.folder !== picked) syncPassphrase = "";
      syncFolder = picked;
      syncProvider = undefined;
      syncProviderFolder = "";
      saveSyncState({
        folder: picked,
        lastSynced: previous?.folder === picked ? previous.lastSynced : {}
      });
      syncStatus = previous?.folder === picked
        ? "Folder ready. Enter your passphrase and choose Sync now."
        : "Folder saved. The first sync creates an encrypted vault inside it.";
    } catch (error) {
      console.error("Could not choose a sync folder.", error);
      syncStatus = "Could not open the folder picker.";
    }
  }

  function forgetSyncFolder() {
    if (syncBusy) return;
    clearSyncState();
    syncFolder = "";
    syncProvider = undefined;
    syncProviderFolder = "";
    syncPassphrase = "";
    syncStatus = "Sync folder forgotten. Files in the folder were left untouched.";
  }

  async function runSync() {
    if (!syncFolder || syncBusy) return;
    if (syncPassphrase.length < 8) {
      syncStatus = "Use a sync passphrase of at least 8 characters.";
      return;
    }
    syncBusy = true;
    syncStatus = "Syncing…";
    try {
      if (saveTimer) clearTimeout(saveTimer);
      persistNow();
      const provider = await getSyncProvider(syncFolder);
      const state = loadSyncState();
      const lastSynced = state?.folder === syncFolder ? state.lastSynced : {};
      const result = await provider.sync(
        syncPassphrase,
        readStoredProjectRecords(),
        lastSynced,
        Date.now(),
        currentDeviceId()
      );
      saveSyncState({ folder: syncFolder, lastSynced: result.lastSynced });
      const nextActiveId = result.projects.some((project) => project.id === activeProjectId)
        ? activeProjectId
        : (result.projects[0]?.id ?? "");
      writeStored(result.projects, nextActiveId);
      projects = result.projects.map((stored) => stored.project);
      const selected = projects.find((project) => project.id === nextActiveId);
      if (selected) {
        loadProject(selected);
      } else {
        activeProjectId = "";
      }
      void syncNativeProjectMenu();
      const details = [
        result.imported ? `${result.imported} imported` : "",
        result.exported ? `${result.exported} exported` : "",
        result.removed ? `${result.removed} removed` : "",
        result.conflicts
          ? `${result.conflicts} conflicted ${result.conflicts === 1 ? "copy" : "copies"}`
          : ""
      ].filter(Boolean).join(", ");
      syncStatus = result.created
        ? `Created an encrypted vault in this folder. ${result.projects.length} project(s) synced.`
        : `Synced ${result.projects.length} project(s)${details ? ` (${details})` : ""}.`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      if (message !== "Incorrect passphrase.") {
        console.error("Device sync failed.", error);
      }
      syncStatus = message === "Incorrect passphrase."
        ? "Incorrect passphrase."
        : `Sync failed: ${message}`;
    } finally {
      syncBusy = false;
    }
  }

  function setWorkspaceView(next: WorkspaceView) {
    if (next === workspaceView) return;
    showZenInterface();
    if (workspaceView === "writing" && next !== "writing") {
      writingSidebarState = { left: leftSidebarVisible, right: rightSidebarVisible };
    }
    leftSidebarHovered = false;
    rightSidebarHovered = false;
    if (next === "writing") {
      leftSidebarVisible = writingSidebarState.left;
      rightSidebarVisible = writingSidebarState.right;
    } else {
      leftSidebarVisible = false;
      rightSidebarVisible = false;
    }
    workspaceView = next;
  }

  function openOutlineView() {
    persistNow();
    setWorkspaceView("outline");
  }

  function addOutlineChapter() {
    const chapter = createChapter({ focusEditor: false });
    return chapter.id;
  }

  function syncChapterSummary(chapterId: string, summary: string) {
    const nextSummary = summary.slice(0, 4000);
    chapters = chapters.map((chapter) => chapter.id === chapterId
      ? { ...chapter, summary: nextSummary }
      : chapter);
    storyboardCards = storyboardCards.map((card) => card.kind === "chapter" && card.sourceId === chapterId
      ? { ...card, note: nextSummary }
      : card);
  }

  function updateChapterSummary(chapterId: string, summary: string) {
    syncChapterSummary(chapterId, summary);
    persist();
  }

  function openPublishView() {
    persistNow();
    setWorkspaceView("publish");
  }

  async function preparePublishExport() {
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    await tick();
  }

  function switchToMarkdownEditor() {
    if (!markdownEditorEnabled || markdownEditorMode) return;
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const active = documents.find((doc) => doc.id === activeDocumentId);
    setMarkdownSource(active?.markdownSource ?? htmlToMarkdown(editor.innerHTML));
    selectEditorImage(null);
    clearRichTextFade();
    markdownEditorMode = true;
  }

  function switchToRichTextEditor() {
    if (!markdownEditorMode) return;
    if (saveTimer) clearTimeout(saveTimer);
    const html = cleanHtml(markdownToHtml(markdownSource));
    editor.innerHTML = html;
    documents = documents.map((doc) => doc.id === activeDocumentId
      ? { ...doc, content: html, markdownSource }
      : doc);
    markdownEditorMode = false;
    refreshCounts();
    lastEditorWordCount = wordCount;
    persistNow();
    void tick().then(() => scheduleRichTextFade(true));
  }

  function toggleEditorMode() {
    showZenInterface();
    if (markdownEditorMode) switchToRichTextEditor();
    else switchToMarkdownEditor();
  }

  function handleMarkdownInput() {
    const previousWordCount = lastEditorWordCount;
    const html = cleanHtml(markdownToHtml(markdownSource));
    documents = documents.map((doc) => doc.id === activeDocumentId
      ? { ...doc, content: html, markdownSource }
      : doc);
    const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
    wordCount = text.trim().match(/\S+/g)?.length ?? 0;
    characterCount = text.replace(/\n/g, "").length;
    trackActivity(wordCount - previousWordCount);
    lastEditorWordCount = wordCount;
    persist();
  }

  const MAX_IMAGE_FILE_BYTES = 15_000_000;
  const MAX_IMAGE_PIXELS = 50_000_000;
  const MAX_EMBEDDED_IMAGE_BYTES = 1_500_000;
  const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp"
  };

  function imageFiles(files: FileList | null | undefined): File[] {
    return Array.from(files ?? []).filter((file) =>
      file.type.startsWith("image/") || /\.(?:png|jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i.test(file.name)
    );
  }

  function isSupportedImage(file: File): boolean {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    return ["image/png", "image/jpeg", "image/webp"].includes(file.type)
      || (!file.type || file.type === "application/octet-stream" || file.type === "image/jpg")
        && extension in IMAGE_MIME_BY_EXTENSION;
  }

  function markdownImagePosition(event?: DragEvent | ClipboardEvent): number | null {
    const view = markdownCodeEditor;
    if (!view) return null;
    if (event instanceof DragEvent) {
      return view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
    }
    return view.state.selection.main.head;
  }

  function editorRangeAtPoint(event?: DragEvent | ClipboardEvent): Range | null {
    const selection = window.getSelection();
    if (event instanceof DragEvent) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range && editor.contains(range.startContainer)) return range;
    }
    if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
      return selection.getRangeAt(0).cloneRange();
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  async function imageFileToDataUrl(file: File): Promise<string> {
    if (!isSupportedImage(file)) throw new Error("Use a PNG, JPG, or WebP image.");
    if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error("Images must be 15 MB or smaller.");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const source = !file.type || file.type === "application/octet-stream"
      ? new Blob([file], { type: IMAGE_MIME_BY_EXTENSION[extension] })
      : file;
    const imageUrl = URL.createObjectURL(source);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not decode that image."));
        image.src = imageUrl;
      });
    } catch (error) {
      URL.revokeObjectURL(imageUrl);
      throw new Error("Could not read that image.", { cause: error });
    }
    try {
      if (image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
        throw new Error("That image has too many pixels to insert.");
      }
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare that image.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.7, 0.58]) {
        const dataUrl = canvas.toDataURL("image/webp", quality);
        const base64 = dataUrl.split(",", 2)[1] ?? "";
        if (dataUrl.startsWith("data:image/webp;base64,")
          && base64.length <= Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4) return dataUrl;
      }
      if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
        for (const quality of [0.82, 0.7, 0.58]) {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const base64 = dataUrl.split(",", 2)[1] ?? "";
          if (dataUrl.startsWith("data:image/jpeg;base64,")
            && base64.length <= Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4) return dataUrl;
        }
      }
      const pngDataUrl = canvas.toDataURL("image/png");
      const pngBase64 = pngDataUrl.split(",", 2)[1] ?? "";
      if (pngBase64.length <= Math.ceil(MAX_EMBEDDED_IMAGE_BYTES / 3) * 4) return pngDataUrl;
      throw new Error("That image is too large after compression. Try a smaller image.");
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function insertRichTextImage(dataUrl: string, alt: string, range: Range | null) {
    const target = range && editor.contains(range.startContainer)
      ? range
      : editorRangeAtPoint();
    if (!target) return;
    target.deleteContents();
    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = alt;
    target.insertNode(image);
    selectEditorImage(image);
    const lineBreak = document.createElement("br");
    image.after(lineBreak);
    target.setStartAfter(lineBreak);
    target.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(target);
    editor.focus();
    image.scrollIntoView({ block: "nearest", inline: "nearest" });
    handleInput();
  }

  function selectEditorImage(image: HTMLImageElement | null) {
    selectedEditorImage?.classList.remove("selected-writing-image");
    selectedEditorImage = image && editor.contains(image) ? image : null;
    selectedEditorImage?.classList.add("selected-writing-image");
  }

  function handleEditorClick(event: MouseEvent) {
    const target = event.target;
    const image = target instanceof Element ? target.closest("img") : null;
    selectEditorImage(image instanceof HTMLImageElement ? image : null);
  }

  function setSelectedImageWidth(percent: number | null) {
    const image = selectedEditorImage;
    if (!image || !editor.contains(image)) {
      selectEditorImage(null);
      return;
    }
    if (percent === null) {
      image.removeAttribute("width");
      image.removeAttribute("height");
    } else {
      const width = Math.round(editor.clientWidth * percent / 100);
      const ratio = image.naturalHeight / image.naturalWidth;
      image.setAttribute("width", String(width));
      image.setAttribute("height", String(Math.round(width * ratio)));
    }
    handleInput();
  }

  function removeSelectedImage() {
    const image = selectedEditorImage;
    if (!image || !editor.contains(image)) {
      selectEditorImage(null);
      return;
    }
    image.remove();
    selectEditorImage(null);
    editor.focus();
    handleInput();
  }

  function insertMarkdownImage(dataUrl: string, alt: string, position: number | null) {
    const view = markdownCodeEditor;
    if (!view) return;
    const at = position ?? view.state.selection.main.head;
    const safeAlt = alt.replace(/[\[\]\\\n\r]/g, " ").trim();
    const insertion = `![${safeAlt}](${dataUrl})\n`;
    view.dispatch({
      changes: { from: at, insert: insertion },
      selection: { anchor: at + insertion.length }
    });
    view.focus();
  }

  async function insertImageFiles(files: File[], range: Range | null, markdownPosition: number | null) {
    const documentId = activeDocumentId;
    if (files.some((file) => !isSupportedImage(file))) {
      imageInsertError = "Use a PNG, JPG, or WebP image.";
      return;
    }
    imageInsertError = "";
    try {
      for (const file of files) {
        const dataUrl = await imageFileToDataUrl(file);
        if (activeDocumentId !== documentId) return;
        const alt = file.name.replace(/\.[^.]+$/, "").slice(0, 500);
        if (markdownEditorMode) {
          insertMarkdownImage(dataUrl, alt, markdownPosition);
          if (markdownPosition !== null) markdownPosition += `![${alt}](${dataUrl})\n`.length;
        } else {
          insertRichTextImage(dataUrl, alt, range);
          range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null;
        }
      }
    } catch (error) {
      console.error("Could not insert image.", error);
      imageInsertError = error instanceof Error ? error.message : "Could not insert that image.";
    }
  }

  function handleImageDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    imageDropActive = true;
  }

  function handleImageDragLeave(event: DragEvent) {
    const next = event.relatedTarget;
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement) || !(next instanceof Node) || !currentTarget.contains(next)) imageDropActive = false;
  }

  function handleImageDrop(event: DragEvent) {
    const files = imageFiles(event.dataTransfer?.files);
    if (!files.length) return;
    event.preventDefault();
    imageDropActive = false;
    const range = markdownEditorMode ? null : editorRangeAtPoint(event);
    const position = markdownEditorMode ? markdownImagePosition(event) : null;
    void insertImageFiles(files, range, position);
  }

  function handleImagePaste(event: ClipboardEvent) {
    const files = imageFiles(event.clipboardData?.files);
    if (!files.length) return;
    event.preventDefault();
    const range = markdownEditorMode ? null : editorRangeAtPoint(event);
    const position = markdownEditorMode ? markdownImagePosition(event) : null;
    void insertImageFiles(files, range, position);
  }

  function openImagePicker() {
    imageInsertError = "";
    pendingImageRange = markdownEditorMode ? null : editorRangeAtPoint();
    pendingMarkdownImagePosition = markdownEditorMode ? markdownImagePosition() : null;
    imageFileInput?.click();
  }

  function handleImagePickerChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = imageFiles(input.files);
    input.value = "";
    void insertImageFiles(files, pendingImageRange, pendingMarkdownImagePosition);
    pendingImageRange = null;
    pendingMarkdownImagePosition = null;
  }

  function setMarkdownSource(source: string) {
    markdownSource = source;
    const view = markdownCodeEditor;
    if (view && view.state.doc.toString() !== source) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
    }
  }

  function refreshCounts() {
    const text = editor?.innerText ?? "";
    const words = text.trim().match(/\S+/g) ?? [];
    wordCount = words.length;
    characterCount = text.replace(/\n/g, "").length;
  }

  function countHtmlWords(html: string) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return parsed.body.textContent?.trim().match(/\S+/g)?.length ?? 0;
  }

  function dateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function progressPercent(count: number, goal: number) {
    return goal > 0 ? Math.min(100, Math.round((count / goal) * 100)) : 0;
  }

  function activityLevel(record?: ActivityRecord) {
    if (!record?.edits) return 0;
    if (record.edits < 2) return 1;
    if (record.edits < 5) return 2;
    if (record.edits < 10) return 3;
    return 4;
  }

  function persistWritingStats() {
    try {
      persistProjectCollection();
    } catch {
      saveState = "Could not save writing progress";
    }
  }

  function setProjectGoal(value: number) {
    projectGoal = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    persistWritingStats();
  }

  function setChapterGoal(id: string, value: number) {
    chapterGoals = {
      ...chapterGoals,
      [id]: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    };
    persistWritingStats();
  }

  function trackActivity(wordsAdded: number) {
    const key = dateKey(new Date());
    const previous = activity[key] ?? { edits: 0, wordsAdded: 0 };
    activity = {
      ...activity,
      [key]: {
        edits: previous.edits + 1,
        wordsAdded: previous.wordsAdded + Math.max(0, wordsAdded)
      }
    };
    persistWritingStats();
  }

  function changeViewedMonth(offset: number) {
    viewedMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + offset, 1);
  }

  function persistNow() {
    if (!editor) return;
    const content = markdownEditorMode
      ? cleanHtml(markdownToHtml(markdownSource))
      : cleanHtml(editor.innerHTML);
    documents = documents.map((doc) => doc.id === activeDocumentId
      ? { ...doc, title, content, ...(markdownEditorMode ? { markdownSource } : {}) }
      : doc);
    try {
      persistProjectCollection();
      saveState = "All changes saved";
    } catch {
      saveState = "Could not save changes";
    }
  }

  function persist() {
    saveState = "Saving…";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 350);
  }

  function openDocument(id: string) {
    if (id === activeDocumentId) return;
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const next = documents.find((doc) => doc.id === id && !doc.trashed);
    if (!next) return;
    selectEditorImage(null);
    activeDocumentId = next.id;
    title = next.title;
    clearRichTextFade();
    editor.innerHTML = cleanHtml(next.content);
    setMarkdownSource(next.markdownSource ?? htmlToMarkdown(next.content));
    refreshCounts();
    lastEditorWordCount = wordCount;
  }

  function openSidebarDocument(id: string) {
    openDocument(id);
    setWorkspaceView("writing");
  }

  function createScene(
    chapterId: string,
    sceneTitle = "Untitled scene",
    options: { focusEditor?: boolean } = {}
  ) {
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const next: DocumentData = {
      id: crypto.randomUUID(),
      title: sceneTitle,
      content: "<p><br></p>",
      chapterId
    };
    documents = [...documents, next];
    activeDocumentId = next.id;
    title = next.title;
    clearRichTextFade();
    editor.innerHTML = next.content;
    setMarkdownSource("");
    refreshCounts();
    lastEditorWordCount = wordCount;
    persist();
    if (options.focusEditor !== false) editor.focus();
    return next;
  }

  function createChapter(options: { focusEditor?: boolean } = {}) {
    const chapterNumber = chapters.filter(isAutomaticallyNumberedChapter).length + 1;
    const chapter: ChapterData = {
      id: crypto.randomUUID(),
      title: `Chapter ${chapterNumber}`,
      expanded: true,
      summary: ""
    };
    chapters = [...chapters, chapter];
    createScene(chapter.id, "Scene 1", options);
    return chapter;
  }

  function isAutomaticallyNumberedChapter(chapter: ChapterData) {
    return isAutoNumberedChapter(chapter);
  }

  function chapterLabel(chapter: ChapterData) {
    return formatChapterLabel(chapter, chapters);
  }

  async function startChapterRename(chapter: ChapterData) {
    editingChapterId = chapter.id;
    chapterNameDraft = chapterLabel(chapter);
    await tick();
    chapterNameInput?.focus();
    chapterNameInput?.select();
  }

  function saveChapterRename(id: string) {
    if (editingChapterId !== id) return;
    const nextTitle = chapterNameDraft.trim();
    if (nextTitle) {
      chapters = chapters.map((chapter) => chapter.id === id ? { ...chapter, title: nextTitle } : chapter);
      persistChapters();
    }
    editingChapterId = null;
  }

  function cancelChapterRename() {
    editingChapterId = null;
    chapterNameDraft = "";
  }

  function moveChapter(id: string, offset: number) {
    const index = chapters.findIndex((chapter) => chapter.id === id);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= chapters.length) return;
    const reordered = [...chapters];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    chapters = reordered;
    persistChapters();
  }

  function reorderChapter(sourceId: string, targetId: string, afterTarget: boolean) {
    if (sourceId === targetId) return;
    const reordered = [...chapters];
    const sourceIndex = reordered.findIndex((chapter) => chapter.id === sourceId);
    if (sourceIndex < 0 || !reordered.some((chapter) => chapter.id === targetId)) return;
    const [source] = reordered.splice(sourceIndex, 1);
    const targetIndex = reordered.findIndex((chapter) => chapter.id === targetId);
    reordered.splice(targetIndex + (afterTarget ? 1 : 0), 0, source);
    if (reordered.every((chapter, index) => chapter.id === chapters[index]?.id)) return;
    chapters = reordered;
    persistChapters();
  }

  function startChapterDrag(event: PointerEvent, id: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    draggedChapterId = id;
    chapterDragPointerId = event.pointerId;
    dropTargetChapterId = id;
    dropAfterChapter = false;
  }

  function updateChapterDropTarget(event: PointerEvent) {
    if (chapterDragPointerId !== event.pointerId || !draggedChapterId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-chapter-id]");
    const targetId = target?.dataset.chapterId;
    if (!target || !targetId) {
      dropTargetChapterId = null;
      return;
    }
    const bounds = target.querySelector(".chapter-row")?.getBoundingClientRect() ?? target.getBoundingClientRect();
    dropTargetChapterId = targetId;
    dropAfterChapter = event.clientY >= bounds.top + bounds.height * 0.35;
  }

  function finishChapterDrag(event: PointerEvent) {
    if (chapterDragPointerId !== event.pointerId) return;
    if (draggedChapterId && dropTargetChapterId) {
      reorderChapter(draggedChapterId, dropTargetChapterId, dropAfterChapter);
    }
    draggedChapterId = null;
    chapterDragPointerId = null;
    dropTargetChapterId = null;
  }

  function endChapterDrag() {
    draggedChapterId = null;
    chapterDragPointerId = null;
    dropTargetChapterId = null;
    boardDragSource = null;
    boardDropTarget = null;
  }

  function startStoryboardDrag(event: PointerEvent, kind: BoardDragSource["kind"], sourceId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    boardDragSource = { pointerId: event.pointerId, kind, sourceId };
    boardDropTarget = null;
  }

  function updateStoryboardDropTarget(event: PointerEvent) {
    if (boardDragSource?.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-board-row-id][data-board-drop-index]");
    boardDropTarget = target
      ? { rowId: target.dataset.boardRowId ?? "", index: Number(target.dataset.boardDropIndex) }
      : null;
  }

  function orderedStoryboardCards(cards: StoryboardCard[]) {
    return storyboardRows.flatMap((row) => cards.filter((card) => card.rowId === row.id));
  }

  function insertStoryboardCard(card: StoryboardCard, rowId: string, index: number) {
    const destination = storyboardCards.filter((item) => item.rowId === rowId && item.id !== card.id);
    destination.splice(Math.max(0, Math.min(index, destination.length)), 0, { ...card, rowId });
    const next = [...storyboardCards.filter((item) => item.rowId !== rowId && item.id !== card.id), ...destination];
    storyboardCards = orderedStoryboardCards(next);
    persist();
  }

  function createStoryboardCard(kind: StoryboardKind, sourceId: string): Omit<StoryboardCard, "rowId"> | null {
    if (kind === "blank") {
      return {
        id: crypto.randomUUID(),
        sourceId: "",
        kind,
        title: "Untitled card",
        note: ""
      };
    }
    const chapter = kind === "chapter"
      ? chapters.find((item) => item.id === sourceId)
      : undefined;
    const sourceDocument = kind !== "chapter"
      ? documents.find((doc) => doc.id === sourceId && !doc.trashed)
      : undefined;
    if (!chapter && !sourceDocument) return null;
    return {
      id: crypto.randomUUID(),
      sourceId,
      kind,
      title: chapter ? chapterLabel(chapter) : sourceDocument?.title || "Untitled",
      note: chapter?.summary ?? ""
    };
  }

  function addStoryboardCard(kind: StoryboardKind, sourceId: string, rowId = storyboardRows.at(-1)?.id) {
    if (!rowId || !storyboardRows.some((row) => row.id === rowId)) return;
    const card = createStoryboardCard(kind, sourceId);
    if (!card) return;
    insertStoryboardCard({ ...card, rowId }, rowId, storyboardCards.filter((item) => item.rowId === rowId).length);
  }

  function finishStoryboardDrag(event: PointerEvent) {
    const drag = boardDragSource;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = boardDropTarget;
    if (target && storyboardRows.some((row) => row.id === target.rowId)) {
      if (drag.kind === "board-card") {
        const card = storyboardCards.find((item) => item.id === drag.sourceId);
        if (card) {
          const sourceIndex = storyboardCards.filter((item) => item.rowId === target.rowId)
            .findIndex((item) => item.id === card.id);
          const targetIndex = sourceIndex >= 0 && sourceIndex < target.index
            ? target.index - 1
            : target.index;
          insertStoryboardCard(card, target.rowId, targetIndex);
        }
      } else {
        const card = createStoryboardCard(drag.kind, drag.sourceId);
        if (card) {
          const before = storyboardCards.filter((item) => item.rowId === target.rowId);
          const index = target.index < before.length ? target.index : before.length;
          insertStoryboardCard({ ...card, rowId: target.rowId }, target.rowId, index);
        }
      }
    }
    boardDragSource = null;
    boardDropTarget = null;
  }

  function finishPointerInteractions(event: PointerEvent) {
    finishChapterDrag(event);
    finishStoryboardDrag(event);
  }

  function updatePointerInteractions(event: PointerEvent) {
    handleZenPointerMove(event);
    if (zenInterfaceHidden) {
      leftSidebarHovered = false;
      rightSidebarHovered = false;
      return;
    }
    handleSidebarPointerMove(event);
    updateChapterDropTarget(event);
    updateStoryboardDropTarget(event);
  }

  function updateStoryboardCard(id: string, field: "title" | "note", value: string) {
    const card = storyboardCards.find((item) => item.id === id);
    if (!card) return;
    if (field === "note" && card.kind === "chapter") {
      syncChapterSummary(card.sourceId, value);
    } else {
      storyboardCards = storyboardCards.map((item) => item.id === id ? { ...item, [field]: value } : item);
    }
    persist();
  }

  function removeStoryboardCard(id: string) {
    storyboardCards = storyboardCards.filter((card) => card.id !== id);
    persist();
  }

  function moveStoryboardCard(id: string, offset: number) {
    const card = storyboardCards.find((item) => item.id === id);
    if (!card) return;
    const rowCards = storyboardCards.filter((item) => item.rowId === card.rowId);
    const index = rowCards.findIndex((item) => item.id === id);
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= rowCards.length) return;
    insertStoryboardCard(card, card.rowId, targetIndex);
  }

  function moveStoryboardCardToRow(id: string, rowId: string) {
    const card = storyboardCards.find((item) => item.id === id);
    if (!card || card.rowId === rowId || !storyboardRows.some((row) => row.id === rowId)) return;
    insertStoryboardCard(card, rowId, storyboardCards.filter((item) => item.rowId === rowId).length);
  }

  function addStoryboardRow() {
    const row = { id: crypto.randomUUID(), title: `Timeline row ${storyboardRows.length + 1}` };
    storyboardRows = [...storyboardRows, row];
    persist();
  }

  function updateStoryboardRow(id: string, titleValue: string) {
    storyboardRows = storyboardRows.map((row) => row.id === id ? { ...row, title: titleValue } : row);
    persist();
  }

  function removeStoryboardRow(id: string) {
    if (storyboardRows.length <= 1 || storyboardCards.some((card) => card.rowId === id)) return;
    storyboardRows = storyboardRows.filter((row) => row.id !== id);
    persist();
  }

  function moveStoryboardRow(id: string, offset: number) {
    const index = storyboardRows.findIndex((row) => row.id === id);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= storyboardRows.length) return;
    const reordered = [...storyboardRows];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    storyboardRows = reordered;
    storyboardCards = orderedStoryboardCards(storyboardCards);
    persist();
  }

  function persistChapters() {
    try {
      persistProjectCollection();
      saveState = "All changes saved";
    } catch {
      saveState = "Could not save changes";
    }
  }

  /**
   * Updates one field of the active character's sheet. The name is stored in
   * `title`, and the rich-text editor below the form stores free-form notes in
   * `content`, so this only touches the structured profile.
   */
  function updateCharacterField(field: keyof CharacterSheet, value: string) {
    const trimmed = value.slice(0, SHEET_FIELD_LIMIT);
    documents = documents.map((doc) => doc.id === activeDocumentId
      ? { ...doc, character: { ...normalizeCharacterSheet(doc.character), [field]: trimmed } }
      : doc);
    persist();
  }

  /** Updates one field of the active place's sheet. Mirrors the character path. */
  function updatePlaceField(field: keyof PlaceSheet, value: string) {
    const trimmed = value.slice(0, SHEET_FIELD_LIMIT);
    documents = documents.map((doc) => doc.id === activeDocumentId
      ? { ...doc, place: { ...normalizePlaceSheet(doc.place), [field]: trimmed } }
      : doc);
    persist();
  }

  function createSpaceDocument(space: SpaceName, folderId?: string) {
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const next: DocumentData = {
      id: crypto.randomUUID(),
      title: `Untitled ${spaceNouns[space]}`,
      content: "<p><br></p>",
      space,
      ...(space === "Notes" && folderId ? { folderId } : {}),
      ...(space === "Characters" ? { character: emptyCharacterSheet() } : {}),
      ...(space === "Places" ? { place: emptyPlaceSheet() } : {})
    };
    documents = [...documents, next];
    expandedSpaces[space] = true;
    if (space === "Notes" && folderId) {
      expandNoteFolderPath(folderId);
    }
    activeDocumentId = next.id;
    title = next.title;
    clearRichTextFade();
    editor.innerHTML = next.content;
    setMarkdownSource("");
    refreshCounts();
    lastEditorWordCount = wordCount;
    persist();
    editor.focus();
  }

  async function createNoteFolder(parentId: string | null = null) {
    const folder: NoteFolder = {
      id: crypto.randomUUID(),
      title: "Untitled folder",
      parentId
    };
    noteFolders = [...noteFolders, folder];
    expandedSpaces.Notes = true;
    if (parentId) expandNoteFolderPath(parentId);
    expandedNoteFolders = { ...expandedNoteFolders, [folder.id]: true };
    persist();
    await startNoteFolderRename(folder);
  }

  async function startNoteFolderRename(folder: NoteFolder) {
    editingNoteFolderId = folder.id;
    noteFolderNameDraft = folder.title;
    await tick();
    noteFolderInput?.focus();
    noteFolderInput?.select();
  }

  function saveNoteFolderRename(id: string) {
    if (editingNoteFolderId !== id) return;
    const nextTitle = noteFolderNameDraft.trim().slice(0, 60);
    if (nextTitle) {
      noteFolders = noteFolders.map((folder) => folder.id === id ? { ...folder, title: nextTitle } : folder);
      persist();
    }
    editingNoteFolderId = null;
  }

  function cancelNoteFolderRename() {
    editingNoteFolderId = null;
    noteFolderNameDraft = "";
  }

  function moveNoteToFolder(documentId: string, folderId: string) {
    if (folderId && !noteFolders.some((folder) => folder.id === folderId)) return;
    documents = documents.map((doc) => {
      if (doc.id !== documentId || doc.space !== "Notes") return doc;
      const { folderId: _previousFolderId, ...withoutFolder } = doc;
      return folderId ? { ...withoutFolder, folderId } : withoutFolder;
    });
    if (folderId) {
      expandNoteFolderPath(folderId);
    }
    persist();
  }

  function expandNoteFolderPath(id: string) {
    const expanded = { ...expandedNoteFolders };
    let currentId: string | null | undefined = id;
    while (currentId) {
      expanded[currentId] = true;
      currentId = noteFolders.find((folder) => folder.id === currentId)?.parentId;
    }
    expandedNoteFolders = expanded;
  }

  function toggleNoteFolder(id: string) {
    expandedNoteFolders = {
      ...expandedNoteFolders,
      [id]: expandedNoteFolders[id] === false
    };
  }

  function toggleChapter(id: string) {
    chapters = chapters.map((chapter) => chapter.id === id
      ? { ...chapter, expanded: !chapter.expanded }
      : chapter);
    persistChapters();
  }

  function moveToTrash(id: string) {
    documents = documents.map((doc) => doc.id === id ? { ...doc, trashed: true } : doc);
    if (activeDocumentId === id) {
      const next = documents.find((doc) => !doc.trashed);
      if (next) {
        activeDocumentId = id;
        openDocument(next.id);
      } else {
        activeDocumentId = "";
        title = "";
        editor.innerHTML = "<p><br></p>";
        setMarkdownSource("");
        refreshCounts();
      }
    }
    persist();
  }

  function restoreDocument(id: string) {
    documents = documents.map((doc) => doc.id === id ? { ...doc, trashed: false } : doc);
    persist();
  }

  function permanentlyDelete(id: string) {
    documents = documents.filter((doc) => doc.id !== id);
    if (activeDocumentId === id) {
      const next = documents.find((doc) => !doc.trashed);
      if (next) {
        activeDocumentId = id;
        openDocument(next.id);
      } else {
        activeDocumentId = "";
        title = "";
        editor.innerHTML = "<p><br></p>";
        setMarkdownSource("");
        refreshCounts();
      }
    }
    persist();
  }

  function createDocument() {
    showZenInterface();
    const chapter = chapters[0];
    if (chapter) createScene(chapter.id);
    else createChapter();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") showZenInterface();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createDocument();
    }
  }

  function handleInput() {
    const previousWordCount = lastEditorWordCount;
    documents = documents.map((doc) => {
      if (doc.id !== activeDocumentId || doc.markdownSource === undefined) return doc;
      const { markdownSource: _markdownSource, ...withoutMarkdownSource } = doc;
      return withoutMarkdownSource;
    });
    refreshCounts();
    trackActivity(wordCount - previousWordCount);
    lastEditorWordCount = wordCount;
    persist();
    scheduleRichTextTypewriter();
    if (fadeOtherParagraphs) scheduleRichTextFade();
  }

  function runCommand(command: string, value?: string) {
    editor?.focus();
    document.execCommand(command, false, value);
    handleInput();
    if (fadeOtherParagraphs) scheduleRichTextFade(true);
  }

  function changeBlock(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value) runCommand("formatBlock", value);
    (event.currentTarget as HTMLSelectElement).value = "";
  }

  function addLink() {
    const entered = window.prompt("Paste a link");
    if (!entered) return;
    const value = entered.trim();
    const href = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(href);
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
        window.alert("Please use a web link or email address.");
        return;
      }
      runCommand("createLink", url.href);
    } catch {
      window.alert("Please enter a valid link.");
    }
  }

  onMount(() => {
    themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    themeMediaQuery.addEventListener("change", handleSystemThemeChange);
    try {
      const savedTheme = localStorage.getItem(themeStorageKey);
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
        themePreference = savedTheme;
      }
      const savedColorScheme = localStorage.getItem(colorSchemeStorageKey);
      if (isColorScheme(savedColorScheme)) {
        colorScheme = savedColorScheme;
      }
      const savedFont = localStorage.getItem(fontStorageKey);
      if (isRichTextFontPreference(savedFont)) {
        richTextFontPreference = savedFont;
      }
      const savedMarkdownFont = localStorage.getItem(markdownFontStorageKey);
      if (isMarkdownFontPreference(savedMarkdownFont)) markdownFontPreference = savedMarkdownFont;
      richTextSystemFont = localStorage.getItem(richTextSystemFontStorageKey)?.trim() ?? "";
      markdownSystemFont = localStorage.getItem(markdownSystemFontStorageKey)?.trim() ?? "";
      const savedScale = Number(localStorage.getItem(scaleStorageKey));
      if ([80, 90, 100, 110, 120, 130, 140].includes(savedScale)) editorScale = savedScale;
      markdownEditorEnabled = localStorage.getItem(markdownEditorStorageKey) === "true";
      typewriterMode = localStorage.getItem(typewriterStorageKey) === "true";
      fadeOtherParagraphs = localStorage.getItem(fadeParagraphsStorageKey) === "true";
      zenMode = localStorage.getItem(zenModeStorageKey) === "true";
      const savedProjectSettings = localStorage.getItem(projectSettingsStorageKey);
      if (savedProjectSettings) {
        const parsed: unknown = JSON.parse(savedProjectSettings);
        if (typeof parsed === "object" && parsed !== null) {
          const settings = parsed as { projectName?: unknown; authorName?: unknown };
          if (typeof settings.projectName === "string" && settings.projectName.trim()) {
            projectName = settings.projectName.trim();
          }
          if (typeof settings.authorName === "string") authorName = settings.authorName;
        }
      }
      const savedGoals = localStorage.getItem(goalsStorageKey);
      if (savedGoals) {
        const parsed: unknown = JSON.parse(savedGoals);
        if (typeof parsed === "object" && parsed !== null) {
          const goals = parsed as { projectGoal?: unknown; chapterGoals?: unknown };
          if (typeof goals.projectGoal === "number" && Number.isFinite(goals.projectGoal) && goals.projectGoal >= 0) {
            projectGoal = Math.floor(goals.projectGoal);
          }
          if (typeof goals.chapterGoals === "object" && goals.chapterGoals !== null && !Array.isArray(goals.chapterGoals)) {
            chapterGoals = Object.fromEntries(
              Object.entries(goals.chapterGoals)
                .filter((entry): entry is [string, number] =>
                  typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0)
                .map(([id, goal]) => [id, Math.floor(goal)])
            );
          }
        }
      }
      const savedActivity = localStorage.getItem(activityStorageKey);
      if (savedActivity) {
        const parsed: unknown = JSON.parse(savedActivity);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          activity = Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, ActivityRecord] => {
              if (typeof entry[1] !== "object" || entry[1] === null) return false;
              const record = entry[1] as { edits?: unknown; wordsAdded?: unknown };
              return Number.isInteger(record.edits) && Number(record.edits) >= 0
                && Number.isInteger(record.wordsAdded) && Number(record.wordsAdded) >= 0;
            })
          );
        }
      }
    } catch {
      preferencesSaved = false;
    }
    applyTheme(themePreference === "system"
      ? (themeMediaQuery.matches ? "dark" : "light")
      : themePreference);
    applyColorScheme(colorScheme);
    applyRichTextFont();
    applyMarkdownFont();
    document.documentElement.style.setProperty("--editor-scale", String(editorScale / 100));
    void syncTypewriterMenu(typewriterMode);
    void syncFadeParagraphsMenu(fadeOtherParagraphs);
    void syncZenModeMenu(zenMode);

    try {
      let loadedProject = false;
      const vault = loadVault();
      if (vault && vault.projects.length > 0) {
        projects = vault.projects;
        const selectedProject = projects.find((project) => project.id === vault.activeProjectId) ?? projects[0];
        if (selectedProject) {
          loadProject(selectedProject);
          loadedProject = true;
        }
      }
      if (!loadedProject) {
      storyboardRows = [{ id: crypto.randomUUID(), title: "Timeline" }];
      const storedDocuments = localStorage.getItem(storageKey);
      const storedChapters = localStorage.getItem(chaptersStorageKey);
      const savedActiveId = localStorage.getItem(activeStorageKey);
      let loadedLegacyDocument = false;
      if (storedDocuments) {
        const parsed: unknown = JSON.parse(storedDocuments);
        if (Array.isArray(parsed)) {
          documents = parsed.filter((item): item is DocumentData =>
            typeof item === "object" &&
            item !== null &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.content === "string"
          ).map((doc) => normalizeDocumentSheets({
            ...doc,
            content: cleanHtml(doc.content)
          }));
        }
      } else {
        const legacySaved = localStorage.getItem(legacyStorageKey);
        if (legacySaved) {
          const parsed: unknown = JSON.parse(legacySaved);
          if (typeof parsed === "object" && parsed !== null) {
            const legacyDoc = parsed as { title?: unknown; content?: unknown };
            if (typeof legacyDoc.title === "string" && typeof legacyDoc.content === "string") {
              documents = [{
                id: "welcome",
                title: legacyDoc.title,
                content: cleanHtml(legacyDoc.content)
              }];
              loadedLegacyDocument = true;
            }
          }
        }
      }
      if (storedChapters) {
        const parsed: unknown = JSON.parse(storedChapters);
        if (Array.isArray(parsed)) {
          chapters = parsed.filter((item): item is ChapterData =>
            typeof item === "object" &&
            item !== null &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.expanded === "boolean"
          ).map((chapter) => ({
            ...chapter,
            summary: (typeof chapter.summary === "string" ? chapter.summary : "").slice(0, 4000)
          }));
        }
      }
      const migratedScenes = documents.some((doc) => !doc.space && !doc.chapterId);
      if (chapters.length === 0 && migratedScenes) {
        const chapter: ChapterData = { id: "chapter-1", title: "Chapter 1", expanded: true, summary: "" };
        chapters = [chapter];
        documents = documents.map((doc) => !doc.space && !doc.chapterId ? { ...doc, chapterId: chapter.id } : doc);
      }
      if (documents.length === 0 && storedDocuments === null && !loadedLegacyDocument) {
        const chapter: ChapterData = { id: "chapter-1", title: "Chapter 1", expanded: true, summary: "" };
        chapters = [chapter];
        documents = [{ id: "welcome", title, content: starterContent, chapterId: chapter.id }];
      }
      const active = documents.find((doc) => doc.id === savedActiveId && !doc.trashed)
        ?? documents.find((doc) => !doc.trashed);
      if (active) {
        activeDocumentId = active.id;
        title = active.title;
        editor.innerHTML = active.content;
        setMarkdownSource(active.markdownSource ?? htmlToMarkdown(active.content));
      } else {
        activeDocumentId = "";
        title = "";
        editor.innerHTML = "<p><br></p>";
        setMarkdownSource("");
      }
      activeProjectId = crypto.randomUUID();
      projects = [currentProjectData()];
      persistProjectCollection();
      }
    } catch {
      saveState = "Could not load saved document";
      chapters = [{ id: "chapter-1", title: "Chapter 1", expanded: true, summary: "" }];
      documents = [{ id: "welcome", title, content: starterContent, chapterId: chapters[0].id }];
      editor.innerHTML = starterContent;
      setMarkdownSource(htmlToMarkdown(starterContent));
    }
    refreshCounts();
    lastEditorWordCount = wordCount;
    void syncNativeProjectMenu();
  });

  onDestroy(() => {
    if (saveTimer) clearTimeout(saveTimer);
    if (publishTimer) clearTimeout(publishTimer);
    if (richTextTypewriterFrame !== undefined) cancelAnimationFrame(richTextTypewriterFrame);
    if (markdownTypewriterFrame !== undefined) cancelAnimationFrame(markdownTypewriterFrame);
    if (richTextFadeFrame !== undefined) cancelAnimationFrame(richTextFadeFrame);
    persistNow();
    themeMediaQuery?.removeEventListener("change", handleSystemThemeChange);
  });

  onMount(() => {
    window.addEventListener("resize", handleViewportResize);
    document.addEventListener("selectionchange", handleRichTextSelectionChange);
    return () => {
      window.removeEventListener("resize", handleViewportResize);
      document.removeEventListener("selectionchange", handleRichTextSelectionChange);
    };
  });

  onMount(() => {
    syncFolder = loadSyncState()?.folder ?? "";
    void import("@tauri-apps/api/core")
      .then(({ isTauri }) => {
        desktopRuntime = isTauri();
      })
      .catch(() => {
        desktopRuntime = false;
      });
  });

  onMount(() => {
    let disposed = false;
    const unlisten: Array<() => void> = [];
    void (async () => {
      try {
        const { isTauri } = await import("@tauri-apps/api/core");
        if (!isTauri()) return;
        const { listen } = await import("@tauri-apps/api/event");
        const settingsUnlisten = await listen("prosecraft:open-settings", openSettings);
        const projectSettingsUnlisten = await listen("prosecraft:open-project-settings", openProjectSettings);
        const newProjectUnlisten = await listen("prosecraft:new-project", createProject);
        const switchProjectUnlisten = await listen<string>("prosecraft:switch-project", (event) => switchProject(event.payload));
        const exportUnlisten = await listen("prosecraft:export-document", exportDocument);
        const newSceneUnlisten = await listen("prosecraft:new-scene", createDocument);
        const publishUnlisten = await listen("prosecraft:open-publish", openPublishView);
        const typewriterUnlisten = await listen("prosecraft:toggle-typewriter", () => {
          setTypewriterMode(!typewriterMode, false);
        });
        const fadeParagraphsUnlisten = await listen("prosecraft:toggle-fade-paragraphs", () => {
          setFadeOtherParagraphs(!fadeOtherParagraphs, false);
        });
        const zenModeUnlisten = await listen("prosecraft:toggle-zen-mode", () => {
          setZenMode(!zenMode, false);
        });
        if (disposed) {
          settingsUnlisten();
          projectSettingsUnlisten();
          newProjectUnlisten();
          switchProjectUnlisten();
          exportUnlisten();
          newSceneUnlisten();
          publishUnlisten();
          typewriterUnlisten();
          fadeParagraphsUnlisten();
          zenModeUnlisten();
        } else {
          unlisten.push(
            settingsUnlisten,
            projectSettingsUnlisten,
            newProjectUnlisten,
            switchProjectUnlisten,
            exportUnlisten,
            newSceneUnlisten,
            publishUnlisten,
            typewriterUnlisten,
            fadeParagraphsUnlisten,
            zenModeUnlisten
          );
        }
      } catch (error) {
        console.error("Could not initialize application menu listeners.", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten.forEach((stop) => stop());
    };
  });
</script>

<svelte:window
  onkeydown={handleKeydown}
  onpointermove={updatePointerInteractions}
  onpointerup={finishPointerInteractions}
  onpointercancel={endChapterDrag}
/>

<svelte:head>
  <title>{title || "Untitled"} — ProseCraft</title>
  <meta name="description" content="A quiet place to find the words." />
</svelte:head>

<div class="app-shell" class:zen-hidden={zenInterfaceHidden}>
  <aside
    class="sidebar"
    class:peek={!leftSidebarVisible}
    class:peek-open={!leftSidebarVisible && leftSidebarHovered}
    inert={zenInterfaceHidden || (!leftSidebarVisible && !leftSidebarHovered)}
    aria-label="Chapter and story navigation"
  >
    <div class="project-identity">
      <select aria-label="Switch project" value={activeProjectId} onchange={(event) => switchProject((event.currentTarget as HTMLSelectElement).value)}>
        {#each projects as project (project.id)}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
      <div class="project-identity-actions">
        <button aria-label="Project settings" title="Project settings" onclick={openProjectSettings}>⚙</button>
        <button aria-label="Create project" title="Create project" onclick={createProject}>+</button>
      </div>
      <span class="author-name">{authorName ? `by ${authorName}` : "Add author name"}</span>
    </div>

    <div class="sidebar-tree">
      <div class="tree-heading">
        <span class="nav-label">CHAPTERS</span>
        <button class="tree-add" aria-label="Add chapter" title="Add chapter" onclick={() => createChapter()}>+</button>
      </div>
      <div class="chapter-list">
        {#each chapters as chapter (chapter.id)}
          <div
            class="chapter-group"
            class:dragging={draggedChapterId === chapter.id}
            class:drop-before={dropTargetChapterId === chapter.id && !dropAfterChapter}
            class:drop-after={dropTargetChapterId === chapter.id && dropAfterChapter}
            role="group"
            aria-label="{chapterLabel(chapter)} chapter"
            data-chapter-id={chapter.id}
          >
            <div class="chapter-row">
              <button
                class="chapter-drag"
                aria-label="Drag to reorder {chapterLabel(chapter)}"
                title="Drag to reorder"
                onpointerdown={(event) => startChapterDrag(event, chapter.id)}
              >⠿</button>
              {#if editingChapterId === chapter.id}
                  <input
                    bind:this={chapterNameInput}
                    class="chapter-name-input"
                    aria-label="Rename {chapterLabel(chapter)}"
                    bind:value={chapterNameDraft}
                    maxlength="60"
                    onblur={() => saveChapterRename(chapter.id)}
                    onkeydown={(event) => {
                      if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                      if (event.key === "Escape") cancelChapterRename();
                    }}
                    onpointerdown={(event) => event.stopPropagation()}
                  />
              {:else}
                <button class="chapter-toggle" aria-label="{chapter.expanded ? 'Collapse' : 'Expand'} {chapterLabel(chapter)}" aria-expanded={chapter.expanded} onclick={() => toggleChapter(chapter.id)}>
                  <span class:rotated={chapter.expanded} class="chevron">›</span>
                  <svg class="folder-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.8 5.5a1.4 1.4 0 0 1 1.4-1.4h4l1.6 1.7h6a1.4 1.4 0 0 1 1.4 1.4v7.3a1.4 1.4 0 0 1-1.4 1.4H4.2a1.4 1.4 0 0 1-1.4-1.4V5.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
                  <span class="tree-name">{chapterLabel(chapter)}</span>
                </button>
              {/if}
              <div class="chapter-actions">
                <button class="chapter-action" aria-label="Rename {chapterLabel(chapter)}" title="Rename chapter" onclick={() => startChapterRename(chapter)}>✎</button>
                <button class="chapter-action" aria-label="Move {chapterLabel(chapter)} up" title="Move chapter up" disabled={chapters.indexOf(chapter) === 0} onclick={() => moveChapter(chapter.id, -1)}>↑</button>
                <button class="chapter-action" aria-label="Move {chapterLabel(chapter)} down" title="Move chapter down" disabled={chapters.indexOf(chapter) === chapters.length - 1} onclick={() => moveChapter(chapter.id, 1)}>↓</button>
                <button class="row-add" aria-label="Add scene to {chapterLabel(chapter)}" title="Add scene" onclick={() => createScene(chapter.id)}>+</button>
              </div>
            </div>
            {#if chapter.expanded}
              <div class="scene-list">
                {#each documents.filter((doc) => doc.chapterId === chapter.id && !doc.trashed) as doc (doc.id)}
                  <div class:current={doc.id === activeDocumentId} class="document-row">
                    <button class="document-select" aria-current={doc.id === activeDocumentId ? "page" : undefined} onclick={() => openSidebarDocument(doc.id)}>
                      <span class="scene-mark">¶</span>
                      <span class="tree-name">{doc.title || "Untitled scene"}</span>
                    </button>
                    <button class="row-action" aria-label="Move {doc.title} to Trash" title="Move to Trash" onclick={() => moveToTrash(doc.id)}>×</button>
                  </div>
                {/each}
                {#if !documents.some((doc) => doc.chapterId === chapter.id && !doc.trashed)}
                  <span class="empty-tree">No scenes yet</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
        {#if chapters.length === 0}
          <button class="empty-action" onclick={() => createChapter()}>+ Add your first chapter</button>
        {/if}
      </div>

      <div class="tree-divider"></div>
      <div class="tree-heading spaces-heading"><span class="nav-label">STORY SPACES</span></div>
      {#each spaces as space (space)}
        <div class="space-group">
          <div class="space-heading">
            <button class="space-toggle" aria-expanded={expandedSpaces[space]} onclick={() => expandedSpaces[space] = !expandedSpaces[space]}>
              <span class:rotated={expandedSpaces[space]} class="chevron">›</span>
              <span class="space-icon" aria-hidden="true">{space === "Characters" ? "◉" : space === "Places" ? "⌖" : space === "Research" ? "⌕" : "▤"}</span>
              <span class="tree-name">{space}</span>
            </button>
            {#if space === "Notes"}
              <button class="row-add" aria-label="Add folder to Notes" title="Add folder" onclick={() => createNoteFolder()}>▱</button>
            {/if}
            <button class="row-add" aria-label="Add to {space}" title="Add to {space}" onclick={() => createSpaceDocument(space)}>+</button>
          </div>
          {#if expandedSpaces[space]}
            <div class="space-items">
              {#if space === "Notes"}
                {#each noteTreeItems as item (item.kind === "folder" ? `folder-${item.folder.id}` : `document-${item.document.id}`)}
                  {#if item.kind === "folder"}
                    <div class="note-folder-row" style={`padding-left: ${item.depth * 14 + 2}px`}>
                      {#if editingNoteFolderId === item.folder.id}
                        <input
                          bind:this={noteFolderInput}
                          class="chapter-name-input note-folder-name-input"
                          aria-label="Rename folder {item.folder.title}"
                          bind:value={noteFolderNameDraft}
                          maxlength="60"
                          onblur={() => saveNoteFolderRename(item.folder.id)}
                          onkeydown={(event) => {
                            if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelNoteFolderRename();
                            }
                          }}
                          onpointerdown={(event) => event.stopPropagation()}
                        />
                      {:else}
                        <button
                          class="note-folder-toggle"
                          aria-expanded={expandedNoteFolders[item.folder.id] !== false}
                          onclick={() => toggleNoteFolder(item.folder.id)}
                        >
                          <span class:rotated={expandedNoteFolders[item.folder.id] !== false} class="chevron">›</span>
                          <span class="note-folder-icon" aria-hidden="true">▱</span>
                          <span class="tree-name">{item.folder.title}</span>
                        </button>
                      {/if}
                      <div class="note-folder-actions">
                        <button class="chapter-action" aria-label="Add subfolder to {item.folder.title}" title="Add subfolder" onclick={() => createNoteFolder(item.folder.id)}>▱+</button>
                        <button class="chapter-action" aria-label="Rename folder {item.folder.title}" title="Rename folder" onclick={() => startNoteFolderRename(item.folder)}>✎</button>
                        <button class="row-add" aria-label="Add note to {item.folder.title}" title="Add note" onclick={() => createSpaceDocument("Notes", item.folder.id)}>+</button>
                      </div>
                    </div>
                  {:else}
                    <div class:current={item.document.id === activeDocumentId} class="document-row note-document-row" style={`padding-left: ${item.depth * 14 + 2}px`}>
                      <button class="document-select" aria-current={item.document.id === activeDocumentId ? "page" : undefined} onclick={() => openSidebarDocument(item.document.id)}>
                        <span class="scene-mark">¶</span>
                        <span class="tree-name">{item.document.title || "Untitled"}</span>
                      </button>
                      {#if noteFolderChoices.length > 0}
                        <select
                          class="note-folder-select"
                          aria-label="Move {item.document.title || 'note'} to folder"
                          value={item.document.folderId ?? ""}
                          onchange={(event) => moveNoteToFolder(item.document.id, (event.currentTarget as HTMLSelectElement).value)}
                        >
                          <option value="">Unfiled</option>
                          {#each noteFolderChoices as choice (choice.folder.id)}
                            <option value={choice.folder.id}>{"- ".repeat(choice.depth)}{choice.folder.title}</option>
                          {/each}
                        </select>
                      {/if}
                      <button class="row-action" aria-label="Move {item.document.title} to Trash" title="Move to Trash" onclick={() => moveToTrash(item.document.id)}>×</button>
                    </div>
                  {/if}
                {/each}
                {#if !documents.some((doc) => doc.space === "Notes" && !doc.trashed) && noteFolders.length === 0}
                  <span class="empty-tree">Nothing here yet</span>
                {/if}
              {:else}
                {#each documents.filter((doc) => doc.space === space && !doc.trashed) as doc (doc.id)}
                  <div class:current={doc.id === activeDocumentId} class="document-row">
                    <button class="document-select" aria-current={doc.id === activeDocumentId ? "page" : undefined} onclick={() => openSidebarDocument(doc.id)}>
                      <span class="scene-mark">¶</span>
                      <span class="tree-name">{doc.title || "Untitled"}</span>
                    </button>
                    <button class="row-action" aria-label="Move {doc.title} to Trash" title="Move to Trash" onclick={() => moveToTrash(doc.id)}>×</button>
                  </div>
                {/each}
                {#if !documents.some((doc) => doc.space === space && !doc.trashed)}
                  <span class="empty-tree">Nothing here yet</span>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      <div class="tree-divider"></div>
      <div class="space-group trash-group">
        <div class="space-heading">
          <button class="space-toggle" aria-expanded={expandedSpaces.Trash} onclick={() => expandedSpaces.Trash = !expandedSpaces.Trash}>
            <span class:rotated={expandedSpaces.Trash} class="chevron">›</span>
            <span class="space-icon" aria-hidden="true">⌫</span>
            <span class="tree-name">Trash</span>
            <span class="trash-count">{documents.filter((doc) => doc.trashed).length || ""}</span>
          </button>
        </div>
        {#if expandedSpaces.Trash}
          <div class="space-items">
            {#each documents.filter((doc) => doc.trashed) as doc (doc.id)}
              <div class="document-row">
                <span class="document-select trashed-document">
                  <span class="scene-mark">¶</span>
                  <span class="tree-name">{doc.title || "Untitled"}</span>
                </span>
                <button class="row-action restore-action" aria-label="Restore {doc.title}" title="Restore" onclick={() => restoreDocument(doc.id)}>↶</button>
                <button class="row-action delete-action" aria-label="Permanently delete {doc.title}" title="Delete permanently" onclick={() => permanentlyDelete(doc.id)}>×</button>
              </div>
            {/each}
            {#if !documents.some((doc) => doc.trashed)}
              <span class="empty-tree">Trash is empty</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="sidebar-footer">
      <button
        class="settings-button"
        aria-label="Settings"
        onclick={openSettings}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3.2a1.2 1.2 0 0 1 2.3-.5l.5 1.2a1.2 1.2 0 0 0 1.7.6l1.1-.6a1.2 1.2 0 0 1 1.7 1.7l-.6 1.1a1.2 1.2 0 0 0 .6 1.7l1.2.5a1.2 1.2 0 0 1-.5 2.3l-1.3.1a1.2 1.2 0 0 0-1.1 1.4l.2 1.3a1.2 1.2 0 0 1-2 1l-1-.9a1.2 1.2 0 0 0-1.8.2l-.7 1.1a1.2 1.2 0 0 1-2.2-.8l.3-1.3a1.2 1.2 0 0 0-1-1.4l-1.3-.2a1.2 1.2 0 0 1-.3-2.3l1.2-.5a1.2 1.2 0 0 0 .5-1.7l-.7-1.1a1.2 1.2 0 0 1 1.6-1.7l1.2.6a1.2 1.2 0 0 0 1.7-.6L10 3.2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.2" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Settings</span>
      </button>
      <div class="sync-status"><span class="sync-dot"></span> Your writing is private</div>
    </div>
  </aside>

  <main class="main-panel" class:left-hidden={!leftSidebarVisible} class:right-hidden={!rightSidebarVisible}>
    <section class="writing-area" id="editor">
      <div class="workspace-controls" aria-label="Workspace panels">
        <div class="workspace-modes" role="tablist" aria-label="Workspace view">
          <button class="workspace-mode" class:active={workspaceView === "outline"} role="tab" aria-selected={workspaceView === "outline"} onclick={openOutlineView}>Outline</button>
          <button class="workspace-mode" class:active={workspaceView === "writing"} role="tab" aria-selected={workspaceView === "writing"} onclick={() => setWorkspaceView("writing")}>Write</button>
          <button class="workspace-mode" class:active={workspaceView === "storyboard"} role="tab" aria-selected={workspaceView === "storyboard"} onclick={() => setWorkspaceView("storyboard")}>Storyboard</button>
          <button class="workspace-mode" class:active={workspaceView === "publish"} role="tab" aria-selected={workspaceView === "publish"} onclick={openPublishView}>Publish</button>
        </div>
        <div class="panel-toggles">
          <button class="panel-toggle" aria-label={leftSidebarVisible ? "Hide chapter sidebar" : "Show chapter sidebar"} title={leftSidebarVisible ? "Hide chapter sidebar" : "Show chapter sidebar"} aria-pressed={leftSidebarVisible} onclick={() => leftSidebarVisible = !leftSidebarVisible}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.8" y="3.5" width="14.4" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M7.3 3.8v12.4" stroke="currentColor" stroke-width="1.3"/></svg>
            <span>Chapters</span>
          </button>
          <button class="panel-toggle" aria-label={rightSidebarVisible ? "Hide progress sidebar" : "Show progress sidebar"} title={rightSidebarVisible ? "Hide progress sidebar" : "Show progress sidebar"} aria-pressed={rightSidebarVisible} onclick={() => rightSidebarVisible = !rightSidebarVisible}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.8" y="3.5" width="14.4" height="13" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M12.7 3.8v12.4m-6.8-6.1 2.1-2.2 2.2 2.2 2.4-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>Progress</span>
          </button>
        </div>
      </div>
      <div class="editor-panel" class:editor-panel-hidden={workspaceView !== "writing"} class:typewriter-mode={typewriterMode}>
      <div
        class="editor-column"
        bind:this={editorColumn}
        class:image-drop-active={imageDropActive}
        role="region"
        aria-label="Writing editor. Drop images here to insert them."
        ondragover={handleImageDragOver}
        ondragleave={handleImageDragLeave}
        ondrop={handleImageDrop}
        onpaste={handleImagePaste}
      >
        <input
          bind:this={imageFileInput}
          class="data-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onchange={handleImagePickerChange}
        />
        <div class="document-meta">
          <span>{locationLabel}</span>
          <span class="meta-divider"></span>
          <span class="document-type"><span class="type-mark">¶</span> {activeDocument?.space ? activeDocument.space.toUpperCase() : "SCENE"}</span>
          <span class="meta-divider"></span>
          <span>Edited today</span>
          {#if markdownEditorEnabled}
            <button
              type="button"
              class="markdown-mode-toggle"
              aria-pressed={markdownEditorMode}
              onclick={toggleEditorMode}
            >{markdownEditorMode ? "Rich text editor" : "Markdown editor"}</button>
          {/if}
          <button type="button" class="markdown-mode-toggle image-insert-button" onclick={openImagePicker}>Insert image</button>
        </div>
        {#if imageInsertError}
          <p class="image-insert-error" role="status">{imageInsertError}</p>
        {/if}

        <input
          class="title-input"
          aria-label="Document title"
          placeholder={isCharacterDocument ? "Character name" : isPlaceDocument ? "Place name" : "Untitled"}
          bind:value={title}
          oninput={persist}
          maxlength="120"
        />

        {#if isCharacterDocument}
          <EntitySheet
            sections={characterSections}
            values={characterSheet}
            onchange={(key, value) => updateCharacterField(key as keyof CharacterSheet, value)}
            hint="Use the notes below for anything the fields above don’t cover."
          />
        {:else if isPlaceDocument}
          <EntitySheet
            sections={placeSections}
            values={placeSheet}
            onchange={(key, value) => updatePlaceField(key as keyof PlaceSheet, value)}
            hint="Use the notes below for anything the fields above don’t cover."
          />
        {/if}

        {#if !isCharacterDocument && !isPlaceDocument && !markdownEditorMode}
        <div class="toolbar" role="toolbar" aria-label="Text formatting">
          <label class="sr-only" for="block-style">Text style</label>
          <select id="block-style" class="style-select" aria-label="Text style" onchange={changeBlock}>
            <option value="">Normal text</option>
            <option value="h1">Title</option>
            <option value="h2">Heading</option>
            <option value="h3">Subheading</option>
            <option value="blockquote">Quote</option>
          </select>
          <span class="toolbar-divider"></span>
          <button class="tool-button" aria-label="Bold" title="Bold" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("bold")}><strong>B</strong></button>
          <button class="tool-button italic" aria-label="Italic" title="Italic" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("italic")}>I</button>
          <button class="tool-button underline" aria-label="Underline" title="Underline" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("underline")}>U</button>
          <button class="tool-button strike" aria-label="Strikethrough" title="Strikethrough" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("strikeThrough")}>S</button>
          <span class="toolbar-divider"></span>
          <button class="tool-button" aria-label="Bulleted list" title="Bulleted list" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("insertUnorderedList")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 5h8M8 10h8M8 15h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="4.5" cy="5" r=".8" fill="currentColor"/><circle cx="4.5" cy="10" r=".8" fill="currentColor"/><circle cx="4.5" cy="15" r=".8" fill="currentColor"/></svg></button>
          <button class="tool-button" aria-label="Numbered list" title="Numbered list" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("insertOrderedList")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 5h8M8 10h8M8 15h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4 4.2h1v2H4m-.2 3.5h1.4l-1.4 1.6h1.4m-1.6 3.5h1.6l-1.6 1.6h1.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <span class="toolbar-divider"></span>
          <button class="tool-button" aria-label="Add link" title="Add link" onpointerdown={(event) => event.preventDefault()} onclick={addLink}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8.2 11.8 3.6-3.6m-5 5-1.2 1.2a2.55 2.55 0 0 1-3.6-3.6l3-3a2.55 2.55 0 0 1 3.6 0m2.2-2.6 1.2-1.2a2.55 2.55 0 0 1 3.6 3.6l-3 3a2.55 2.55 0 0 1-3.6 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
          <button class="tool-button" aria-label="Undo" title="Undo" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("undo")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7.5 6 4 9.5 7.5 13M4.5 9.5h6a5 5 0 0 1 5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button class="tool-button" aria-label="Redo" title="Redo" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("redo")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12.5 6 16 9.5 12.5 13M15.5 9.5h-6a5 5 0 0 0-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <span class="toolbar-divider"></span>
          <button class="tool-button image-tool-button" aria-label="Insert image" title="Insert image" onpointerdown={(event) => event.preventDefault()} onclick={openImagePicker}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.8" y="3.3" width="14.4" height="13.4" rx="1.6" stroke="currentColor" stroke-width="1.3"/><circle cx="7" cy="7.4" r="1.4" stroke="currentColor" stroke-width="1.2"/><path d="m4.2 14.8 4-4 2.5 2.5 2-2 3.1 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
        {/if}

        {#if selectedEditorImage && !markdownEditorMode}
          <div class="image-edit-toolbar" role="toolbar" aria-label="Selected image tools">
            <span class="image-edit-label">Image size</span>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(50)}>50%</button>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(75)}>75%</button>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(100)}>Fit width</button>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(null)}>Original size</button>
            <button type="button" class="remove-image-button" onpointerdown={(event) => event.preventDefault()} onclick={removeSelectedImage}>Remove image</button>
          </div>
        {/if}

        {#if isCharacterDocument || isPlaceDocument}
          <h2 class="sheet-notes-title">Additional notes</h2>
        {/if}

        {#if markdownEditorMode}
          <div
            bind:this={markdownEditorHost}
            class="markdown-source-editor"
            class:fade-other-paragraphs={fadeOtherParagraphs}
            role="textbox"
            aria-label="Markdown source"
            aria-multiline="true"
          ></div>
        {/if}
        <div
          class="editor-content"
          class:sheet-notes={isCharacterDocument || isPlaceDocument}
          class:editor-content-hidden={markdownEditorMode}
          class:fade-other-paragraphs={fadeOtherParagraphs}
          bind:this={editor}
          contenteditable="true"
          role="textbox"
          tabindex="0"
          aria-label="Document text"
          aria-multiline="true"
          spellcheck="true"
          onbeforeinput={handleEditorBeforeInput}
          onfocus={() => scheduleRichTextFade(true)}
          onblur={() => {
            clearRichTextFade();
            showZenInterface();
          }}
          oninput={handleInput}
          onclick={handleEditorClick}
          onkeydown={(event) => { if (event.key === "Escape") selectEditorImage(null); }}
        >{@html starterContent}</div>

        <footer class="editor-footer">
          <span>{wordCount} words <span class="footer-separator">·</span> {characterCount} characters</span>
          <span class="footer-actions">
            <span class="save-indicator"><span class:unsaved={saveState !== "All changes saved"} class="save-dot"></span>{saveState}</span>
            <button class="export-button" onclick={exportDocument}>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3.5v9m0 0 3.2-3.2M10 12.5 6.8 9.3M4.5 13v3.5h11V13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Export
            </button>
          </span>
        </footer>
      </div>
      </div>
        {#if workspaceView === "outline"}
          <OutlineView
            {chapters}
            {chapterWordCounts}
            {chapterSceneCounts}
            onAddChapter={addOutlineChapter}
            onSummaryChange={updateChapterSummary}
          />
        {/if}
        <div class="storyboard-view" class:storyboard-view-hidden={workspaceView !== "storyboard"}>
          <aside class="storyboard-sources" aria-label="Story elements to add">
            <div class="board-sources-heading">
              <span class="board-eyebrow">STORY ELEMENTS</span>
              <h2>Add to timeline</h2>
              <p>Drag an element into a row, or add it to the last row.</p>
            </div>
            <section class="board-source-group">
              <h3>Cards</h3>
              <div class="board-source">
                <button class="source-drag-handle" aria-label="Drag a blank card into a timeline row" title="Drag into a row" onpointerdown={(event) => startStoryboardDrag(event, "blank", "")}>⠿</button>
                <span class="source-icon">▢</span><span class="source-name">Blank card</span>
                <button class="source-add" aria-label="Add a blank card to the last row" title="Add to last row" onclick={() => addStoryboardCard("blank", "")}>+</button>
              </div>
            </section>
            <section class="board-source-group">
              <h3>Chapters</h3>
              {#each chapters as chapter (chapter.id)}
                <div class="board-source">
                  <button class="source-drag-handle" aria-label="Drag {chapterLabel(chapter)} into a timeline row" title="Drag into a row" onpointerdown={(event) => startStoryboardDrag(event, "chapter", chapter.id)}>⠿</button>
                  <span class="source-icon">▱</span><span class="source-name">{chapterLabel(chapter)}</span>
                  <button class="source-add" aria-label="Add {chapterLabel(chapter)} to the last row" title="Add to last row" onclick={() => addStoryboardCard("chapter", chapter.id)}>+</button>
                </div>
              {:else}
                <p class="board-source-empty">No chapters yet</p>
              {/each}
            </section>
            <section class="board-source-group">
              <h3>Scenes</h3>
              {#each documents.filter((doc) => doc.chapterId && !doc.trashed) as doc (doc.id)}
                <div class="board-source">
                  <button class="source-drag-handle" aria-label="Drag {doc.title || 'Untitled scene'} into a timeline row" title="Drag into a row" onpointerdown={(event) => startStoryboardDrag(event, "scene", doc.id)}>⠿</button>
                  <span class="source-icon">¶</span><span class="source-name">{doc.title || "Untitled scene"}</span>
                  <button class="source-add" aria-label="Add {doc.title || 'Untitled scene'} to the last row" title="Add to last row" onclick={() => addStoryboardCard("scene", doc.id)}>+</button>
                </div>
              {:else}
                <p class="board-source-empty">No scenes yet</p>
              {/each}
            </section>
            {#each spaces as space (space)}
              <section class="board-source-group">
                <h3>{space}</h3>
                {#each documents.filter((doc) => doc.space === space && !doc.trashed) as doc (doc.id)}
                  <div class="board-source">
                    <button class="source-drag-handle" aria-label="Drag {doc.title || 'Untitled'} into a timeline row" title="Drag into a row" onpointerdown={(event) => startStoryboardDrag(event, space, doc.id)}>⠿</button>
                    <span class="source-icon">{space === "Characters" ? "◉" : space === "Places" ? "⌖" : space === "Research" ? "⌕" : "▤"}</span>
                    <span class="source-name">{doc.title || "Untitled"}</span>
                    <button class="source-add" aria-label="Add {doc.title || 'Untitled'} to the last row" title="Add to last row" onclick={() => addStoryboardCard(space, doc.id)}>+</button>
                  </div>
                {:else}
                  <p class="board-source-empty">No {space.toLowerCase()} yet</p>
                {/each}
              </section>
            {/each}
          </aside>
          <section class="storyboard-canvas" aria-label="Storyboard timeline">
            <header class="storyboard-header">
              <div><span class="board-eyebrow">PLAN YOUR STORY</span><h1>Storyboard</h1></div>
              <div class="storyboard-header-actions">
                <span class="board-card-count">{storyboardRows.length} {storyboardRows.length === 1 ? "row" : "rows"} · {storyboardCards.length} {storyboardCards.length === 1 ? "card" : "cards"}</span>
                <button class="add-timeline-row" onclick={addStoryboardRow}>+ Add row</button>
              </div>
            </header>
            <div class="storyboard-timeline">
              {#each storyboardRows as row, rowIndex (row.id)}
                {@const rowCards = storyboardCards.filter((card) => card.rowId === row.id)}
                <section class="timeline-row">
                  <header class="timeline-row-header">
                    <span class="timeline-marker">{String(rowIndex + 1).padStart(2, "0")}</span>
                    <input class="timeline-row-title" aria-label="Timeline row name" value={row.title} maxlength="80" oninput={(event) => updateStoryboardRow(row.id, (event.currentTarget as HTMLInputElement).value)} />
                    <div class="timeline-row-actions">
                      <button class="card-order" aria-label="Move row earlier" title="Move row earlier" disabled={rowIndex === 0} onclick={() => moveStoryboardRow(row.id, -1)}>↑</button>
                      <button class="card-order" aria-label="Move row later" title="Move row later" disabled={rowIndex === storyboardRows.length - 1} onclick={() => moveStoryboardRow(row.id, 1)}>↓</button>
                      <button class="remove-board-card" aria-label="Remove empty row {row.title}" title="Remove empty row" disabled={rowCards.length > 0 || storyboardRows.length <= 1} onclick={() => removeStoryboardRow(row.id)}>×</button>
                    </div>
                  </header>
                  <div class="timeline-row-cards">
                    {#each rowCards as card, index (card.id)}
                      <article class="storyboard-card" class:blank-card={card.kind === "blank"} class:drop-target={boardDropTarget?.rowId === row.id && boardDropTarget.index === index} data-board-row-id={row.id} data-board-drop-index={index}>
                        <div class="storyboard-card-top">
                          <button class="card-drag-handle" aria-label="Drag {card.title} to another position or row" title="Drag to reorder or move rows" onpointerdown={(event) => startStoryboardDrag(event, "board-card", card.id)}>⠿</button>
                          <span class="card-kind">{card.kind === "blank" ? "blank" : card.kind}</span>
                          <span class="card-position">{String(index + 1).padStart(2, "0")}</span>
                          <select class="card-row-select" aria-label="Move {card.title} to timeline row" value={row.id} onchange={(event) => moveStoryboardCardToRow(card.id, (event.currentTarget as HTMLSelectElement).value)}>
                            {#each storyboardRows as optionRow (optionRow.id)}
                              <option value={optionRow.id}>{optionRow.title || "Untitled row"}</option>
                            {/each}
                          </select>
                          <button class="card-order" aria-label="Move {card.title} earlier" title="Move earlier" disabled={index === 0} onclick={() => moveStoryboardCard(card.id, -1)}>↑</button>
                          <button class="card-order" aria-label="Move {card.title} later" title="Move later" disabled={index === rowCards.length - 1} onclick={() => moveStoryboardCard(card.id, 1)}>↓</button>
                          <button class="remove-board-card" aria-label="Remove {card.title} from storyboard" title="Remove from storyboard" onclick={() => removeStoryboardCard(card.id)}>×</button>
                        </div>
                        <input class="board-card-title" aria-label="Storyboard card title" value={card.title} maxlength="120" oninput={(event) => updateStoryboardCard(card.id, "title", (event.currentTarget as HTMLInputElement).value)} />
                        <textarea
                          class="board-card-note"
                          aria-label={card.kind === "chapter" ? `Chapter summary for ${card.title}` : `Planning notes for ${card.title}`}
                          placeholder={card.kind === "chapter" ? "Chapter summary — synced with Outline" : "Write a note about this story element…"}
                          value={card.note}
                          maxlength={card.kind === "chapter" ? 4000 : undefined}
                          use:autoResize={card.note}
                          oninput={(event) => updateStoryboardCard(card.id, "note", (event.currentTarget as HTMLTextAreaElement).value)}
                        ></textarea>
                      </article>
                    {/each}
                    <div class="storyboard-row-drop" class:drop-target={boardDropTarget?.rowId === row.id && boardDropTarget.index === rowCards.length} data-board-row-id={row.id} data-board-drop-index={rowCards.length}>
                      {#if rowCards.length === 0}<span>Drop cards here, or add them from Story Elements</span>{:else}<span>Drop here to add or move a card</span>{/if}
                    </div>
                  </div>
                </section>
              {/each}
              {#if storyboardCards.length === 0}
                <p class="storyboard-empty-hint">Arrange cards in a row to show events happening at the same point in the story.</p>
              {/if}
            </div>
          </section>
        </div>
        {#if workspaceView === "publish"}
          <PublishView
            {chapters}
            {documents}
            projectName={projectName}
            authorName={authorName}
            options={publishOptions}
            theme={resolvedTheme}
            {colorScheme}
            onOptionsChange={handlePublishOptionsChange}
            beforeExport={preparePublishExport}
          />
        {/if}
    </section>
  </main>

    <aside
      class="progress-sidebar"
      class:peek={!rightSidebarVisible}
      class:peek-open={!rightSidebarVisible && rightSidebarHovered}
      inert={zenInterfaceHidden || (!rightSidebarVisible && !rightSidebarHovered)}
      aria-label="Writing goals and activity"
    >
      <div class="progress-header">
        <div>
          <span class="progress-eyebrow">YOUR WRITING</span>
          <h2>Progress</h2>
        </div>
        <button class="progress-close" type="button" aria-label="Hide progress sidebar" title="Hide progress sidebar" onclick={() => rightSidebarVisible = false}>×</button>
      </div>

      <section class="progress-section project-progress">
        <div class="section-title"><strong>Project goal</strong><span class="goal-tag">PROJECT</span></div>
        <div class="progress-numbers">
          <strong>{projectWordCount.toLocaleString()}</strong>
          <span>{projectGoal > 0 ? `of ${projectGoal.toLocaleString()} words` : "words written"}</span>
        </div>
        {#if projectGoal > 0}
          <div class="progress-track" role="progressbar" aria-label="Project goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent(projectWordCount, projectGoal)}>
            <span style:width="{progressPercent(projectWordCount, projectGoal)}%"></span>
          </div>
          <div class="progress-caption">{progressPercent(projectWordCount, projectGoal)}% of project goal</div>
        {:else}
          <div class="progress-caption">Set a goal to track project progress</div>
        {/if}
        <label class="goal-label" for="project-goal">Word count goal</label>
        <div class="goal-input-wrap">
          <input id="project-goal" class="goal-input" type="number" min="0" step="500" value={projectGoal} onchange={(event) => setProjectGoal(Number((event.currentTarget as HTMLInputElement).value))} />
          <span>words</span>
        </div>
      </section>

      <section class="progress-section chapters-progress">
        <div class="section-title"><strong>Chapter goals</strong><span>{chapters.length}</span></div>
        {#if chapters.length > 0}
          <div class="chapter-goal-list">
            {#each chapters as chapter (chapter.id)}
              {@const count = chapterWordCounts[chapter.id] ?? 0}
              {@const goal = chapterGoals[chapter.id] ?? 0}
              <div class="chapter-goal">
                <div class="chapter-goal-heading">
                  <strong title={chapterLabel(chapter)}>{chapterLabel(chapter)}</strong>
                  <span>{count.toLocaleString()}</span>
                </div>
                {#if goal > 0}
                  <div class="progress-track chapter-track" role="progressbar" aria-label="{chapterLabel(chapter)} goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progressPercent(count, goal)}>
                    <span style:width="{progressPercent(count, goal)}%"></span>
                  </div>
                  <div class="chapter-goal-footer">
                    <span>{progressPercent(count, goal)}% complete</span>
                    <label class="chapter-goal-input">
                      <span class="sr-only">{chapterLabel(chapter)} word goal</span>
                      <input type="number" min="0" step="100" value={goal} onchange={(event) => setChapterGoal(chapter.id, Number((event.currentTarget as HTMLInputElement).value))} />
                      <span>goal</span>
                    </label>
                  </div>
                {:else}
                  <label class="chapter-goal-input unset-goal">
                    <span class="sr-only">{chapterLabel(chapter)} word goal</span>
                    <input type="number" min="0" step="100" value="0" placeholder="Set word goal" onchange={(event) => setChapterGoal(chapter.id, Number((event.currentTarget as HTMLInputElement).value))} />
                    <span>words</span>
                  </label>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-progress">Add a chapter to set chapter goals.</p>
        {/if}
      </section>

      <section class="progress-section activity-section">
        <div class="section-title activity-title">
          <strong>Writing activity</strong>
          <span>{activeDaysThisMonth} active {activeDaysThisMonth === 1 ? "day" : "days"}</span>
        </div>
        <div class="calendar-heading">
          <strong>{viewedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
          <div class="calendar-navigation">
            <button aria-label="Previous month" onclick={() => changeViewedMonth(-1)}>‹</button>
            <button aria-label="Next month" onclick={() => changeViewedMonth(1)}>›</button>
          </div>
        </div>
        <div class="calendar-grid" role="grid" aria-label="Writing activity calendar">
          {#each ["S", "M", "T", "W", "T", "F", "S"] as dayName, index (`${dayName}-${index}`)}
            <span class="calendar-weekday" role="columnheader" aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index]}>{dayName}</span>
          {/each}
          {#each calendarCells as cell, index (`${cell?.key ?? "blank"}-${index}`)}
            {#if cell}
              {@const level = activityLevel(cell.record)}
              <span
                class="calendar-day"
                class:activity-1={level === 1}
                class:activity-2={level === 2}
                class:activity-3={level === 3}
                class:activity-4={level === 4}
                role="gridcell"
                aria-label="{cell.key}: {cell.record?.edits ?? 0} writing edits, {cell.record?.wordsAdded ?? 0} words added"
                title="{cell.key}: {cell.record?.edits ?? 0} edits, {cell.record?.wordsAdded ?? 0} words added"
              >{cell.day}</span>
            {:else}
              <span class="calendar-day empty-day" aria-hidden="true"></span>
            {/if}
          {/each}
        </div>
        <div class="calendar-legend"><span>Less</span><i></i><i></i><i></i><i></i><span>More</span></div>
        <p class="activity-note">Activity is recorded when you edit a scene. Added words are estimated from each edit.</p>
      </section>
    </aside>
</div>

<dialog class="settings-dialog" bind:this={settingsDialog} onclick={(event) => {
  if (event.target === settingsDialog) settingsDialog.close();
}}>
  <div class="settings-header">
    <div><span class="settings-kicker">PROSECRAFT</span><h2>Settings</h2></div>
    <button class="close-settings" aria-label="Close settings" onclick={() => settingsDialog.close()}>×</button>
  </div>
  <div class="settings-body">
    <section class="preference-section">
      <div class="preference-heading"><strong>Appearance</strong><span>Choose how ProseCraft looks</span></div>
      <label class="preference-label" for="theme-preference">Theme</label>
      <select id="theme-preference" class="preference-select" value={themePreference} onchange={(event) => setThemePreference((event.currentTarget as HTMLSelectElement).value as ThemePreference)}>
        <option value="system">Follow system</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <label class="preference-label color-scheme-label" for="color-scheme-preference">Color scheme</label>
      <select
        id="color-scheme-preference"
        class="preference-select"
        value={colorScheme}
        onchange={(event) => {
          const value = (event.currentTarget as HTMLSelectElement).value;
          if (isColorScheme(value)) setColorScheme(value);
        }}
      >
        {#each colorSchemeOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </section>
    <section class="preference-section">
      <div class="preference-heading"><strong>Writing fonts</strong><span>Choose typefaces for the writing area and Markdown source</span></div>
      <label class="preference-label" for="rich-text-font-preference">Writing font</label>
      <EditorFontPicker
        id="rich-text-font-preference"
        builtinOptions={RICH_TEXT_FONT_OPTIONS}
        builtinValue={richTextFontPreference}
        systemValue={richTextSystemFont}
        families={systemFonts}
        loading={systemFontsLoading}
        error={systemFontsError}
        supported={desktopRuntime}
        onselect={selectRichTextFont}
      />
      {#if installedFontMissing(richTextSystemFont)}
        <p class="font-picker-warning">“{richTextSystemFont}” is not installed on this device; the ProseCraft fallback will be used.</p>
      {/if}
      <label class="preference-label markdown-font-label" for="markdown-font-preference">Markdown source font</label>
      <EditorFontPicker
        id="markdown-font-preference"
        builtinOptions={MARKDOWN_FONT_OPTIONS}
        builtinValue={markdownFontPreference}
        systemValue={markdownSystemFont}
        families={systemFonts}
        loading={systemFontsLoading}
        error={systemFontsError}
        supported={desktopRuntime}
        monospaceOnly
        onselect={selectMarkdownFont}
      />
      {#if installedFontMissing(markdownSystemFont)}
        <p class="font-picker-warning">“{markdownSystemFont}” is not installed on this device; the ProseCraft fallback will be used.</p>
      {/if}
    </section>
    <section class="preference-section">
      <div class="preference-heading"><strong>Text size</strong><span>Adjust the editor scale</span></div>
      <div class="scale-control">
        <label class="preference-label" for="scale-preference">Scale</label>
        <select id="scale-preference" class="preference-select" value={editorScale} onchange={(event) => setEditorScale(Number((event.currentTarget as HTMLSelectElement).value))}>
          {#each [80, 90, 100, 110, 120, 130, 140] as scale}
            <option value={scale}>{scale}%</option>
          {/each}
        </select>
      </div>
    </section>
    <section class="preference-section">
      <div class="preference-heading"><strong>Writing experience</strong><span>Control how the editor follows your focus</span></div>
      <label class="preference-toggle">
        <input
          type="checkbox"
          checked={typewriterMode}
          onchange={(event) => setTypewriterMode((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>Typewriter mode</span>
      </label>
      <p class="preference-help">Keeps the caret near the vertical center of the page in both the rich-text and Markdown editors.</p>
      <label class="preference-toggle">
        <input
          type="checkbox"
          checked={fadeOtherParagraphs}
          onchange={(event) => setFadeOtherParagraphs((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>Fade other paragraphs</span>
      </label>
      <p class="preference-help">Keeps the paragraph you’re editing at full contrast and fades the rest while an editor is focused.</p>
      <label class="preference-toggle">
        <input
          type="checkbox"
          checked={zenMode}
          onchange={(event) => setZenMode((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>Zen mode</span>
      </label>
      <p class="preference-help">Hides the interface while you type. Move the mouse outside the editor or press Escape to bring it back.</p>
    </section>
    <section class="preference-section">
      <div class="preference-heading"><strong>Markdown editor</strong><span>Enable an optional plain-text Markdown editor alongside rich text</span></div>
      <label class="preference-toggle">
        <input
          type="checkbox"
          checked={markdownEditorEnabled}
          onchange={(event) => setMarkdownEditorEnabled((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>Enable Markdown editor</span>
      </label>
      <p class="preference-help">When enabled, use the Markdown editor button above a document to switch between Markdown source and rich text.</p>
    </section>
    <section class="preference-section">
      <div class="preference-heading"><strong>Data</strong><span>Back up or move your projects between devices</span></div>
      <div class="data-group">
        <span class="data-group-label">Plain backup (unencrypted)</span>
        <div class="data-actions">
          <button type="button" class="data-button" onclick={exportDataBundle}>Export backup</button>
          <button type="button" class="data-button" onclick={triggerImportData}>Import backup</button>
        </div>
      </div>
      <div class="data-group">
        <span class="data-group-label">Encrypted backup</span>
        <div class="data-actions">
          <button type="button" class="data-button" onclick={openEncryptedExport}>Export encrypted</button>
          <button type="button" class="data-button" onclick={triggerEncryptedImport}>Import encrypted</button>
        </div>
      </div>
      {#if desktopRuntime}
        <div class="data-group">
          <span class="data-group-label">Device sync</span>
          <p class="data-help">Keep this device in sync through a folder your devices already share, such as a Nextcloud folder. Projects are encrypted with your passphrase before they are written.</p>
          <div class="sync-folder-row">
            <span class="sync-folder-path" title={syncFolder}>{syncFolder || "No folder chosen"}</span>
            <button type="button" class="data-button" onclick={chooseSyncFolder} disabled={syncBusy}>Choose folder…</button>
          </div>
          {#if syncFolder}
            <input
              class="preference-select passphrase-input"
              type="password"
              aria-label="Sync passphrase"
              placeholder="Sync passphrase"
              autocomplete="current-password"
              bind:value={syncPassphrase}
              disabled={syncBusy}
            />
            <div class="data-actions">
              <button type="button" class="data-button" onclick={runSync} disabled={syncBusy || syncPassphrase.length < 8}>
                {syncBusy ? "Syncing…" : "Sync now"}
              </button>
              <button type="button" class="data-button" onclick={forgetSyncFolder} disabled={syncBusy}>Forget folder</button>
            </div>
          {/if}
          {#if syncStatus}<p class="data-status" role="status">{syncStatus}</p>{/if}
        </div>
      {/if}
      <input
        id="plain-import-input"
        class="data-file-input"
        type="file"
        accept=".prosecraft,application/json"
        bind:this={dataImportInput}
        onchange={handleImportData}
      />
      <input
        id="encrypted-import-input"
        class="data-file-input"
        type="file"
        accept=".prosecraft,application/json"
        bind:this={encryptedImportInput}
        onchange={handleEncryptedImportFile}
      />
      {#if dataStatus}<p class="data-status" role="status">{dataStatus}</p>{/if}
    </section>
    {#if !preferencesSaved}
      <p class="preference-error" role="status">Could not save preferences. They may reset when you close the app.</p>
    {/if}
  </div>
  <div class="settings-footer"><span>Preferences are saved on this device.</span><button class="done-button" onclick={() => settingsDialog.close()}>Done</button></div>
</dialog>

<dialog class="settings-dialog passphrase-dialog" bind:this={passphraseDialog} onclick={(event) => {
  if (event.target === passphraseDialog && !passphraseBusy) passphraseDialog.close();
}}>
  <form onsubmit={submitPassphrase}>
    <div class="settings-header">
      <div>
        <span class="settings-kicker">PROSECRAFT</span>
        <h2>{passphraseMode === "export" ? "Encrypt backup" : "Unlock backup"}</h2>
      </div>
      <button class="close-settings" aria-label="Close passphrase dialog" type="button" disabled={passphraseBusy} onclick={() => passphraseDialog.close()}>×</button>
    </div>
    <div class="settings-body">
      <section class="preference-section">
        <div class="preference-heading">
          <strong>Passphrase</strong>
          <span>{passphraseMode === "export"
            ? "You will need this passphrase to open the backup on another device. It cannot be recovered."
            : "Enter the passphrase used when this backup was created."}</span>
        </div>
        <input
          class="preference-select passphrase-input"
          type="password"
          aria-label="Passphrase"
          placeholder="Passphrase"
          autocomplete={passphraseMode === "export" ? "new-password" : "current-password"}
          bind:value={passphraseDraft}
          disabled={passphraseBusy}
        />
        {#if passphraseMode === "export"}
          <input
            class="preference-select passphrase-input"
            type="password"
            aria-label="Confirm passphrase"
            placeholder="Confirm passphrase"
            autocomplete="new-password"
            bind:value={passphraseConfirm}
            disabled={passphraseBusy}
          />
          <input
            class="preference-select passphrase-input"
            type="text"
            aria-label="Passphrase hint"
            placeholder="Hint (optional, stored unencrypted)"
            bind:value={passphraseHint}
            disabled={passphraseBusy}
          />
        {:else if pendingEncryptedHint}
          <p class="passphrase-hint-note">Hint: {pendingEncryptedHint}</p>
        {/if}
        {#if passphraseError}<p class="preference-error" role="alert">{passphraseError}</p>{/if}
      </section>
    </div>
    <div class="settings-footer">
      <span>{passphraseMode === "export" ? "Argon2id · XChaCha20-Poly1305" : "Encrypted with XChaCha20-Poly1305"}</span>
      <button class="done-button" type="submit" disabled={passphraseBusy}>
        {passphraseBusy ? "Working…" : passphraseMode === "export" ? "Encrypt & export" : "Unlock"}
      </button>
    </div>
  </form>
</dialog>

<dialog class="settings-dialog project-settings-dialog" bind:this={projectSettingsDialog} onclick={(event) => {
  if (event.target === projectSettingsDialog) projectSettingsDialog.close();
}}>
  <form onsubmit={saveProjectSettings}>
    <div class="settings-header">
      <div><span class="settings-kicker">PROSECRAFT</span><h2>Project Settings</h2></div>
      <button class="close-settings" aria-label="Close project settings" type="button" onclick={() => projectSettingsDialog.close()}>×</button>
    </div>
    <div class="settings-body">
      <section class="preference-section">
        <div class="preference-heading"><strong>Project details</strong><span>Set the title and author shown in your workspace</span></div>
        <label class="preference-label" for="project-name">Project name</label>
        <input id="project-name" class="preference-select" type="text" bind:value={projectNameDraft} maxlength="100" required />
        <label class="preference-label project-author-label" for="author-name">Author name</label>
        <input id="author-name" class="preference-select" type="text" bind:value={authorNameDraft} maxlength="100" />
      </section>
      {#if !projectSettingsSaved}
        <p class="preference-error" role="status">Could not save project settings. Please check available storage and try again.</p>
      {/if}
    </div>
    <div class="settings-footer"><span>Project details are saved on this device.</span><button class="done-button" type="submit">Save</button></div>
  </form>
</dialog>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html) {
    min-width: 320px;
    min-height: 100%;
    background: var(--page-bg);
    color-scheme: light;
    --page-bg: #f8f8f6;
    --sidebar-bg: #f1f1ed;
    --surface: #fbfbf9;
    --surface-raised: #fff;
    --border: #e8e8e3;
    --border-soft: #ecece8;
    --border-control: #e0e2db;
    --text-primary: #272a27;
    --text-heading: #323832;
    --text-body: #565b53;
    --text-secondary: #73766e;
    --text-nav: #5e6259;
    --text-muted: #999b94;
    --text-faint: #a0a198;
    --hover-bg: #e9eae5;
    --selected-bg: #e6e8e1;
    --selected-text: #3e5845;
    --control-bg: #fbfbf9;
    --control-hover: #f4f5f1;
    --toolbar-hover: #f0f1ed;
    --tree-divider: #dedfd9;
    --eyebrow: #87917f;
    --quote: #737c6f;
    --link: #55715b;
    --link-underline: #b0bbaa;
    --accent: #81977b;
    --accent-soft: #9aa993;
    --accent-ring: #81977b40;
    --accent-strong: #536d58;
    --accent-strong-hover: #435a47;
    --accent-contrast: #fff;
    --danger: #ba6158;
    --warning: #c2a16c;
    --success: #4c6a51;
    --scrollbar: #d5d7d0;
    --shadow-soft: 0 2px 5px #22291c08;
    --shadow-card: 0 3px 9px #22291c07;
    --shadow-panel: 12px 0 28px #11161212;
    --shadow-panel-left: -12px 0 28px #11161212;
    --shadow-dialog: 0 22px 70px #0005;
    --shadow-preview-frame: 0 14px 34px #22291c12;
    --shadow-preview-page: 0 14px 38px rgba(28, 32, 27, 0.12);
    --backdrop: #11161280;
    --heat-1: #b9c9b1;
    --heat-2: #8fa985;
    --heat-3: #64805d;
    --heat-4: #435e48;
    --heat-text-1: #354637;
    --heat-text-2: #263829;
    --heat-text-3: #fff;
    --heat-text-4: #fff;
    --editor-scale: 1;
    --interface-font: Georgia, "Times New Roman", serif;
    --writing-font: var(--interface-font);
  }
  :global(html[data-theme="dark"]) {
    color-scheme: dark;
    --page-bg: #191b19;
    --sidebar-bg: #202320;
    --surface: #20221f;
    --surface-raised: #282b27;
    --border: #353933;
    --border-soft: #30332f;
    --border-control: #454a42;
    --text-primary: #e2e5df;
    --text-heading: #e1e5dd;
    --text-body: #c6cbc2;
    --text-secondary: #adb3a9;
    --text-nav: #cbd0c6;
    --text-muted: #9da397;
    --text-faint: #969d91;
    --hover-bg: #2d312c;
    --selected-bg: #343c33;
    --selected-text: #b6cbae;
    --control-bg: #292c28;
    --control-hover: #30342f;
    --toolbar-hover: #383d36;
    --tree-divider: #3b4039;
    --eyebrow: #a8b69d;
    --quote: #adb8a6;
    --link: #b2cba8;
    --link-underline: #64775e;
    --accent: #81977b;
    --accent-soft: #9aa993;
    --accent-ring: #81977b40;
    --accent-strong: #536d58;
    --accent-strong-hover: #435a47;
    --accent-contrast: #fff;
    --danger: #ba6158;
    --warning: #c2a16c;
    --success: #4c6a51;
    --scrollbar: #d5d7d0;
    --shadow-soft: 0 2px 5px #22291c08;
    --shadow-card: 0 3px 9px #22291c07;
    --shadow-panel: 12px 0 28px #11161212;
    --shadow-panel-left: -12px 0 28px #11161212;
    --shadow-dialog: 0 22px 70px #0005;
    --shadow-preview-frame: 0 14px 34px #22291c12;
    --shadow-preview-page: 0 14px 38px rgba(0, 0, 0, 0.5);
    --backdrop: #11161280;
    --heat-1: #b9c9b1;
    --heat-2: #8fa985;
    --heat-3: #64805d;
    --heat-4: #435e48;
    --heat-text-1: #354637;
    --heat-text-2: #263829;
    --heat-text-3: #fff;
    --heat-text-4: #fff;
    --editor-scale: 1;
  }
  @media (prefers-color-scheme: dark) {
    :global(html:not([data-theme])) {
      color-scheme: dark;
      --page-bg: #191b19;
      --sidebar-bg: #202320;
      --surface: #20221f;
      --surface-raised: #282b27;
      --border: #353933;
      --border-soft: #30332f;
      --border-control: #454a42;
      --text-primary: #e2e5df;
      --text-heading: #e1e5dd;
      --text-body: #c6cbc2;
      --text-secondary: #adb3a9;
      --text-nav: #cbd0c6;
      --text-muted: #9da397;
      --text-faint: #969d91;
      --hover-bg: #2d312c;
      --selected-bg: #343c33;
      --selected-text: #b6cbae;
      --control-bg: #292c28;
      --control-hover: #30342f;
      --toolbar-hover: #383d36;
      --tree-divider: #3b4039;
      --eyebrow: #a8b69d;
      --quote: #adb8a6;
      --link: #b2cba8;
      --link-underline: #64775e;
      --accent: #81977b;
      --accent-soft: #9aa993;
      --accent-ring: #81977b40;
      --accent-strong: #536d58;
      --accent-strong-hover: #435a47;
      --accent-contrast: #fff;
      --danger: #ba6158;
      --warning: #c2a16c;
      --success: #4c6a51;
      --scrollbar: #d5d7d0;
      --shadow-soft: 0 2px 5px #22291c08;
      --shadow-card: 0 3px 9px #22291c07;
      --shadow-panel: 12px 0 28px #11161212;
      --shadow-panel-left: -12px 0 28px #11161212;
      --shadow-dialog: 0 22px 70px #0005;
      --shadow-preview-frame: 0 14px 34px #22291c12;
      --shadow-preview-page: 0 14px 38px rgba(0, 0, 0, 0.5);
      --backdrop: #11161280;
      --heat-1: #b9c9b1;
      --heat-2: #8fa985;
      --heat-3: #64805d;
      --heat-4: #435e48;
      --heat-text-1: #354637;
      --heat-text-2: #263829;
      --heat-text-3: #fff;
      --heat-text-4: #fff;
      --editor-scale: 1;
    }
  }
  :global(html[data-markdown-font="sf-mono"]) { --markdown-editor-font: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
  :global(html[data-markdown-font="menlo"]) { --markdown-editor-font: Menlo, "SFMono-Regular", monospace; }
  :global(html[data-markdown-font="monaco"]) { --markdown-editor-font: Monaco, "SFMono-Regular", monospace; }
  :global(html[data-markdown-font="courier"]) { --markdown-editor-font: "Courier New", Courier, monospace; }
  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    color: var(--text-primary);
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }
  :global(button), :global(input), :global(select) { font: inherit; }
  :global(button) { color: inherit; }

  .app-shell { display: flex; min-height: 100vh; }
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 2;
    display: flex;
    width: 258px;
    flex-direction: column;
    padding: 18px 12px 14px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    transition: transform .18s ease, opacity .18s ease;
  }
  .sidebar.peek { transform: translateX(-100%); pointer-events: none; }
  .sidebar.peek.peek-open { transform: translateX(0); pointer-events: auto; box-shadow: var(--shadow-panel); }
  .project-identity { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 5px; margin: 6px 4px 0; padding: 7px 5px 8px 8px; border: 1px solid transparent; border-radius: 6px; }
  .project-identity:focus-within { border-color: var(--border); background: var(--surface-raised); }
  .project-identity select { min-width: 0; max-width: 100%; grid-column: 1 / -1; padding: 2px 18px 2px 0; border: 0; appearance: none; background: transparent; color: var(--text-heading); font-family: Georgia, serif; font-size: 16px; font-weight: 500; text-overflow: ellipsis; cursor: pointer; }
  .project-identity select:focus-visible, .project-identity-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .project-identity-actions { display: flex; align-items: center; gap: 2px; }
  .project-identity-actions button { display: grid; width: 25px; height: 25px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; }
  .project-identity-actions button:hover { background: var(--hover-bg); color: var(--text-primary); }
  .author-name { overflow: hidden; max-width: 100%; color: var(--text-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .project-identity .author-name { grid-column: 1; grid-row: 2; padding-top: 2px; }
  .nav-label { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1px; }
  .sidebar-tree { min-height: 0; flex: 1; overflow-y: auto; margin-top: 28px; padding: 0 1px; scrollbar-width: thin; scrollbar-color: var(--scrollbar) transparent; }
  .tree-heading, .space-heading, .chapter-row { display: flex; min-width: 0; align-items: center; }
  .tree-heading { justify-content: space-between; padding: 0 7px 7px; }
  .tree-add, .row-add, .row-action { display: grid; width: 23px; height: 23px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1; }
  .tree-add:hover, .row-add:hover, .row-action:hover { background: var(--hover-bg); color: var(--selected-text); }
  .chapter-list { display: flex; flex-direction: column; gap: 2px; }
  .chapter-group, .space-group { min-width: 0; }
  .chapter-group.dragging { opacity: .45; }
  .chapter-group { position: relative; }
  .chapter-group.drop-before::before, .chapter-group.drop-after::after { position: absolute; right: 2px; left: 2px; z-index: 1; height: 2px; border-radius: 2px; background: var(--accent); content: ""; pointer-events: none; }
  .chapter-group.drop-before::before { top: -2px; }
  .chapter-group.drop-after::after { bottom: -2px; }
  .chapter-row, .space-heading { min-height: 32px; padding: 0 4px; border-radius: 5px; }
  .chapter-row:hover, .space-heading:hover { background: var(--hover-bg); }
  .chapter-toggle, .space-toggle { display: flex; min-width: 0; height: 30px; flex: 1; align-items: center; gap: 7px; padding: 0 3px; border: 0; background: transparent; color: var(--text-nav); cursor: pointer; text-align: left; }
  .chapter-drag, .chapter-action { display: grid; width: 19px; height: 23px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; line-height: 1; }
  .chapter-drag { cursor: grab; font-size: 15px; }
  .chapter-drag:active { cursor: grabbing; }
  .chapter-actions { display: flex; flex: 0 0 auto; align-items: center; }
  .chapter-action { opacity: .45; }
  .chapter-row:hover .chapter-action, .chapter-action:focus-visible { opacity: 1; }
  .chapter-action:hover:not(:disabled), .chapter-drag:hover { background: var(--hover-bg); color: var(--text-primary); }
  .chapter-action:disabled { opacity: .18; cursor: default; }
  .chapter-name-input { min-width: 0; flex: 1; padding: 2px 3px; border: 1px solid var(--border-control); border-radius: 3px; background: var(--control-bg); color: var(--text-primary); font-size: 10px; }
  .chapter-name-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .chevron { display: inline-block; width: 11px; color: var(--text-faint); font-size: 17px; line-height: 1; transform: rotate(0deg); transition: transform .12s ease; }
  .chevron.rotated { transform: rotate(90deg); }
  .folder-icon { width: 15px; height: 15px; flex: 0 0 auto; color: var(--text-muted); }
  .tree-name { overflow: hidden; min-width: 0; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
  .chapter-toggle .tree-name, .space-toggle .tree-name { color: var(--text-nav); font-size: 11px; font-weight: 550; }
  .row-add { opacity: 0; }
  .chapter-row:hover .row-add, .space-heading:hover .row-add, .row-add:focus-visible { opacity: 1; }
  .scene-list, .space-items { display: flex; flex-direction: column; gap: 1px; margin: 1px 0 5px 22px; padding-left: 7px; border-left: 1px solid var(--tree-divider); }
  .note-folder-row { display: flex; min-width: 0; min-height: 29px; align-items: center; gap: 1px; padding-right: 2px; border-radius: 5px; }
  .note-folder-row:hover { background: var(--hover-bg); }
  .note-folder-toggle { display: flex; min-width: 0; height: 27px; flex: 1; align-items: center; gap: 5px; padding: 0 3px; border: 0; background: transparent; color: var(--text-nav); cursor: pointer; text-align: left; font-size: 10px; }
  .note-folder-icon { width: 13px; flex: 0 0 auto; color: var(--text-muted); font-size: 13px; text-align: center; }
  .note-folder-actions { display: flex; flex: 0 0 auto; align-items: center; }
  .note-folder-actions .chapter-action { opacity: .45; }
  .note-folder-row:hover .chapter-action, .note-folder-actions .chapter-action:focus-visible { opacity: 1; }
  .note-folder-name-input { height: 23px; }
  .note-document-row { padding-right: 2px; }
  .note-folder-select { width: 19px; height: 20px; flex: 0 0 auto; padding: 0; border: 0; appearance: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 9px; opacity: .45; }
  .note-folder-select:focus-visible, .note-document-row:hover .note-folder-select { width: auto; max-width: 88px; appearance: auto; opacity: 1; }
  .document-row { display: flex; min-width: 0; min-height: 29px; align-items: center; gap: 1px; padding: 0 2px; border-radius: 5px; }
  .document-row:hover, .document-row.current { background: var(--selected-bg); }
  .document-select { display: flex; min-width: 0; height: 27px; flex: 1; align-items: center; gap: 7px; padding: 0 4px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; text-align: left; font-size: 10px; }
  .document-row.current .document-select { color: var(--selected-text); font-weight: 600; }
  .scene-mark { flex: 0 0 auto; color: var(--text-faint); font-family: Georgia, serif; font-size: 13px; }
  .row-action { width: 21px; height: 21px; opacity: .45; font-size: 15px; }
  .document-row:hover .row-action, .row-action:focus-visible { opacity: 1; }
  .restore-action, .delete-action { opacity: 1; }
  .trashed-document { color: var(--text-muted); }
  .empty-tree, .empty-action { display: block; padding: 5px 7px; color: var(--text-faint); font-size: 10px; }
  .empty-action { border: 0; background: transparent; cursor: pointer; text-align: left; }
  .empty-action:hover { color: var(--selected-text); }
  .tree-divider { height: 1px; margin: 14px 7px 12px; background: var(--tree-divider); }
  .spaces-heading { padding-bottom: 4px; }
  .space-group { margin: 1px 0; }
  .space-heading { padding-right: 3px; }
  .space-toggle { gap: 8px; }
  .space-icon { width: 15px; flex: 0 0 auto; color: var(--text-muted); font-size: 13px; text-align: center; }
  .trash-group .space-toggle { width: 100%; }
  .trash-count { color: var(--text-faint); font-size: 10px; }
  .sidebar-footer { flex: 0 0 auto; padding-top: 8px; }
  .settings-button { display: flex; width: 100%; height: 34px; align-items: center; gap: 9px; padding: 0 8px; border: 0; border-radius: 5px; background: transparent; color: var(--text-secondary); cursor: pointer; text-align: left; font-size: 10px; }
  .settings-button:hover { background: var(--hover-bg); color: var(--text-primary); }
  .settings-button svg { width: 15px; height: 15px; flex: 0 0 auto; }
  .sync-status { display: flex; align-items: center; gap: 7px; padding: 0 8px 13px; color: var(--text-muted); font-size: 10px; }
  .sync-dot, .save-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

  .progress-sidebar { position: fixed; inset: 0 0 0 auto; z-index: 2; display: flex; width: 286px; flex-direction: column; overflow-y: auto; padding: 27px 19px 22px; border-left: 1px solid var(--border); background: var(--sidebar-bg); scrollbar-width: thin; scrollbar-color: var(--scrollbar) transparent; transition: transform .18s ease, opacity .18s ease; }
  .progress-sidebar.peek { transform: translateX(100%); pointer-events: none; }
  .progress-sidebar.peek.peek-open { transform: translateX(0); pointer-events: auto; box-shadow: var(--shadow-panel-left); }
  .progress-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 0 3px 19px; }
  .progress-close { display: none; width: 26px; height: 26px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 20px; line-height: 1; }
  .progress-close:hover { background: var(--hover-bg); color: var(--text-primary); }
  .progress-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .progress-eyebrow { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.1px; }
  .progress-header h2 { margin: 7px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 23px; font-weight: 500; letter-spacing: -.4px; }
  .progress-section { padding: 16px 3px 18px; border-top: 1px solid var(--tree-divider); }
  .section-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .section-title strong { color: var(--text-nav); font-size: 11px; font-weight: 600; }
  .goal-tag { padding: 3px 5px; border-radius: 3px; background: var(--selected-bg); color: var(--text-muted); font-size: 8px; font-weight: 650; letter-spacing: .6px; }
  .progress-numbers { display: flex; align-items: baseline; gap: 5px; margin-top: 15px; }
  .progress-numbers strong { color: var(--text-heading); font-family: Georgia, serif; font-size: 23px; font-weight: 500; }
  .progress-numbers span { color: var(--text-muted); font-size: 9px; }
  .progress-track { height: 6px; overflow: hidden; margin-top: 10px; border-radius: 99px; background: var(--tree-divider); }
  .progress-track > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .2s ease; }
  .progress-caption { margin-top: 6px; color: var(--text-muted); font-size: 9px; }
  .goal-label { display: block; margin-top: 15px; margin-bottom: 5px; color: var(--text-muted); font-size: 9px; }
  .goal-input-wrap { display: flex; height: 31px; align-items: center; gap: 7px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-muted); font-size: 9px; }
  .goal-input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font-size: 10px; }
  .chapter-goal-list { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; }
  .chapter-goal { min-width: 0; }
  .chapter-goal-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .chapter-goal-heading strong { overflow: hidden; color: var(--text-nav); font-size: 10px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
  .chapter-goal-heading > span { flex: 0 0 auto; color: var(--text-muted); font-size: 9px; }
  .chapter-track { height: 4px; margin-top: 7px; }
  .chapter-goal-footer { display: flex; align-items: center; justify-content: space-between; gap: 7px; margin-top: 6px; color: var(--text-muted); font-size: 8px; }
  .chapter-goal-input { display: flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: 8px; }
  .chapter-goal-input input { width: 69px; height: 22px; padding: 0 5px; border: 1px solid var(--border-control); border-radius: 4px; background: var(--control-bg); color: var(--text-primary); font-size: 9px; }
  .unset-goal { margin-top: 7px; }
  .unset-goal input { width: 110px; }
  .empty-progress { margin: 13px 0 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .activity-title > span { color: var(--text-muted); font-size: 9px; }
  .calendar-heading { display: flex; align-items: center; justify-content: space-between; margin: 14px 0 10px; }
  .calendar-heading > strong { color: var(--text-nav); font-size: 10px; font-weight: 550; }
  .calendar-navigation { display: flex; gap: 3px; }
  .calendar-navigation button { display: grid; width: 22px; height: 22px; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 17px; line-height: 1; }
  .calendar-navigation button:hover { background: var(--hover-bg); }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .calendar-weekday { display: grid; height: 19px; place-items: center; color: var(--text-muted); font-size: 8px; }
  .calendar-day { display: grid; aspect-ratio: 1; min-width: 0; place-items: center; border-radius: 4px; background: var(--control-hover); color: var(--text-secondary); font-size: 8px; }
  .calendar-day.empty-day { background: transparent; }
  .calendar-day.activity-1 { background: var(--heat-1); color: var(--heat-text-1); }
  .calendar-day.activity-2 { background: var(--heat-2); color: var(--heat-text-2); }
  .calendar-day.activity-3 { background: var(--heat-3); color: var(--heat-text-3); }
  .calendar-day.activity-4 { background: var(--heat-4); color: var(--heat-text-4); }
  .calendar-legend { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 10px; color: var(--text-muted); font-size: 8px; }
  .calendar-legend i { width: 9px; height: 9px; border-radius: 2px; background: var(--control-hover); }
  .calendar-legend i:nth-of-type(1) { background: var(--heat-1); }
  .calendar-legend i:nth-of-type(2) { background: var(--heat-2); }
  .calendar-legend i:nth-of-type(3) { background: var(--heat-3); }
  .calendar-legend i:nth-of-type(4) { background: var(--heat-4); }
  .activity-note { margin: 10px 0 0; color: var(--text-muted); font-size: 8px; line-height: 1.5; }

  .main-panel { display: flex; min-width: 0; min-height: 100vh; flex: 1; flex-direction: column; margin-right: 286px; margin-left: 258px; transition: margin .18s ease; }
  .main-panel.left-hidden { margin-left: 0; }
  .main-panel.right-hidden { margin-right: 0; }
  .save-indicator { display: flex; align-items: center; gap: 7px; color: var(--text-muted); font-size: 10px; }
  .save-dot.unsaved { background: var(--warning); }
  .export-button svg { width: 16px; height: 16px; }
  .export-button { display: flex; height: 30px; align-items: center; gap: 7px; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 11px; }
  .export-button:hover { background: var(--control-hover); }
  .writing-area { display: flex; flex: 1; flex-direction: column; align-items: center; padding: 15px 32px 44px; }
  .workspace-controls { display: flex; width: min(100%, 1120px); align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .workspace-modes, .panel-toggles { display: flex; align-items: center; gap: 5px; }
  .workspace-modes { padding: 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); }
  .workspace-mode { height: 26px; padding: 0 11px; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; }
  .workspace-mode:hover { color: var(--text-primary); }
  .workspace-mode.active { background: var(--selected-bg); color: var(--selected-text); font-weight: 600; }
  .panel-toggle { display: inline-flex; height: 28px; align-items: center; gap: 6px; padding: 0 7px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 9px; }
  .panel-toggle:hover { border-color: var(--border); background: var(--surface); color: var(--text-secondary); }
  .panel-toggle svg { width: 15px; height: 15px; }
  .editor-panel { display: flex; width: 100%; justify-content: center; }
  .editor-panel.typewriter-mode { padding-bottom: 50vh; }
  .editor-panel-hidden { display: none; }
  .editor-column { position: relative; width: min(100%, 690px); }
  .editor-column.image-drop-active { outline: 2px dashed var(--accent); outline-offset: 10px; border-radius: 4px; }
  .document-meta { display: flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 10px; }
  .document-type { display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 650; letter-spacing: .8px; }
  .type-mark { color: var(--accent); font-family: Georgia, serif; font-size: 15px; font-weight: 400; }
  .meta-divider { height: 12px; border-left: 1px solid var(--border); }
  .title-input { display: block; width: 100%; margin: 21px 0 22px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--text-heading); font-family: var(--writing-font, var(--interface-font)); font-size: clamp(calc(32px * var(--editor-scale)), calc(4vw * var(--editor-scale)), calc(40px * var(--editor-scale))); font-weight: 500; letter-spacing: -1.35px; line-height: 1.2; }
  .title-input::placeholder { color: var(--text-faint); }
  .toolbar { display: flex; min-height: 41px; align-items: center; gap: 3px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface-raised); box-shadow: var(--shadow-soft); }
  .style-select { width: 112px; height: 28px; padding: 0 6px; border: 0; outline: 0; background: transparent; color: var(--text-secondary); font-size: 10px; cursor: pointer; }
  .toolbar-divider { width: 1px; height: 18px; margin: 0 5px; background: var(--border); }
  .tool-button { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 13px; }
  .tool-button:hover { background: var(--toolbar-hover); color: var(--selected-text); }
  .tool-button svg { width: 16px; height: 16px; }
  .italic { font-family: Georgia, serif; font-style: italic; }
  .underline { text-decoration: underline; text-underline-offset: 2px; }
  .strike { text-decoration: line-through; }
  .markdown-mode-toggle { margin-left: auto; padding: 5px 8px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-secondary); cursor: pointer; font-size: 9px; }
  .markdown-mode-toggle:hover { border-color: var(--accent); color: var(--text-heading); }
  .image-insert-button { margin-left: auto; }
  .document-meta .markdown-mode-toggle + .image-insert-button { margin-left: 0; }
  .image-tool-button { font-size: 17px; }
  .image-insert-error { margin: 8px 0 0; color: var(--danger, #b42318); font-size: 11px; }
  .image-edit-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 8px 0 12px; padding: 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-raised); }
  .image-edit-label { margin: 0 4px; color: var(--text-muted); font-size: 10px; }
  .image-edit-toolbar button { min-height: 25px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 4px; background: var(--surface); color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .image-edit-toolbar button:hover { border-color: var(--accent); color: var(--text-heading); }
  .image-edit-toolbar .remove-image-button { margin-left: auto; color: var(--danger, #b42318); }
  .markdown-source-editor { width: 100%; min-height: 430px; margin-top: 0; }
  .markdown-source-editor :global(.cm-editor) { min-height: 430px; background: transparent; color: var(--text-body); font-size: calc(13px * var(--editor-scale)); }
  .markdown-source-editor :global(.cm-scroller) { overflow: visible !important; font-family: var(--markdown-editor-font); line-height: 1.85; }
  .markdown-source-editor :global(.cm-content) { min-height: 430px; padding: 37px 1px 35px; }
  .markdown-source-editor :global(.cm-line) { padding: 0; }
  .markdown-source-editor :global(.cm-gutters) { display: none; }
  .markdown-source-editor :global(.cm-focused) { outline: none; }
  .markdown-source-editor.fade-other-paragraphs :global(.cm-line.cm-faded-line) { opacity: .38; }
  :global(.markdown-image-placeholder) { display: inline-block; padding: 1px 6px; border: 1px solid var(--border-control); border-radius: 4px; background: var(--surface-raised); color: var(--text-muted); font: 10px/1.6 var(--markdown-editor-font); white-space: nowrap; }
  .editor-content-hidden { display: none; }
  .editor-content { min-height: 430px; padding: 37px 1px 35px; outline: none; color: var(--text-body); font-family: var(--writing-font, var(--interface-font)); font-size: calc(16px * var(--editor-scale)); line-height: 1.85; }
  .editor-content.fade-other-paragraphs :global(.faded-writing-block) {
    opacity: .38;
    transition: opacity .15s ease;
  }
  .editor-content :global(.eyebrow) { margin: 0 0 11px; color: var(--eyebrow); font-family: ui-sans-serif, sans-serif; font-size: calc(9px * var(--editor-scale)); font-weight: 650; letter-spacing: 1.3px; line-height: 1.5; }
  .editor-content :global(h2) { margin: 0 0 19px; color: var(--text-heading); font-size: calc(24px * var(--editor-scale)); font-weight: 500; letter-spacing: -.5px; line-height: 1.4; }
  .editor-content :global(h1) { color: var(--text-heading); font-size: calc(30px * var(--editor-scale)); font-weight: 500; line-height: 1.35; }
  .editor-content :global(h3) { color: var(--text-heading); font-size: calc(19px * var(--editor-scale)); font-weight: 500; }
  .editor-content :global(p) { margin: 0 0 18px; }
  .editor-content :global(blockquote) { margin: 26px 0; padding: 2px 0 2px 17px; border-left: 2px solid var(--accent-soft); color: var(--quote); font-style: italic; }
  .editor-content :global(ul), .editor-content :global(ol) { padding-left: 24px; }
  .editor-content :global(a) { color: var(--link); text-decoration-color: var(--link-underline); text-underline-offset: 3px; }
  .editor-content :global(img) { display: block; max-width: 100%; height: auto; margin: 18px 0; object-fit: contain; }
  .editor-content :global(img.selected-writing-image) { outline: 2px solid var(--accent); outline-offset: 3px; cursor: pointer; }
  .editor-content :global(pre) { overflow-x: auto; padding: 12px 14px; border-radius: 5px; background: var(--surface-raised); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; line-height: 1.55; }
  .editor-content :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .editor-content :global(table) { width: 100%; border-collapse: collapse; font-size: .9em; }
  .editor-content :global(th), .editor-content :global(td) { padding: 5px 8px; border: 1px solid var(--border); text-align: left; }
  .sheet-notes-title { margin: 26px 0 0; color: var(--eyebrow); font-size: 9px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; }
  .editor-content.sheet-notes { min-height: 120px; padding-top: 11px; font-size: calc(15px * var(--editor-scale)); }
  .editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 15px; border-top: 1px solid var(--border-soft); color: var(--text-faint); font-size: 10px; }
  .footer-actions { display: flex; align-items: center; gap: 12px; }
  .footer-separator { margin: 0 4px; color: var(--border); }
  .sr-only { position: absolute; overflow: hidden; width: 1px; height: 1px; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .storyboard-view { display: grid; width: min(100%, 1120px); min-height: 0; flex: 1; grid-template-columns: minmax(185px, 230px) minmax(0, 1fr); gap: 22px; }
  .storyboard-view-hidden { display: none; }
  .storyboard-sources { min-height: 0; overflow: auto; padding: 16px 13px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); scrollbar-width: thin; }
  .board-sources-heading { padding: 0 3px 14px; border-bottom: 1px solid var(--border-soft); }
  .board-eyebrow { color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: 1.2px; }
  .board-sources-heading h2 { margin: 6px 0 5px; color: var(--text-heading); font-family: var(--interface-font); font-size: 18px; font-weight: 500; }
  .board-sources-heading p { margin: 0; color: var(--text-muted); font-size: 9px; line-height: 1.5; }
  .board-source-group { padding: 13px 0 2px; }
  .board-source-group h3 { margin: 0 3px 6px; color: var(--text-muted); font-size: 8px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
  .board-source { display: flex; width: 100%; min-width: 0; align-items: center; gap: 6px; padding: 4px 3px; border-radius: 5px; color: var(--text-nav); }
  .board-source:hover { background: var(--control-hover); color: var(--text-primary); }
  .source-drag-handle, .source-add { display: grid; width: 21px; height: 22px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .source-drag-handle { cursor: grab; font-size: 15px; touch-action: none; }
  .source-drag-handle:active { cursor: grabbing; }
  .source-add { font-size: 16px; }
  .source-drag-handle:hover, .source-add:hover { background: var(--selected-bg); color: var(--selected-text); }
  .source-name { overflow: hidden; min-width: 0; flex: 1; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .source-icon { width: 14px; flex: 0 0 auto; color: var(--eyebrow); font-family: Georgia, serif; text-align: center; }
  .board-source-empty { margin: 5px 3px; color: var(--text-muted); font-size: 9px; }
  .storyboard-canvas { min-width: 0; padding: 18px 20px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .storyboard-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 18px; padding-bottom: 13px; border-bottom: 1px solid var(--border-soft); }
  .storyboard-header h1 { margin: 5px 0 0; color: var(--text-heading); font-family: var(--interface-font); font-size: 25px; font-weight: 500; }
  .storyboard-header-actions { display: flex; align-items: center; gap: 10px; }
  .board-card-count { padding-bottom: 3px; color: var(--text-muted); font-size: 9px; }
  .add-timeline-row { height: 28px; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 9px; }
  .add-timeline-row:hover { background: var(--control-hover); color: var(--selected-text); }
  .storyboard-timeline { position: relative; display: flex; flex-direction: column; gap: 12px; }
  .timeline-row { position: relative; min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); }
  .timeline-row-header { display: flex; align-items: center; gap: 8px; margin-bottom: 11px; }
  .timeline-marker { display: grid; width: 23px; height: 23px; flex: 0 0 auto; place-items: center; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); color: var(--eyebrow); font-size: 8px; font-variant-numeric: tabular-nums; }
  .timeline-row-title { min-width: 0; flex: 1; padding: 3px 0; border: 0; border-bottom: 1px solid transparent; outline: none; background: transparent; color: var(--text-heading); font-size: 11px; font-weight: 600; }
  .timeline-row-title:focus { border-color: var(--accent); }
  .timeline-row-actions { display: flex; align-items: center; gap: 2px; }
  .timeline-row-actions .remove-board-card:disabled { opacity: .25; cursor: default; }
  .timeline-row-cards { display: flex; min-width: 0; align-items: stretch; gap: 10px; overflow-x: auto; padding: 1px 1px 8px; scrollbar-width: thin; }
  .storyboard-card { width: min(100%, 240px); min-width: 200px; flex: 0 0 220px; padding: 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-card); transition: border-color .12s, box-shadow .12s, transform .12s; }
  .storyboard-card.drop-target { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ring); transform: translateY(2px); }
  .storyboard-card.blank-card { border-style: dashed; }
  .storyboard-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 9px; }
  .card-drag-handle, .card-order, .remove-board-card { display: grid; width: 21px; height: 22px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .card-drag-handle { cursor: grab; font-size: 15px; touch-action: none; }
  .card-drag-handle:active { cursor: grabbing; }
  .card-order, .remove-board-card { font-size: 12px; }
  .card-order:disabled { opacity: .3; cursor: default; }
  .card-drag-handle:hover, .card-order:hover:not(:disabled), .remove-board-card:hover { background: var(--control-hover); color: var(--text-primary); }
  .card-row-select { width: 55px; height: 21px; padding: 0 2px; border: 1px solid var(--border-control); border-radius: 4px; background: var(--surface); color: var(--text-muted); font-size: 8px; }
  .card-kind { overflow: hidden; min-width: 0; flex: 1; color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: .7px; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .card-position { color: var(--text-muted); font-size: 8px; font-variant-numeric: tabular-nums; }
  .board-card-title { width: 100%; padding: 2px 0 7px; border: 0; border-bottom: 1px solid var(--border-soft); outline: none; background: transparent; color: var(--text-heading); font-family: var(--interface-font); font-size: 15px; font-weight: 500; }
  .board-card-title:focus { border-color: var(--accent); }
  .board-card-note { display: block; width: 100%; min-height: 106px; margin-top: 8px; padding: 4px 0; resize: none; overflow-y: hidden; border: 0; outline: none; background: transparent; color: var(--text-body); font-family: var(--interface-font); font-size: 12px; line-height: 1.6; }
  .board-card-note::placeholder { color: var(--text-muted); font-family: Inter, ui-sans-serif, sans-serif; font-size: 9px; }
  .storyboard-row-drop { display: grid; min-width: 82px; min-height: 80px; flex: 1 0 82px; place-items: center; padding: 8px; border: 1px dashed var(--border-control); border-radius: 7px; color: var(--text-muted); font-size: 8px; text-align: center; transition: background .12s, border-color .12s; }
  .storyboard-row-drop.drop-target { border-color: var(--accent); background: var(--selected-bg); color: var(--selected-text); }
  .storyboard-empty-hint { margin: 0; color: var(--text-muted); font-size: 9px; line-height: 1.5; }

  .settings-dialog { width: min(440px, calc(100vw - 32px)); max-height: min(680px, calc(100vh - 32px)); padding: 0; overflow: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-primary); box-shadow: var(--shadow-dialog); }
  .project-settings-dialog form { margin: 0; }
  .settings-dialog::backdrop { background: var(--backdrop); backdrop-filter: blur(2px); }
  .settings-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 23px 25px 18px; border-bottom: 1px solid var(--border-soft); }
  .settings-kicker { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
  .settings-header h2 { margin: 7px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 25px; font-weight: 500; }
  .close-settings { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 20px; }
  .close-settings:hover { background: var(--hover-bg); color: var(--text-primary); }
  .settings-body { padding: 7px 25px 10px; }
  .preference-section { padding: 17px 0; border-bottom: 1px solid var(--border-soft); }
  .preference-heading { display: flex; flex-direction: column; gap: 4px; margin-bottom: 13px; }
  .preference-heading strong { color: var(--text-heading); font-size: 12px; font-weight: 600; }
  .preference-heading span { color: var(--text-muted); font-size: 10px; }
  .preference-label { display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 10px; }
  .markdown-font-label { margin-top: 14px; }
  .font-picker-warning { margin: 6px 0 0; color: var(--warning); font-size: 10px; line-height: 1.5; }
  .preference-toggle { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); cursor: pointer; font-size: 11px; }
  .preference-help + .preference-toggle { margin-top: 12px; }
  .preference-toggle input { accent-color: var(--accent-strong); }
  .preference-help { margin: 9px 0 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .color-scheme-label { margin-top: 14px; }
  .preference-select { width: 100%; height: 35px; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); font-size: 11px; }
  .project-author-label { margin-top: 16px; }
  .preference-select:focus-visible, .close-settings:focus-visible, .done-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .preference-error { margin: 12px 0 0; color: var(--danger); font-size: 10px; }
  .data-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .data-group { margin-bottom: 11px; }
  .data-group:last-of-type { margin-bottom: 4px; }
  .data-group-label { display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 9px; letter-spacing: 0.04em; text-transform: uppercase; }
  .data-button { height: 32px; padding: 0 13px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-size: 11px; }
  .data-button:hover { border-color: var(--accent); color: var(--text-heading); }
  .data-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .data-file-input { display: none; }
  .data-status { margin: 10px 0 0; color: var(--text-muted); font-size: 10px; }
  .data-help { margin: 0 0 8px; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .data-button:disabled { opacity: 0.5; cursor: default; }
  .data-button:disabled:hover { border-color: var(--border-control); color: var(--text-primary); }
  .sync-folder-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .sync-folder-path { flex: 1; overflow: hidden; color: var(--text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .passphrase-input { margin-bottom: 8px; }
  .passphrase-input:last-of-type { margin-bottom: 0; }
  .passphrase-hint-note { margin: 8px 0 0; color: var(--text-muted); font-size: 10px; }
  .done-button:disabled { opacity: 0.6; cursor: default; }
  .settings-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 25px; border-top: 1px solid var(--border-soft); color: var(--text-muted); font-size: 9px; }
  .done-button { height: 30px; padding: 0 14px; border: 1px solid transparent; border-radius: 5px; background: var(--accent-strong); color: var(--accent-contrast); cursor: pointer; font-size: 10px; }
  .done-button:hover { background: var(--accent-strong-hover); }

  @media (max-width: 1050px) {
    .progress-sidebar { width: 270px; box-shadow: var(--shadow-panel-left); }
    .progress-close { display: grid; }
    .main-panel { margin-right: 0; }
    .workspace-controls { justify-content: flex-start; gap: 8px; }
    .storyboard-view { gap: 14px; }
  }
  @media (max-width: 760px) {
    .sidebar { width: 220px; padding-right: 10px; padding-left: 10px; }
    .main-panel { margin-left: 220px; }
    .writing-area { padding: 15px 20px 35px; }
    .workspace-controls { flex-wrap: wrap; margin-bottom: 20px; }
    .panel-toggles { margin-left: auto; }
    .panel-toggle span { display: none; }
    .storyboard-view { grid-template-columns: 1fr; }
    .storyboard-sources { max-height: 230px; }
    .storyboard-sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0 12px; }
    .board-sources-heading { grid-column: 1 / -1; }
    .toolbar { gap: 1px; overflow-x: auto; }
    .style-select { width: 100px; flex: 0 0 auto; }
    .toolbar-divider { margin: 0 3px; }
  }
  @media (max-width: 440px) {
    .sidebar { width: 174px; padding-right: 7px; padding-left: 7px; }
    .main-panel { margin-left: 174px; }
    .progress-sidebar { width: min(270px, calc(100vw - 24px)); }
    .writing-area { padding: 12px 12px 28px; }
    .workspace-modes { width: 100%; gap: 0; overflow-x: auto; scrollbar-width: none; }
    .workspace-modes::-webkit-scrollbar { display: none; }
    .workspace-mode { flex: 1 0 auto; padding: 0 4px; font-size: 9px; white-space: nowrap; }
    .panel-toggle { gap: 3px; padding: 0 4px; }
    .storyboard-canvas { padding: 14px 12px; }
    .editor-footer { align-items: flex-start; flex-direction: column; }
    .footer-actions { width: 100%; justify-content: space-between; }
    .title-input { margin-top: 17px; font-size: 31px; }
    .editor-content { padding-top: 30px; font-size: calc(15px * var(--editor-scale)); }
    .toolbar { padding-right: 4px; padding-left: 4px; }
    .tool-button { width: 26px; }
    .toolbar-divider { margin: 0 1px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sidebar, .progress-sidebar { transition: none; }
  }

  .app-shell.zen-hidden .sidebar,
  .app-shell.zen-hidden .sidebar.peek,
  .app-shell.zen-hidden .sidebar.peek.peek-open {
    opacity: 0;
    transform: translateX(-100%);
    pointer-events: none;
  }
  .app-shell.zen-hidden .progress-sidebar,
  .app-shell.zen-hidden .progress-sidebar.peek,
  .app-shell.zen-hidden .progress-sidebar.peek.peek-open {
    opacity: 0;
    transform: translateX(100%);
    pointer-events: none;
  }
  .app-shell.zen-hidden .main-panel { margin-right: 0; margin-left: 0; }
  .app-shell.zen-hidden .workspace-controls,
  .app-shell.zen-hidden .document-meta,
  .app-shell.zen-hidden .title-input,
  .app-shell.zen-hidden .toolbar,
  .app-shell.zen-hidden .image-edit-toolbar,
  .app-shell.zen-hidden .image-insert-error,
  .app-shell.zen-hidden .editor-footer {
    display: none;
  }
</style>
