<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { base } from "$app/paths";
  import { history, historyKeymap, isolateHistory, redo as redoMarkdown, undo as undoMarkdown, undoDepth } from "@codemirror/commands";
  import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    BookOpen,
    Columns2,
    ChevronLeft,
    ChevronRight,
    Check,
    Database,
    Download,
    Ellipsis,
    ExternalLink,
    FileText,
    Folder,
    FolderPlus,
    GripVertical,
    Hand,
    History,
    Image as ImageIcon,
    Info,
    Keyboard,
    ImagePlus,
    Link as LinkIcon,
    List,
    ListOrdered,
    MessageSquareText,
    Minus,
    MousePointer2,
    PanelLeft,
    PanelRight,
    Pencil,
    PenLine,
    Plus,
    Redo2,
    RotateCcw,
    Calculator,
    Search,
    Settings,
    Sigma,
    SlidersHorizontal,
    SpellCheck,
    Square,
    Trash2,
    Type,
    Undo2,
    Upload,
    Workflow,
    X
  } from "@lucide/svelte";
  import { markdown } from "@codemirror/lang-markdown";
  import { Compartment, EditorState, StateEffect, StateField, Transaction, type Range as DecorationRange } from "@codemirror/state";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { tags } from "@lezer/highlight";
  import { Decoration, EditorView, keymap, ViewPlugin, type DecorationSet, type ViewUpdate, WidgetType } from "@codemirror/view";
  import "@fontsource-variable/bitter/wght.css";
  import "@fontsource-variable/literata/wght.css";
  import "@fontsource/ibm-plex-serif/latin-400.css";
  import "@fontsource/ibm-plex-serif/latin-700.css";
  import "@fontsource/ibm-plex-sans/latin-400.css";
  import "@fontsource/ibm-plex-sans/latin-700.css";
  import "$lib/color-schemes.css";
  import { APP_AUTHOR, APP_LICENSE, APP_NAME, APP_REPOSITORY_URL, APP_VERSION, buildDiagnosticsReport } from "$lib/about";
  import { autoResize } from "$lib/auto-resize";
  import { confirmDestructiveAction } from "$lib/confirm";
  import {
    applyImageLayout,
    clampImageWidth,
    DEFAULT_IMAGE_LAYOUT,
    MAX_IMAGE_WIDTH,
    MIN_IMAGE_WIDTH,
    readImageLayout,
    type ImageLayout,
    type ImageLayoutAlign,
    type ImageLayoutSize,
    type ImageLayoutWrap
  } from "$lib/image-layout";
  import { centerCaretInViewport, scrollContainerOf } from "$lib/typewriter";
  import EditorFontPicker from "$lib/EditorFontPicker.svelte";
  import OutlineView from "$lib/OutlineView.svelte";
  import SearchDialog from "$lib/SearchDialog.svelte";
  import type { ReplaceResult } from "$lib/replace";
  import { findFirstMatch } from "$lib/search";
  import { commentText, offsetFromPoint, offsetsFromRange, rangeFromOffsets } from "$lib/comment-dom";
  import {
    HARPER_DIALECTS,
    ensureHarperLinter,
    extractProofreadText,
    lintPlainText,
    rangeFromSpan,
    type HarperDialect,
    type HarperLint,
    type ProofreadText
  } from "$lib/proofread/harper";
  import {
    buildAnchor,
    commentsForDocument,
    createComment,
    dropOrphanComments,
    locateAnchor,
    normalizeComments,
    removeComment,
    setCommentResolved,
    type CommentAnchor
  } from "$lib/comments";
  import SplitPane from "$lib/SplitPane.svelte";
  import {
    addSplitPane,
    canAddSplitPane,
    docTarget,
    fileTarget,
    moveSplitPane,
    parseSplitTarget,
    openBeside,
    pruneSplitTargets,
    removeSplitPane,
    setSplitTarget,
    tileColumns,
    type SplitGroup,
    type SplitPaneState
  } from "$lib/split";
  import {
    addSnapshot,
    createSnapshot,
    dropOrphanSnapshots,
    normalizeSnapshots,
    removeSnapshot,
    snapshotsForDocument
  } from "$lib/snapshots";
  import { patchTileDocument, type TileDocumentPatch } from "$lib/tile-editing";
  import {
    MAX_MARKDOWN_FILES,
    MAX_MARKDOWN_FILE_BYTES,
    STORAGE_WARN_CHARS,
    buildMarkdownProject,
    estimateStoredChars,
    isImportableMarkdownPath,
    listImportFolders,
    roleOf,
    type ChapterMode,
    type FolderRole,
    type ImportFolder,
    type MarkdownFile
  } from "$lib/import/markdown-folder";
  import PublishView from "$lib/PublishView.svelte";
  import TimelineView from "$lib/TimelineView.svelte";
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
    buildChapterHtml,
    isSceneBreakElement,
    joinChapterMarkdown,
    sceneBreakHtml,
    splitChapterHtml,
    splitChapterMarkdown
  } from "$lib/chapter-sections";
  import { encodeSelection, restoreSelection, type CaretSelection } from "$lib/undo/caret";
  import {
    applyStateStep,
    diffState,
    editKindFromInputType,
    removedIds,
    UNDO_GROUP_MAX_MS,
    UndoManager,
    type EditKind,
    type StateStep,
    type StateTree
  } from "$lib/undo/manager";
  import { countWords, htmlToPlainText } from "$lib/publish/content";
  import {
    createRichPlaceholder,
    MAX_CALC_SOURCE_LENGTH,
    MAX_DIAGRAM_SOURCE_LENGTH,
    MAX_MATH_SOURCE_LENGTH,
    readRichPlaceholder,
    RICH_SELECTOR,
    richKindOf,
    richSourceLimit,
    type RichKind
  } from "$lib/rich/model";
  import {
    editableNeighbor,
    ensureParagraphsAroundRichBlocks,
    renderRichWidgets,
    richClickSide
  } from "$lib/rich/dom";
  import { renderRich } from "$lib/rich/render";
  import {
    chapterLabel as formatChapterLabel,
    isAutomaticallyNumberedChapter as isAutoNumberedChapter
  } from "$lib/publish/chapters";
  import { htmlToMarkdown, markdownToHtml } from "$lib/publish/markdown";
  import {
    defaultPublishOptions,
    normalizePublishOptions,
    SPACE_NAMES,
    type ChapterData,
    type DocumentData,
    type BinderFolder,
    type LabelDef,
    type PublishOptions,
    type ResearchFile,
    type ResearchItem,
    type ResearchLink,
    type SpaceName
  } from "$lib/publish/types";
  import { saveExport } from "$lib/publish/save";
  import type { DragDropEvent } from "@tauri-apps/api/webview";
  import { addLabel, countByLabel, DEFAULT_LABELS, LABEL_COLORS, labelById, projectLabels, removeLabel, setLabel } from "$lib/labels";
  import ShortcutsSheet from "$lib/ShortcutsSheet.svelte";
  import { SHORTCUT_GROUPS, buildShortcutsPdf } from "$lib/shortcuts";
  import { buildEpubProject, parseEpub } from "$lib/import/epub";
  import {
    createResearchFolderName,
    formatResearchFileSize,
    MAX_RESEARCH_FILE_BYTES,
    normalizeResearchFolderName,
    normalizeResearchItems,
    normalizeResearchUrl,
    researchFileNameFromPath,
    researchMimeType,
    researchTitleFromUrl,
    safeResearchFileName
  } from "$lib/research";
  import {
    deleteBrowserResearchFile,
    openBrowserResearchFile,
    readBrowserResearchBlob,
    readBrowserResearchFile,
    saveBrowserResearchFile
  } from "$lib/research-files";
  import { createTimelineNode, normalizeTimelineNodes } from "$lib/timeline";
  import {
    STARTERS,
    STARTER_MODULES,
    addModule,
    allBlueprintKeys,
    buildFromBlueprint,
    filterBlueprint,
    loadCustomStarters,
    moduleFolderKey,
    saveCustomStarters,
    starterBlueprint,
    type BlueprintFolder,
    type CustomStarter,
    type StarterBlueprint,
    type StarterId
  } from "$lib/starters";
  import { migrateLegacyDocument, migrateProjectToWiki } from "$lib/wiki-migration";
  import { createWikiMentionMatcher } from "$lib/wiki-mentions";
  import {
    createBundleText,
    createEncryptedBundleText,
    currentDeviceId,
    flushVaultStorage,
    importBundleText,
    importEncryptedBundleText,
    initVaultStorage,
    isQuotaExceededError,
    loadVault,
    onVaultStorageError,
    readStoredProjectRecords,
    saveVault,
    writeStored
  } from "$lib/storage/repository";
  import { getVaultBackend } from "$lib/storage/vault-store";
  import { readEncryptedBundleHint } from "$lib/storage/encrypted-bundle";
  import {
    clearSyncState,
    loadSyncState,
    saveSyncState,
    type PersistedSyncState,
    type SyncProviderType
  } from "$lib/storage/sync/state";
  import {
    authenticateGoogleDrive,
    cancelGoogleDriveAuthorization,
    completeWebRedirectIfPresent,
    exchangeCodeForToken,
    isTokenExpired,
    refreshAccessToken,
    revokeGoogleDriveAccess,
    type GoogleDriveTokens
  } from "$lib/storage/sync/google-drive-oauth";
  import {
    boardPointAtViewportCenter,
    boardPointFromClient,
    clampBoardZoom,
    drawingBoundsFromPoints,
    moveStoryboardDrawing,
    normalizeStoryboardDrawings,
    positionStoryboardCards,
    resizeStoryboardDrawing,
    type BoardPoint
  } from "$lib/storyboard-layout";
  import type { SyncMode, SyncProvider, SyncStamp } from "$lib/storage/sync/types";
  import type {
    ActivityRecord,
    DocumentSnapshot,
    ProjectData,
    StoryboardCard,
    StoryboardDrawing,
    StoryboardKind,
    StoryboardRow,
    TextComment,
    TimelineNode
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
  const timelineStorageKey = "prosecraft-timeline-enabled";
  const typewriterStorageKey = "prosecraft-typewriter-mode";
  const fadeParagraphsStorageKey = "prosecraft-fade-other-paragraphs";
  const zenModeStorageKey = "prosecraft-zen-mode";
  const modifierName = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "Cmd" : "Ctrl";
  const harperEnabledStorageKey = "prosecraft-harper-enabled";
  const harperDialectStorageKey = "prosecraft-harper-dialect";
  const researchRootStorageKey = "prosecraft-research-root";
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
  const WIKI_PAGE_TITLE = "Untitled page";

  type BoardDragSource = {
    pointerId: number;
    kind: StoryboardKind | "board-card";
    sourceId: string;
    offsetX: number;
    offsetY: number;
  };
  type BoardPanDrag = {
    pointerId: number | "touch";
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originZoom: number;
    startDistance?: number;
    anchor?: BoardPoint;
  };
  type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  };
  type RowMenuTarget = { kind: "chapter" | "scene"; id: string };
  type LabelMenuTarget = { kind: "chapter" | "scene"; id: string };
  type StoryboardDrawingTool = "select" | "pan" | "line" | "arrow" | "box" | "text";
  type StoryboardDrawingInteraction = {
    pointerId: number;
    mode: "create" | "move" | "resize";
    start: BoardPoint;
    original: StoryboardDrawing;
  };
  const storyboardDrawingTools: { tool: StoryboardDrawingTool; label: string; icon: typeof MousePointer2 }[] = [
    { tool: "select", label: "Select", icon: MousePointer2 },
    { tool: "pan", label: "Pan", icon: Hand },
    { tool: "line", label: "Line", icon: Minus },
    { tool: "arrow", label: "Arrow", icon: ArrowRight },
    { tool: "box", label: "Box", icon: Square },
    { tool: "text", label: "Text", icon: Type }
  ];
  type ResearchTreeItem =
    | { kind: "folder"; folder: BinderFolder; depth: number }
    | { kind: "document"; document: DocumentData; depth: number }
    | { kind: "file"; item: ResearchFile; depth: number }
    | { kind: "link"; item: ResearchLink; depth: number };
  type WorkspaceView = "outline" | "writing" | "storyboard" | "timeline" | "publish";

  let editor: HTMLDivElement;
  type WikiMention = {
    node: Text;
    from: number;
    to: number;
    article: DocumentData;
  };
  let wikiMentions: WikiMention[] = [];
  let wikiMentionPreview = $state<{
    article: DocumentData;
    excerpt: string;
    left: number;
    top: number;
  } | null>(null);
  const wikiMentionHighlightName = "prosecraft-wiki-mention";
  let settingsDialog: HTMLDialogElement;
  type SettingsCategory = "general" | "writing" | "proofreading" | "data" | "install" | "about";
  const settingsCategoryStorageKey = "prosecraft-settings-category";
  const settingsCategories: { id: SettingsCategory; label: string; icon: typeof Settings }[] = [
    { id: "general", label: "General", icon: SlidersHorizontal },
    { id: "writing", label: "Writing", icon: PenLine },
    { id: "proofreading", label: "Proofreading", icon: SpellCheck },
    { id: "data", label: "Data and sync", icon: Database },
    { id: "install", label: "Updates and install", icon: Download },
    { id: "about", label: "About", icon: Info }
  ];
  let activeSettingsCategory = $state<SettingsCategory>("general");
  let aboutDialog: HTMLDialogElement;
  let aboutDiagnostics = $state("");
  let aboutCopyStatus = $state("");
  let aboutDiagnosticsTextarea = $state<HTMLTextAreaElement>();
  let aboutCopyTimer: ReturnType<typeof setTimeout> | undefined;
  let researchMarkdownDialog: HTMLDialogElement;
  let researchMarkdownTitle = $state("");
  let researchMarkdownHtml = $state("");
  let projectSettingsDialog: HTMLDialogElement;
  let labelsDialog: HTMLDialogElement;
  let labelsDialogTrigger = $state<HTMLButtonElement>();
  let labelDrafts = $state<LabelDef[]>([]);
  let starterDialog: HTMLDialogElement;
  let starterDraft = $state<string>("blank");
  let starterWorking = $state<StarterBlueprint>({ folders: [] });
  let starterSelectedKeys = $state<string[]>([]);
  let starterCustomStarters = $state<CustomStarter[]>([]);
  let starterTemplateName = $state("");
  let starterNotice = $state("");
  let starterSelected = $derived(new Set(starterSelectedKeys));
  let starterIncludedModules = $derived(
    starterWorking.folders.filter((folder) => isStarterModuleFolder(folder) && isStarterFolderIncluded(folder))
  );
  let starterExtraFolders = $derived(starterWorking.folders.filter((folder) => !isStarterModuleFolder(folder)));
  let starterIncludedExtras = $derived(starterExtraFolders.filter((folder) => isStarterFolderIncluded(folder)));
  let chapterNameInput = $state<HTMLInputElement>();
  let dataImportInput = $state<HTMLInputElement>();
  let dataStatus = $state("");
  let epubImportInput = $state<HTMLInputElement>();
  let epubImportBusy = $state(false);
  let markdownFolderInput = $state<HTMLInputElement>();
  let markdownImportDialog: HTMLDialogElement;
  let markdownImportFiles = $state<MarkdownFile[]>([]);
  let markdownImportFolders = $state<ImportFolder[]>([]);
  let markdownImportRoles = $state<Record<string, FolderRole>>({});
  let markdownImportMode = $state<ChapterMode>("folders");
  let markdownImportName = $state("");
  let markdownImportIgnored = $state(0);
  let markdownImportBusy = $state(false);
  // Read when the dialog opens: the storage backend is chosen at startup and does not change reactively.
  let markdownImportOnLocalStorage = $state(false);
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
  let syncProviderType = $state<SyncProviderType>("folder");
  let syncFolder = $state("");
  let syncMode = $state<SyncMode>("encrypted-file");
  let syncPassphrase = $state("");
  let syncBusy = $state(false);
  let syncStatus = $state("");
  let syncProvider: SyncProvider | undefined;
  let syncProviderKey = "";
  let googleDriveAccessToken = $state("");
  let googleDriveRefreshToken = $state("");
  let googleDriveTokenExpiry = $state(0);
  let googleDriveEmail = $state("");
  let googleDriveAuthenticated = $state(false);
  let googleDriveAuthCode = $state("");
  let googleDriveCodeVerifier = $state("");
  let googleDriveAuthUrl = $state("");
  let googleDriveAuthorizing = $state(false);
  let googleDriveConfigured = $derived(Boolean(googleDriveAccessToken || googleDriveRefreshToken));
  let lastEditorWordCount = 0;
  let title = $state("The shape of a first draft");
  let saveState = $state("All changes saved");
  let storageError = $state("");
  let storageUsage = $state<{ usage: number; quota: number } | null>(null);
  let saveSequence = 0;
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
  let timelineEnabled = $state(false);
  let typewriterMode = $state(false);
  let fadeOtherParagraphs = $state(false);
  let zenMode = $state(false);
  let zenInterfaceHidden = $state(false);
  let focusMode = $state(false);
  let focusHintVisible = $state(false);
  let focusHintTimer: ReturnType<typeof setTimeout> | undefined;
  let shortcutsOpen = $state(false);
  let lastShortcutsToggle = 0;
  let harperEnabled = $state(false);
  let harperDialect = $state<HarperDialect>("american");
  let harperLints = $state<HarperLint[]>([]);
  let harperMap = $state<ProofreadText | null>(null);
  let harperChecking = $state(false);
  let harperError = $state("");
  let harperCheckedDocumentId = $state("");
  let harperPopover = $state<{ lint: HarperLint; left: number; top: number } | null>(null);
  let harperIgnored = new Set<string>();
  let harperTimer: ReturnType<typeof setTimeout> | undefined;
  let harperRequest = 0;
  const harperHighlightName = "prosecraft-harper";
  const HARPER_RENDER_LIMIT = 200;
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
  let selectedImageLayout = $state<ImageLayout>({ ...DEFAULT_IMAGE_LAYOUT });
  let customImageWidthEditing = $state(false);
  let customImageWidthDraft = $state<string | null>(null);
  let imageResizeHandle = $state<{ left: number; top: number } | null>(null);
  let imageResizeStart: { x: number; percent: number; columnWidth: number } | null = null;
  let imageFileInput = $state<HTMLInputElement>();
  let imageDropActive = $state(false);
  let imageInsertError = $state("");
  let pendingImageRange: Range | null = null;
  let pendingMarkdownImagePosition: number | null = null;
  type RichDialogKind = "math" | "diagram" | "calc";
  let richDialog: HTMLDialogElement;
  let richDialogOpen = $state(false);
  let richDialogKind = $state<RichDialogKind>("math");
  let richSource = $state("");
  let richDisplay = $state<"inline" | "block">("inline");
  let richPreviewSvg = $state("");
  let richPreviewError = $state("");
  let richPreviewBusy = $state(false);
  let richDialogError = $state("");
  let richEditTarget = $state<HTMLElement | null>(null);
  let savedRichRange: Range | null = null;
  let richPreviewRequest = 0;
  const richDialogNoun = $derived(
    richDialogKind === "diagram" ? "diagram" : richDialogKind === "calc" ? "calculation" : "equation"
  );
  let preferencesSaved = $state(true);
  let projectSettingsSaved = $state(true);
  let projectName = $state("Untitled Project");
  let authorName = $state("");
  let projectNameDraft = $state("Untitled Project");
  let authorNameDraft = $state("");
  let projects = $state<ProjectData[]>([]);
  let liveProjects = $derived(projects.filter((project) => !project.trashed));
  let activeProjectId = $state("");
  let wordCount = $state(0);
  let characterCount = $state(0);
  const initialViewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const initialViewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const initialCoarsePointer = typeof window !== "undefined"
    && window.matchMedia("(pointer: coarse)").matches;
  const initialPhoneLayout = initialViewportWidth <= 760
    || (initialCoarsePointer && initialViewportHeight <= 520);
  let leftSidebarVisible = $state(!initialPhoneLayout);
  let rightSidebarVisible = $state(initialViewportWidth > 1050);
  // Split view borrows the sidebar space and gives it back when it closes.
  // Hover-peek keeps working while hidden.
  function leftSidebarShown(): boolean {
    return leftSidebarVisible && !tilesOpen;
  }
  function rightSidebarShown(): boolean {
    return rightSidebarVisible && !tilesOpen;
  }
  let compactChapterLayout = $state(initialPhoneLayout);
  let compactProgressLayout = $state(initialViewportWidth <= 1050);
  let leftSidebarHovered = $state(false);
  let rightSidebarHovered = $state(false);
  let rightSidebarTab = $state<"progress" | "comments" | "snapshots">("progress");
  // On phones both sidebars are overlay drawers. On tablets the progress
  // sidebar still overlays, but the binder remains part of the layout.
  let mobileDrawerOpen = $derived(
    compactChapterLayout && (leftSidebarShown() || rightSidebarShown())
  );
  let drawerTrigger: HTMLElement | null = null;
  let editingChapterId = $state<string | null>(null);
  let chapterNameDraft = $state("");
  let editingSceneId = $state<string | null>(null);
  let sceneTitleDraft = $state("");
  let sceneNameInput = $state<HTMLInputElement>();
  let researchFolderInput = $state<HTMLInputElement>();
  let editingResearchFolderId = $state<string | null>(null);
  let researchFolderNameDraft = $state("");
  let researchLinkDialog: HTMLDialogElement;
  let researchFileInput = $state<HTMLInputElement>();
  let researchLinkTitle = $state("");
  let researchLinkUrl = $state("");
  let researchLinkDescription = $state("");
  let researchLinkError = $state("");
  let researchLinkFolderId = $state<string | null>(null);
  let researchRoot = $state("");
  let researchFolderName = $state("");
  let researchFolders = $state<BinderFolder[]>([]);
  let researchItems = $state<ResearchItem[]>([]);
  let comments = $state<TextComment[]>([]);
  let commentsDialog: HTMLDialogElement;
  let commentDraft = $state("");
  let commentAuthor = $state("");
  let pendingAnchor = $state<CommentAnchor | null>(null);
  let pendingAnchorScene = $state<string | null>(null);
  let showResolvedComments = $state(false);
  let showAllComments = $state(false);
  let commentPositions = $state<Record<string, number | null>>({});
  let commentSpans: Array<{ comment: TextComment; start: number; end: number }> = [];
  let commentPreview = $state<{ comments: TextComment[]; left: number; top: number } | null>(null);
  let commentPreviewTimer: ReturnType<typeof setTimeout> | undefined;
  let commentSelectionPopover = $state<{ left: number; top: number } | null>(null);
  let commentPopoverSuppressedUntil = 0;
  const commentHighlightName = "prosecraft-comment";
  const commentAuthorStorageKey = "prosecraft-comment-author";
  let projectSearchOpen = $state(false);
  let searchInitialQuery = $state("");
  let splitPanes = $state<SplitPaneState[]>([]);
  let tileGridWidth = $state(0);
  let tileGridElement = $state<HTMLDivElement>();
  let tileGridTop = $state(0);
  let tileGridBottom = $state(0);
  let gridDropActive = $state(false);
  let paneDropActive = $state<string | null>(null);
  let snapshots = $state<DocumentSnapshot[]>([]);
  let snapshotsDialog: HTMLDialogElement;
  let snapshotNote = $state("");
  let snapshotPreviewId = $state<string | null>(null);
  let expandedResearchFolders = $state<Record<string, boolean>>({});
  let researchStatus = $state("");
  let researchSettingsStatus = $state("");
  let researchBusy = $state(false);
  let pendingResearchFolderId = $state<string | null>(null);
  let draggedChapterId = $state<string | null>(null);
  let chapterDragPointerId = $state<number | null>(null);
  let boardDragSource = $state<BoardDragSource | null>(null);
  let boardDropPosition = $state<BoardPoint | null>(null);
  let boardViewport = $state<HTMLDivElement>();
  let boardPan = $state<BoardPoint>({ x: 0, y: 0 });
  let boardZoom = $state(1);
  let boardPanDrag = $state<BoardPanDrag | null>(null);
  let boardTouchPoints = $state<Map<number, BoardPoint>>(new Map());
  let boardSpacePan = $state(false);
  let openRowMenu = $state<RowMenuTarget | null>(null);
  let openLabelMenu = $state<LabelMenuTarget | null>(null);
  let labelMenuTrigger = $state<HTMLButtonElement>();
  type ContextMenuTarget =
    | { kind: "chapter"; id: string }
    | { kind: "scene"; id: string }
    | { kind: "wiki-root" }
    | { kind: "wiki-folder"; id: string }
    | { kind: "wiki-doc"; id: string }
    | { kind: "wiki-file"; id: string }
    | { kind: "wiki-link"; id: string };
  let contextMenu = $state<{ target: ContextMenuTarget; x: number; y: number } | null>(null);
  let contextMenuElement = $state<HTMLDivElement>();
  let contextMenuMoveOpen = $state(false);
  let draggedSceneId = $state<string | null>(null);
  let sceneDropTarget = $state<{ id: string; after: boolean } | null>(null);
  let sceneDropChapterId = $state<string | null>(null);
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressTarget: ContextMenuTarget | null = null;
  let pressX = 0;
  let pressY = 0;
  let installPromptEvent = $state<BeforeInstallPromptEvent | null>(null);
  let installDismissed = $state(false);
  let installedStandalone = $state(false);
  let isIosDevice = $state(false);
  let updateReady = $state(false);
  let updateApplying = $state(false);
  let updateDismissed = $state(false);
  let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  let canInstallApp = $derived(Boolean(installPromptEvent));
  let showInstallBanner = $derived(
    !installedStandalone && !installDismissed
      && (isIosDevice || (canInstallApp && initialCoarsePointer))
  );
  let showUpdateBanner = $derived(updateReady && !updateDismissed);
  let storyboardCards = $state<StoryboardCard[]>([]);
  let storyboardDrawings = $state<StoryboardDrawing[]>([]);
  let activeDrawingTool = $state<StoryboardDrawingTool>("select");
  let defaultStoryboardTextFontSize = $state(14);
  let selectedDrawingId = $state<string | null>(null);
  let editingDrawingId = $state<string | null>(null);
  let drawingInteraction = $state<StoryboardDrawingInteraction | null>(null);
  let storyboardRows = $state<StoryboardRow[]>([]);
  let timelineNodes = $state<TimelineNode[]>([]);
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
  let liveChapters = $derived(chapters.filter((chapter) => !chapter.trashed));
  let projectLabelList = $state<LabelDef[]>(DEFAULT_LABELS.map((label) => ({ ...label })));
  let labelFilter = $state("");
  let filterLabelDef = $derived(labelFilter ? labelById(projectLabelList, labelFilter) : undefined);
  let visibleChapters = $derived.by(() => {
    const label = filterLabelDef;
    if (!label) return liveChapters;
    return liveChapters.filter((chapter) =>
      documents.some((doc) => doc.chapterId === chapter.id && !doc.trashed && doc.labelId === label.id)
    );
  });
  $effect(() => {
    if (labelFilter && !labelById(projectLabelList, labelFilter)) labelFilter = "";
  });
  let peekedChapterId = $state<string | null>(null);
  let lastSceneByChapter = $state<Record<string, string>>({});
  // Chapters stay open only while active in the editor or a split pane. The
  // chevron merely peeks an inactive chapter open until the next doc switch.
  let activeChapterIds = $derived.by(() => {
    const ids = new Set<string>();
    const active = documents.find((doc) => doc.id === activeDocumentId);
    if (active?.chapterId) ids.add(active.chapterId);
    for (const pane of splitPanes) {
      const parsed = parseSplitTarget(pane.target);
      if (parsed?.kind !== "doc") continue;
      const doc = documents.find((entry) => entry.id === parsed.id);
      if (doc?.chapterId) ids.add(doc.chapterId);
    }
    return ids;
  });
  $effect(() => {
    void activeDocumentId;
    peekedChapterId = null;
  });
  $effect(() => {
    const doc = documents.find((entry) => entry.id === activeDocumentId);
    if (doc?.chapterId) lastSceneByChapter[doc.chapterId] = doc.id;
  });
  function isChapterOpen(id: string) {
    return activeChapterIds.has(id) || peekedChapterId === id;
  }

  function peekChapter(id: string) {
    if (activeChapterIds.has(id)) return;
    peekedChapterId = peekedChapterId === id ? null : id;
  }
  /** Clicking a chapter goes there: opens its last active scene. */
  function openChapter(id: string) {
    const visible = documents.filter((doc) => doc.chapterId === id && !doc.trashed
      && (!filterLabelDef || doc.labelId === filterLabelDef.id));
    const remembered = lastSceneByChapter[id];
    const target = remembered && visible.some((doc) => doc.id === remembered)
      ? remembered
      : visible[0]?.id;
    if (!target) {
      peekChapter(id);
      return;
    }
    if (target === activeDocumentId) scrollToScene(target);
    else openSidebarDocument(target);
  }
  let trashCount = $derived(
    documents.filter((doc) => doc.trashed
      && !chapters.some((chapter) => chapter.id === doc.chapterId && chapter.trashed)).length
      + chapters.filter((chapter) => chapter.trashed).length
      + projects.filter((project) => project.trashed).length
  );
  let expandedSpaces = $state<Record<SpaceName | "Trash", boolean>>({
    Wiki: true,
    Trash: true
  });
  let activeDocumentId = $state("welcome");
  let activeDocument = $derived(documents.find((doc) => doc.id === activeDocumentId));
  $effect(() => {
    refreshWikiMentionHighlights(documents, activeDocumentId);
  });
  // Chapter mode: the editor shows every scene of the active chapter as one
  // scrollable document. Scene documents stay separate in storage.
  let activeChapter = $derived(activeDocument?.chapterId
    ? chapters.find((chapter) => chapter.id === activeDocument.chapterId)
    : undefined);
  let inChapterMode = $derived(!!activeChapter);
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
  type UndoGroupKind = "type" | "delete" | "newline";
  type UndoGroup = { kind: UndoGroupKind; start: number };

  function startsUndoGroup(group: UndoGroup | null, kind: UndoGroupKind, time: number) {
    return !group || kind === "newline" || kind !== group.kind || time - group.start >= UNDO_GROUP_MAX_MS;
  }

  function markdownUndoGroupKind(tr: Transaction): UndoGroupKind | null {
    if (!tr.docChanged || tr.isUserEvent("input.type.compose")) return null;
    if (!tr.isUserEvent("input.type") && !tr.isUserEvent("delete")) return null;
    let inserted = "";
    tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, text) => { inserted += text.toString(); });
    if (!inserted) return "delete";
    return inserted.includes("\n") ? "newline" : "type";
  }

  const markdownUndoGroup = StateField.define<UndoGroup | null>({
    create: () => null,
    update(group, tr) {
      if (!tr.docChanged) return tr.selection ? null : group;
      const kind = markdownUndoGroupKind(tr);
      if (!kind) return null;
      const time = tr.annotation(Transaction.time) ?? Date.now();
      return startsUndoGroup(group, kind, time) ? { kind, start: time } : group;
    }
  });
  const markdownUndoBoundaries = EditorState.transactionExtender.of((tr) => {
    const kind = markdownUndoGroupKind(tr as Transaction);
    if (!kind) return null;
    const time = tr.annotation(Transaction.time) ?? Date.now();
    return startsUndoGroup(tr.startState.field(markdownUndoGroup), kind, time)
      ? { annotations: isolateHistory.of("before") }
      : null;
  });
  const markdownHistoryExtension = history({ newGroupDelay: UNDO_GROUP_MAX_MS, minDepth: 1000 });
  const markdownHistory = new Compartment();
  const markdownStates = new Map<string, EditorState>();
  let markdownStateKey = "";
  let loadingMarkdownDocument = false;

  function markdownUndoKey() {
    return `markdown:${markdownStateKey}`;
  }

  /** CodeMirror state follows the chapter in chapter mode, like undo does. */
  function markdownDocKey() {
    const scope = inChapterMode && activeChapter ? `chapter:${activeChapter.id}` : activeDocumentId;
    return `${activeProjectId}/${scope}`;
  }

  function trackMarkdownHistory(update: ViewUpdate) {
    if (loadingMarkdownDocument) return;
    const page = currentUndoPage();
    if (update.transactions.some((tr) => tr.isUserEvent("undo"))) {
      undoManager.externalUndone(page, markdownUndoKey());
    } else if (update.transactions.some((tr) => tr.isUserEvent("redo"))) {
      undoManager.externalRedone(page, markdownUndoKey());
    } else if (undoDepth(update.state) !== undoDepth(update.startState)) {
      commitPageState();
      undoManager.recordExternal(page, markdownUndoKey());
    }
  }
  const markdownZenInput = EditorView.domEventHandlers({
    beforeinput(event) {
      const inputEvent = event as InputEvent;
      if (isTypingInputType(inputEvent.inputType)) hideZenInterface();
      return false;
    }
  });
  $effect(() => {
    if (!markdownEditorMode || !markdownEditorHost) return;
    const savedStateKey = untrack(() => markdownDocKey());
    const savedState = markdownStates.get(savedStateKey);
    markdownStateKey = savedStateKey;
    if (!savedState || savedState.doc.toString() !== untrack(() => markdownSource)) {
      undoManager.forgetExternal(untrack(() => currentUndoPage()), markdownUndoKey());
    }
    const view = new EditorView({
      state: savedState && savedState.doc.toString() === untrack(() => markdownSource) ? savedState : EditorState.create({
        doc: untrack(() => markdownSource),
        extensions: [
          markdownUndoGroup,
          markdownUndoBoundaries,
          markdownHistory.of(markdownHistoryExtension),
          keymap.of(historyKeymap),
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
              trackMarkdownHistory(update);
              markdownSource = state.doc.toString();
              handleMarkdownInput();
            }
            if (update.focusChanged && !update.view.hasFocus) showZenInterface();
            // Typewriter mode follows text changes only, not caret moves, so
            // clicks and arrow keys never yank the scroll position.
            if (typewriterMode && update.view.hasFocus && docChanged) {
              scheduleMarkdownTypewriter(update.view);
            }
          })
        ]
      }),
      parent: markdownEditorHost
    });
    markdownCodeEditor = view;
    return () => {
      markdownStates.set(markdownStateKey, view.state);
      view.destroy();
      if (markdownCodeEditor === view) markdownCodeEditor = undefined;
    };
  });
  let researchTreeItems = $derived.by(() => {
    const items: ResearchTreeItem[] = [];
    const researchDocuments = documents.filter((doc) => doc.space === "Wiki" && !doc.trashed);
    const appendLevel = (parentId: string | null, depth: number) => {
      for (const folder of researchFolders.filter((entry) => entry.parentId === parentId)) {
        items.push({ kind: "folder", folder, depth });
        if (expandedResearchFolders[folder.id] === false) continue;
        appendLevel(folder.id, depth + 1);
        items.push(...researchDocuments
          .filter((document) => document.folderId === folder.id)
          .map((document) => ({ kind: "document" as const, document, depth: depth + 1 })));
        items.push(...researchItems
          .filter((item) => item.folderId === folder.id)
          .map((item) => item.kind === "file"
            ? { kind: "file" as const, item, depth: depth + 1 }
            : { kind: "link" as const, item, depth: depth + 1 }));
      }
    };
    appendLevel(null, 0);
    items.push(...researchDocuments
      .filter((document) => !document.folderId)
      .map((document) => ({ kind: "document" as const, document, depth: 0 })));
    items.push(...researchItems
      .filter((item) => !item.folderId)
      .map((item) => item.kind === "file"
        ? { kind: "file" as const, item, depth: 0 }
        : { kind: "link" as const, item, depth: 0 }));
    return items;
  });
  let researchFolderChoices = $derived.by(() => {
    const choices: Array<{ folder: BinderFolder; depth: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const folder of researchFolders.filter((item) => item.parentId === parentId)) {
        choices.push({ folder, depth });
        visit(folder.id, depth + 1);
      }
    };
    visit(null, 0);
    return choices;
  });
  let researchEmpty = $derived(
    researchFolders.length === 0
    && researchItems.length === 0
    && !documents.some((doc) => doc.space === "Wiki" && !doc.trashed)
  );
  let projectWordCount = $derived(documents
    .filter((doc) => doc.chapterId && !doc.trashed)
    .reduce((total, doc) => total + countHtmlWords(doc.content), 0));
  let chapterWordCounts = $derived.by(() => Object.fromEntries(
    liveChapters.map((chapter) => [
      chapter.id,
      documents
        .filter((doc) => doc.chapterId === chapter.id && !doc.space && !doc.trashed)
        .reduce((total, doc) => total + countHtmlWords(doc.content), 0)
    ])
  ));
  let chapterSceneCounts = $derived.by(() => Object.fromEntries(
    liveChapters.map((chapter) => [
      chapter.id,
      documents.filter((doc) => doc.chapterId === chapter.id && !doc.space && !doc.trashed).length
    ])
  ));
  let outlineChapterLabelInfo = $derived.by(() => {
    const info: Record<string, { name: string; color: string }> = {};
    for (const chapter of liveChapters) {
      const label = labelFor(chapter.labelId);
      if (label) info[chapter.id] = { name: label.name, color: labelColorCss(label.color) };
    }
    return info;
  });
  let outlineSceneLabelSummary = $derived.by(() => {
    const summary: Record<string, { id: string; name: string; color: string; count: number }[]> = {};
    for (const chapter of liveChapters) {
      const counts = countByLabel(documents.filter((doc) => doc.chapterId === chapter.id && !doc.space));
      const entries = projectLabelList
        .filter((label) => (counts[label.id] ?? 0) > 0)
        .map((label) => ({
          id: label.id,
          name: label.name,
          color: labelColorCss(label.color),
          count: counts[label.id] ?? 0
        }));
      if (entries.length > 0) summary[chapter.id] = entries;
    }
    return summary;
  });
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
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let publishTimer: ReturnType<typeof setTimeout> | undefined;

  function currentProjectData(): ProjectData {
    return {
      id: activeProjectId,
      name: projectName,
      author: authorName,
      labels: projectLabelList,
      documents,
      chapters,
      activeDocumentId,
      projectGoal,
      chapterGoals,
      activity,
      storyboardCards,
      storyboardRows,
      storyboardDrawings,
      timelineNodes,
      researchFolderName,
      researchFolders,
      researchItems,
      publishOptions,
      comments: dropOrphanComments(comments, new Set(documents.map((doc) => doc.id))),
      snapshots: dropOrphanSnapshots(snapshots, new Set(documents.map((doc) => doc.id)))
    };
  }

  /**
   * `saveVault` feeds the data to IndexedDB, which cannot structured-clone
   * Svelte `$state` proxies. Snapshot the working set so the stored vault is
   * always plain data.
   */
  function saveProjectSnapshot(activeId = activeProjectId) {
    saveVault($state.snapshot(projects), activeId);
  }

  function persistProjectCollection() {
    if (!activeProjectId) return;
    const current = currentProjectData();
    const currentIndex = projects.findIndex((project) => project.id === activeProjectId);
    projects = currentIndex < 0
      ? [...projects, current]
      : projects.map((project) => project.id === activeProjectId ? current : project);
    try {
      saveProjectSnapshot();
      void syncNativeProjectMenu();
      scheduleSaveState();
    } catch (error) {
      handleStorageError(error);
    }
  }

  function handleStorageError(error: unknown) {
    console.error("Could not save changes.", error);
    saveState = "Could not save changes";
    storageError = isQuotaExceededError(error)
      ? "Storage is full. Export a backup now, then remove large images or projects."
      : "Could not save changes to this device. Export a backup to avoid losing work.";
  }

  function scheduleSaveState() {
    const sequence = ++saveSequence;
    saveState = "Saving…";
    void flushVaultStorage()
      .then(() => {
        if (sequence !== saveSequence) return;
        saveState = "All changes saved";
        storageError = "";
        void refreshStorageUsage();
      })
      .catch((error) => {
        if (sequence !== saveSequence) return;
        handleStorageError(error);
      });
  }

  async function refreshStorageUsage() {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate && typeof estimate.usage === "number") {
        storageUsage = { usage: estimate.usage, quota: estimate.quota ?? 0 };
      }
    } catch {
      // Storage estimates are best-effort.
    }
  }

  function formatStorageBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  function storageUsageText(): string {
    if (!storageUsage) return "Storage usage is unavailable.";
    const used = formatStorageBytes(storageUsage.usage);
    if (storageUsage.quota > 0) {
      return `${used} used of ${formatStorageBytes(storageUsage.quota)} available.`;
    }
    return `${used} used.`;
  }

  async function syncNativeProjectMenu() {
    try {
      const { invoke, isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) return;
      await invoke("update_project_menu", {
        projects: liveProjects.map(({ id, name }) => ({ id, name })),
        activeProjectId
      });
    } catch (error) {
      console.error("Could not update the native project menu.", error);
    }
  }

  function loadProject(sourceProject: ProjectData) {
    const project = migrateProjectToWiki(sourceProject);
    activeProjectId = project.id;
    boardPan = { x: 0, y: 0 };
    boardZoom = 1;
    openRowMenu = null;
    projectName = project.name;
    authorName = project.author;
    projectLabelList = projectLabels(project);
    labelFilter = "";
    researchFolders = normalizeBinderFolders(project.researchFolders);
    researchFolderName = normalizeResearchFolderName(project.researchFolderName);
    expandedResearchFolders = {};
    researchStatus = "";
    researchSettingsStatus = "";
    pendingResearchFolderId = null;
    editingResearchFolderId = null;
    researchFolderNameDraft = "";
    const researchFolderIds = new Set(researchFolders.map((folder) => folder.id));
    researchItems = normalizeResearchItems(project.researchItems, researchFolderIds);
    comments = normalizeComments(project.comments);
    snapshots = normalizeSnapshots(project.snapshots);
    snapshotPreviewId = null;
    documents = project.documents.map((doc) => {
      if (doc.space !== "Wiki" || !doc.folderId) return doc;
      if (researchFolderIds.has(doc.folderId)) return doc;
      const { folderId: _folderId, ...withoutFolder } = doc;
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
    timelineNodes = normalizeTimelineNodes(project.timelineNodes);
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
    storyboardCards = positionStoryboardCards(savedCards.map((card) => ({
      ...card,
      rowId: typeof card.rowId === "string" && rowIds.has(card.rowId) ? card.rowId : defaultRowId
    })), storyboardRows);
    storyboardDrawings = normalizeStoryboardDrawings(project.storyboardDrawings);
    selectedDrawingId = null;
    editingDrawingId = null;
    drawingInteraction = null;
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
      if (!renderChapter(active.id)) {
        title = active.title;
        clearRichTextFade();
        setEditorContent(active.content);
        setMarkdownSource(active.markdownSource ?? htmlToMarkdown(active.content));
      }
    } else {
      activeDocumentId = "";
      title = "";
      setEditorContent("<p><br></p>");
      setMarkdownSource("");
    }
    refreshCounts();
    lastEditorWordCount = wordCount;
    refreshPageStateBaseline();
    if (project !== sourceProject) {
      try {
        persistProjectCollection();
      } catch (error) {
        console.error("Could not save the Wiki migration.", error);
      }
    }
  }

  function normalizeBinderFolders(value: unknown): BinderFolder[] {
    if (!Array.isArray(value)) return [];
    const folders: BinderFolder[] = [];
    const seen = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) continue;
      const folder = entry as Partial<BinderFolder>;
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
      let current: BinderFolder | undefined = folder;
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
    const compactChapter = window.innerWidth <= 760
      || (window.matchMedia("(pointer: coarse)").matches && window.innerHeight <= 520);
    if (compactChapter && !compactChapterLayout) {
      leftSidebarVisible = false;
      leftSidebarHovered = false;
      if (workspaceView !== "writing") writingSidebarState.left = false;
    }
    compactChapterLayout = compactChapter;
    const compactProgress = window.innerWidth <= 1050;
    if (compactProgress && !compactProgressLayout) {
      rightSidebarVisible = false;
      rightSidebarHovered = false;
      if (workspaceView !== "writing") writingSidebarState.right = false;
    }
    compactProgressLayout = compactProgress;
    // The storyboard tab hides on phone layouts; never strand the user there.
    if (compactChapter && workspaceView === "storyboard") setWorkspaceView("writing");
  }

  function rememberDrawerTrigger() {
    drawerTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  async function focusDrawer(selector: string) {
    await tick();
    document.querySelector<HTMLElement>(selector)?.focus();
  }

  function closeSidebarDrawers(restoreFocus = true) {
    if (compactChapterLayout) leftSidebarVisible = false;
    if (compactProgressLayout) rightSidebarVisible = false;
    const trigger = drawerTrigger;
    drawerTrigger = null;
    if (restoreFocus && trigger) {
      // Wait for the drawer backdrop/inert state to clear before restoring focus.
      void tick().then(() => trigger.focus());
    }
  }

  function toggleLeftSidebar() {
    if (!compactChapterLayout) {
      leftSidebarVisible = !leftSidebarVisible;
      return;
    }
    if (leftSidebarVisible) {
      closeSidebarDrawers();
      return;
    }
    rememberDrawerTrigger();
    rightSidebarVisible = false;
    leftSidebarVisible = true;
    void focusDrawer(".sidebar-mobile-close");
  }

  function toggleRightSidebar() {
    if (!compactProgressLayout) {
      rightSidebarVisible = !rightSidebarVisible;
      return;
    }
    if (rightSidebarVisible) {
      closeSidebarDrawers();
      return;
    }
    rememberDrawerTrigger();
    if (compactChapterLayout) leftSidebarVisible = false;
    rightSidebarVisible = true;
    void focusDrawer(".progress-close");
  }

  // Keep the page behind an open drawer from scrolling on phones.
  $effect(() => {
    if (typeof document === "undefined" || !mobileDrawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  });

  type EdgeSwipe = { id: number; startX: number; startY: number } | null;
  let edgeSwipe: EdgeSwipe = null;

  /**
   * Touch edge-swipe for the sidebar drawers (hover-peek is mouse-only).
   * A mostly-horizontal swipe from a screen edge opens that side; swiping
   * back toward the edge from inside an open drawer dismisses it.
   */
  function handleEdgeTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      edgeSwipe = null;
      return;
    }
    const touch = event.touches[0];
    const target = touch.target;
    if (target instanceof Element && target.closest(
      ".storyboard-viewport, .ctx-menu, dialog, input, textarea, select, [contenteditable='true']"
    )) {
      edgeSwipe = null;
      return;
    }
    edgeSwipe = { id: touch.identifier, startX: touch.clientX, startY: touch.clientY };
  }

  function handleEdgeTouchEnd(event: TouchEvent) {
    const swipe = edgeSwipe;
    edgeSwipe = null;
    if (!swipe) return;
    const touch = event.changedTouches[0];
    if (!touch || touch.identifier !== swipe.id) return;
    const dx = touch.clientX - swipe.startX;
    const dy = touch.clientY - swipe.startY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
    const width = window.innerWidth;
    if (dx > 0) {
      if (swipe.startX <= 24 && !leftSidebarVisible) toggleLeftSidebar();
      else if (swipe.startX > width - Math.min(360, width * 0.8) && rightSidebarVisible) closeSidebarDrawers();
    } else {
      if (swipe.startX >= width - 24 && !rightSidebarVisible) toggleRightSidebar();
      else if (swipe.startX < Math.min(360, width * 0.8) && leftSidebarVisible) closeSidebarDrawers();
    }
  }

  onMount(() => {
    window.addEventListener("touchstart", handleEdgeTouchStart, { passive: true });
    window.addEventListener("touchend", handleEdgeTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleEdgeTouchStart);
      window.removeEventListener("touchend", handleEdgeTouchEnd);
    };
  });

  function handleSidebarPointerMove(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    // Phones use explicit drawer buttons; edge-hover peeking would fight them.
    // The storyboard owns the whole window, so there is nothing to peek.
    if (compactChapterLayout || workspaceView === "storyboard") {
      leftSidebarHovered = false;
      rightSidebarHovered = false;
      return;
    }

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
      localStorage.setItem(timelineStorageKey, String(timelineEnabled));
      localStorage.setItem(typewriterStorageKey, String(typewriterMode));
      localStorage.setItem(fadeParagraphsStorageKey, String(fadeOtherParagraphs));
      localStorage.setItem(zenModeStorageKey, String(zenMode));
      localStorage.setItem(harperEnabledStorageKey, String(harperEnabled));
      localStorage.setItem(harperDialectStorageKey, harperDialect);
      localStorage.setItem(researchRootStorageKey, researchRoot);
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
      if (rect) centerCaretInViewport(rect, scrollContainerOf(editor));
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
      if (coords) centerCaretInViewport(coords, scrollContainerOf(view.dom));
    });
  }

  function handleRichTextSelectionChange() {
    if (!editor) return;
    if (!editor.contains(document.activeElement)) {
      commentSelectionPopover = null;
      clearRichTextFade();
      return;
    }

    syncAnchorToCaret();
    updateCommentSelectionPopover();
    if (fadeOtherParagraphs) scheduleRichTextFade();
    // Note: typewriter recentering runs on input (typing), not here, so caret
    // moves from clicks or arrow keys never yank the scroll position.
  }

  /**
   * Follows the caret across sections so the sidebar highlight tracks the
   * scene being edited. Anchor-only: never re-renders or saves.
   */
  function syncAnchorToCaret() {
    if (!editor || !inChapterMode || !activeChapter || markdownEditorMode) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    if (!editor.contains(selection.anchorNode)) return;
    const block = editorTopBlock(selection.anchorNode);
    if (!block || isSceneBreakElement(block)) return;
    const doc = scenesInChapter(activeChapter.id)[sectionIndexOf(block)];
    if (doc && doc.id !== activeDocumentId) activeDocumentId = doc.id;
  }

  /** Shows the "Comment" button above a selection, mirroring the comment toolbar button. */
  function updateCommentSelectionPopover() {
    if (!editor || markdownEditorMode || zenInterfaceHidden || !activeDocumentId
      || workspaceView !== "writing" || commentsDialog?.open) {
      commentSelectionPopover = null;
      return;
    }
    if (Date.now() < commentPopoverSuppressedUntil) {
      commentSelectionPopover = null;
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      commentSelectionPopover = null;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      commentSelectionPopover = null;
      return;
    }
    const offsets = offsetsFromRange(editor, range);
    // Whitespace-only selections have no anchor to comment on.
    if (!offsets || !buildAnchor(commentText(editor), offsets.start, offsets.end)) {
      commentSelectionPopover = null;
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      commentSelectionPopover = null;
      return;
    }
    const width = 108;
    const above = rect.top > 52;
    commentSelectionPopover = {
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
      top: Math.max(8, above ? rect.top - 40 : rect.bottom + 10)
    };
  }

  function hideCommentSelectionPopover() {
    commentSelectionPopover = null;
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

  /** The menu accelerator and the key handler can both fire for one key press; the second one is ignored. */
  function toggleShortcuts() {
    const now = Date.now();
    if (now - lastShortcutsToggle < 300) return;
    lastShortcutsToggle = now;
    shortcutsOpen = !shortcutsOpen;
  }

  async function saveShortcutsPdf(isMac: boolean): Promise<{ ok: boolean; message: string } | null> {
    const bytes = await buildShortcutsPdf(SHORTCUT_GROUPS, isMac);
    const result = await saveExport({
      blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      filename: "prosecraft-shortcuts.pdf",
      extension: "pdf",
      formatName: "PDF document"
    });
    if (result.outcome === "cancelled") return null;
    return { ok: true, message: "Saved" };
  }

  function showZenInterface() {
    // Focus mode keeps the interface hidden until it is left explicitly.
    if (focusMode || !zenInterfaceHidden) return;
    zenInterfaceHidden = false;
  }

  /** Hides everything but the text right away; the same shortcut brings it back. */
  function toggleFocusMode() {
    clearTimeout(focusHintTimer);
    if (focusMode) {
      focusMode = false;
      focusHintVisible = false;
      zenInterfaceHidden = false;
      return;
    }
    if (workspaceView !== "writing") return;
    focusMode = true;
    leftSidebarHovered = false;
    rightSidebarHovered = false;
    zenInterfaceHidden = true;
    focusHintVisible = true;
    focusHintTimer = setTimeout(() => { focusHintVisible = false; }, 3000);
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

  function setTimelineEnabled(enabled: boolean) {
    timelineEnabled = enabled;
    if (!enabled && workspaceView === "timeline") setWorkspaceView("writing");
    savePreferences();
  }

  function isSettingsCategory(value: string): value is SettingsCategory {
    return settingsCategories.some((category) => category.id === value);
  }

  function restoreSettingsCategory() {
    try {
      const saved = localStorage.getItem(settingsCategoryStorageKey);
      if (!saved || !isSettingsCategory(saved)) return;
      if (saved === "install" && desktopRuntime) {
        activeSettingsCategory = "general";
        return;
      }
      activeSettingsCategory = saved;
    } catch {
      // Private browsing may block persistence; keep the current category.
    }
  }

  function selectSettingsCategory(category: SettingsCategory) {
    activeSettingsCategory = category;
    try {
      localStorage.setItem(settingsCategoryStorageKey, category);
    } catch {
      // Private browsing may block persistence; the category still changes for this session.
    }
  }

  function handleSettingsCategoryKey(event: KeyboardEvent) {
    const visibleCategories = settingsCategories.filter((category) => category.id !== "install" || !desktopRuntime);
    const currentIndex = visibleCategories.findIndex((category) => category.id === activeSettingsCategory);
    if (currentIndex === -1) return;
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % visibleCategories.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + visibleCategories.length) % visibleCategories.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = visibleCategories.length - 1;
    else return;
    event.preventDefault();
    const next = visibleCategories[nextIndex];
    selectSettingsCategory(next.id);
    document.getElementById(`settings-tab-${next.id}`)?.focus();
  }

  function openSettings() {
    showZenInterface();
    restoreSettingsCategory();
    if (settingsDialog && !settingsDialog.open) settingsDialog.showModal();
    void ensureSystemFonts();
    void refreshStorageUsage();
  }

  /** Dialogs sit in the top layer above the sheet, so the settings close first. */
  function showShortcutsFromSettings() {
    if (settingsDialog?.open) settingsDialog.close();
    shortcutsOpen = true;
  }

  function openAbout() {
    aboutCopyStatus = "";
    aboutDiagnostics = buildDiagnosticsReport({
      version: APP_VERSION,
      userAgent: navigator.userAgent,
      storageBackend: getVaultBackend(),
      online: navigator.onLine,
      counts: {
        projects: liveProjects.length,
        chapters: liveChapters.length,
        scenes: documents.filter((doc) => doc.chapterId && !doc.space && !doc.trashed).length,
        wikiPages: documents.filter((doc) => doc.space === "Wiki" && !doc.trashed).length,
        words: projectWordCount,
        comments: comments.length,
        snapshots: snapshots.length
      },
      features: {
        "zen mode": zenMode,
        "typewriter mode": typewriterMode,
        "fade other paragraphs": fadeOtherParagraphs,
        "markdown editor": markdownEditorEnabled,
        proofreading: harperEnabled
      }
    });
    if (settingsDialog?.open) settingsDialog.close();
    if (aboutDialog && !aboutDialog.open) aboutDialog.showModal();
  }

  async function copyDiagnostics() {
    if (aboutCopyTimer) clearTimeout(aboutCopyTimer);
    try {
      await navigator.clipboard.writeText(aboutDiagnostics);
      aboutCopyStatus = "Copied";
    } catch {
      // Clipboard access can be denied; select the report so it can be copied by hand.
      aboutDiagnosticsTextarea?.focus();
      aboutDiagnosticsTextarea?.select();
      aboutCopyStatus = "Select the text and copy it with your keyboard.";
      return;
    }
    aboutCopyTimer = setTimeout(() => {
      aboutCopyStatus = "";
    }, 2000);
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
    const next = liveProjects.find((project) => project.id === id);
    if (!next) return;
    loadProject(next);
    persistProjectCollection();
  }

  function createProject() {
    showZenInterface();
    reloadStarterTemplates();
    selectStarter("blank");
    if (starterDialog && !starterDialog.open) starterDialog.showModal();
  }

  function reloadStarterTemplates() {
    try {
      starterCustomStarters = loadCustomStarters(localStorage);
    } catch {
      starterCustomStarters = [];
    }
  }

  /** Working copy of a preset or of one of the user's own templates, everything included. */
  function selectStarter(selection: string) {
    starterDraft = selection;
    starterNotice = "";
    let blueprint: StarterBlueprint = { folders: [] };
    if (selection.startsWith("custom:")) {
      const template = starterCustomStarters.find((entry) => `custom:${entry.id}` === selection);
      if (template) blueprint = cloneBlueprint(template.blueprint);
    } else if (selection !== "blank") {
      blueprint = starterBlueprint(selection as StarterId);
    }
    starterWorking = blueprint;
    starterSelectedKeys = [...allBlueprintKeys(blueprint)];
  }

  function cloneBlueprint(blueprint: StarterBlueprint): StarterBlueprint {
    return {
      folders: blueprint.folders.map((folder) => ({
        key: folder.key,
        name: folder.name,
        pages: folder.pages.map((page) => ({ key: page.key, title: page.title, html: page.html }))
      }))
    };
  }

  function setStarterKeys(keys: string[], selected: boolean) {
    const next = new Set(starterSelectedKeys);
    for (const key of keys) {
      if (selected) next.add(key);
      else next.delete(key);
    }
    starterSelectedKeys = [...next];
  }

  function starterFolderKeys(folder: BlueprintFolder): string[] {
    return [folder.key, ...folder.pages.map((page) => page.key)];
  }

  function isStarterModuleFolder(folder: BlueprintFolder): boolean {
    return STARTER_MODULES.some((module) => moduleFolderKey(module.id) === folder.key);
  }

  /** A folder counts as included when the folder and all of its pages are selected. */
  function isStarterFolderIncluded(folder: BlueprintFolder): boolean {
    return starterFolderKeys(folder).every((key) => starterSelected.has(key));
  }

  function setStarterFolderIncluded(folder: BlueprintFolder, included: boolean) {
    setStarterKeys(starterFolderKeys(folder), included);
  }

  /** Module toggles include or exclude the folder; excluding keeps it so toggling back restores it. */
  function toggleStarterModule(id: string) {
    const folder = starterWorking.folders.find((entry) => entry.key === moduleFolderKey(id));
    if (!folder) {
      const next = addModule(starterWorking, id);
      const added = next.folders.find((entry) => entry.key === moduleFolderKey(id));
      starterWorking = next;
      if (added) setStarterKeys(starterFolderKeys(added), true);
      return;
    }
    setStarterFolderIncluded(folder, !isStarterFolderIncluded(folder));
  }

  function clearStarterModules() {
    const keys = starterWorking.folders
      .filter((folder) => isStarterModuleFolder(folder))
      .flatMap((folder) => starterFolderKeys(folder));
    setStarterKeys(keys, false);
  }

  function starterSummary(blueprint: StarterBlueprint): string {
    const folders = blueprint.folders.length;
    const pages = blueprint.folders.reduce((count, folder) => count + folder.pages.length, 0);
    return `${folders} ${folders === 1 ? "folder" : "folders"} · ${pages} ${pages === 1 ? "page" : "pages"}`;
  }

  function saveStarterTemplate() {
    const name = starterTemplateName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const next: CustomStarter[] = [
      ...starterCustomStarters,
      { id, name, blueprint: filterBlueprint(starterWorking, starterSelected) }
    ];
    try {
      saveCustomStarters(localStorage, next);
      reloadStarterTemplates();
      starterTemplateName = "";
      starterNotice = starterCustomStarters.some((entry) => entry.id === id)
        ? `Saved as "${name}".`
        : "Could not save the template in this browser.";
    } catch {
      starterNotice = "Could not save the template in this browser.";
    }
  }

  async function deleteStarterTemplate(id: string) {
    const template = starterCustomStarters.find((entry) => entry.id === id);
    if (!template) return;
    if (!(await confirmDestructiveAction(`Delete the template “${template.name}”? Projects created from it keep their pages.`))) return;
    try {
      saveCustomStarters(localStorage, starterCustomStarters.filter((entry) => entry.id !== id));
      reloadStarterTemplates();
    } catch {
      starterNotice = "Could not delete the template in this browser.";
      return;
    }
    if (starterDraft === `custom:${id}`) selectStarter("blank");
  }

  function createProjectFromStarter(event: SubmitEvent) {
    event.preventDefault();
    starterDialog.close();
    createProjectWithStarter(filterBlueprint(starterWorking, starterSelected));
  }

  function createProjectWithStarter(blueprint: StarterBlueprint) {
    showZenInterface();
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const number = liveProjects.length + 1;
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
      timelineNodes: [],
      researchFolderName: "",
      researchFolders: [],
      researchItems: [],
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
    const starterContent = buildFromBlueprint(blueprint, () => crypto.randomUUID());
    next.researchFolders = starterContent.folders;
    next.documents = [...next.documents, ...starterContent.documents];
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

  function exportDocument() {
    const text = (editor?.innerText ?? "").trim();
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
    pageStateDirty = true;
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = setTimeout(() => {
      persistProjectCollection();
    }, 400);
  }

  async function exportDataBundle() {
    try {
      if (saveTimer) clearTimeout(saveTimer);
      persistNow();
      try {
        await flushVaultStorage();
      } catch (error) {
        handleStorageError(error);
      }
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
    if (desktopRuntime) {
      void pickDesktopBackup(false);
      return;
    }
    dataImportInput?.click();
  }

  async function pickDesktopBackup(encrypted: boolean) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: false,
        directory: false,
        title: encrypted ? "Import encrypted backup" : "Import backup",
        filters: [{ name: "ProseCraft backups", extensions: ["prosecraft", "json"] }]
      });
      if (typeof picked !== "string" || !picked) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = await invoke<ArrayBuffer>("read_import_file", { path: picked });
      const text = new TextDecoder().decode(new Uint8Array(bytes));
      if (encrypted) {
        openEncryptedImport(text);
      } else {
        await importBackupText(text);
      }
    } catch (error) {
      console.error("Could not import a backup.", error);
      dataStatus = error instanceof Error ? error.message : "Could not import that backup.";
    }
  }

  function triggerEpubImport() {
    if (epubImportBusy) return;
    if (desktopRuntime) {
      void pickDesktopEpub();
      return;
    }
    epubImportInput?.click();
  }

  async function pickDesktopEpub() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: false,
        directory: false,
        title: "Import EPUB",
        filters: [{ name: "EPUB", extensions: ["epub"] }]
      });
      if (typeof picked !== "string" || !picked) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = await invoke<ArrayBuffer>("read_import_file", { path: picked });
      const name = picked.split(/[\\/]/).pop() || "book.epub";
      await importEpubData(name, new Uint8Array(bytes));
    } catch (error) {
      console.error("Could not open that EPUB.", error);
      dataStatus = error instanceof Error ? error.message : "Could not open that EPUB.";
      openSettings();
    }
  }

  async function handleEpubImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await importEpubData(file.name, new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      dataStatus = error instanceof Error ? error.message : "Could not read that file.";
    }
  }

  async function importEpubData(name: string, data: Uint8Array) {
    if (epubImportBusy) return;
    epubImportBusy = true;
    dataStatus = "Reading EPUB…";
    try {
      const manuscript = await parseEpub(data, {
        fallbackTitle: name,
        onProgress: (message) => {
          dataStatus = message;
        }
      });
      const project = buildEpubProject(manuscript);
      showZenInterface();
      if (saveTimer) clearTimeout(saveTimer);
      persistNow();
      projects = [...projects, project];
      loadProject(project);
      saveProjectSnapshot(project.id);
      await flushVaultStorage();
      void syncNativeProjectMenu();
      const images = manuscript.skippedImages;
      dataStatus = `Imported “${project.name}” — ${project.chapters.length} chapter(s), `
        + `${project.documents.length} scene(s)${images ? `, ${images} image(s) skipped` : ""}.`;
      settingsDialog?.close();
    } catch (error) {
      console.error("Could not import that EPUB.", error);
      dataStatus = error instanceof Error ? error.message : "Could not import that EPUB.";
      openSettings();
    } finally {
      epubImportBusy = false;
    }
  }

  const markdownImportStoredChars = $derived(estimateStoredChars(markdownImportFiles, markdownImportRoles));
  const markdownImportSelectedCount = $derived(
    markdownImportFiles.filter((file) => roleOf(file.path, markdownImportRoles) !== "skip").length
  );

  function triggerMarkdownFolderImport() {
    if (markdownImportBusy) return;
    markdownFolderInput?.click();
  }

  async function handleMarkdownFolder(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = "";
    if (picked.length === 0) return;
    markdownImportBusy = true;
    dataStatus = "Reading folder…";
    try {
      const rootName = (picked[0].webkitRelativePath || picked[0].name).split("/")[0];
      const files: MarkdownFile[] = [];
      let ignored = 0;
      for (const file of picked) {
        const path = (file.webkitRelativePath || file.name).split("/").slice(1).join("/") || file.name;
        if (!isImportableMarkdownPath(path) || file.size > MAX_MARKDOWN_FILE_BYTES) {
          ignored += 1;
          continue;
        }
        if (files.length >= MAX_MARKDOWN_FILES) throw new Error(`That folder has more than ${MAX_MARKDOWN_FILES} Markdown files.`);
        files.push({ path, text: await file.text() });
      }
      if (files.length === 0) {
        dataStatus = "No Markdown files found in that folder.";
        return;
      }
      markdownImportFiles = files;
      markdownImportIgnored = ignored;
      markdownImportName = rootName;
      markdownImportFolders = listImportFolders(files);
      markdownImportRoles = Object.fromEntries(markdownImportFolders.map((folder) => [folder.path, folder.suggested]));
      markdownImportMode = "folders";
      dataStatus = "";
      markdownImportOnLocalStorage = getVaultBackend() === "localstorage";
      markdownImportDialog.showModal();
    } catch (error) {
      console.error("Could not read that folder.", error);
      dataStatus = error instanceof Error ? error.message : "Could not read that folder.";
    } finally {
      markdownImportBusy = false;
    }
  }

  async function importMarkdownFolder(event: SubmitEvent) {
    event.preventDefault();
    if (markdownImportBusy) return;
    markdownImportBusy = true;
    try {
      const { project, report } = buildMarkdownProject(
        markdownImportFiles,
        { roles: markdownImportRoles, chapterMode: markdownImportMode },
        { name: markdownImportName }
      );
      showZenInterface();
      if (saveTimer) clearTimeout(saveTimer);
      persistNow();
      // Save first: if the storage is too small the open project stays as it is.
      const nextProjects = [...projects, project];
      try {
        saveVault(nextProjects, project.id);
        await flushVaultStorage();
      } catch (error) {
        try {
          saveVault(projects, activeProjectId);
          await flushVaultStorage();
        } catch {
          // The previous state could not be rewritten either.
        }
        console.error("Not enough storage for that import.", error);
        throw new Error(isQuotaExceededError(error)
          ? "There is not enough storage for that import. Skip some folders and try again."
          : "Could not save the imported project.");
      }
      projects = nextProjects;
      loadProject(project);
      void syncNativeProjectMenu();
      const links = report.linksUnresolved > 0 ? `, ${report.linksUnresolved} link(s) without a target page` : "";
      dataStatus = `Imported “${project.name}”: ${report.chapters} chapter(s), ${report.scenes} scene(s), `
        + `${report.wikiPages} wiki page(s)${links}.`;
      markdownImportFiles = [];
      markdownImportDialog.close();
      settingsDialog?.close();
    } catch (error) {
      console.error("Could not import that folder.", error);
      dataStatus = error instanceof Error ? error.message : "Could not import that folder.";
    } finally {
      markdownImportBusy = false;
    }
  }

  async function handleImportData(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await importBackupText(await file.text());
    } catch (error) {
      console.error("Could not read a backup.", error);
      dataStatus = "Could not read that backup.";
    }
  }

  async function importBackupText(text: string) {
    try {
      const result = await importBundleText(text);
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
    if (desktopRuntime) {
      void pickDesktopBackup(true);
      return;
    }
    encryptedImportInput?.click();
  }

  async function handleEncryptedImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      openEncryptedImport(await file.text());
    } catch {
      dataStatus = "Could not read that file.";
    }
  }

  function openEncryptedImport(text: string) {
    pendingEncryptedImport = text;
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
        try {
          await flushVaultStorage();
        } catch (error) {
          handleStorageError(error);
        }
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

  function currentSyncState(lastSynced: Record<string, SyncStamp>): PersistedSyncState {
    return {
      provider: syncProviderType,
      folder: syncFolder,
      mode: syncMode,
      googleDriveAccessToken,
      googleDriveRefreshToken,
      googleDriveTokenExpiry,
      googleDriveEmail,
      lastSynced
    };
  }

  /**
   * Writes the active configuration to device storage. Nothing is saved until
   * the selected provider is usable, so switching to Google Drive and closing
   * the settings dialog cannot erase a working folder setup.
   */
  function persistSyncSettings(lastSynced?: Record<string, SyncStamp>): void {
    if (syncProviderType === "folder" && !syncFolder) return;
    if (syncProviderType === "googledrive"
      && !googleDriveAccessToken
      && !googleDriveRefreshToken) return;
    const previous = loadSyncState();
    const sameTarget = previous?.provider === syncProviderType
      && previous.mode === syncMode
      && (syncProviderType === "folder" ? previous.folder === syncFolder : true);
    saveSyncState(currentSyncState(
      lastSynced ?? (sameTarget ? previous.lastSynced : {})
    ));
  }

  /**
   * Returns a usable access token for Drive requests, refreshing it and
   * persisting the new token when the short-lived token has expired.
   */
  async function googleDriveAccessTokenForRequest(): Promise<string> {
    const state = loadSyncState();
    if (!state || state.provider !== "googledrive") {
      throw new Error("Google Drive is not connected.");
    }
    const tokens = {
      accessToken: state.googleDriveAccessToken,
      refreshToken: state.googleDriveRefreshToken,
      expiry: state.googleDriveTokenExpiry,
      email: state.googleDriveEmail
    };
    if (tokens.accessToken && !isTokenExpired(tokens)) return tokens.accessToken;
    if (!tokens.refreshToken) {
      throw new Error("Google Drive session expired. Please reconnect.");
    }

    const result = await refreshAccessToken(tokens.refreshToken);
    if (!result.success || !result.tokens) {
      throw new Error(result.error ?? "Could not refresh the Google Drive session.");
    }

    googleDriveAccessToken = result.tokens.accessToken;
    googleDriveRefreshToken = result.tokens.refreshToken ?? state.googleDriveRefreshToken;
    googleDriveTokenExpiry = result.tokens.expiry;
    googleDriveEmail = result.tokens.email ?? state.googleDriveEmail;
    googleDriveAuthenticated = true;
    saveSyncState({
      ...state,
      googleDriveAccessToken,
      googleDriveRefreshToken,
      googleDriveTokenExpiry,
      googleDriveEmail
    });
    return googleDriveAccessToken;
  }

  async function getSyncProvider(): Promise<SyncProvider> {
    const state = loadSyncState();
    if (!state) throw new Error("Sync is not configured.");
    const cacheKey = `${state.provider}\u0000${state.mode}\u0000${state.provider === "folder" ? state.folder : state.googleDriveEmail}`;
    if (syncProvider && syncProviderKey === cacheKey) return syncProvider;

    if (state.provider === "folder") {
      if (!desktopRuntime) throw new Error("Folder sync is only available on desktop.");
      const [
        { TauriFileSystem },
        { FolderSyncProvider },
        { EncryptedFileSyncProvider },
        { OpenFolderSyncProvider }
      ] = await Promise.all([
        import("$lib/storage/sync/tauri-fs"),
        import("$lib/storage/sync/folder-provider"),
        import("$lib/storage/sync/bundle-provider"),
        import("$lib/storage/sync/open-provider")
      ]);
      const fs = new TauriFileSystem(state.folder);
      syncProvider = state.mode === "encrypted-file"
        ? new EncryptedFileSyncProvider(fs)
        : state.mode === "open-folder"
          ? new OpenFolderSyncProvider(fs)
          : new FolderSyncProvider(fs);
    } else {
      const { createGoogleDriveProvider } = await import("$lib/storage/sync/google-drive-provider");
      syncProvider = createGoogleDriveProvider(
        { getAccessToken: googleDriveAccessTokenForRequest },
        state.mode
      );
    }

    syncProviderKey = cacheKey;
    return syncProvider;
  }

  function syncFolderReadyMessage(): string {
    if (syncMode === "open-folder") return "Folder ready. Choose Sync now.";
    return "Folder ready. Enter your passphrase and choose Sync now.";
  }

  function syncCreatedMessage(count: number): string {
    if (syncMode === "open-folder") {
      return syncProviderType === "googledrive"
        ? `Set up Google Drive as an open folder. ${count} project(s) synced.`
        : `Set up the open folder. ${count} project(s) synced.`;
    }
    if (syncMode === "encrypted-file") {
      return syncProviderType === "googledrive"
        ? `Created an encrypted sync file in Google Drive. ${count} project(s) synced.`
        : `Created an encrypted sync file. ${count} project(s) synced.`;
    }
    return syncProviderType === "googledrive"
      ? `Created an encrypted vault in Google Drive. ${count} project(s) synced.`
      : `Created an encrypted vault in this folder. ${count} project(s) synced.`;
  }

  function googleDriveReadyMessage(): string {
    return syncMode === "open-folder"
      ? "Connected to Google Drive. Choose Sync now."
      : "Connected to Google Drive. Enter your passphrase and choose Sync now.";
  }

  function setSyncMode(next: SyncMode) {
    if (syncBusy || next === syncMode) return;
    syncMode = next;
    syncProvider = undefined;
    syncProviderKey = "";
    syncPassphrase = "";
    persistSyncSettings({});
    if (syncProviderType === "folder" && syncFolder) {
      syncStatus = "Sync method changed. Use a folder already set up for this method, or an empty folder.";
    } else if (syncProviderType === "googledrive" && googleDriveConfigured) {
      syncStatus = "Sync method changed. Use a Google Drive setup already created for this method, or start fresh.";
    } else {
      syncStatus = "";
    }
  }

  async function chooseSyncFolder() {
    if (syncBusy) return;
    syncStatus = "";
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false, title: "Choose a sync folder" });
      if (typeof picked !== "string" || !picked) return;
      const previous = loadSyncState();
      const same = previous?.provider === "folder"
        && previous.folder === picked
        && previous.mode === syncMode;
      if (!same) syncPassphrase = "";
      syncFolder = picked;
      syncProviderType = "folder";
      syncProvider = undefined;
      syncProviderKey = "";
      persistSyncSettings(same ? previous.lastSynced : {});
      if (same) {
        syncStatus = syncFolderReadyMessage();
      } else if (syncMode === "open-folder") {
        syncStatus = "Folder saved. The first sync writes plain Markdown and JSON files.";
      } else if (syncMode === "encrypted-file") {
        syncStatus = "Folder saved. The first sync creates one encrypted sync file.";
      } else {
        syncStatus = "Folder saved. The first sync creates an encrypted vault inside it.";
      }
    } catch (error) {
      console.error("Could not choose a sync folder.", error);
      syncStatus = "Could not open the folder picker.";
    }
  }

  function handleSyncProviderChange(provider: SyncProviderType) {
    if (syncBusy || provider === syncProviderType) return;
    const previous = loadSyncState();
    syncProviderType = provider;
    syncProvider = undefined;
    syncProviderKey = "";
    syncPassphrase = "";
    syncStatus = "";
    // Keep the last-synced stamps only when returning to the same provider.
    if (previous?.provider === provider) {
      persistSyncSettings(previous.lastSynced);
    } else {
      persistSyncSettings({});
    }
  }

  function applyGoogleDriveTokens(tokens: GoogleDriveTokens) {
    googleDriveAccessToken = tokens.accessToken;
    googleDriveRefreshToken = tokens.refreshToken ?? "";
    googleDriveTokenExpiry = tokens.expiry;
    googleDriveEmail = tokens.email ?? "";
    googleDriveAuthenticated = true;
    googleDriveAuthCode = "";
    googleDriveCodeVerifier = "";
    googleDriveAuthUrl = "";
    syncProviderType = "googledrive";
    syncProvider = undefined;
    syncProviderKey = "";
    persistSyncSettings({});
  }

  async function connectGoogleDrive() {
    if (syncBusy) return;
    syncStatus = "";
    googleDriveAuthUrl = "";
    syncBusy = true;
    googleDriveAuthorizing = true;
    try {
      const result = await authenticateGoogleDrive((message) => {
        syncStatus = message;
      });
      if (result.success && result.tokens) {
        applyGoogleDriveTokens(result.tokens);
        syncStatus = googleDriveReadyMessage();
      } else if (result.cancelled) {
        googleDriveCodeVerifier = "";
        googleDriveAuthUrl = "";
        syncStatus = "Google Drive authorization cancelled.";
      } else if (result.pending) {
        googleDriveCodeVerifier = "pending";
        googleDriveAuthUrl = result.authorizationUrl ?? "";
        syncStatus = result.error
          ?? "Complete authorization in your browser, then paste the code below.";
      } else {
        googleDriveAuthUrl = "";
        syncStatus = result.error ?? "Could not start Google Drive authorization.";
      }
    } catch (error) {
      console.error("Could not connect to Google Drive.", error);
      syncStatus = "Could not connect to Google Drive.";
    } finally {
      googleDriveAuthorizing = false;
      syncBusy = false;
    }
  }

  async function exchangeAuthCode() {
    if (syncBusy || !googleDriveAuthCode) return;
    syncStatus = "";
    syncBusy = true;
    try {
      const result = await exchangeCodeForToken(googleDriveAuthCode);
      if (result.success && result.tokens) {
        applyGoogleDriveTokens(result.tokens);
        syncStatus = googleDriveReadyMessage();
      } else {
        syncStatus = result.error ?? "Failed to exchange authorization code.";
      }
    } catch (error) {
      console.error("Could not exchange authorization code.", error);
      syncStatus = "Could not exchange authorization code.";
    } finally {
      syncBusy = false;
    }
  }

  function cancelGoogleDriveAuth() {
    cancelGoogleDriveAuthorization();
    googleDriveAuthCode = "";
    googleDriveCodeVerifier = "";
    googleDriveAuthUrl = "";
    if (!googleDriveAuthorizing) syncStatus = "";
  }

  async function disconnectGoogleDrive() {
    if (syncBusy) return;
    syncStatus = "";
    syncBusy = true;
    try {
      const tokens = [googleDriveAccessToken, googleDriveRefreshToken].filter(Boolean);
      for (const token of tokens) {
        await revokeGoogleDriveAccess(token);
      }
      googleDriveAccessToken = "";
      googleDriveRefreshToken = "";
      googleDriveTokenExpiry = 0;
      googleDriveEmail = "";
      googleDriveAuthenticated = false;
      googleDriveAuthCode = "";
      googleDriveCodeVerifier = "";
      googleDriveAuthUrl = "";
      syncPassphrase = "";
      syncProvider = undefined;
      syncProviderKey = "";
      // The saved state belongs to the Google Drive connection, so remove it
      // rather than leaving unusable tokens behind. Projects in Drive are not
      // touched; the user can reconnect at any time.
      clearSyncState();
      syncStatus = "Disconnected from Google Drive. Files in your app data folder were left untouched.";
    } catch (error) {
      console.error("Could not disconnect from Google Drive.", error);
      syncStatus = "Could not disconnect from Google Drive.";
    } finally {
      syncBusy = false;
    }
  }

  function forgetSyncSettings() {
    if (syncBusy) return;
    clearSyncState();
    syncFolder = "";
    googleDriveAccessToken = "";
    googleDriveRefreshToken = "";
    googleDriveTokenExpiry = 0;
    googleDriveEmail = "";
    googleDriveAuthenticated = false;
    googleDriveAuthCode = "";
    googleDriveCodeVerifier = "";
    googleDriveAuthUrl = "";
    syncProvider = undefined;
    syncProviderKey = "";
    syncPassphrase = "";
    syncStatus = syncProviderType === "folder"
      ? "Sync folder forgotten. Files in the folder were left untouched."
      : "Google Drive connection forgotten. Files in your app data folder were left untouched.";
  }

  async function runSync() {
    const configured = syncProviderType === "folder" ? Boolean(syncFolder) : googleDriveConfigured;
    if (!configured || syncBusy) return;
    const encrypted = syncMode !== "open-folder";
    if (encrypted && syncPassphrase.length < 8) {
      syncStatus = "Use a sync passphrase of at least 8 characters.";
      return;
    }
    syncBusy = true;
    syncStatus = "Syncing…";
    try {
      if (saveTimer) clearTimeout(saveTimer);
      persistNow();
      const provider = await getSyncProvider();
      const state = loadSyncState();
      if (!state) throw new Error("Sync configuration not found.");
      const sameTarget = state.provider === syncProviderType
        && state.mode === syncMode
        && (syncProviderType === "folder" ? state.folder === syncFolder : true);
      const lastSynced = sameTarget ? state.lastSynced : {};
      const result = await provider.sync(
        syncPassphrase,
        readStoredProjectRecords(),
        lastSynced,
        Date.now(),
        currentDeviceId()
      );
      saveSyncState(currentSyncState(result.lastSynced));
      const nextActiveId = result.projects.some((project) => project.id === activeProjectId)
        ? activeProjectId
        : (result.projects[0]?.id ?? "");
      writeStored(result.projects, nextActiveId);
      await flushVaultStorage();
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
        ? syncCreatedMessage(result.projects.length)
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
    commitPageState();
    if (focusMode) toggleFocusMode();
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

  function addTimelineNode(): string {
    const node = createTimelineNode();
    timelineNodes = [...timelineNodes, node];
    persist();
    return node.id;
  }

  function updateTimelineNode(id: string, patch: Partial<Omit<TimelineNode, "id">>) {
    timelineNodes = timelineNodes.map((node) => node.id === id ? { ...node, ...patch } : node);
    persist();
  }

  function removeTimelineNode(id: string) {
    timelineNodes = timelineNodes.filter((node) => node.id !== id);
    persist();
  }

  function moveTimelineNode(id: string, offset: number) {
    const index = timelineNodes.findIndex((node) => node.id === id);
    if (index < 0) return;
    const target = Math.max(0, Math.min(index + offset, timelineNodes.length - 1));
    if (target === index) return;
    const next = [...timelineNodes];
    const [node] = next.splice(index, 1);
    next.splice(target, 0, node);
    timelineNodes = next;
    persist();
  }

  function reorderTimelineNodes(orderedIds: string[]) {
    const byId = new Map(timelineNodes.map((node) => [node.id, node]));
    const next = orderedIds.flatMap((id) => {
      const node = byId.get(id);
      return node ? [node] : [];
    });
    if (next.length !== timelineNodes.length) return;
    timelineNodes = next;
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
    setMarkdownSource(inChapterMode ? chapterMarkdownSource() : (active?.markdownSource ?? htmlToMarkdown(editor.innerHTML)));
    selectEditorImage(null);
    clearRichTextFade();
    markdownEditorMode = true;
  }

  /** Writes the chapter markdown source back to scene documents. */
  function applyMarkdownSourceToDocs() {
    const mdSections = splitChapterMarkdown(markdownSource);
    writeChapterSections(mdSections.map((section) => cleanHtml(markdownToHtml(section))), mdSections);
  }

  function switchToRichTextEditor() {
    if (!markdownEditorMode) return;
    if (saveTimer) clearTimeout(saveTimer);
    if (inChapterMode && activeChapter) {
      applyMarkdownSourceToDocs();
      setEditorContent(buildChapterHtml(
        scenesInChapter(activeChapter.id).map((doc) => doc.content),
        publishOptions.sceneSeparator
      ));
    } else {
      const html = cleanHtml(markdownToHtml(markdownSource));
      setEditorContent(html);
      documents = documents.map((doc) => doc.id === activeDocumentId
        ? { ...doc, content: html, markdownSource }
        : doc);
    }
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
    if (inChapterMode) applyMarkdownSourceToDocs();
    else {
      const single = cleanHtml(markdownToHtml(markdownSource));
      documents = documents.map((doc) => doc.id === activeDocumentId
        ? { ...doc, content: single, markdownSource }
        : doc);
    }
    const html = inChapterMode && activeChapter
      ? buildChapterHtml(scenesInChapter(activeChapter.id).map((doc) => doc.content), publishOptions.sceneSeparator)
      : cleanHtml(markdownToHtml(markdownSource));
    const text = htmlToPlainText(html, { rich: "omit" });
    wordCount = countWords(text);
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
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    avif: "image/avif"
  };
  const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif"];
  const IMAGE_ERROR_MESSAGE = "Use a PNG, JPG, WebP, GIF, BMP, or AVIF image.";

  function imageFiles(files: FileList | null | undefined): File[] {
    return Array.from(files ?? []).filter((file) =>
      file.type.startsWith("image/") || /\.(?:png|jpe?g|webp|gif|bmp|tiff?|avif|heic)$/i.test(file.name)
    );
  }

  function isSupportedImage(file: File): boolean {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_MIME_TYPES.includes(file.type)
      || (!file.type || file.type === "application/octet-stream" || file.type === "image/jpg")
        && extension in IMAGE_MIME_BY_EXTENSION;
  }

  function markdownImagePosition(event?: DragEvent | ClipboardEvent | { clientX: number; clientY: number }): number | null {
    const view = markdownCodeEditor;
    if (!view) return null;
    if (event && "clientX" in event) {
      return view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
    }
    return view.state.selection.main.head;
  }

  function editorRangeAtPoint(event?: DragEvent | ClipboardEvent | { clientX: number; clientY: number }): Range | null {
    const selection = window.getSelection();
    if (event && "clientX" in event) {
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
    if (!isSupportedImage(file)) throw new Error(IMAGE_ERROR_MESSAGE);
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

  const IMAGE_SIZE_OPTIONS: { size: Exclude<ImageLayoutSize, "custom">; label: string; ariaLabel: string }[] = [
    { size: "small", label: "Small", ariaLabel: "Small image size" },
    { size: "medium", label: "Medium", ariaLabel: "Medium image size" },
    { size: "large", label: "Large", ariaLabel: "Large image size" },
    { size: "full", label: "Full", ariaLabel: "Full width" }
  ];
  const IMAGE_ALIGN_OPTIONS: { align: ImageLayoutAlign; label: string }[] = [
    { align: "left", label: "Left" },
    { align: "center", label: "Center" },
    { align: "right", label: "Right" }
  ];

  function selectedImageWidthPercent(): number {
    const image = selectedEditorImage;
    if (!image) return MAX_IMAGE_WIDTH;
    const layout = readImageLayout(image);
    if (layout.size === "custom") return layout.width ?? MAX_IMAGE_WIDTH;
    const columnWidth = editor?.clientWidth ?? 0;
    return columnWidth > 0
      ? clampImageWidth(image.getBoundingClientRect().width / columnWidth * 100)
      : MAX_IMAGE_WIDTH;
  }

  function paintCustomImageWidth(image: HTMLImageElement) {
    const layout = readImageLayout(image);
    if (layout.size === "custom") {
      image.style.width = `${layout.width ?? MAX_IMAGE_WIDTH}%`;
    } else {
      image.style.removeProperty("width");
    }
  }

  function paintEditorImageWidths() {
    if (!editor) return;
    for (const image of editor.querySelectorAll<HTMLImageElement>("img")) {
      paintCustomImageWidth(image);
    }
  }

  function applySelectedImageLayout(patch: Partial<ImageLayout>) {
    const image = selectedEditorImage;
    if (!image || !editor.contains(image)) {
      selectEditorImage(null);
      return;
    }
    applyImageLayout(image, { ...readImageLayout(image), ...patch });
    paintCustomImageWidth(image);
    selectedImageLayout = readImageLayout(image);
    void tick().then(positionImageResizeHandle);
    handleInput();
  }

  function setSelectedImageSize(size: Exclude<ImageLayoutSize, "custom">) {
    customImageWidthEditing = false;
    customImageWidthDraft = null;
    applySelectedImageLayout({ size });
  }

  function useCustomImageWidth() {
    customImageWidthEditing = true;
    customImageWidthDraft = null;
    applySelectedImageLayout({ size: "custom", width: selectedImageWidthPercent() });
  }

  function handleImageWidthInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    customImageWidthDraft = input.value;
    const width = Number.parseFloat(input.value);
    if (!Number.isFinite(width)) return;
    applySelectedImageLayout({ size: "custom", width: clampImageWidth(width) });
  }

  function setSelectedImageAlign(align: ImageLayoutAlign) {
    applySelectedImageLayout({ align });
  }

  function setSelectedImageWrap(wrap: ImageLayoutWrap) {
    if (wrap === "block") {
      applySelectedImageLayout({ wrap });
    } else {
      applySelectedImageLayout({ wrap, align: wrap === "wrap-left" ? "left" : "right" });
    }
  }

  function positionImageResizeHandle() {
    const image = selectedEditorImage;
    if (!image || !editorColumn || !editor.contains(image)) {
      imageResizeHandle = null;
      return;
    }
    const column = editorColumn.getBoundingClientRect();
    const rect = image.getBoundingClientRect();
    imageResizeHandle = { left: rect.right - column.left, top: rect.bottom - column.top };
  }

  function startImageResize(event: PointerEvent) {
    const image = selectedEditorImage;
    if (!image || !editor.contains(image) || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    customImageWidthDraft = null;
    imageResizeStart = { x: event.clientX, percent: selectedImageWidthPercent(), columnWidth: editor.clientWidth };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveImageResize(event: PointerEvent) {
    const start = imageResizeStart;
    const image = selectedEditorImage;
    if (!start || !image) return;
    const width = clampImageWidth(start.percent + (event.clientX - start.x) / Math.max(1, start.columnWidth) * 100);
    customImageWidthEditing = true;
    applyImageLayout(image, { ...readImageLayout(image), size: "custom", width });
    paintCustomImageWidth(image);
    selectedImageLayout = readImageLayout(image);
    positionImageResizeHandle();
  }

  function endImageResize(event: PointerEvent) {
    if (!imageResizeStart) return;
    imageResizeStart = null;
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    handleInput();
  }

  function handleImageResizeKeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    customImageWidthEditing = true;
    customImageWidthDraft = null;
    const step = event.key === "ArrowRight" ? 5 : -5;
    applySelectedImageLayout({ size: "custom", width: clampImageWidth(selectedImageWidthPercent() + step) });
  }

  onMount(() => {
    const reposition = () => positionImageResizeHandle();
    paintEditorImageWidths();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  });

  function selectEditorImage(image: HTMLImageElement | null) {
    selectedEditorImage?.classList.remove("selected-writing-image");
    selectedEditorImage = image && editor.contains(image) ? image : null;
    selectedEditorImage?.classList.add("selected-writing-image");
    selectedImageLayout = selectedEditorImage ? readImageLayout(selectedEditorImage) : { ...DEFAULT_IMAGE_LAYOUT };
    customImageWidthEditing = false;
    customImageWidthDraft = null;
    imageResizeStart = null;
    if (selectedEditorImage) paintCustomImageWidth(selectedEditorImage);
    void tick().then(positionImageResizeHandle);
  }

  function handleEditorClick(event: MouseEvent) {
    const target = event.target;
    const divider = target instanceof Element ? target.closest<HTMLElement>(".scene-break") : null;
    if (divider && editor.contains(divider)) {
      event.preventDefault();
      placeCaretAfterDivider(divider);
      return;
    }
    const rich = target instanceof Element
      ? target.closest<HTMLElement>(".math-inline, .math-block, .mermaid-diagram, .calc-worksheet")
      : null;
    if (rich && editor.contains(rich)) {
      event.preventDefault();
      selectEditorImage(null);
      const side = richClickSide(rich, event.clientX, event.clientY);
      if (side !== "content") {
        placeCaretBesideRich(rich, side);
        return;
      }
      const kind = richKindOf(rich);
      openRichDialog(kind === "diagram" || kind === "calc" ? kind : "math", rich);
      return;
    }
    const image = target instanceof Element ? target.closest("img") : null;
    selectEditorImage(image instanceof HTMLImageElement ? image : null);
    // Clicking a proofreading underline opens its suggestions; clicking
    // anywhere else dismisses the popover. Only for collapsed carets so text
    // selection (e.g. for comments) keeps working.
    if (harperEnabled && !markdownEditorMode) {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        openHarperPopover(event.clientX, event.clientY);
      } else {
        hideHarperPopover();
      }
    }
  }

  function placeCaretBesideRich(rich: HTMLElement, side: "before" | "after") {
    const neighbor = editableNeighbor(rich, side);
    const range = document.createRange();
    range.selectNodeContents(neighbor);
    range.collapse(side === "after");
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
  }

  /**
   * Equations, diagrams, and calculations are copied as their source rather
   * than their rendered SVG, so pasting them back re-renders them and pasting
   * into another app gives readable text.
   */
  function handleEditorClipboard(event: ClipboardEvent) {
    if (!event.clipboardData) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const container = document.createElement("div");
    container.append(range.cloneContents());
    if (!container.querySelector(RICH_SELECTOR)) return;
    const html = cleanHtml(container.innerHTML);
    event.preventDefault();
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", htmlToPlainText(html));
    if (event.type === "cut" && !document.execCommand("delete")) {
      range.deleteContents();
      handleInput();
    }
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
    applyImageLayout(image, { ...readImageLayout(image), size: "large" });
    selectedImageLayout = readImageLayout(image);
    paintCustomImageWidth(image);
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
      imageInsertError = IMAGE_ERROR_MESSAGE;
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

  /** file:// entries of a drop; WebKitGTK reports files from a file manager only as a URI list. */
  function droppedFileUris(dataTransfer: DataTransfer | null | undefined): string[] {
    const raw = dataTransfer?.getData("text/uri-list") ?? "";
    return raw.split(/\r?\n/).filter((line) => line.startsWith("file://"));
  }

  function pathFromFileUri(uri: string): string | null {
    try {
      const url = new URL(uri);
      let path = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
      return path;
    } catch {
      return null;
    }
  }

  async function readDroppedImagePaths(uris: string[]): Promise<File[]> {
    return readImagePaths(uris.map(pathFromFileUri).filter((path): path is string => Boolean(path)));
  }

  async function readImagePaths(paths: string[]): Promise<File[]> {
    const { invoke, isTauri } = await import("@tauri-apps/api/core");
    if (!isTauri()) return [];
    const files: File[] = [];
    for (const path of paths) {
      const extension = path.split(".").pop()?.toLowerCase() ?? "";
      if (!(extension in IMAGE_MIME_BY_EXTENSION)) continue;
      const bytes = await invoke<ArrayBuffer>("read_import_file", { path });
      const name = path.split(/[\\/]/).pop() || `image.${extension}`;
      files.push(new File([bytes], name, { type: IMAGE_MIME_BY_EXTENSION[extension] }));
    }
    return files;
  }

  function handleImageDragOver(event: DragEvent) {
    const types = event.dataTransfer?.types;
    if (!types?.includes("Files") && !types?.includes("text/uri-list")) return;
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
    const uris = files.length ? [] : droppedFileUris(event.dataTransfer);
    if (!files.length && !uris.length) return;
    event.preventDefault();
    imageDropActive = false;
    const range = markdownEditorMode ? null : editorRangeAtPoint(event);
    const position = markdownEditorMode ? markdownImagePosition(event) : null;
    if (files.length) {
      void insertImageFiles(files, range, position);
      return;
    }
    readDroppedImagePaths(uris).then((read) => {
      if (read.length) void insertImageFiles(read, range, position);
      else imageInsertError = IMAGE_ERROR_MESSAGE;
    }).catch((error) => {
      console.error("Could not read the dropped file.", error);
      imageInsertError = "Could not read the dropped file.";
    });
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
    if (!view) return;
    markdownStates.set(markdownStateKey, view.state);
    markdownStateKey = markdownDocKey();
    const saved = markdownStates.get(markdownStateKey);
    if (saved && saved.doc.toString() === source) {
      view.setState(saved);
      return;
    }
    // Removing and re-adding the extension clears the undo history, so undo
    // cannot restore text from the previously open document.
    undoManager.forgetExternal(currentUndoPage(), markdownUndoKey());
    loadingMarkdownDocument = true;
    view.dispatch({
      ...(view.state.doc.toString() !== source
        ? { changes: { from: 0, to: view.state.doc.length, insert: source } }
        : {}),
      effects: markdownHistory.reconfigure([])
    });
    view.dispatch({ effects: markdownHistory.reconfigure(markdownHistoryExtension) });
    loadingMarkdownDocument = false;
  }

  function setEditorContent(html: string) {
    if (!editor) return;
    editor.innerHTML = html;
    ensureParagraphsAroundRichBlocks(editor);
    selectEditorImage(null);
    paintEditorImageWidths();
    if (!applyingUndoHistory) undoManager.sync(bodyUndoKey(), cleanHtml(html));
    void renderRichWidgets(editor, { mode: "svg", bodySizePt: 12 });
    refreshWikiMentionHighlights();
    hideHarperPopover();
    scheduleHarperLint();
  }

  function refreshWikiMentionHighlights(
    sourceDocuments: DocumentData[] = documents,
    currentDocumentId: string = activeDocumentId
  ) {
    if (!editor) return;
    const articles = sourceDocuments.filter((doc) =>
      doc.space === "Wiki" && !doc.trashed && doc.id !== currentDocumentId && doc.title.trim()
    );
    const findMentions = createWikiMentionMatcher(articles);
    const matches: WikiMention[] = [];
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        return parent?.closest(
          "a, code, pre, .math-inline, .math-block, .mermaid-diagram, .calc-worksheet, [contenteditable='false']"
        )
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      for (const mention of findMentions(node.data)) {
        matches.push({ node, ...mention });
        const range = document.createRange();
        range.setStart(node, mention.from);
        range.setEnd(node, mention.to);
        ranges.push(range);
      }
    }

    wikiMentions = matches;
    wikiMentionPreview = null;
    const registry = Reflect.get(window.CSS, "highlights") as {
      set: (name: string, highlight: unknown) => void;
      delete: (name: string) => void;
    } | undefined;
    const HighlightConstructor = Reflect.get(window, "Highlight") as
      | (new (...highlightRanges: Range[]) => unknown)
      | undefined;
    registry?.delete(wikiMentionHighlightName);
    if (ranges.length > 0 && registry && HighlightConstructor) {
      registry.set(wikiMentionHighlightName, new HighlightConstructor(...ranges));
    }
  }

  function pointerTextPoint(event: PointerEvent): { node: Node; offset: number } | null {
    const positionFromPoint = Reflect.get(document, "caretPositionFromPoint") as
      | ((x: number, y: number) => { offsetNode: Node; offset: number } | null)
      | undefined;
    const rangeFromPoint = Reflect.get(document, "caretRangeFromPoint") as
      | ((x: number, y: number) => Range | null)
      | undefined;
    const position = positionFromPoint?.call(document, event.clientX, event.clientY);
    const range = position ? null : rangeFromPoint?.call(document, event.clientX, event.clientY);
    const node = position?.offsetNode ?? range?.startContainer;
    const offset = position?.offset ?? range?.startOffset;
    return node && offset !== undefined ? { node, offset } : null;
  }

  function handleEditorPointerMove(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    // Dragging out a selection: the Comment button is the useful UI, not a card.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      wikiMentionPreview = null;
      hideCommentPreviewSoon();
      return;
    }
    const point = pointerTextPoint(event);
    const mention = point?.node instanceof Text
      ? wikiMentions.find((entry) => entry.node === point.node && point.offset >= entry.from && point.offset < entry.to)
      : undefined;

    if (mention) {
      hideCommentPreview();
      const previous = wikiMentionPreview;
      const excerpt = previous?.article.id === mention.article.id
        ? previous.excerpt
        : htmlToPlainText(cleanHtml(mention.article.content), { rich: "omit" })
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 360);
      wikiMentionPreview = {
        article: mention.article,
        excerpt,
        left: Math.max(8, Math.min(event.clientX + 14, window.innerWidth - 350)),
        top: Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 190))
      };
      return;
    }
    wikiMentionPreview = null;

    const offset = point && editor ? offsetFromPoint(editor, point.node, point.offset) : null;
    const matches = offset === null
      ? []
      : commentSpans.filter((span) => offset >= span.start && offset < span.end);
    if (matches.length === 0) {
      hideCommentPreviewSoon();
      return;
    }

    keepCommentPreview();
    commentPreview = {
      comments: matches.slice(0, 3).map((span) => span.comment),
      left: Math.max(8, Math.min(event.clientX + 14, window.innerWidth - 334)),
      top: Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 230))
    };
  }

  function keepCommentPreview() {
    if (commentPreviewTimer) {
      clearTimeout(commentPreviewTimer);
      commentPreviewTimer = undefined;
    }
  }

  /** The card is clickable, so it needs a moment to survive the trip from the text. */
  function hideCommentPreviewSoon() {
    if (!commentPreview) return;
    keepCommentPreview();
    commentPreviewTimer = setTimeout(() => {
      commentPreviewTimer = undefined;
      commentPreview = null;
    }, 160);
  }

  function hideCommentPreview() {
    keepCommentPreview();
    commentPreview = null;
  }

  function goToCommentFromPreview(comment: TextComment) {
    hideCommentPreview();
    // Selecting the passage would immediately offer "Comment" again.
    commentPopoverSuppressedUntil = Date.now() + 600;
    goToComment(comment);
  }

  function captureEditorSelection() {
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      savedRichRange = null;
      return;
    }
    const range = selection.getRangeAt(0);
    savedRichRange = editor.contains(range.commonAncestorContainer)
      ? range.cloneRange()
      : null;
  }

  function openRichDialog(kind: RichDialogKind, target: HTMLElement | null = null) {
    captureEditorSelection();
    richDialogKind = kind;
    richEditTarget = target;
    if (target) {
      const placeholder = readRichPlaceholder(target);
      richSource = placeholder?.source ?? "";
      richDisplay = target.classList.contains("math-block") ? "block" : "inline";
    } else {
      richSource = "";
      richDisplay = "inline";
    }
    richDialogError = "";
    richPreviewError = "";
    richPreviewSvg = "";
    richDialogOpen = true;
    if (richDialog && !richDialog.open) richDialog.showModal();
  }

  function closeRichDialog() {
    richDialogOpen = false;
    if (richDialog?.open) richDialog.close();
    richEditTarget = null;
    richDialogError = "";
    richPreviewSvg = "";
    richPreviewError = "";
  }

  function placeCaretIn(node: Node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRichRange = range.cloneRange();
  }

  function richKindForDialog(kind: RichDialogKind, display: "inline" | "block"): RichKind {
    if (kind !== "math") return kind;
    return display === "block" ? "math-block" : "math-inline";
  }

  function insertRichPlaceholder(kind: RichKind, source: string) {
    if (!editor) return;
    const placeholder = createRichPlaceholder(kind, source, document);
    placeholder.setAttribute("contenteditable", "false");
    editor.focus();

    let range = savedRichRange && editor.contains(savedRichRange.commonAncestorContainer)
      ? savedRichRange
      : null;
    if (!range) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0
        && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        range = selection.getRangeAt(0).cloneRange();
      } else {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }
    }

    if (kind === "math-inline") {
      range.deleteContents();
      range.insertNode(placeholder);
      const space = document.createTextNode(" ");
      placeholder.after(space);
      const after = document.createRange();
      after.setStartAfter(space);
      after.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
      savedRichRange = after.cloneRange();
    } else {
      const start = range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
      const block = start?.closest("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre") ?? null;
      const host = block && block !== editor && editor.contains(block) ? block : null;
      if (host && !host.textContent?.trim()
        && !host.querySelector("img, .math-inline, .math-block, .mermaid-diagram, .calc-worksheet")) {
        host.replaceWith(placeholder);
        const after = document.createElement("p");
        after.append(document.createElement("br"));
        placeholder.after(after);
        placeCaretIn(after);
      } else if (host) {
        const after = document.createElement("p");
        after.append(document.createElement("br"));
        host.after(placeholder);
        placeholder.after(after);
        placeCaretIn(after);
      } else {
        editor.append(placeholder);
        const after = document.createElement("p");
        after.append(document.createElement("br"));
        editor.append(after);
        placeCaretIn(after);
      }
    }

    void renderRichWidgets(editor, { mode: "svg", bodySizePt: 12 });
    handleInput();
  }

  function saveRichDialog() {
    const source = richSource.trim();
    if (!source) {
      richDialogError = richDialogKind === "diagram"
        ? "Add a Mermaid definition first."
        : richDialogKind === "calc"
          ? "Add a calculation first."
          : "Add some LaTeX first.";
      return;
    }
    const kind = richKindForDialog(richDialogKind, richDisplay);
    const sourceLimit = richSourceLimit(kind);
    if (source.length > sourceLimit) {
      richDialogError = `Keep the source to ${sourceLimit.toLocaleString()} characters or fewer.`;
      return;
    }
    richDialogError = "";

    if (richEditTarget) {
      const placeholder = createRichPlaceholder(kind, source, document);
      placeholder.setAttribute("contenteditable", "false");
      richEditTarget.replaceWith(placeholder);
      richEditTarget = null;
      closeRichDialog();
      void renderRichWidgets(editor, { mode: "svg", bodySizePt: 12 });
      handleInput();
      return;
    }

    insertRichPlaceholder(kind, source);
    closeRichDialog();
  }

  function removeRichTarget() {
    const target = richEditTarget;
    if (!target) return;
    target.remove();
    richEditTarget = null;
    if (editor && !editor.textContent?.trim()
      && !editor.querySelector("img, .math-inline, .math-block, .mermaid-diagram, .calc-worksheet")) {
      setEditorContent("<p><br></p>");
    }
    closeRichDialog();
    handleInput();
  }

  $effect(() => {
    const source = richSource.trim();
    const kind = richDialogKind;
    const display = richDisplay;
    if (!richDialogOpen || !source) {
      richPreviewSvg = "";
      richPreviewError = "";
      richPreviewBusy = false;
      return;
    }
    const request = ++richPreviewRequest;
    richPreviewBusy = true;
    const timer = setTimeout(() => {
      renderRich(richKindForDialog(kind, display), source, { mode: "svg", bodySizePt: 12 })
        .then((rendered) => {
          if (request !== richPreviewRequest) return;
          richPreviewSvg = rendered.svg ?? "";
          richPreviewError = "";
        })
        .catch((error) => {
          if (request !== richPreviewRequest) return;
          richPreviewSvg = "";
          richPreviewError = error instanceof Error ? error.message : "Could not render that content.";
        })
        .finally(() => {
          if (request === richPreviewRequest) richPreviewBusy = false;
        });
    }, 220);
    return () => clearTimeout(timer);
  });

  function refreshCounts() {
    const html = cleanHtml(editor?.innerHTML ?? "");
    const text = htmlToPlainText(html, { rich: "omit" });
    wordCount = countWords(text);
    characterCount = text.replace(/\n/g, "").length;
  }

  function countHtmlWords(html: string) {
    return countWords(htmlToPlainText(cleanHtml(html), { rich: "omit" }));
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
    if (inChapterMode && activeChapter) {
      if (markdownEditorMode) {
        const mdSections = splitChapterMarkdown(markdownSource);
        writeChapterSections(mdSections.map((section) => cleanHtml(markdownToHtml(section))), mdSections);
      } else {
        writeChapterSections(splitChapterHtml(cleanHtml(editor.innerHTML)));
      }
      chapters = chapters.map((chapter) => chapter.id === activeChapter.id ? { ...chapter, title } : chapter);
      persistChapters();
    } else {
      const content = markdownEditorMode
        ? cleanHtml(markdownToHtml(markdownSource))
        : cleanHtml(editor.innerHTML);
      documents = documents.map((doc) => doc.id === activeDocumentId
        ? { ...doc, title, content, ...(markdownEditorMode ? { markdownSource } : {}) }
        : doc);
    }
    commitPageState();
    try {
      persistProjectCollection();
      saveState = "All changes saved";
    } catch {
      saveState = "Could not save changes";
    }
  }

  function persist() {
    pageStateDirty = true;
    saveState = "Saving…";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 350);
  }

  const activeComments = $derived.by(() => {
    const pool = showAllComments
      ? comments.filter((comment) => {
        const doc = documents.find((entry) => entry.id === comment.documentId);
        return doc && !doc.trashed;
      })
      : comments.filter((comment) => commentDocs().some((doc) => doc.id === comment.documentId));
    const visible = pool.filter((comment) => showResolvedComments || !comment.resolved);
    if (!showAllComments) {
      return visible.sort((a, b) => (commentPositions[a.id] ?? Infinity) - (commentPositions[b.id] ?? Infinity)
        || a.createdAt - b.createdAt);
    }
    const chapterOrder = new Map(liveChapters.map((chapter, index) => [chapter.id, index]));
    const docOrder = new Map(documents.map((doc, index) => [doc.id, index]));
    const chapterOf = (comment: TextComment) => documents.find((doc) => doc.id === comment.documentId)?.chapterId;
    return visible.sort((a, b) =>
      (chapterOrder.get(chapterOf(a) ?? "") ?? liveChapters.length) - (chapterOrder.get(chapterOf(b) ?? "") ?? liveChapters.length)
      || (docOrder.get(a.documentId) ?? 0) - (docOrder.get(b.documentId) ?? 0)
      || (commentPositions[a.id] ?? Infinity) - (commentPositions[b.id] ?? Infinity)
      || a.createdAt - b.createdAt);
  });

  /** Location label for a comment outside the current chapter. */
  function commentLocation(comment: TextComment): string {
    const doc = documents.find((entry) => entry.id === comment.documentId);
    if (!doc) return "";
    if (doc.space) return doc.space;
    const chapter = doc.chapterId ? chapters.find((entry) => entry.id === doc.chapterId) : undefined;
    const scene = doc.title || "Untitled scene";
    return chapter ? `${chapterLabel(chapter)} · ${scene}` : scene;
  }
  const resolvedCommentCount = $derived(comments
    .filter((comment) => commentDocs().some((doc) => doc.id === comment.documentId))
    .filter((comment) => comment.resolved).length);

  /** Scenes shown in the editor: the whole chapter, or one Wiki document. */
  function commentDocs(): DocumentData[] {
    if (inChapterMode && activeChapter) return scenesInChapter(activeChapter.id);
    const doc = documents.find((entry) => entry.id === activeDocumentId);
    return doc ? [doc] : [];
  }

  /**
   * Cumulative comment-text offsets of each top-level section. Dividers
   * contribute no text, so boundaries align scenes with documents in order.
   */
  function chapterSectionOffsets(): number[] {
    if (!editor) return [];
    const offsets: number[] = [];
    const probe = document.createElement("div");
    let total = 0;
    for (const child of Array.from(editor.childNodes)) {
      if (isSceneBreakElement(child)) continue;
      probe.replaceChildren();
      probe.append(child.cloneNode(true));
      total += commentText(probe).length;
      offsets.push(total);
    }
    return offsets;
  }

  function sceneIdAtOffset(offset: number): string | null {
    const docs = commentDocs();
    if (!inChapterMode) return activeDocumentId || null;
    const boundaries = chapterSectionOffsets();
    for (let index = 0; index < docs.length; index++) {
      if (offset < (boundaries[index] ?? Infinity)) return docs[index].id;
    }
    return docs[docs.length - 1]?.id ?? null;
  }

  // Draws the open comments of the current chapter on top of the text, using
  // the same highlight API as the wiki mentions, so the scene HTML stays untouched.
  function refreshCommentHighlights() {
    const registry = Reflect.get(window.CSS, "highlights") as {
      set: (name: string, highlight: unknown) => void;
      delete: (name: string) => void;
    } | undefined;
    const HighlightConstructor = Reflect.get(window, "Highlight") as
      | (new (...highlightRanges: Range[]) => unknown)
      | undefined;
    registry?.delete(commentHighlightName);
    hideCommentPreview();
    if (!editor || markdownEditorMode || !activeDocumentId) {
      commentPositions = {};
      commentSpans = [];
      return;
    }
    const text = commentText(editor);
    const docs = commentDocs();
    const boundaries = inChapterMode ? chapterSectionOffsets() : [text.length];
    const positions: Record<string, number | null> = {};
    const spans: Array<{ comment: TextComment; start: number; end: number }> = [];
    const ranges: Range[] = [];
    docs.forEach((doc, index) => {
      const base = index === 0 ? 0 : (boundaries[index - 1] ?? text.length);
      const sectionText = text.slice(base, boundaries[index] ?? text.length);
      for (const comment of commentsForDocument(comments, doc.id)) {
        const found = locateAnchor(sectionText, comment);
        const global = found ? { start: found.start + base, end: found.end + base } : null;
        positions[comment.id] = global ? global.start : null;
        if (!global || comment.resolved) continue;
        spans.push({ comment, start: global.start, end: global.end });
        const range = rangeFromOffsets(editor, global.start, global.end);
        if (range) ranges.push(range);
      }
    });
    commentPositions = positions;
    commentSpans = spans;
    if (ranges.length > 0 && registry && HighlightConstructor) {
      registry.set(commentHighlightName, new HighlightConstructor(...ranges));
    }
  }

  $effect(() => {
    void documents;
    void comments;
    void activeDocumentId;
    void markdownEditorMode;
    refreshCommentHighlights();
  });

  // The floating button belongs to the rich writing view only.
  $effect(() => {
    void markdownEditorMode;
    void workspaceView;
    void zenInterfaceHidden;
    commentSelectionPopover = null;
  });

  function setHarperEnabled(enabled: boolean) {
    harperEnabled = enabled;
    savePreferences();
    harperPopover = null;
    if (!enabled) {
      clearHarperHighlights();
    } else {
      scheduleHarperLint();
    }
  }

  function setHarperDialect(value: string) {
    if (value !== "american" && value !== "british" && value !== "australian" && value !== "canadian") return;
    harperDialect = value;
    savePreferences();
    scheduleHarperLint();
  }

  function harperKey(lint: HarperLint, text: string): string {
    return `${lint.kind}:${text.slice(lint.start, lint.end)}`;
  }

  function clearHarperHighlights() {
    if (harperTimer) clearTimeout(harperTimer);
    harperTimer = undefined;
    harperLints = [];
    harperMap = null;
    harperChecking = false;
    harperError = "";
    const registry = Reflect.get(window.CSS, "highlights") as {
      delete: (name: string) => void;
    } | undefined;
    registry?.delete(harperHighlightName);
  }

  function hideHarperPopover() {
    harperPopover = null;
  }

  function scheduleHarperLint() {
    if (harperTimer) clearTimeout(harperTimer);
    harperTimer = undefined;
    if (!harperEnabled) {
      clearHarperHighlights();
      return;
    }
    harperTimer = setTimeout(() => {
      harperTimer = undefined;
      void refreshHarperLints();
    }, 1200);
  }

  async function refreshHarperLints() {
    const request = ++harperRequest;
    if (!harperEnabled || !editor || markdownEditorMode || !activeDocumentId || workspaceView !== "writing") {
      if (request === harperRequest) clearHarperHighlights();
      return;
    }
    const map = extractProofreadText(editor);
    if (request !== harperRequest) return;
    harperMap = map;
    if (!map.text.trim()) {
      harperLints = [];
      harperCheckedDocumentId = activeDocumentId;
      const registry = Reflect.get(window.CSS, "highlights") as {
        delete: (name: string) => void;
      } | undefined;
      registry?.delete(harperHighlightName);
      return;
    }
    harperChecking = true;
    harperError = "";
    try {
      const linter = await ensureHarperLinter(harperDialect);
      if (request !== harperRequest) return;
      const lints = await lintPlainText(linter, map.text);
      if (request !== harperRequest) return;
      harperLints = lints.filter((lint) => !harperIgnored.has(harperKey(lint, map.text)));
      harperCheckedDocumentId = activeDocumentId;
      renderHarperHighlights();
    } catch (error) {
      if (request !== harperRequest) return;
      console.error("Could not check spelling and grammar.", error);
      harperError = "Proofreading is unavailable on this device right now.";
    } finally {
      if (request === harperRequest) harperChecking = false;
    }
  }

  function renderHarperHighlights() {
    const registry = Reflect.get(window.CSS, "highlights") as {
      set: (name: string, highlight: unknown) => void;
      delete: (name: string) => void;
    } | undefined;
    const HighlightConstructor = Reflect.get(window, "Highlight") as
      | (new (...highlightRanges: Range[]) => unknown)
      | undefined;
    registry?.delete(harperHighlightName);
    const map = harperMap;
    if (!map || !editor || markdownEditorMode) return;
    const ranges: Range[] = [];
    for (const lint of harperLints.slice(0, HARPER_RENDER_LIMIT)) {
      const range = rangeFromSpan(map, lint.start, lint.end);
      if (range && editor.contains(range.commonAncestorContainer)) ranges.push(range);
    }
    if (ranges.length > 0 && registry && HighlightConstructor) {
      registry.set(harperHighlightName, new HighlightConstructor(...ranges));
    }
  }

  function harperLintAtPoint(clientX: number, clientY: number): { lint: HarperLint; rect: DOMRect } | null {
    const map = harperMap;
    if (!map || harperLints.length === 0 || !editor) return null;
    const caret = typeof document.caretRangeFromPoint === "function"
      ? document.caretRangeFromPoint(clientX, clientY)
      : null;
    if (!caret || !editor.contains(caret.startContainer)) return null;
    const entry = map.nodes.find((candidate) => candidate.node === caret.startContainer);
    if (!entry) return null;
    const offset = entry.start + Math.min(caret.startOffset, entry.node.data.length);
    const lint = harperLints.find((candidate) => offset >= candidate.start && offset <= candidate.end);
    if (!lint) return null;
    const range = rangeFromSpan(map, lint.start, lint.end);
    const rect = range?.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { lint, rect };
  }

  function positionPopoverForRect(rect: DOMRect): { left: number; top: number } {
    const width = 280;
    const above = rect.top > 190;
    return {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, above ? rect.top - 12 : rect.bottom + 10)
    };
  }

  function openHarperPopover(clientX: number, clientY: number) {
    const found = harperLintAtPoint(clientX, clientY);
    if (!found) {
      harperPopover = null;
      return;
    }
    harperPopover = { lint: found.lint, ...positionPopoverForRect(found.rect) };
  }

  /** Follows the anchor when the editor scrolls (e.g. typewriter recentering)
   * instead of dismissing, so the popover survives caret-driven scrolling. */
  function repositionHarperPopover() {
    const popover = harperPopover;
    if (!popover || !editor) return;
    const map = extractProofreadText(editor);
    const range = rangeFromSpan(map, popover.lint.start, popover.lint.end);
    const rect = range?.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)
      || rect.bottom < 0 || rect.top > window.innerHeight) {
      harperPopover = null;
      return;
    }
    const position = positionPopoverForRect(rect);
    popover.left = position.left;
    popover.top = position.top;
  }

  function applyHarperSuggestion(lint: HarperLint, suggestion: string) {
    // Single-shot: the popover closes on apply and the lint is dropped, so a
    // second click (or a reopen before the re-lint refreshes spans) cannot
    // delete text at stale offsets.
    const popover = harperPopover;
    // Close first so the popover never lingers, even when the range below
    // cannot be built or the replacement throws halfway through.
    harperPopover = null;
    if (!editor || !popover || popover.lint !== lint) return;
    const map = extractProofreadText(editor);
    const range = rangeFromSpan(map, lint.start, lint.end);
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    // Programmatic DOM edits fire no beforeinput, so seed the undo baseline
    // exactly like the beforeinput handler does; handleInput() records it.
    commitPageState();
    const key = bodyUndoKey();
    if (!undoManager.has(key)) undoManager.sync(key, cleanHtml(editor.innerHTML));
    const caret = encodeSelection(editor);
    pendingEdit = {
      kind: "other",
      caretMoved: lastEditCaret?.key !== key || lastEditCaret.caret !== JSON.stringify(caret),
      before: caret
    };
    const selection = window.getSelection();
    range.deleteContents();
    const replacement = document.createTextNode(suggestion);
    range.insertNode(replacement);
    editor.normalize();
    if (selection) {
      selection.removeAllRanges();
      const after = document.createRange();
      after.setStartAfter(replacement);
      after.collapse(true);
      selection.addRange(after);
    }
    harperLints = harperLints.filter((candidate) => candidate !== lint);
    renderHarperHighlights();
    hideHarperPopover();
    handleInput();
  }

  function ignoreHarperLint(lint: HarperLint) {
    const text = harperMap?.text ?? "";
    harperIgnored.add(harperKey(lint, text));
    harperLints = harperLints.filter((candidate) => candidate !== lint);
    renderHarperHighlights();
    hideHarperPopover();
  }

  function readCommentAuthor(): string {
    try {
      return localStorage.getItem(commentAuthorStorageKey) || authorName || "";
    } catch {
      return authorName || "";
    }
  }

  function openComments() {
    if (!activeDocumentId) return;
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    pendingAnchor = null;
    pendingAnchorScene = null;
    if (editor && !markdownEditorMode) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const offsets = offsetsFromRange(editor, selection.getRangeAt(0));
        if (offsets) {
          pendingAnchor = buildAnchor(commentText(editor), offsets.start, offsets.end);
          pendingAnchorScene = sceneIdAtOffset(offsets.start);
        }
      }
    }
    commentDraft = "";
    commentAuthor = readCommentAuthor();
    commentSelectionPopover = null;
    hideCommentPreview();
    commentsDialog.showModal();
  }

  function addComment(event: SubmitEvent) {
    event.preventDefault();
    if (!pendingAnchor || !commentDraft.trim()) return;
    const author = commentAuthor.trim() || "Me";
    try {
      localStorage.setItem(commentAuthorStorageKey, author);
    } catch {
      // The author name just isn't remembered.
    }
    comments = [...comments, createComment({
      id: crypto.randomUUID(),
      documentId: pendingAnchorScene ?? activeDocumentId,
      anchor: pendingAnchor,
      body: commentDraft,
      author,
      now: Date.now()
    })];
    pendingAnchor = null;
    pendingAnchorScene = null;
    commentDraft = "";
    persistNow();
  }

  function goToComment(comment: TextComment) {
    if (!editor || markdownEditorMode) return;
    const sameChapter = inChapterMode && activeChapter
      && documents.find((doc) => doc.id === comment.documentId)?.chapterId === activeChapter.id;
    if (comment.documentId !== activeDocumentId && !sameChapter) {
      const target = documents.find((doc) => doc.id === comment.documentId && !doc.trashed);
      if (!target) return;
      openSidebarDocument(target.id);
      void tick().then(() => goToCommentInEditor(comment));
      return;
    }
    goToCommentInEditor(comment);
  }

  function goToCommentInEditor(comment: TextComment) {
    if (!editor || markdownEditorMode) return;
    const found = locateAnchor(commentText(editor), comment);
    const range = found ? rangeFromOffsets(editor, found.start, found.end) : null;
    if (!range) return;
    if (commentsDialog?.open) commentsDialog.close();
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: "center" });
  }

  function resolveComment(id: string, resolved: boolean) {
    comments = setCommentResolved(comments, id, resolved);
    persistNow();
  }

  function deleteComment(id: string) {
    comments = removeComment(comments, id);
    persistNow();
  }

  /** Scenes a snapshot covers: the whole chapter, or one Wiki document. */
  function snapshotDocs(): DocumentData[] {
    if (inChapterMode && activeChapter) return scenesInChapter(activeChapter.id);
    const doc = documents.find((entry) => entry.id === activeDocumentId);
    return doc ? [doc] : [];
  }

  const activeSnapshots = $derived(snapshotDocs()
    .flatMap((doc) => snapshotsForDocument(snapshots, doc.id))
    .sort((a, b) => b.createdAt - a.createdAt));

  function snapshotSceneTitle(snapshot: DocumentSnapshot): string {
    if (!inChapterMode) return "";
    return documents.find((doc) => doc.id === snapshot.documentId)?.title || "Untitled scene";
  }

  function openSnapshots() {
    if (!activeDocumentId) return;
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    snapshotNote = "";
    snapshotPreviewId = null;
    snapshotsDialog.showModal();
  }

  function takeSnapshot(event: SubmitEvent) {
    event.preventDefault();
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const docs = snapshotDocs();
    if (docs.length === 0) return;
    const now = Date.now();
    for (const current of docs) {
      snapshots = addSnapshot(snapshots, createSnapshot(current, {
        id: crypto.randomUUID(),
        now,
        reason: "manual",
        note: snapshotNote
      }));
    }
    snapshotNote = "";
    persistNow();
  }

  function restoreSnapshot(id: string) {
    const snapshot = snapshots.find((entry) => entry.id === id);
    if (!snapshot) return;
    const inScope = inChapterMode && activeChapter
      ? snapshotDocs().some((doc) => doc.id === snapshot.documentId)
      : snapshot.documentId === activeDocumentId;
    if (!inScope) return;
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const current = documents.find((doc) => doc.id === snapshot.documentId);
    if (!current) return;
    // Keep what is being replaced, so a restore can itself be undone.
    snapshots = addSnapshot(snapshots, createSnapshot(current, {
      id: crypto.randomUUID(),
      now: Date.now(),
      reason: "before-restore"
    }));
    const restored = cleanHtml(snapshot.content);
    documents = documents.map((doc) => {
      if (doc.id !== snapshot.documentId) return doc;
      const { markdownSource: _discarded, ...rest } = doc;
      return { ...rest, content: restored };
    });
    if (inChapterMode && activeChapter) {
      activeDocumentId = snapshot.documentId;
      setEditorContent(buildChapterHtml(
        scenesInChapter(activeChapter.id).map((doc) => doc.content),
        publishOptions.sceneSeparator
      ));
      setMarkdownSource(chapterMarkdownSource());
      scrollToScene(snapshot.documentId);
    } else {
      setEditorContent(restored);
      setMarkdownSource(htmlToMarkdown(restored));
    }
    refreshCounts();
    lastEditorWordCount = wordCount;
    snapshotPreviewId = null;
    persistNow();
    if (snapshotsDialog?.open) snapshotsDialog.close();
  }

  function deleteSnapshot(id: string) {
    snapshots = removeSnapshot(snapshots, id);
    if (snapshotPreviewId === id) snapshotPreviewId = null;
    persistNow();
  }

  function snapshotLabel(snapshot: DocumentSnapshot): string {
    const when = new Date(snapshot.createdAt).toLocaleString();
    return snapshot.reason === "before-restore" ? `${when} (before a restore)` : when;
  }

  function chapterMarkdownSource(): string {
    if (!activeChapter) return "";
    const docs = scenesInChapter(activeChapter.id);
    if (docs.length > 0 && docs.every((doc) => typeof doc.markdownSource === "string")) {
      return joinChapterMarkdown(docs.map((doc) => doc.markdownSource as string));
    }
    return joinChapterMarkdown(docs.map((doc) => htmlToMarkdown(doc.content)));
  }

  /**
   * Writes chapter sections back to scene documents in order. Surplus
   * sections fold into the last scene; scenes left without a section are
   * emptied and moved to Trash; trashed scenes regaining a section are
   * restored (undo of a merge).
   */
  function writeChapterSections(sections: string[], markdownSections?: string[]) {
    const chapterId = activeChapter?.id;
    if (!chapterId) return;
    writeChapterSectionsFor(chapterId, sections, markdownSections);
  }

  function writeChapterSectionsFor(chapterId: string, sections: string[], markdownSections?: string[]) {
    const live = documents.filter((doc) => doc.chapterId === chapterId && !doc.trashed);
    if (live.length === 0) return;
    const trashed = documents.filter((doc) => doc.chapterId === chapterId && doc.trashed);
    const revived: DocumentData[] = [];
    for (let index = live.length; index < sections.length; index++) {
      const donor = trashed.find((doc) => !revived.some((entry) => entry.id === doc.id));
      if (!donor) break;
      revived.push(donor);
    }
    const targets = [...live, ...revived];
    const merged = [...sections];
    const mergedMarkdown = markdownSections ? [...markdownSections] : undefined;
    while (merged.length > targets.length) {
      const extra = merged.pop() as string;
      merged[merged.length - 1] = `${merged[merged.length - 1]}${extra}`;
      if (mergedMarkdown) {
        const extraSource = mergedMarkdown.pop() as string;
        mergedMarkdown[mergedMarkdown.length - 1] = `${mergedMarkdown[mergedMarkdown.length - 1]}\n\n${extraSource}`;
      }
    }
    const updates = new Map<string, { content: string; markdownSource: string | undefined }>();
    targets.forEach((target, index) => {
      // Scenes left without a section are emptied and trashed below.
      if (index >= merged.length) return;
      updates.set(target.id, {
        content: cleanHtml(merged[index]),
        markdownSource: mergedMarkdown ? mergedMarkdown[index] ?? "" : undefined
      });
    });
    documents = documents.map((doc) => {
      if (doc.chapterId !== chapterId) return doc;
      const update = updates.get(doc.id);
      if (update) {
        if (mergedMarkdown) {
          return { ...doc, content: update.content, markdownSource: update.markdownSource, trashed: false };
        }
        if (doc.markdownSource === undefined && !doc.trashed) return { ...doc, content: update.content };
        const { markdownSource: _dropped, ...rest } = doc;
        return { ...rest, content: update.content, trashed: false };
      }
      if (!doc.trashed) {
        const { markdownSource: _dropped, ...rest } = doc;
        return { ...rest, content: "<p><br></p>", trashed: true };
      }
      return doc;
    });
  }

  function scrollToScene(docId: string) {
    const docs = activeChapter ? scenesInChapter(activeChapter.id) : [];
    const index = docs.findIndex((doc) => doc.id === docId);
    void tick().then(() => {
      if (!editor || index < 0) return;
      if (index === 0) {
        editor.firstElementChild?.scrollIntoView({ block: "center" });
        return;
      }
      editor.querySelectorAll(".scene-break")[index - 1]?.scrollIntoView({ block: "center" });
    });
  }

  function editorTopBlock(node: Node | null): HTMLElement | null {
    let current = node instanceof Element ? node : node?.parentElement ?? null;
    while (current && current.parentElement !== editor) current = current.parentElement as HTMLElement | null;
    return current instanceof HTMLElement ? current : null;
  }

  // WebKit (the desktop shell) splits paragraphs into DIVs on Enter while
  // Blink uses Ps, so any empty plain block can start a new scene.
  function isEmptySplittableBlock(element: HTMLElement | null): boolean {
    if (!element) return false;
    if (element.tagName !== "P" && element.tagName !== "DIV") return false;
    if (element.classList.contains("scene-break")) return false;
    if (richKindOf(element)) return false;
    return (element.textContent ?? "").trim() === ""
      && element.querySelector("img, svg, video, audio, canvas") === null;
  }

  function significantSibling(node: Node, direction: "next" | "previous"): Node | null {
    let sibling = direction === "next" ? node.nextSibling : node.previousSibling;
    while (sibling && sibling.nodeType === Node.TEXT_NODE && !(sibling.textContent ?? "").trim()) {
      sibling = direction === "next" ? sibling.nextSibling : sibling.previousSibling;
    }
    return sibling;
  }

  function sectionIndexOf(block: HTMLElement): number {
    let index = 0;
    for (let sibling = block.previousSibling; sibling; sibling = sibling.previousSibling) {
      if (isSceneBreakElement(sibling)) index++;
    }
    return index;
  }

  function caretAtBlockEdge(anchorNode: Node | null, offset: number, block: HTMLElement, edge: "start" | "end"): boolean {
    if (!anchorNode) return false;
    try {
      const range = document.createRange();
      if (edge === "start") {
        range.setStart(block, 0);
        range.setEnd(anchorNode, offset);
      } else {
        range.setStart(anchorNode, offset);
        range.setEnd(block, block.childNodes.length);
      }
      return range.toString() === "";
    } catch {
      return false;
    }
  }

  /**
   * Enter on an empty paragraph starts a new scene: the paragraph becomes a
   * divider and the content after it moves into the new scene. Never leads
   * the chapter with a divider.
   */
  function handleChapterEnter(event: KeyboardEvent): boolean {
    if (!inChapterMode || !activeChapter || !editor || event.isComposing) return false;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false;
    const block = editorTopBlock(selection.anchorNode);
    if (!isEmptySplittableBlock(block)) return false;
    const sectionIndex = sectionIndexOf(block as HTMLElement);
    if (sectionIndex === 0 && !significantSibling(block as HTMLElement, "previous")) return false;
    event.preventDefault();
    const docs = scenesInChapter(activeChapter.id);
    const next: DocumentData = {
      id: crypto.randomUUID(),
      title: "Untitled scene",
      content: "<p><br></p>",
      chapterId: activeChapter.id
    };
    const anchorId = docs[sectionIndex]?.id;
    const at = anchorId ? documents.findIndex((doc) => doc.id === anchorId) + 1 : documents.length;
    documents = [...documents.slice(0, at), next, ...documents.slice(at)];
    activeDocumentId = next.id;
    const dividerTemplate = document.createElement("div");
    dividerTemplate.innerHTML = sceneBreakHtml(publishOptions.sceneSeparator);
    const divider = dividerTemplate.firstElementChild as HTMLElement;
    (block as HTMLElement).replaceWith(divider);
    let target = significantSibling(divider, "next");
    let caretHost: HTMLElement;
    if (target instanceof HTMLElement && !isSceneBreakElement(target)) {
      caretHost = target;
    } else {
      caretHost = document.createElement("p");
      caretHost.append(document.createElement("br"));
      divider.after(caretHost);
    }
    const range = document.createRange();
    range.selectNodeContents(caretHost);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
    refreshCounts();
    persist();
    scheduleHarperLint();
    refreshWikiMentionHighlights();
    return true;
  }

  /**
   * Backspace/Delete against a divider removes it and merges the two scenes;
   * the emptied scene is moved to Trash on save (recoverable).
   */
  function handleChapterBoundaryDelete(event: KeyboardEvent, forward: boolean): boolean {
    if (!inChapterMode || !activeChapter || !editor || event.isComposing) return false;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false;
    const block = editorTopBlock(selection.anchorNode);
    if (!block || isSceneBreakElement(block)) return false;
    const edge = forward ? "end" : "start";
    if (!caretAtBlockEdge(selection.anchorNode, selection.anchorOffset, block, edge)) return false;
    const neighbor = significantSibling(block, forward ? "next" : "previous");
    // Only merge at section edges: the adjacent block must be a divider,
    // otherwise the browser merges paragraphs natively within the section.
    if (!isSceneBreakElement(neighbor)) return false;
    event.preventDefault();
    (neighbor as HTMLElement).remove();
    refreshCounts();
    persist();
    scheduleHarperLint();
    return true;
  }

  /** Clicking a divider drops the caret into the following section. */
  function placeCaretAfterDivider(divider: HTMLElement) {
    if (!editor) return;
    let target = significantSibling(divider, "next");
    if (!(target instanceof HTMLElement) || isSceneBreakElement(target)) {
      const paragraph = document.createElement("p");
      paragraph.append(document.createElement("br"));
      divider.after(paragraph);
      target = paragraph;
    }
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.focus();
  }

  /**
   * Re-renders divider glyphs when the publish separator changes, without
   * touching the caret or rewriting text.
   */
  function refreshDividerGlyphs() {
    if (!editor || !inChapterMode) return;
    const template = document.createElement("div");
    template.innerHTML = sceneBreakHtml(publishOptions.sceneSeparator);
    const fresh = template.firstElementChild as HTMLElement | null;
    if (!fresh) return;
    for (const divider of Array.from(editor.querySelectorAll(".scene-break"))) {
      if (divider.isEqualNode(fresh)) continue;
      divider.className = fresh.className;
      divider.replaceChildren(...Array.from(fresh.childNodes).map((node) => node.cloneNode(true)));
    }
  }

  $effect(() => {
    void publishOptions.sceneSeparator;
    refreshDividerGlyphs();
  });

  /** Renders a whole chapter for the anchor scene. Returns false for Wiki docs. */
  function renderChapter(anchorId: string, focusEditor = false): boolean {
    const anchor = documents.find((doc) => doc.id === anchorId);
    const chapter = anchor?.chapterId ? chapters.find((entry) => entry.id === anchor.chapterId) : undefined;
    if (!chapter) return false;
    activeDocumentId = anchorId;
    title = chapter.title;
    clearRichTextFade();
    setEditorContent(buildChapterHtml(
      scenesInChapter(chapter.id).map((doc) => doc.content),
      publishOptions.sceneSeparator
    ));
    setMarkdownSource(chapterMarkdownSource());
    refreshCounts();
    lastEditorWordCount = wordCount;
    scrollToScene(anchorId);
    if (focusEditor) editor?.focus();
    return true;
  }

  function openDocument(id: string) {
    if (id === activeDocumentId) return;
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const next = documents.find((doc) => doc.id === id && !doc.trashed);
    if (!next) return;
    selectEditorImage(null);
    if (renderChapter(next.id)) return;
    activeDocumentId = next.id;
    title = next.title;
    clearRichTextFade();
    setEditorContent(cleanHtml(next.content));
    setMarkdownSource(next.markdownSource ?? htmlToMarkdown(next.content));
    refreshCounts();
    lastEditorWordCount = wordCount;
  }

  function openSidebarDocument(id: string) {
    openDocument(id);
    closeSidebarDrawers(false);
    setWorkspaceView("writing");
    if (compactChapterLayout) {
      void tick().then(() => editor?.focus());
    }
  }

  /** Opens project search, seeding the query with the current selection when there is one. */
  function openProjectSearch() {
    searchInitialQuery = currentSelectionText().split("\n", 1)[0]?.trim().slice(0, 100) ?? "";
    projectSearchOpen = true;
  }

  function currentSelectionText(): string {
    if (markdownEditorMode && markdownCodeEditor) {
      const range = markdownCodeEditor.state.selection.main;
      if (!range.empty) return markdownCodeEditor.state.sliceDoc(range.from, range.to);
      return "";
    }
    return window.getSelection()?.toString() ?? "";
  }

  function openSearchResult(id: string, reveal?: { query: string; caseSensitive: boolean; wholeWord: boolean }) {
    projectSearchOpen = false;
    openSidebarDocument(id);
    if (!reveal) return;
    void tick().then(() => {
      if (markdownEditorMode) revealMarkdownMatch(reveal);
      else revealEditorMatch(reveal);
    });
  }

  /** Selects the searched passage in the rich editor and scrolls it into view. */
  function revealEditorMatch(reveal: { query: string; caseSensitive: boolean; wholeWord: boolean }) {
    if (!editor) return;
    const match = findFirstMatch(commentText(editor), reveal.query, reveal);
    if (!match) return;
    const range = rangeFromOffsets(editor, match.start, match.end);
    if (!range) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: "center" });
  }

  /** Selects the searched passage in the markdown source editor. */
  function revealMarkdownMatch(reveal: { query: string; caseSensitive: boolean; wholeWord: boolean }) {
    if (!markdownCodeEditor) return;
    const match = findFirstMatch(markdownSource, reveal.query, reveal);
    if (!match) return;
    markdownCodeEditor.dispatch({
      selection: { anchor: match.start, head: match.end },
      scrollIntoView: true
    });
    markdownCodeEditor.focus();
  }

  /** Writes pending editor edits into `documents` so replace counts see them. */
  function flushEditorForReplace(): DocumentData[] {
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    return documents;
  }

  function snapshotBeforeReplace(document: DocumentData) {
    snapshots = addSnapshot(snapshots, createSnapshot(document, {
      id: crypto.randomUUID(),
      now: Date.now(),
      reason: "manual",
      note: "Before replace"
    }));
  }

  function applyProjectReplace(nextDocuments: DocumentData[], changed: ReplaceResult["changed"]) {
    if (saveTimer) clearTimeout(saveTimer);
    documents = nextDocuments;
    const changedIds = new Set(changed.map((entry) => entry.id));
    const touched = inChapterMode && activeChapter
      ? scenesInChapter(activeChapter.id).some((doc) => changedIds.has(doc.id))
      : changedIds.has(activeDocumentId);
    if (touched) {
      // Refresh the open layout like a snapshot restore does, from the new HTML.
      if (inChapterMode && activeChapter) {
        setEditorContent(buildChapterHtml(
          scenesInChapter(activeChapter.id).map((doc) => doc.content),
          publishOptions.sceneSeparator
        ));
        setMarkdownSource(chapterMarkdownSource());
      } else {
        const current = nextDocuments.find((doc) => doc.id === activeDocumentId);
        if (!current) {
          persist();
          return;
        }
        const content = cleanHtml(current.content);
        setEditorContent(content);
        setMarkdownSource(htmlToMarkdown(content));
      }
      refreshCounts();
      lastEditorWordCount = wordCount;
    }
    persist();
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
    renderChapter(next.id, options.focusEditor !== false);
    persist();
    return next;
  }

  function createChapter(options: { focusEditor?: boolean } = {}) {
    const chapterNumber = liveChapters.filter(isAutomaticallyNumberedChapter).length + 1;
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
    if (chapter.trashed && isAutomaticallyNumberedChapter(chapter)) return chapter.title;
    return formatChapterLabel(chapter, liveChapters);
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

  async function startSceneRename(doc: DocumentData) {
    editingSceneId = doc.id;
    sceneTitleDraft = doc.title || "Untitled scene";
    await tick();
    sceneNameInput?.focus();
    sceneNameInput?.select();
  }

  function saveSceneRename(id: string) {
    if (editingSceneId !== id) return;
    const nextTitle = sceneTitleDraft.trim();
    if (nextTitle) {
      documents = documents.map((doc) => doc.id === id ? { ...doc, title: nextTitle } : doc);
      persist();
    }
    editingSceneId = null;
  }

  function cancelSceneRename() {
    editingSceneId = null;
    sceneTitleDraft = "";
  }

  function moveChapter(id: string, offset: number) {
    const live = [...liveChapters];
    const index = live.findIndex((chapter) => chapter.id === id);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= live.length) return;
    const reordered = [...live];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    let nextLiveIndex = 0;
    chapters = chapters.map((chapter) => chapter.trashed ? chapter : reordered[nextLiveIndex++]);
    persistChapters();
  }

  function reorderChapter(sourceId: string, targetId: string, afterTarget: boolean) {
    if (sourceId === targetId) return;
    const reordered = [...liveChapters];
    const sourceIndex = reordered.findIndex((chapter) => chapter.id === sourceId);
    if (sourceIndex < 0 || !reordered.some((chapter) => chapter.id === targetId)) return;
    const [source] = reordered.splice(sourceIndex, 1);
    const targetIndex = reordered.findIndex((chapter) => chapter.id === targetId);
    reordered.splice(targetIndex + (afterTarget ? 1 : 0), 0, source);
    if (reordered.every((chapter, index) => chapter.id === liveChapters[index]?.id)) return;
    let nextLiveIndex = 0;
    chapters = chapters.map((chapter) => chapter.trashed ? chapter : reordered[nextLiveIndex++]);
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
    boardDropPosition = null;
    boardPanDrag = null;
    boardTouchPoints = new Map();
    cancelStoryboardDrawingInteraction();
  }

  function startStoryboardDrag(event: PointerEvent, kind: BoardDragSource["kind"], sourceId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const card = kind === "board-card"
      ? handle.closest<HTMLElement>("[data-board-card-id]")
      : null;
    const rect = card?.getBoundingClientRect();
    boardDragSource = {
      pointerId: event.pointerId,
      kind,
      sourceId,
      offsetX: rect ? (event.clientX - rect.left) / boardZoom : 110,
      offsetY: rect ? (event.clientY - rect.top) / boardZoom : 80
    };
    boardDropPosition = null;
    handle.setPointerCapture(event.pointerId);
  }

  function boardPositionForPointer(event: PointerEvent, drag: BoardDragSource): BoardPoint | null {
    const viewport = boardViewport;
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) {
      return null;
    }
    const point = boardPointFromClient(event.clientX, event.clientY, rect, boardPan, boardZoom);
    return { x: point.x - drag.offsetX, y: point.y - drag.offsetY };
  }

  function updateStoryboardDrag(event: PointerEvent) {
    const drag = boardDragSource;
    if (!drag || drag.pointerId !== event.pointerId) return;
    boardDropPosition = boardPositionForPointer(event, drag);
  }

  function startStoryboardPan(event: PointerEvent) {
    if (event.pointerType === "touch") {
      const points = new Map(boardTouchPoints);
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      boardTouchPoints = points;
      if (points.size >= 2) {
        cancelStoryboardDrawingInteraction();
        const [first, second] = [...points.values()];
        const rect = boardViewport?.getBoundingClientRect();
        const midX = (first.x + second.x) / 2;
        const midY = (first.y + second.y) / 2;
        boardPanDrag = {
          pointerId: "touch",
          startX: midX,
          startY: midY,
          originX: boardPan.x,
          originY: boardPan.y,
          originZoom: boardZoom,
          startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
          anchor: rect
            ? boardPointFromClient(midX, midY, rect, boardPan, boardZoom)
            : undefined
        };
      }
      return;
    }
    if (event.button !== 1
      && !(event.button === 0 && (boardSpacePan || activeDrawingTool === "pan"))) return;
    event.preventDefault();
    boardViewport?.focus({ preventScroll: true });
    boardPanDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: boardPan.x,
      originY: boardPan.y,
      originZoom: boardZoom
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function updateStoryboardPan(event: PointerEvent) {
    if (event.pointerType === "touch" && boardTouchPoints.has(event.pointerId)) {
      const points = new Map(boardTouchPoints);
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      boardTouchPoints = points;
      const drag = boardPanDrag;
      if (drag?.pointerId === "touch" && points.size >= 2) {
        const [first, second] = [...points.values()];
        const rect = boardViewport?.getBoundingClientRect();
        if (drag.anchor && drag.startDistance && rect) {
          // Keep the world point under the pinch midpoint anchored while the
          // fingers move, so zooming does not drift toward the viewport corner.
          const midX = (first.x + second.x) / 2;
          const midY = (first.y + second.y) / 2;
          const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
          const zoom = clampBoardZoom(drag.originZoom * (distance / drag.startDistance));
          boardZoom = zoom;
          boardPan = {
            x: drag.anchor.x - (midX - rect.left) / zoom,
            y: drag.anchor.y - (midY - rect.top) / zoom
          };
        } else {
          boardPan = {
            x: drag.originX - ((first.x + second.x) / 2 - drag.startX) / drag.originZoom,
            y: drag.originY - ((first.y + second.y) / 2 - drag.startY) / drag.originZoom
          };
        }
      }
      return;
    }
    const drag = boardPanDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    boardPan = {
      x: drag.originX - (event.clientX - drag.startX) / drag.originZoom,
      y: drag.originY - (event.clientY - drag.startY) / drag.originZoom
    };
  }

  function finishStoryboardPan(event: PointerEvent) {
    if (boardTouchPoints.has(event.pointerId)) {
      const points = new Map(boardTouchPoints);
      points.delete(event.pointerId);
      boardTouchPoints = points;
      if (boardPanDrag?.pointerId === "touch") {
        if (points.size < 2) {
          boardPanDrag = null;
        } else {
          const [first, second] = [...points.values()];
          const rect = boardViewport?.getBoundingClientRect();
          const midX = (first.x + second.x) / 2;
          const midY = (first.y + second.y) / 2;
          boardPanDrag = {
            pointerId: "touch",
            startX: midX,
            startY: midY,
            originX: boardPan.x,
            originY: boardPan.y,
            originZoom: boardZoom,
            startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
            anchor: rect
              ? boardPointFromClient(midX, midY, rect, boardPan, boardZoom)
              : undefined
          };
        }
      }
    } else if (boardPanDrag?.pointerId === event.pointerId) {
      boardPanDrag = null;
    }
  }

  function resetBoardView() {
    boardPan = { x: 0, y: 0 };
    boardZoom = 1;
  }

  function boardGridStyle(): string {
    const size = 24 * boardZoom;
    const x = 8 * boardZoom - ((boardPan.x * boardZoom) % size);
    const y = 8 * boardZoom - ((boardPan.y * boardZoom) % size);
    return `background-size: ${size}px ${size}px; background-position: ${x}px ${y}px;`;
  }

  function storyboardDrawingPoint(event: PointerEvent): BoardPoint | null {
    if (!boardViewport) return null;
    return boardPointFromClient(
      event.clientX,
      event.clientY,
      boardViewport.getBoundingClientRect(),
      boardPan,
      boardZoom
    );
  }

  function replaceStoryboardDrawing(drawing: StoryboardDrawing) {
    storyboardDrawings = storyboardDrawings.map((item) => item.id === drawing.id ? drawing : item);
  }

  function startStoryboardDrawing(event: PointerEvent) {
    if (event.pointerType === "touch"
      && (activeDrawingTool === "select" || activeDrawingTool === "pan")) return;
    if (event.button !== 0 || boardSpacePan) return;
    const target = event.target;
    if (target instanceof Element
      && (target.closest(".storyboard-card") || target.closest(".storyboard-text-editor"))) return;

    if (activeDrawingTool === "select") {
      if (target === event.currentTarget || target instanceof Element && target.classList.contains("storyboard-pan-surface")) {
        selectedDrawingId = null;
      }
      return;
    }
    const point = storyboardDrawingPoint(event);
    if (!point) return;
    event.preventDefault();

    if (activeDrawingTool === "text") {
      const drawing: StoryboardDrawing = {
        id: crypto.randomUUID(),
        type: "text",
        x: Math.round(point.x),
        y: Math.round(point.y),
        width: 180,
        height: 56,
        text: "",
        fontSize: defaultStoryboardTextFontSize
      };
      storyboardDrawings = [...storyboardDrawings, drawing];
      selectedDrawingId = drawing.id;
      editingDrawingId = drawing.id;
      persist();
      void tick().then(() => document.getElementById(`storyboard-drawing-text-${drawing.id}`)?.focus());
      return;
    }

    const drawing: StoryboardDrawing = activeDrawingTool === "line" || activeDrawingTool === "arrow"
      ? {
          id: crypto.randomUUID(),
          type: activeDrawingTool,
          startX: Math.round(point.x),
          startY: Math.round(point.y),
          endX: Math.round(point.x),
          endY: Math.round(point.y)
        }
      : {
          id: crypto.randomUUID(),
          type: "box",
          ...drawingBoundsFromPoints(point, point)
        };
    storyboardDrawings = [...storyboardDrawings, drawing];
    selectedDrawingId = drawing.id;
    drawingInteraction = { pointerId: event.pointerId, mode: "create", start: point, original: drawing };
    boardViewport?.setPointerCapture(event.pointerId);
  }

  function startStoryboardCanvasInteraction(event: PointerEvent) {
    if (event.pointerType === "touch"
      && (activeDrawingTool === "select" || activeDrawingTool === "pan")) return;
    if (activeDrawingTool === "pan") {
      const target = event.target;
      if (target instanceof Element && target.closest("button, input, textarea, select")) return;
      event.preventDefault();
      event.stopPropagation();
      startStoryboardPan(event);
      return;
    }
    startStoryboardDrawing(event);
  }

  function startStoryboardDrawingMove(event: PointerEvent, drawing: StoryboardDrawing) {
    if (activeDrawingTool !== "select" || event.button !== 0) return;
    const point = storyboardDrawingPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    selectedDrawingId = drawing.id;
    drawingInteraction = { pointerId: event.pointerId, mode: "move", start: point, original: drawing };
    boardViewport?.setPointerCapture(event.pointerId);
  }

  function startStoryboardDrawingResize(event: PointerEvent, drawing: StoryboardDrawing) {
    if (activeDrawingTool !== "select" || event.button !== 0
      || (drawing.type !== "box" && drawing.type !== "text")) return;
    const point = storyboardDrawingPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    selectedDrawingId = drawing.id;
    drawingInteraction = { pointerId: event.pointerId, mode: "resize", start: point, original: drawing };
    boardViewport?.setPointerCapture(event.pointerId);
  }

  function updateStoryboardDrawing(event: PointerEvent) {
    const interaction = drawingInteraction;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const point = storyboardDrawingPoint(event);
    if (!point) return;
    const { original, mode, start } = interaction;
    if (mode === "create") {
      replaceStoryboardDrawing(original.type === "line" || original.type === "arrow"
        ? { ...original, endX: Math.round(point.x), endY: Math.round(point.y) }
        : { ...original, ...drawingBoundsFromPoints(start, point) });
      return;
    }

    const delta = { x: point.x - start.x, y: point.y - start.y };
    if (mode === "move") {
      replaceStoryboardDrawing(moveStoryboardDrawing(original, delta));
      return;
    }
    if (original.type === "box" || original.type === "text") {
      const minWidth = original.type === "text" ? 100 : 24;
      const minHeight = original.type === "text" ? 40 : 24;
      replaceStoryboardDrawing(resizeStoryboardDrawing(original, delta, minWidth, minHeight));
    }
  }

  function cancelStoryboardDrawingInteraction() {
    const interaction = drawingInteraction;
    if (!interaction) return;
    if (interaction.mode === "create") {
      storyboardDrawings = storyboardDrawings.filter((drawing) => drawing.id !== interaction.original.id);
      selectedDrawingId = null;
    } else {
      replaceStoryboardDrawing(interaction.original);
    }
    drawingInteraction = null;
  }

  function finishStoryboardDrawing(event: PointerEvent) {
    const interaction = drawingInteraction;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.mode === "create") {
      const point = storyboardDrawingPoint(event) ?? interaction.start;
      const distance = Math.hypot(point.x - interaction.start.x, point.y - interaction.start.y);
      if (distance < 3) {
        storyboardDrawings = storyboardDrawings.filter((drawing) => drawing.id !== interaction.original.id);
        selectedDrawingId = null;
      } else {
        persist();
      }
    } else {
      persist();
    }
    drawingInteraction = null;
  }

  function nudgeStoryboardDrawing(drawing: StoryboardDrawing, key: string) {
    const distance = 12;
    const delta = key === "ArrowLeft" ? { x: -distance, y: 0 }
      : key === "ArrowRight" ? { x: distance, y: 0 }
        : key === "ArrowUp" ? { x: 0, y: -distance }
          : key === "ArrowDown" ? { x: 0, y: distance }
            : null;
    if (!delta) return;
    replaceStoryboardDrawing(moveStoryboardDrawing(drawing, delta));
    persist();
  }

  function handleStoryboardDrawingKeydown(event: KeyboardEvent, drawing: StoryboardDrawing) {
    selectedDrawingId = drawing.id;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      nudgeStoryboardDrawing(drawing, event.key);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
    }
  }

  function selectedStoryboardTextDrawing(): Extract<StoryboardDrawing, { type: "text" }> | null {
    const drawing = storyboardDrawings.find((item) => item.id === selectedDrawingId);
    return drawing?.type === "text" ? drawing : null;
  }

  function updateStoryboardTextFontSize(value: string) {
    const fontSize = Number(value);
    if (!Number.isFinite(fontSize)) return;
    defaultStoryboardTextFontSize = fontSize;
    const drawing = selectedStoryboardTextDrawing();
    if (!drawing) return;
    replaceStoryboardDrawing({ ...drawing, fontSize });
    persist();
  }

  function updateStoryboardDrawingText(id: string, text: string) {
    const drawing = storyboardDrawings.find((item) => item.id === id);
    if (!drawing || drawing.type !== "text") return;
    replaceStoryboardDrawing({ ...drawing, text });
    persist();
  }

  function finishStoryboardTextEdit(id: string) {
    if (editingDrawingId !== id) return;
    editingDrawingId = null;
    const drawing = storyboardDrawings.find((item) => item.id === id);
    if (drawing?.type === "text" && !drawing.text.trim()) {
      storyboardDrawings = storyboardDrawings.filter((item) => item.id !== id);
      selectedDrawingId = null;
    }
    persist();
  }

  function removeStoryboardDrawing(id: string) {
    storyboardDrawings = storyboardDrawings.filter((drawing) => drawing.id !== id);
    if (selectedDrawingId === id) selectedDrawingId = null;
    if (editingDrawingId === id) editingDrawingId = null;
    persist();
  }

  function createStoryboardCard(
    kind: StoryboardKind,
    sourceId: string
  ): Omit<StoryboardCard, "rowId" | "x" | "y"> | null {
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

  function addStoryboardCard(kind: StoryboardKind, sourceId: string) {
    const card = createStoryboardCard(kind, sourceId);
    if (!card) return;
    const rowId = storyboardRows[0]?.id ?? "";
    const offset = (storyboardCards.length % 8) * 24;
    const position = boardPointAtViewportCenter(
      boardViewport?.clientWidth ?? 700,
      boardViewport?.clientHeight ?? 600,
      boardPan,
      offset,
      boardZoom
    );
    storyboardCards = [...storyboardCards, { ...card, rowId, ...position }];
    persist();
  }

  function finishStoryboardDrag(event: PointerEvent) {
    const drag = boardDragSource;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const position = boardPositionForPointer(event, drag);
    if (position) {
      if (drag.kind === "board-card") {
        storyboardCards = storyboardCards.map((card) =>
          card.id === drag.sourceId ? { ...card, ...position } : card
        );
      } else {
        const card = createStoryboardCard(drag.kind, drag.sourceId);
        if (card) {
          storyboardCards = [
            ...storyboardCards,
            { ...card, rowId: storyboardRows[0]?.id ?? "", ...position }
          ];
        }
      }
      persist();
    }
    boardDragSource = null;
    boardDropPosition = null;
  }

  function finishPointerInteractions(event: PointerEvent) {
    finishChapterDrag(event);
    finishStoryboardDrawing(event);
    finishStoryboardDrag(event);
    finishStoryboardPan(event);
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
    updateStoryboardDrawing(event);
    updateStoryboardDrag(event);
    updateStoryboardPan(event);
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

  function nudgeStoryboardCard(id: string, key: string) {
    const delta = key === "ArrowLeft" ? { x: -24, y: 0 }
      : key === "ArrowRight" ? { x: 24, y: 0 }
        : key === "ArrowUp" ? { x: 0, y: -24 }
          : key === "ArrowDown" ? { x: 0, y: 24 }
            : null;
    if (!delta) return;
    storyboardCards = storyboardCards.map((card) =>
      card.id === id ? { ...card, x: card.x + delta.x, y: card.y + delta.y } : card
    );
    persist();
  }

  function handleStoryboardCardKeydown(event: KeyboardEvent, id: string) {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    nudgeStoryboardCard(id, event.key);
  }

  function handleStoryboardPanKeydown(event: KeyboardEvent) {
    if (workspaceView === "storyboard" && event.code === "Space"
      && event.target === boardViewport) {
      event.preventDefault();
      boardSpacePan = true;
    }
  }

  function handleStoryboardPanKeyup(event: KeyboardEvent) {
    if (event.code === "Space") boardSpacePan = false;
  }

  function persistChapters() {
    pageStateDirty = true;
    try {
      persistProjectCollection();
      saveState = "All changes saved";
    } catch {
      saveState = "Could not save changes";
    }
  }

  function createSpaceDocument(space: SpaceName, folderId?: string) {
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const next: DocumentData = {
      id: crypto.randomUUID(),
      title: WIKI_PAGE_TITLE,
      content: "<p><br></p>",
      space,
      ...(folderId ? { folderId } : {})
    };
    documents = [...documents, next];
    expandedSpaces[space] = true;
    if (folderId) {
      expandResearchFolderPath(folderId);
    }
    activeDocumentId = next.id;
    title = next.title;
    clearRichTextFade();
    setEditorContent(next.content);
    setMarkdownSource("");
    refreshCounts();
    lastEditorWordCount = wordCount;
    persist();
    editor.focus();
  }

  async function createResearchFolder(parentId: string | null = null) {
    const folder: BinderFolder = {
      id: crypto.randomUUID(),
      title: "Untitled folder",
      parentId
    };
    researchFolders = [...researchFolders, folder];
    expandedSpaces.Wiki = true;
    if (parentId) expandResearchFolderPath(parentId);
    expandedResearchFolders = { ...expandedResearchFolders, [folder.id]: true };
    persist();
    await startResearchFolderRename(folder);
  }

  async function startResearchFolderRename(folder: BinderFolder) {
    editingResearchFolderId = folder.id;
    researchFolderNameDraft = folder.title;
    await tick();
    researchFolderInput?.focus();
    researchFolderInput?.select();
  }

  function saveResearchFolderRename(id: string) {
    if (editingResearchFolderId !== id) return;
    const nextTitle = researchFolderNameDraft.trim().slice(0, 60);
    if (nextTitle) {
      researchFolders = researchFolders.map((folder) => folder.id === id ? { ...folder, title: nextTitle } : folder);
      persist();
    }
    editingResearchFolderId = null;
  }

  function cancelResearchFolderRename() {
    editingResearchFolderId = null;
    researchFolderNameDraft = "";
  }

  function toggleResearchFolder(id: string) {
    expandedResearchFolders = {
      ...expandedResearchFolders,
      [id]: expandedResearchFolders[id] === false
    };
  }

  function expandResearchFolderPath(id: string) {
    const expanded = { ...expandedResearchFolders };
    let currentId: string | null | undefined = id;
    while (currentId) {
      expanded[currentId] = true;
      currentId = researchFolders.find((folder) => folder.id === currentId)?.parentId;
    }
    expandedResearchFolders = expanded;
  }

  async function removeResearchFolder(folder: BinderFolder) {
    const parentId = folder.parentId;
    const parentTitle = parentId
      ? researchFolders.find((entry) => entry.id === parentId)?.title ?? "the parent folder"
      : "the Wiki root";
    if (!(await confirmDestructiveAction(`Remove “${folder.title}”? Its folders, pages, files, and links will move to ${parentTitle}.`))) {
      return;
    }
    researchFolders = researchFolders
      .filter((entry) => entry.id !== folder.id)
      .map((entry) => entry.parentId === folder.id ? { ...entry, parentId } : entry);
    documents = documents.map((doc) => {
      if (doc.space !== "Wiki" || doc.folderId !== folder.id) return doc;
      if (parentId) return { ...doc, folderId: parentId };
      const { folderId: _folderId, ...withoutFolder } = doc;
      return withoutFolder;
    });
    researchItems = researchItems.map((item) =>
      item.folderId === folder.id ? { ...item, folderId: parentId } : item
    );
    if (parentId) expandResearchFolderPath(parentId);
    persist();
  }

  /** Reorders a folder among its siblings for touch users (drag is mouse-only). */
  function moveWikiFolder(id: string, offset: number) {
    const folder = researchFolders.find((entry) => entry.id === id);
    if (!folder) return;
    const siblings = researchFolders.filter((entry) => entry.parentId === folder.parentId);
    const index = siblings.findIndex((entry) => entry.id === id);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const next = [...researchFolders];
    const from = next.findIndex((entry) => entry.id === siblings[index].id);
    const to = next.findIndex((entry) => entry.id === siblings[targetIndex].id);
    [next[from], next[to]] = [next[to], next[from]];
    researchFolders = next;
    persist();
  }

  function moveWikiFolderToTop(id: string) {
    const folder = researchFolders.find((entry) => entry.id === id);
    if (!folder || folder.parentId === null) return;
    researchFolders = [
      ...researchFolders.filter((entry) => entry.id !== id),
      { ...folder, parentId: null }
    ];
    persist();
  }

  function moveResearchDocument(documentId: string, folderId: string) {
    if (folderId && !researchFolders.some((folder) => folder.id === folderId)) return;
    documents = documents.map((doc) => {
      if (doc.id !== documentId || doc.space !== "Wiki") return doc;
      if (folderId) return { ...doc, folderId };
      const { folderId: _folderId, ...withoutFolder } = doc;
      return withoutFolder;
    });
    if (folderId) expandResearchFolderPath(folderId);
    persist();
  }

  function moveResearchItem(itemId: string, folderId: string) {
    if (folderId && !researchFolders.some((folder) => folder.id === folderId)) return;
    researchItems = researchItems.map((item) =>
      item.id === itemId ? { ...item, folderId: folderId || null } : item
    );
    if (folderId) expandResearchFolderPath(folderId);
    persist();
  }

  function ensureResearchFolderName(): string {
    if (researchFolderName) return researchFolderName;
    researchFolderName = createResearchFolderName(projectName, activeProjectId);
    return researchFolderName;
  }

  function researchErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === "string" && error.trim()) return error;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  function researchImportStatus(added: number, failures: string[]): string {
    const noun = added === 1 ? "file" : "files";
    if (added === 0 && failures.length > 0) return `Could not add files. ${failures[0]}`;
    if (failures.length > 0) return `Added ${added} ${noun}. ${failures[0]}`;
    return `Added ${added} ${noun}.`;
  }

  async function ensureResearchRoot(): Promise<string | null> {
    if (!desktopRuntime) return null;
    if (researchRoot) return researchRoot;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Choose a folder for wiki files",
        defaultPath: researchRoot || undefined
      });
      if (typeof picked !== "string" || !picked) return null;
      researchRoot = picked;
      savePreferences();
      researchStatus = "Wiki files folder saved for this device.";
      return picked;
    } catch (error) {
      console.error("Could not choose a wiki files folder.", error);
      researchStatus = "Could not open the folder picker.";
      return null;
    }
  }

  async function chooseResearchRoot() {
    if (!desktopRuntime) return;
    researchSettingsStatus = "";
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Choose a folder for wiki files",
        defaultPath: researchRoot || undefined
      });
      if (typeof picked !== "string" || !picked) return;
      researchRoot = picked;
      savePreferences();
      researchSettingsStatus = "Wiki files folder saved. Existing files remain in the previous folder.";
    } catch (error) {
      console.error("Could not choose a wiki files folder.", error);
      researchSettingsStatus = "Could not open the folder picker.";
    }
  }

  async function revealResearchProjectFolder() {
    if (!desktopRuntime) return;
    researchSettingsStatus = "";
    const root = await ensureResearchRoot();
    if (!root) return;
    const projectFolder = ensureResearchFolderName();
    persist();
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("research_prepare_project_folder", { root, projectFolder });
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(path);
      researchSettingsStatus = "";
    } catch (error) {
      console.error("Could not reveal the wiki folder.", error);
      researchSettingsStatus = researchErrorMessage(error, "Could not reveal the wiki folder.");
    }
  }

  async function addResearchFiles(folderId: string | null = null) {
    if (researchBusy) return;
    researchStatus = "";
    if (!desktopRuntime) {
      pendingResearchFolderId = folderId;
      if (researchFileInput) {
        researchFileInput.value = "";
        researchFileInput.click();
      }
      return;
    }

    const root = await ensureResearchRoot();
    if (!root) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ multiple: true, title: "Add wiki files" });
      const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
      if (paths.length === 0) return;

      researchBusy = true;
      researchStatus = "Adding files…";
      const projectFolder = ensureResearchFolderName();
      const importProjectId = activeProjectId;
      const { invoke } = await import("@tauri-apps/api/core");
      let added = 0;
      const failures: string[] = [];

      for (const sourcePath of paths) {
        try {
          const id = crypto.randomUUID();
          const fileName = researchFileNameFromPath(sourcePath);
          const storageKey = `research/${id}/${fileName}`;
          const size = await invoke<number>("research_import_file", {
            root,
            projectFolder,
            storageKey,
            sourcePath
          });
          if (activeProjectId !== importProjectId) {
            await invoke("research_delete_file", { root, projectFolder, storageKey });
            continue;
          }
          const item: ResearchFile = {
            id,
            kind: "file",
            folderId,
            title: fileName,
            fileName,
            mimeType: researchMimeType(fileName),
            size,
            storageKey,
            addedAt: Date.now()
          };
          researchItems = [...researchItems, item];
          added += 1;
        } catch (error) {
          console.error("Could not import a wiki file.", error);
          failures.push(researchErrorMessage(error, "Unknown error"));
        }
      }

      if (added > 0 && activeProjectId === importProjectId) {
        expandedSpaces.Wiki = true;
        if (folderId) expandResearchFolderPath(folderId);
        persist();
      }
      if (activeProjectId === importProjectId) {
        researchStatus = researchImportStatus(added, failures);
      }
    } catch (error) {
      console.error("Could not add wiki files.", error);
      researchStatus = "Could not open the file picker.";
    } finally {
      researchBusy = false;
    }
  }

  async function handleBrowserResearchFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const folderId = pendingResearchFolderId;
    pendingResearchFolderId = null;
    input.value = "";
    if (files.length === 0) return;

    researchBusy = true;
    researchStatus = "Adding files…";
    const importProjectId = activeProjectId;
    let added = 0;
    const failures: string[] = [];
    for (const file of files) {
      try {
        if (file.size > MAX_RESEARCH_FILE_BYTES) {
          throw new Error("Wiki files must be 200 MB or smaller.");
        }
        const id = crypto.randomUUID();
        const fileName = safeResearchFileName(file.name);
        const storageKey = `research/${id}/${fileName}`;
        const mimeType = file.type || researchMimeType(fileName);
        await saveBrowserResearchFile(importProjectId, storageKey, file, fileName, mimeType);
        if (activeProjectId !== importProjectId) {
          await deleteBrowserResearchFile(importProjectId, storageKey);
          continue;
        }
        const item: ResearchFile = {
          id,
          kind: "file",
          folderId,
          title: fileName,
          fileName,
          mimeType,
          size: file.size,
          storageKey,
          addedAt: Date.now()
        };
        researchItems = [...researchItems, item];
        added += 1;
      } catch (error) {
        console.error("Could not save a wiki file in browser storage.", error);
        failures.push(researchErrorMessage(error, "Unknown error"));
      }
    }
    if (added > 0 && activeProjectId === importProjectId) {
      expandedSpaces.Wiki = true;
      if (folderId) expandResearchFolderPath(folderId);
      persist();
    }
    if (activeProjectId === importProjectId) {
      researchStatus = researchImportStatus(added, failures);
    }
    researchBusy = false;
  }

  function researchItemTitle(item: ResearchItem): string {
    return item.title || (item.kind === "file" ? item.fileName : item.url);
  }

  function researchItemMeta(item: ResearchItem): string {
    if (item.kind === "link") {
      const description = item.description?.trim();
      return description ? `${item.url}\n${description}` : item.url;
    }
    return [formatResearchFileSize(item.size), item.mimeType].filter(Boolean).join(" · ");
  }

  const splitFiles = $derived(researchItems.flatMap((item) => item.kind === "file" ? [item] : []));
  // Zen mode hides the tiles, so the grid then stays a single column for the editor.
  const splitColumns = $derived(zenInterfaceHidden ? 1 : tileColumns(splitPanes.length + 1, tileGridWidth, 300));
  const tilesOpen = $derived(splitPanes.length > 0 && !zenInterfaceHidden);
  // The editor takes the whole first column; the reference tiles share the other columns and wrap into rows of the same height.
  const tileRows = $derived(splitColumns > 1
    ? Math.max(1, Math.ceil(splitPanes.length / (splitColumns - 1)))
    : splitPanes.length + 1);

  // Open tiles fill the viewport, so the grid needs the measured offset of the chrome above it and the page padding below it.
  function measureTileGrid() {
    if (!tileGridElement) return;
    const writingArea = tileGridElement.closest(".writing-area");
    const bottomPadding = writingArea ? parseFloat(getComputedStyle(writingArea).paddingBottom) : Number.NaN;
    tileGridTop = Math.max(0, Math.ceil(tileGridElement.getBoundingClientRect().top + window.scrollY));
    tileGridBottom = Number.isFinite(bottomPadding) ? Math.ceil(bottomPadding) : 0;
  }

  // Panes, columns, view, banners and sidebars all move the grid's top edge, so re-measure when one changes.
  $effect(() => {
    void splitColumns;
    void splitPanes.length;
    void tileGridWidth;
    void workspaceView;
    void leftSidebarVisible;
    void rightSidebarVisible;
    void zenInterfaceHidden;
    void showUpdateBanner;
    void showInstallBanner;
    void storageError;
    if (!tilesOpen) return;
    measureTileGrid();
    const frame = requestAnimationFrame(measureTileGrid);
    return () => cancelAnimationFrame(frame);
  });

  onMount(() => {
    const handleResize = () => measureTileGrid();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  const splitGroups = $derived.by((): SplitGroup[] => {
    const groups: SplitGroup[] = [];
    for (const chapter of liveChapters) {
      const options = documents
        .filter((doc) => doc.chapterId === chapter.id && !doc.trashed)
        .map((doc) => ({ value: docTarget(doc.id), label: doc.title || "Untitled" }));
      if (options.length > 0) groups.push({ label: chapter.title || "Untitled chapter", options });
    }
    const wikiPages = documents
      .filter((doc) => doc.space === "Wiki" && !doc.trashed)
      .map((doc) => ({ value: docTarget(doc.id), label: doc.title || "Untitled" }));
    if (wikiPages.length > 0) groups.push({ label: "Wiki pages", options: wikiPages });
    if (splitFiles.length > 0) {
      groups.push({
        label: "Wiki files",
        options: splitFiles.map((item) => ({ value: fileTarget(item.id), label: researchItemTitle(item) }))
      });
    }
    return groups;
  });

  // Panes keep showing something that was deleted or trashed in the meantime.
  $effect(() => {
    const valid = new Set(splitGroups.flatMap((group) => group.options.map((option) => option.value)));
    if (splitPanes.some((pane) => pane.target && !valid.has(pane.target))) {
      splitPanes = pruneSplitTargets(splitPanes, valid);
    }
  });

  function toggleSplitView() {
    if (splitPanes.length > 0) {
      splitPanes = [];
      return;
    }
    splitPanes = addSplitPane([], crypto.randomUUID());
  }

  /** Puts a tile's document into the editor and the document that was being edited into the tile. */
  function swapTileWithEditor(paneId: string) {
    const pane = splitPanes.find((entry) => entry.id === paneId);
    const parsed = pane ? parseSplitTarget(pane.target) : null;
    if (!pane || parsed?.kind !== "doc" || !activeDocumentId) return;
    const previous = activeDocumentId;
    splitPanes = setSplitTarget(splitPanes, paneId, docTarget(previous));
    openSidebarDocument(parsed.id);
  }

  /** Applies an edit made in a reference tile to its document and saves it. */
  function updateTileDocument(id: string, patch: TileDocumentPatch) {
    const doc = documents.find((entry) => entry.id === id);
    if (patch.content !== undefined && doc?.chapterId
      && chapters.some((chapter) => chapter.id === doc.chapterId)) {
      writeChapterSectionsFor(doc.chapterId, splitChapterHtml(cleanHtml(patch.content)));
      persist();
      return;
    }
    documents = patchTileDocument(documents, id, patch);
    persist();
  }

  function updateTileChapterTitle(chapterId: string, value: string) {
    chapters = chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, title: value } : chapter);
    persistChapters();
  }

  function openBesideTarget(target: string) {
    splitPanes = openBeside(splitPanes, target, crypto.randomUUID());
    closeSidebarDrawers(false);
    setWorkspaceView("writing");
  }

  // Alt/Option+click opens a row beside the editor instead of replacing it.
  function openRowBeside(event: MouseEvent, target: string): boolean {
    if (!event.altKey) return false;
    event.preventDefault();
    openBesideTarget(target);
    return true;
  }

  const TARGET_DRAG_TYPE = "application/x-prosecraft-target";

  // Rows carry their split target, so the editor grid and the panes can accept the drop.
  function startTargetDrag(event: DragEvent, target: string) {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    transfer.setData(TARGET_DRAG_TYPE, target);
    transfer.effectAllowed = "copy";
    if (event.currentTarget instanceof HTMLElement) transfer.setDragImage(event.currentTarget, 12, 14);
  }

  function hasTargetDrag(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes(TARGET_DRAG_TYPE) ?? false;
  }

  // Related-target check keeps the highlight steady while the pointer crosses child elements.
  function targetDragLeaves(event: DragEvent): boolean {
    const next = event.relatedTarget;
    return !(event.currentTarget instanceof Node && next instanceof Node && event.currentTarget.contains(next));
  }

  /** A drag can end without a drop on our zones (Escape, drop elsewhere), so the highlight is cleared globally. */
  function resetTargetDrops() {
    gridDropActive = false;
    paneDropActive = null;
    draggedSceneId = null;
    sceneDropTarget = null;
    sceneDropChapterId = null;
    draggedWiki = null;
    wikiDropTarget = null;
    wikiDropFolderId = null;
    wikiDropRoot = false;
  }

  const WIKI_DRAG_TYPE = "application/x-prosecraft-wiki";
  type WikiDragKind = "folder" | "document" | "file" | "link";
  type WikiDragSource = { kind: WikiDragKind; id: string };
  let draggedWiki = $state<WikiDragSource | null>(null);
  let wikiDropTarget = $state<{ key: string; after: boolean } | null>(null);
  let wikiDropFolderId = $state<string | null>(null);
  let wikiDropRoot = $state(false);

  function wikiRowKey(kind: string, id: string) {
    return `${kind}:${id}`;
  }

  // Wiki rows are draggable twice: the split target opens them beside the
  // editor, while the wiki payload reorders the tree.
  function startWikiDrag(event: DragEvent, kind: WikiDragKind, id: string) {
    if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea")) {
      event.preventDefault();
      return;
    }
    const transfer = event.dataTransfer;
    if (!transfer) return;
    transfer.setData(WIKI_DRAG_TYPE, JSON.stringify({ kind, id }));
    transfer.effectAllowed = "copyMove";
    draggedWiki = { kind, id };
  }

  function hasWikiDrag(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes(WIKI_DRAG_TYPE) ?? false;
  }

  function wikiDragSource(event: DragEvent): WikiDragSource | null {
    try {
      const raw = event.dataTransfer?.getData(WIKI_DRAG_TYPE) ?? "";
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WikiDragSource>;
        if (parsed && typeof parsed.id === "string"
          && (parsed.kind === "folder" || parsed.kind === "document"
            || parsed.kind === "file" || parsed.kind === "link")) {
          return { kind: parsed.kind, id: parsed.id };
        }
      }
    } catch {
      // Fall through to the in-progress drag state.
    }
    return draggedWiki;
  }

  function wikiParentOf(kind: WikiDragKind, id: string): string | null | undefined {
    if (kind === "folder") return researchFolders.find((folder) => folder.id === id)?.parentId ?? null;
    if (kind === "document") {
      const doc = documents.find((entry) => entry.id === id);
      if (!doc || doc.space !== "Wiki") return undefined;
      return doc.folderId ?? null;
    }
    return researchItems.find((item) => item.id === id)?.folderId ?? null;
  }

  function isFolderDescendant(folderId: string, ancestorId: string): boolean {
    let current: string | null | undefined = researchFolders.find((folder) => folder.id === folderId)?.parentId;
    while (current) {
      if (current === ancestorId) return true;
      current = researchFolders.find((folder) => folder.id === current)?.parentId;
    }
    return false;
  }

  function arrayMoveTo<T extends { id: string }>(list: T[], dragId: string, targetId: string, after: boolean): T[] {
    if (dragId === targetId) return list;
    const dragged = list.find((entry) => entry.id === dragId);
    const rest = list.filter((entry) => entry.id !== dragId);
    const at = rest.findIndex((entry) => entry.id === targetId);
    if (!dragged || at < 0) return list;
    const insertAt = after ? at + 1 : at;
    return [...rest.slice(0, insertAt), dragged, ...rest.slice(insertAt)];
  }

  /** Drops an item into a folder (or the root), appended to that group. */
  function moveWikiIntoFolder(source: WikiDragSource, folderId: string | null) {
    if (folderId && !researchFolders.some((folder) => folder.id === folderId)) return;
    if (source.kind === "folder") {
      const folder = researchFolders.find((entry) => entry.id === source.id);
      if (!folder || folder.parentId === folderId) {
        if (folder && folderId) expandResearchFolderPath(folderId);
        return;
      }
      if (folderId && (folderId === source.id || isFolderDescendant(folderId, source.id))) return;
      researchFolders = [
        ...researchFolders.filter((entry) => entry.id !== source.id),
        { ...folder, parentId: folderId }
      ];
      if (folderId) expandResearchFolderPath(folderId);
      persist();
      return;
    }
    if (source.kind === "document") {
      const doc = documents.find((entry) => entry.id === source.id);
      if (!doc || doc.space !== "Wiki") return;
      const moved = folderId
        ? { ...doc, folderId }
        : (() => {
          const { folderId: _folderId, ...withoutFolder } = doc;
          return withoutFolder;
        })();
      documents = [...documents.filter((entry) => entry.id !== source.id), moved];
      if (folderId) expandResearchFolderPath(folderId);
      persist();
      return;
    }
    const item = researchItems.find((entry) => entry.id === source.id);
    if (!item) return;
    researchItems = [...researchItems.filter((entry) => entry.id !== source.id), { ...item, folderId }];
    if (folderId) expandResearchFolderPath(folderId);
    persist();
  }

  /**
   * Drops onto a row: adopts the row's parent and orders within it. Folders
   * reorder among folders, pages and files/links within their own lists.
   */
  function moveWikiToRow(source: WikiDragSource, targetKind: WikiDragKind, targetId: string, after: boolean) {
    if (source.id === targetId) return;
    if (source.kind === "folder" && targetKind === "folder") {
      const target = researchFolders.find((folder) => folder.id === targetId);
      const folder = researchFolders.find((entry) => entry.id === source.id);
      if (!target || !folder) return;
      researchFolders = arrayMoveTo(
        researchFolders.map((entry) => entry.id === source.id ? { ...entry, parentId: target.parentId } : entry),
        source.id,
        targetId,
        after
      );
      persist();
      return;
    }
    if (source.kind === "folder") {
      // Folders land at the end of their new sibling group.
      const parent = wikiParentOf(targetKind, targetId);
      if (parent === undefined) return;
      moveWikiIntoFolder(source, parent);
      return;
    }
    if (targetKind === "folder") {
      const folder = researchFolders.find((entry) => entry.id === targetId);
      if (!folder) return;
      moveWikiIntoFolder(source, folder.parentId);
      return;
    }
    const parent = wikiParentOf(targetKind, targetId);
    if (parent === undefined) return;
    if (source.kind === "document") {
      const doc = documents.find((entry) => entry.id === source.id);
      if (!doc || doc.space !== "Wiki") return;
      const withParent = documents.map((entry) => {
        if (entry.id !== source.id) return entry;
        if (parent) return { ...entry, folderId: parent };
        const { folderId: _folderId, ...withoutFolder } = entry;
        return withoutFolder;
      });
      documents = arrayMoveTo(withParent, source.id, targetId, after);
      persist();
      return;
    }
    const item = researchItems.find((entry) => entry.id === source.id);
    if (!item || (source.kind !== item.kind)) return;
    researchItems = arrayMoveTo(
      researchItems.map((entry) => entry.id === source.id ? { ...entry, folderId: parent } : entry),
      source.id,
      targetId,
      after
    );
    persist();
  }

  function handleWikiRowDragOver(event: DragEvent, kind: WikiDragKind, id: string) {
    if (!hasWikiDrag(event) || !draggedWiki || draggedWiki.id === id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (kind === "folder") {
      const row = event.currentTarget as HTMLElement;
      const bounds = row.getBoundingClientRect();
      const ratio = (event.clientY - bounds.top) / Math.max(1, bounds.height);
      const intoFolder = draggedWiki.kind !== "folder" || (ratio > 1 / 3 && ratio < 2 / 3);
      if (intoFolder) {
        if (draggedWiki.kind === "folder" && isFolderDescendant(id, draggedWiki.id)) {
          wikiDropFolderId = null;
          wikiDropTarget = null;
          wikiDropRoot = false;
          return;
        }
        wikiDropFolderId = id;
        wikiDropTarget = null;
        wikiDropRoot = false;
        return;
      }
    }
    wikiDropFolderId = null;
    wikiDropRoot = false;
    const row = event.currentTarget as HTMLElement;
    const bounds = row.getBoundingClientRect();
    wikiDropTarget = { key: wikiRowKey(kind, id), after: event.clientY >= bounds.top + bounds.height / 2 };
  }

  function handleWikiRowDrop(event: DragEvent, kind: WikiDragKind, id: string) {
    if (!hasWikiDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const source = wikiDragSource(event);
    const intoFolder = wikiDropFolderId === id;
    const after = wikiDropTarget?.key === wikiRowKey(kind, id) ? wikiDropTarget.after : false;
    resetTargetDrops();
    if (!source) return;
    if (intoFolder) {
      moveWikiIntoFolder(source, id);
      return;
    }
    moveWikiToRow(source, kind, id, after);
  }

  function handleWikiRowDragLeave(event: DragEvent, kind: WikiDragKind, id: string) {
    if (!hasWikiDrag(event) || !targetDragLeaves(event)) return;
    if (wikiDropTarget?.key === wikiRowKey(kind, id)) wikiDropTarget = null;
    if (wikiDropFolderId === id) wikiDropFolderId = null;
  }

  function handleWikiRootDragOver(event: DragEvent) {
    if (!hasWikiDrag(event) || !draggedWiki) return;
    if (event.target instanceof Element
      && event.target.closest(".note-folder-row, .note-document-row")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    wikiDropFolderId = null;
    wikiDropTarget = null;
    wikiDropRoot = true;
  }

  function handleWikiRootDrop(event: DragEvent) {
    if (!hasWikiDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const source = wikiDragSource(event);
    resetTargetDrops();
    if (source) moveWikiIntoFolder(source, null);
  }

  function handleWikiRootDragLeave(event: DragEvent) {
    if (!hasWikiDrag(event) || !targetDragLeaves(event)) return;
    wikiDropRoot = false;
  }

  const SCENE_DRAG_TYPE = "application/x-prosecraft-scene";

  function scenesInChapter(chapterId: string): DocumentData[] {
    return documents.filter((doc) => doc.chapterId === chapterId && !doc.trashed);
  }

  // Scene rows are draggable twice: the split target opens them beside the
  // editor, while the scene id reorders them in the sidebar.
  function startSceneDrag(event: DragEvent, id: string) {
    startTargetDrag(event, docTarget(id));
    const transfer = event.dataTransfer;
    if (!transfer) return;
    transfer.setData(SCENE_DRAG_TYPE, id);
    transfer.effectAllowed = "copyMove";
    draggedSceneId = id;
  }

  function hasSceneDrag(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes(SCENE_DRAG_TYPE) ?? false;
  }

  function sceneDragId(event: DragEvent): string {
    return event.dataTransfer?.getData(SCENE_DRAG_TYPE) ?? "";
  }

  /**
   * Re-renders the chapter editor from documents after sidebar structure
   * edits (trash, restore, moves). No-ops outside chapter mode.
   */
  function refreshChapterView(scrollToId?: string | null) {
    if (!inChapterMode || !activeChapter) return;
    if (markdownEditorMode) {
      setMarkdownSource(chapterMarkdownSource());
      return;
    }
    setEditorContent(buildChapterHtml(
      scenesInChapter(activeChapter.id).map((doc) => doc.content),
      publishOptions.sceneSeparator
    ));
    refreshCounts();
    if (scrollToId) scrollToScene(scrollToId);
  }

  /**
   * Surgically removes one scene's section and divider from the live editor,
   * preserving caret and undo. The caller updates documents afterwards.
   */
  function removeEditorSection(docId: string): boolean {
    if (!editor || !inChapterMode || !activeChapter || markdownEditorMode) return false;
    const docs = scenesInChapter(activeChapter.id);
    const index = docs.findIndex((doc) => doc.id === docId);
    if (index < 0) return false;
    const breaks = Array.from(editor.querySelectorAll(".scene-break"));
    const start = index === 0 ? editor.firstChild : breaks[index - 1]?.nextSibling ?? null;
    const end = breaks[index] ?? null;
    if (!start) return false;
    const selection = window.getSelection();
    const top = selection ? editorTopBlock(selection.anchorNode) : null;
    let node: ChildNode | null = start;
    let caretInside = false;
    while (node && node !== end) {
      const next: ChildNode | null = node.nextSibling;
      if (node === top) caretInside = true;
      node.remove();
      node = next;
    }
    if (caretInside && selection) {
      let host: Node | null = end;
      while (host && ((host.nodeType === Node.TEXT_NODE && !(host.textContent ?? "").trim())
        || isSceneBreakElement(host))) {
        host = host.nextSibling;
      }
      const range = document.createRange();
      if (host) {
        range.selectNodeContents(host);
        range.collapse(true);
      } else if (editor.lastChild) {
        range.selectNodeContents(editor.lastChild);
        range.collapse(false);
      } else {
        return true;
      }
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
    }
    refreshCounts();
    return true;
  }

  function moveScene(id: string, offset: number) {
    const scene = documents.find((doc) => doc.id === id);
    if (!scene?.chapterId) return;
    const list = scenesInChapter(scene.chapterId);
    const index = list.findIndex((doc) => doc.id === id);
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;
    const next = [...documents];
    const from = next.findIndex((doc) => doc.id === list[index].id);
    const to = next.findIndex((doc) => doc.id === list[targetIndex].id);
    [next[from], next[to]] = [next[to], next[from]];
    documents = next;
    if (activeChapter && scene.chapterId === activeChapter.id) refreshChapterView(id);
    persist();
  }

  function moveSceneToPosition(sceneId: string, targetSceneId: string, after: boolean) {
    if (sceneId === targetSceneId) return;
    const scene = documents.find((doc) => doc.id === sceneId);
    const target = documents.find((doc) => doc.id === targetSceneId);
    if (!scene || !target?.chapterId) return;
    const fromChapter = scene.chapterId;
    const without = documents.filter((doc) => doc.id !== sceneId);
    const targetIndex = without.findIndex((doc) => doc.id === targetSceneId);
    if (targetIndex < 0) return;
    const moved = scene.chapterId === target.chapterId ? scene : { ...scene, chapterId: target.chapterId };
    const insertAt = after ? targetIndex + 1 : targetIndex;
    documents = [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
    if (activeChapter && (fromChapter === activeChapter.id || target.chapterId === activeChapter.id)) {
      refreshChapterView(sceneId);
    }
    persist();
  }

  function moveSceneToChapterEnd(sceneId: string, chapterId: string) {
    const scene = documents.find((doc) => doc.id === sceneId);
    if (!scene || !liveChapters.some((chapter) => chapter.id === chapterId)) return;
    if (scene.chapterId === chapterId) {
      const list = scenesInChapter(chapterId);
      if (list.length > 0 && list[list.length - 1].id !== sceneId) {
        moveSceneToPosition(sceneId, list[list.length - 1].id, true);
      }
      return;
    }
    const fromChapter = scene.chapterId;
    const without = documents.filter((doc) => doc.id !== sceneId);
    let insertAt = without.length;
    for (let index = without.length - 1; index >= 0; index--) {
      if (without[index].chapterId === chapterId) {
        insertAt = index + 1;
        break;
      }
    }
    documents = [...without.slice(0, insertAt), { ...scene, chapterId }, ...without.slice(insertAt)];
    if (activeChapter && (fromChapter === activeChapter.id || chapterId === activeChapter.id)) {
      refreshChapterView(sceneId);
    }
    persist();
  }

  function handleSceneDragOver(event: DragEvent, id: string) {
    if (!hasSceneDrag(event) || !draggedSceneId || draggedSceneId === id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const row = event.currentTarget as HTMLElement;
    const bounds = row.getBoundingClientRect();
    sceneDropTarget = { id, after: event.clientY >= bounds.top + bounds.height / 2 };
    sceneDropChapterId = null;
  }

  function handleSceneDrop(event: DragEvent, id: string) {
    if (!hasSceneDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const sceneId = sceneDragId(event) || draggedSceneId;
    const after = sceneDropTarget?.id === id ? sceneDropTarget.after : false;
    resetTargetDrops();
    if (sceneId) moveSceneToPosition(sceneId, id, after);
  }

  function handleSceneDragLeave(event: DragEvent, id: string) {
    if (!hasSceneDrag(event) || !targetDragLeaves(event)) return;
    if (sceneDropTarget?.id === id) sceneDropTarget = null;
  }

  function handleChapterSceneDragOver(event: DragEvent, chapterId: string) {
    if (!hasSceneDrag(event) || !draggedSceneId) return;
    if (event.target instanceof Element && event.target.closest(".scene-row")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    sceneDropChapterId = chapterId;
    sceneDropTarget = null;
  }

  function handleChapterSceneDrop(event: DragEvent, chapterId: string) {
    if (!hasSceneDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const sceneId = sceneDragId(event) || draggedSceneId;
    resetTargetDrops();
    if (sceneId) moveSceneToChapterEnd(sceneId, chapterId);
  }

  function handleChapterSceneDragLeave(event: DragEvent, chapterId: string) {
    if (!hasSceneDrag(event) || !targetDragLeaves(event)) return;
    if (sceneDropChapterId === chapterId) sceneDropChapterId = null;
  }

  function handleGridDragEnter(event: DragEvent) {
    if (!hasTargetDrag(event)) return;
    const overPane = event.target instanceof Element && Boolean(event.target.closest(".split-tile"));
    gridDropActive = !overPane;
  }

  function handleGridDragLeave(event: DragEvent) {
    if (!hasTargetDrag(event) || !targetDragLeaves(event)) return;
    gridDropActive = false;
  }

  function handleTargetDragOver(event: DragEvent) {
    if (!hasTargetDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  function handleTargetDrop(event: DragEvent) {
    const target = event.dataTransfer?.getData(TARGET_DRAG_TYPE) ?? "";
    if (!target) return;
    event.preventDefault();
    gridDropActive = false;
    openBesideTarget(target);
  }

  function handlePaneDragEnter(event: DragEvent, paneId: string) {
    if (!hasTargetDrag(event)) return;
    gridDropActive = false;
    paneDropActive = paneId;
  }

  function handlePaneDragLeave(event: DragEvent, paneId: string) {
    if (!hasTargetDrag(event) || !targetDragLeaves(event)) return;
    if (paneDropActive === paneId) paneDropActive = null;
  }

  function handlePaneDrop(event: DragEvent, paneId: string) {
    const target = event.dataTransfer?.getData(TARGET_DRAG_TYPE) ?? "";
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    paneDropActive = null;
    splitPanes = setSplitTarget(splitPanes, paneId, target);
  }

  function chapterFirstScene(chapterId: string): DocumentData | undefined {
    return documents.find((doc) => doc.chapterId === chapterId && !doc.trashed);
  }

  async function readResearchBytes(item: ResearchFile): Promise<ArrayBuffer> {
    if (!desktopRuntime) {
      return (await readBrowserResearchBlob(activeProjectId, item.storageKey)).arrayBuffer();
    }
    const root = await ensureResearchRoot();
    if (!root) throw new Error("The wiki files folder is unavailable.");
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await invoke<string>("research_file_path", {
      root,
      projectFolder: ensureResearchFolderName(),
      storageKey: item.storageKey
    });
    return invoke<ArrayBuffer>("read_import_file", { path });
  }

  async function openExternalUrl(url: string) {
    try {
      if (desktopRuntime) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } else {
        const opened = window.open(url, "_blank");
        if (opened) opened.opener = null;
      }
    } catch (error) {
      console.error("Could not open a link.", error);
    }
  }

  async function openResearchFile(item: ResearchFile, { external = false } = {}) {
    researchStatus = "";
    try {
      if (!external && /\.(?:md|markdown)$/i.test(item.fileName)) {
        let markdownSource: string;
        if (!desktopRuntime) {
          markdownSource = await readBrowserResearchFile(activeProjectId, item.storageKey);
        } else {
          const root = await ensureResearchRoot();
          if (!root) return;
          const projectFolder = ensureResearchFolderName();
          const { invoke } = await import("@tauri-apps/api/core");
          markdownSource = await invoke<string>("research_read_markdown", {
            root,
            projectFolder,
            storageKey: item.storageKey
          });
        }
        researchMarkdownTitle = researchItemTitle(item);
        researchMarkdownHtml = cleanHtml(markdownToHtml(markdownSource));
        researchMarkdownDialog.showModal();
        return;
      }
      if (!desktopRuntime) {
        await openBrowserResearchFile(activeProjectId, item.storageKey, item.fileName, item.mimeType);
        researchStatus = "";
        return;
      }
      const root = await ensureResearchRoot();
      if (!root) return;
      const projectFolder = ensureResearchFolderName();
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("research_open_file", {
        root,
        projectFolder,
        storageKey: item.storageKey
      });
      researchStatus = "";
    } catch (error) {
      console.error("Could not open a wiki file.", error);
      researchStatus = researchErrorMessage(error, "Could not open that file.");
    }
  }

  async function revealResearchFile(item: ResearchFile) {
    if (!desktopRuntime) {
      researchStatus = "Revealing files in a folder is only available in the desktop app.";
      return;
    }
    researchStatus = "";
    try {
      const root = await ensureResearchRoot();
      if (!root) return;
      const projectFolder = ensureResearchFolderName();
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("research_file_path", {
        root,
        projectFolder,
        storageKey: item.storageKey
      });
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(path);
      researchStatus = "";
    } catch (error) {
      console.error("Could not reveal a wiki file.", error);
      researchStatus = researchErrorMessage(error, "Could not reveal that file.");
    }
  }

  async function openResearchLink(item: ResearchLink) {
    const url = normalizeResearchUrl(item.url);
    if (!url) {
      researchStatus = "That wiki link is not a valid web address.";
      return;
    }
    try {
      if (desktopRuntime) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } else {
        const opened = window.open(url, "_blank");
        if (!opened) {
          researchStatus = "The browser blocked the link. Allow pop-ups for ProseCraft and try again.";
          return;
        }
        try {
          opened.opener = null;
        } catch {
          // Cross-origin viewers may already own the new window.
        }
      }
      researchStatus = "";
    } catch (error) {
      console.error("Could not open a wiki link.", error);
      researchStatus = "Could not open that link.";
    }
  }

  function openResearchLinkDialog(folderId: string | null = null) {
    researchLinkTitle = "";
    researchLinkUrl = "";
    researchLinkDescription = "";
    researchLinkError = "";
    researchLinkFolderId = folderId;
    if (researchLinkDialog && !researchLinkDialog.open) researchLinkDialog.showModal();
  }

  function saveResearchLink(event: SubmitEvent) {
    event.preventDefault();
    const url = normalizeResearchUrl(researchLinkUrl);
    if (!url) {
      researchLinkError = "Enter a valid http or https address.";
      return;
    }
    const title = researchLinkTitle.trim().slice(0, 200) || researchTitleFromUrl(url);
    const item: ResearchLink = {
      id: crypto.randomUUID(),
      kind: "link",
      folderId: researchLinkFolderId,
      title,
      url,
      description: researchLinkDescription.trim().slice(0, 2000) || undefined,
      addedAt: Date.now()
    };
    researchItems = [...researchItems, item];
    expandedSpaces.Wiki = true;
    if (researchLinkFolderId) expandResearchFolderPath(researchLinkFolderId);
    persist();
    researchStatus = "Link added.";
    researchLinkDialog.close();
  }

  async function removeResearchItem(item: ResearchItem) {
    const label = researchItemTitle(item);
    if (!(await confirmDestructiveAction(`Remove “${label}” from the Wiki?${item.kind === "file" ? " The file will be deleted from the project folder." : ""}`))) {
      return;
    }
    researchItems = researchItems.filter((entry) => entry.id !== item.id);
    persist();
    try {
      if (item.kind === "file") {
        if (desktopRuntime) {
          if (researchRoot && researchFolderName) {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("research_delete_file", {
              root: researchRoot,
              projectFolder: researchFolderName,
              storageKey: item.storageKey
            });
          }
        } else {
          await deleteBrowserResearchFile(activeProjectId, item.storageKey);
        }
      }
      researchStatus = "";
    } catch (error) {
      console.error("Could not delete a wiki file.", error);
      researchStatus = "The item was removed, but its file could not be deleted.";
    }
  }

  function moveToTrash(id: string) {
    const target = documents.find((doc) => doc.id === id);
    const inActiveChapter = !!target?.chapterId && inChapterMode
      && activeChapter?.id === target.chapterId && id !== activeDocumentId;
    // Remove the section first so the documents below still line up with it.
    if (inActiveChapter && !markdownEditorMode) removeEditorSection(id);
    documents = documents.map((doc) => doc.id === id ? { ...doc, trashed: true } : doc);
    if (activeDocumentId === id) {
      const next = documents.find((doc) => !doc.trashed);
      if (next) {
        activeDocumentId = id;
        openDocument(next.id);
      } else {
        activeDocumentId = "";
        title = "";
        setEditorContent("<p><br></p>");
        setMarkdownSource("");
        refreshCounts();
      }
    } else if (inActiveChapter && markdownEditorMode) {
      setMarkdownSource(chapterMarkdownSource());
    }
    persist();
  }

  function restoreDocument(id: string) {
    const document = documents.find((doc) => doc.id === id);
    const deletedChapter = document?.chapterId
      ? chapters.find((chapter) => chapter.id === document.chapterId && chapter.trashed)
      : undefined;
    if (deletedChapter) {
      restoreChapter(deletedChapter.id, id);
      return;
    }
    documents = documents.map((doc) => doc.id === id ? { ...doc, trashed: false } : doc);
    if (inChapterMode && activeChapter && document?.chapterId === activeChapter.id) {
      refreshChapterView(id);
    }
    persist();
  }

  function permanentlyDelete(id: string) {
    commitPageState();
    permanentDeleteInProgress = true;
    documents = documents.filter((doc) => doc.id !== id);
    if (activeDocumentId === id) {
      const next = documents.find((doc) => !doc.trashed);
      if (next) {
        activeDocumentId = id;
        openDocument(next.id);
      } else {
        activeDocumentId = "";
        title = "";
        setEditorContent("<p><br></p>");
        setMarkdownSource("");
        refreshCounts();
      }
    }
    persist();
    forgetPermanentlyDeleted();
  }

  async function trashChapter(id: string) {
    const chapter = chapters.find((item) => item.id === id && !item.trashed);
    if (!chapter) return;
    const sceneCount = documents.filter((doc) => doc.chapterId === id && !doc.space && !doc.trashed).length;
    const sceneLabel = sceneCount === 1 ? "scene" : "scenes";
    if (!(await confirmDestructiveAction(`Move “${chapterLabel(chapter)}” and its ${sceneCount} ${sceneLabel} to Trash? You can restore them later.`, {
      confirmLabel: "Move to Trash"
    }))) {
      return;
    }

    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    const chapterDocumentIds = new Set(
      documents.filter((doc) => doc.chapterId === id && !doc.space && !doc.trashed).map((doc) => doc.id)
    );
    documents = documents.map((doc) => chapterDocumentIds.has(doc.id)
      ? { ...doc, trashed: true, trashedWithChapterId: id }
      : doc);
    chapters = chapters.map((item) => item.id === id ? { ...item, trashed: true } : item);
    if (chapterDocumentIds.has(activeDocumentId)) {
      activeDocumentId = "";
      const next = documents.find((doc) => !doc.trashed);
      if (next) {
        openDocument(next.id);
      } else {
        title = "";
        setEditorContent("<p><br></p>");
        setMarkdownSource("");
        refreshCounts();
      }
    }
    persist();
  }

  function restoreChapter(id: string, restoreDocumentId?: string) {
    chapters = chapters.map((chapter) => chapter.id === id ? { ...chapter, trashed: false } : chapter);
    documents = documents.map((doc) => {
      if (doc.chapterId !== id || (doc.trashedWithChapterId !== id && doc.id !== restoreDocumentId)) return doc;
      const { trashedWithChapterId: _trashedWithChapterId, ...restored } = doc;
      return { ...restored, trashed: false };
    });
    persist();
  }

  async function permanentlyDeleteChapter(id: string) {
    const chapter = chapters.find((item) => item.id === id && item.trashed);
    if (!chapter) return;
    const chapterDocuments = documents.filter((doc) => doc.chapterId === id);
    if (!(await confirmDestructiveAction(`Permanently delete “${chapterLabel(chapter)}” and its ${chapterDocuments.length} scene(s)? This cannot be undone.`))) {
      return;
    }

    commitPageState();
    permanentDeleteInProgress = true;
    const chapterDocumentIds = new Set(chapterDocuments.map((doc) => doc.id));
    chapters = chapters.filter((item) => item.id !== id);
    documents = documents.filter((doc) => !chapterDocumentIds.has(doc.id));
    storyboardCards = storyboardCards.filter((card) =>
      !(card.kind === "chapter" && card.sourceId === id)
      && !(card.kind === "scene" && chapterDocumentIds.has(card.sourceId))
    );
    const { [id]: _deletedGoal, ...remainingGoals } = chapterGoals;
    chapterGoals = remainingGoals;
    if (chapterDocumentIds.has(activeDocumentId)) {
      activeDocumentId = "";
      const next = documents.find((doc) => !doc.trashed);
      if (next) {
        openDocument(next.id);
      } else {
        title = "";
        setEditorContent("<p><br></p>");
        setMarkdownSource("");
        refreshCounts();
      }
    }
    persist();
    forgetPermanentlyDeleted();
  }

  async function trashActiveProject() {
    if (liveProjects.length <= 1) return;
    const project = projects.find((item) => item.id === activeProjectId && !item.trashed);
    if (!project) return;
    if (!(await confirmDestructiveAction(`Move “${project.name}” to Trash? You can restore it later.`, {
      confirmLabel: "Move to Trash"
    }))) return;

    const next = liveProjects.find((item) => item.id !== project.id);
    if (!next) return;
    if (saveTimer) clearTimeout(saveTimer);
    persistNow();
    projects = projects.map((item) => item.id === project.id
      ? { ...currentProjectData(), trashed: true }
      : item);
    loadProject(next);
    persistProjectCollection();
  }

  function restoreProject(id: string) {
    projects = projects.map((project) => project.id === id ? { ...project, trashed: false } : project);
    persistProjectCollection();
  }

  async function permanentlyDeleteProject(id: string) {
    const project = projects.find((item) => item.id === id && item.trashed);
    if (!project) return;
    if (!(await confirmDestructiveAction(`Permanently delete “${project.name}” and all its contents? This cannot be undone.`))) return;
    projects = projects.filter((item) => item.id !== id);
    saveProjectSnapshot();
    void syncNativeProjectMenu();
  }

  function createDocument() {
    showZenInterface();
    const chapter = liveChapters[0];
    if (chapter) createScene(chapter.id);
    else createChapter();
  }

  function handleKeydown(event: KeyboardEvent) {
    handleHistoryShortcut(event);
    handleStoryboardPanKeydown(event);
    if (workspaceView === "storyboard" && (event.key === "Delete" || event.key === "Backspace")
      && selectedDrawingId) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || target instanceof HTMLElement && target.isContentEditable)) {
        event.preventDefault();
        removeStoryboardDrawing(selectedDrawingId);
      }
    }
    if (event.key === "Escape" && shortcutsOpen) {
      event.preventDefault();
      shortcutsOpen = false;
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key === "/") {
      event.preventDefault();
      toggleShortcuts();
      return;
    }
    if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
      if (!typing) {
        event.preventDefault();
        toggleShortcuts();
        return;
      }
    }
    if (event.key === "Escape" && (openRowMenu || openLabelMenu || contextMenu)) {
      event.preventDefault();
      openRowMenu = null;
      closeLabelMenu(true);
      closeContextMenu();
      return;
    }
    if (event.key === "Escape" && mobileDrawerOpen) {
      event.preventDefault();
      closeSidebarDrawers();
      return;
    }
    if (event.key === "Escape" && focusMode) {
      event.preventDefault();
      toggleFocusMode();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      toggleFocusMode();
      return;
    }
    if (event.key === "Escape" && !projectSearchOpen) showZenInterface();
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openProjectSearch();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openProjectSearch();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createDocument();
    }
  }

  function handleInput() {
    if (editor) {
      // Pasted or restored widgets arrive as source only and need rendering.
      ensureParagraphsAroundRichBlocks(editor);
      void renderRichWidgets(editor, { mode: "svg", bodySizePt: 12 });
    }
    if (!applyingUndoHistory && undoManager.has(bodyUndoKey())) {
      recordFieldEdit(editor, cleanHtml(editor.innerHTML), encodeSelection(editor));
    }
    const previousWordCount = lastEditorWordCount;
    const chapterId = inChapterMode ? activeChapter?.id : undefined;
    documents = documents.map((doc) => {
      if (doc.markdownSource === undefined) return doc;
      if (chapterId ? doc.chapterId !== chapterId : doc.id !== activeDocumentId) return doc;
      const { markdownSource: _markdownSource, ...withoutMarkdownSource } = doc;
      return withoutMarkdownSource;
    });
    refreshCounts();
    trackActivity(wordCount - previousWordCount);
    lastEditorWordCount = wordCount;
    persist();
    hideHarperPopover();
    scheduleHarperLint();
    scheduleRichTextTypewriter();
    if (fadeOtherParagraphs) scheduleRichTextFade();
  }

  type NativeSelection = { start: number; end: number; direction: "forward" | "backward" | "none" };
  type FieldSelection = NativeSelection | CaretSelection;
  type NativeTextField = HTMLInputElement | HTMLTextAreaElement;

  const undoManager = new UndoManager<FieldSelection>();
  // Text in these props has its own field history or is not a page action.
  const undoIgnoredProps = {
    documents: ["content", "title", "markdownSource", "folderId"],
    chapters: ["expanded"]
  };
  const anonymousUndoKeys = new WeakMap<Element, string>();
  const nativeTextInputTypes = new Set(["text", "search", "url", "email", "tel", "number"]);
  let anonymousUndoKeyCount = 0;
  let pageStateBaseline: StateTree = {};
  let pageStateDirty = false;
  let pointerIsDown = false;
  let permanentDeleteInProgress = false;
  let focusAtPointerDown: Element | null = null;
  let applyingUndoHistory = false;
  let pendingEdit: { kind: EditKind; caretMoved: boolean; before: FieldSelection } | null = null;
  let lastEditCaret: { key: string; caret: string } | null = null;

  function isNativeTextField(target: EventTarget | null): target is NativeTextField {
    return target instanceof HTMLTextAreaElement
      || target instanceof HTMLInputElement && (nativeTextInputTypes.has(target.type) || target.type === "password");
  }

  function undoTextTarget(target: EventTarget | null): NativeTextField | HTMLElement | null {
    if (target === editor) return editor;
    return isNativeTextField(target) && target.type !== "password" ? target : null;
  }

  function bodyUndoKey() {
    if (inChapterMode && activeChapter) return `${activeProjectId}/body:chapter:${activeChapter.id}`;
    return `${activeProjectId}/body:${activeDocumentId}`;
  }

  function undoKeyFor(target: NativeTextField | HTMLElement) {
    if (target === editor) return bodyUndoKey();
    const named = target.dataset.undoKey;
    if (named) return `${activeProjectId}/${named}`;
    let key = anonymousUndoKeys.get(target);
    if (!key) {
      key = `element:${anonymousUndoKeyCount += 1}`;
      anonymousUndoKeys.set(target, key);
    }
    return key;
  }

  function undoPageFor(target: NativeTextField | HTMLElement) {
    return target === editor || target.dataset.undoKey ? currentUndoPage() : null;
  }

  function currentUndoPage() {
    const scope = inChapterMode && activeChapter ? `chapter:${activeChapter.id}` : activeDocumentId;
    const page = workspaceView === "writing" ? `writing:${scope}` : workspaceView;
    return `${activeProjectId}/${page}`;
  }

  function nativeFieldForKey(key: string) {
    const prefix = `${activeProjectId}/`;
    if (!key.startsWith(prefix)) return null;
    return document.querySelector<NativeTextField>(`[data-undo-key="${CSS.escape(key.slice(prefix.length))}"]`);
  }

  function capturePageState(): StateTree {
    return {
      storyboardCards: $state.snapshot(storyboardCards),
      storyboardDrawings: $state.snapshot(storyboardDrawings),
      storyboardRows: $state.snapshot(storyboardRows),
      timelineNodes: $state.snapshot(timelineNodes),
      publishOptions: $state.snapshot(publishOptions),
      chapters: $state.snapshot(chapters),
      documents: $state.snapshot(documents)
    };
  }

  function refreshPageStateBaseline() {
    pageStateBaseline = capturePageState();
    pageStateDirty = false;
  }

  function commitPageState(force = false): StateStep | null {
    if (pointerIsDown || permanentDeleteInProgress || !pageStateDirty && !force) return null;
    const next = capturePageState();
    const step = diffState(pageStateBaseline, next, undoIgnoredProps, Date.now());
    pageStateBaseline = next;
    pageStateDirty = false;
    if (step) undoManager.pushState(currentUndoPage(), step);
    return step;
  }

  function forgetPermanentlyDeleted() {
    permanentDeleteInProgress = false;
    const next = capturePageState();
    for (const { collection, id } of removedIds(pageStateBaseline, next)) undoManager.forget(collection, id);
    pageStateBaseline = next;
    pageStateDirty = false;
  }

  function applyFieldValue(target: NativeTextField | HTMLElement, value: string, selection: FieldSelection) {
    applyingUndoHistory = true;
    try {
      if (target === editor) {
        const focused = document.activeElement === editor;
        setEditorContent(value);
        handleInput();
        if (focused) {
          restoreSelection(editor, selection as CaretSelection);
          window.getSelection()?.focusNode?.parentElement?.scrollIntoView({ block: "nearest" });
        }
        lastEditCaret = { key: bodyUndoKey(), caret: JSON.stringify(encodeSelection(editor)) };
      } else if (isNativeTextField(target)) {
        target.value = value;
        const saved = selection as NativeSelection | null;
        if (saved && target === document.activeElement && target.selectionStart !== null) {
          target.setSelectionRange(saved.start, saved.end, saved.direction);
        }
        target.dispatchEvent(new Event("input", { bubbles: true }));
        if (target.type === "number") target.dispatchEvent(new Event("change", { bubbles: true }));
        lastEditCaret = { key: undoKeyFor(target), caret: JSON.stringify(nativeSelection(target)) };
      }
    } finally {
      applyingUndoHistory = false;
    }
    refreshPageStateBaseline();
  }

  function nativeSelection(target: NativeTextField): NativeSelection | null {
    return target.selectionStart === null || target.selectionEnd === null
      ? null
      : { start: target.selectionStart, end: target.selectionEnd, direction: target.selectionDirection ?? "none" };
  }

  function runFieldHistory(target: NativeTextField | HTMLElement, direction: "undo" | "redo") {
    commitPageState();
    const key = undoKeyFor(target);
    if (target !== editor) undoManager.sync(key, (target as NativeTextField).value);
    const result = direction === "undo" ? undoManager.undoField(key) : undoManager.redoField(key);
    if (result) applyFieldValue(target, result.value, result.selection);
  }

  function canApplyFieldHistory(key: string) {
    if (key === bodyUndoKey()) return !markdownEditorMode;
    if (key === markdownUndoKey()) return markdownEditorMode && markdownCodeEditor !== undefined;
    return nativeFieldForKey(key) !== null;
  }

  function runPageHistory(direction: "undo" | "redo") {
    if (saveTimer) {
      clearTimeout(saveTimer);
      persistNow();
    }
    commitPageState(true);
    const page = currentUndoPage();
    const result = direction === "undo"
      ? undoManager.undoPage(page, canApplyFieldHistory)
      : undoManager.redoPage(page, canApplyFieldHistory);
    if (!result) return;
    if (result.type === "external") {
      // The update listener moves the page step once the editor applies this.
      if (!markdownCodeEditor || !(direction === "undo" ? undoMarkdown : redoMarkdown)(markdownCodeEditor)) {
        undoManager.discardNewest(page, direction);
        runPageHistory(direction);
      }
      return;
    }
    if (result.type === "field") {
      const target = result.key === bodyUndoKey() ? editor : nativeFieldForKey(result.key);
      if (target) applyFieldValue(target, result.value, result.selection);
      return;
    }
    applyPageStateStep(result.step, direction);
    undoManager.moveState(page, currentUndoPage(), result.step);
  }

  function applyPageStateStep(step: StateStep, direction: "undo" | "redo") {
    const next = applyStateStep(capturePageState(), step, direction);
    if (step.changes.storyboardCards) storyboardCards = next.storyboardCards as StoryboardCard[];
    if (step.changes.storyboardDrawings) storyboardDrawings = next.storyboardDrawings as StoryboardDrawing[];
    if (step.changes.storyboardRows) storyboardRows = next.storyboardRows as StoryboardRow[];
    if (step.changes.timelineNodes) timelineNodes = next.timelineNodes as TimelineNode[];
    if (step.changes.publishOptions) publishOptions = next.publishOptions as PublishOptions;
    if (step.changes.chapters) chapters = next.chapters as ChapterData[];
    if (step.changes.documents) documents = next.documents as DocumentData[];
    if (!storyboardDrawings.some((drawing) => drawing.id === selectedDrawingId)) selectedDrawingId = null;
    if (!documents.some((doc) => doc.id === activeDocumentId && !doc.trashed)) {
      const fallback = documents.find((doc) => !doc.trashed);
      if (fallback) {
        openDocument(fallback.id);
      } else {
        activeDocumentId = "";
        title = "";
        setEditorContent("<p><br></p>");
        setMarkdownSource("");
      }
    }
    persist();
    refreshPageStateBaseline();
  }

  function handleHistoryShortcut(event: KeyboardEvent) {
    const isApple = /Mac|iPhone|iPad/.test(navigator.platform);
    if (event.altKey || (isApple ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const direction = key === "z" ? (event.shiftKey ? "redo" : "undo")
      : key === "y" && !event.shiftKey ? "redo"
      : null;
    if (!direction) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest(".cm-editor")) return;
    const target = undoTextTarget(event.target);
    if (target) {
      event.preventDefault();
      runFieldHistory(target, direction);
    } else if (isNativeTextField(event.target)) {
      // Password fields have no history, so that passphrases stay out of memory.
      event.preventDefault();
    } else if (!document.querySelector("dialog[open]")) {
      event.preventDefault();
      runPageHistory(direction);
    }
  }

  function handleUndoBeforeInput(event: InputEvent) {
    const target = undoTextTarget(event.target);
    if (!target) return;
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      event.preventDefault();
      runFieldHistory(target, event.inputType === "historyUndo" ? "undo" : "redo");
      return;
    }
    commitPageState();
    const key = undoKeyFor(target);
    const caret = target === editor ? encodeSelection(editor) : nativeSelection(target as NativeTextField);
    if (target === editor) {
      if (!undoManager.has(key)) undoManager.sync(key, cleanHtml(editor.innerHTML));
    } else {
      undoManager.sync(key, (target as NativeTextField).value);
    }
    pendingEdit = {
      kind: editKindFromInputType(event.inputType, event.isComposing),
      caretMoved: lastEditCaret?.key !== key || lastEditCaret.caret !== JSON.stringify(caret),
      before: caret
    };
  }

  function recordFieldEdit(target: NativeTextField | HTMLElement, value: string, after: FieldSelection) {
    const key = undoKeyFor(target);
    const edit = pendingEdit ?? { kind: "other" as const, caretMoved: true, before: after };
    pendingEdit = null;
    undoManager.record(key, undoPageFor(target), value, { ...edit, time: Date.now(), after });
    lastEditCaret = { key, caret: JSON.stringify(after) };
  }

  // Runs after the field's own handlers, so the baseline includes what they wrote to state.
  function handleUndoInput(event: Event) {
    const target = undoTextTarget(event.target);
    if (!target) return;
    if (!applyingUndoHistory && target !== editor) {
      recordFieldEdit(target, (target as NativeTextField).value, nativeSelection(target as NativeTextField));
    }
    refreshPageStateBaseline();
  }

  $effect(() => {
    const handlePointerDown = () => {
      pointerIsDown = true;
      focusAtPointerDown = document.activeElement;
    };
    const handlePointerEnd = () => {
      pointerIsDown = false;
      setTimeout(() => {
        const step = commitPageState(true);
        // A dragged box leaves focus in the last text field, so without this
        // blur the next undo would apply to that field instead of the page.
        const active = document.activeElement;
        if (step && active instanceof HTMLElement && active === focusAtPointerDown && undoTextTarget(active)) active.blur();
      });
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    window.addEventListener("beforeinput", handleUndoBeforeInput, true);
    window.addEventListener("input", handleUndoInput);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
      window.removeEventListener("beforeinput", handleUndoBeforeInput, true);
      window.removeEventListener("input", handleUndoInput);
    };
  });

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
      timelineEnabled = localStorage.getItem(timelineStorageKey) === "true";
      typewriterMode = localStorage.getItem(typewriterStorageKey) === "true";
      fadeOtherParagraphs = localStorage.getItem(fadeParagraphsStorageKey) === "true";
      zenMode = localStorage.getItem(zenModeStorageKey) === "true";
      harperEnabled = localStorage.getItem(harperEnabledStorageKey) === "true";
      const savedDialect = localStorage.getItem(harperDialectStorageKey);
      if (savedDialect === "american" || savedDialect === "british"
        || savedDialect === "australian" || savedDialect === "canadian") {
        harperDialect = savedDialect;
      }
      researchRoot = localStorage.getItem(researchRootStorageKey) ?? "";
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

    void initializeVault();
  });

  async function initializeVault() {
    try {
      await initVaultStorage();
      let loadedProject = false;
      const vault = loadVault();
      if (vault && vault.projects.length > 0) {
        projects = vault.projects;
        const selectedProject = projects.find((project) =>
          project.id === vault.activeProjectId && !project.trashed
        ) ?? projects.find((project) => !project.trashed)
          ?? projects.find((project) => project.id === vault.activeProjectId)
          ?? projects[0];
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
            ).map((doc) => migrateLegacyDocument({
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
          if (!renderChapter(active.id)) {
            title = active.title;
            setEditorContent(active.content);
            setMarkdownSource(active.markdownSource ?? htmlToMarkdown(active.content));
          }
        } else {
          activeDocumentId = "";
          title = "";
          setEditorContent("<p><br></p>");
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
      setEditorContent(starterContent);
      setMarkdownSource(htmlToMarkdown(starterContent));
    }
    refreshCounts();
    lastEditorWordCount = wordCount;
    refreshPageStateBaseline();
    void syncNativeProjectMenu();
    void refreshStorageUsage();
  }

  const INSTALL_DISMISSED_KEY = "prosecraft-install-dismissed";

  function isStandaloneDisplay(): boolean {
    if (typeof window === "undefined") return false;
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia("(display-mode: standalone)").matches
      || standaloneNavigator.standalone === true;
  }

  function dismissInstallBanner() {
    installDismissed = true;
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // Private browsing may not allow persistence; hide it for this session.
    }
  }

  function handleInstallAction() {
    if (!canInstallApp) {
      dismissInstallBanner();
      openSettings();
      return;
    }
    void installApp();
  }

  async function installApp() {
    const prompt = installPromptEvent;
    if (!prompt) {
      openSettings();
      return;
    }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      installPromptEvent = null;
      if (choice.outcome === "accepted") {
        installedStandalone = true;
      } else {
        dismissInstallBanner();
      }
    } catch (error) {
      console.error("Could not open the install prompt.", error);
    }
  }

  function applyServiceWorkerUpdate() {
    const waiting = serviceWorkerRegistration?.waiting;
    if (!waiting) {
      void serviceWorkerRegistration?.update().catch(() => undefined);
      return;
    }
    updateApplying = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  function openContextMenu(target: ContextMenuTarget, x: number, y: number) {
    openRowMenu = null;
    closeLabelMenu();
    contextMenuMoveOpen = false;
    contextMenu = { target, x, y };
    void tick().then(() => {
      positionContextMenu();
      contextMenuElement?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  }

  function closeContextMenu(restoreFocus = false) {
    void restoreFocus;
    contextMenu = null;
    contextMenuMoveOpen = false;
  }

  function positionContextMenu() {
    const menu = contextMenuElement;
    if (!menu || !contextMenu) return;
    const margin = 8;
    // visualViewport shrinks when the touch keyboard opens; fall back to the
    // layout viewport where it is unsupported.
    const viewport = window.visualViewport;
    const viewWidth = viewport?.width ?? window.innerWidth;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const rect = menu.getBoundingClientRect();
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (x + rect.width > viewWidth - margin) x = Math.max(margin, viewWidth - rect.width - margin);
    if (y + rect.height > viewHeight - margin) y = Math.max(margin, viewHeight - rect.height - margin);
    menu.style.maxHeight = `${Math.max(160, viewHeight - y - margin)}px`;
    if (x !== contextMenu.x || y !== contextMenu.y) contextMenu = { ...contextMenu, x, y };
  }

  function handleRowContextMenu(event: MouseEvent, target: ContextMenuTarget) {
    event.preventDefault();
    event.stopPropagation();
    cancelPressTimer();
    openContextMenu(target, event.clientX, event.clientY);
  }

  function handleRowPointerDown(event: PointerEvent, target: ContextMenuTarget) {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (event.button !== 0 && event.pointerType !== "touch") return;
    cancelPressTimer();
    pressTarget = target;
    pressX = event.clientX;
    pressY = event.clientY;
    const startX = event.clientX;
    const startY = event.clientY;
    pressTimer = setTimeout(() => {
      if (!pressTarget) return;
      try {
        navigator.vibrate?.(10);
      } catch {
        // Vibration is best-effort.
      }
      openContextMenu(pressTarget, startX, startY);
      pressTarget = null;
    }, 550);
  }

  function handlePressMove(event: PointerEvent) {
    if (!pressTimer || !pressTarget) return;
    if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > 10) cancelPressTimer();
  }

  function cancelPressTimer() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = undefined;
    pressTarget = null;
  }

  function handleRowKeydown(event: KeyboardEvent, target: ContextMenuTarget, anchor: HTMLElement) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = anchor.getBoundingClientRect();
    openContextMenu(target, Math.min(rect.left + 40, window.innerWidth - 220), rect.bottom + 4);
  }

  function openWikiAddMenu(event: MouseEvent, folderId: string | null) {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu(
      folderId ? { kind: "wiki-folder", id: folderId } : { kind: "wiki-root" },
      Math.max(8, rect.left - 160),
      rect.bottom + 4
    );
    contextMenuMoveOpen = false;
    // Focus lands on the menu; the add section is first for wiki targets.
  }

  function labelColorCss(color: string) {
    const preset = LABEL_COLORS.find((entry) => entry.key === color);
    if (preset) return preset.css;
    return /^#?[0-9a-fA-F]{6}$/.test(color) ? `#${color.replace("#", "")}` : "var(--text-faint)";
  }

  function labelFor(id?: string): LabelDef | undefined {
    return id ? labelById(projectLabelList, id) : undefined;
  }

  function closeLabelMenu(restoreFocus = false) {
    const trigger = labelMenuTrigger;
    openLabelMenu = null;
    labelMenuTrigger = undefined;
    if (restoreFocus) trigger?.focus();
  }

  function applyLabel(kind: LabelMenuTarget["kind"], id: string, labelId: string | undefined) {
    closeLabelMenu(true);
    if (kind === "chapter") {
      chapters = chapters.map((chapter) => chapter.id === id ? setLabel(chapter, labelId) : chapter);
      persistChapters();
      return;
    }
    documents = documents.map((doc) => doc.id === id ? setLabel(doc, labelId) : doc);
    persist();
  }

  function openLabelsDialog(trigger?: HTMLButtonElement) {
    showZenInterface();
    closeLabelMenu();
    labelDrafts = projectLabelList.map((label) => ({ ...label }));
    labelsDialogTrigger = trigger;
    if (labelsDialog && !labelsDialog.open) labelsDialog.showModal();
  }

  function restoreLabelsDialogFocus() {
    const trigger = labelsDialogTrigger;
    labelsDialogTrigger = undefined;
    if (!trigger) return;
    void tick().then(() => {
      if (trigger.isConnected) trigger.focus();
    });
  }

  function addLabelDraft() {
    const id = `label-${crypto.randomUUID()}`;
    labelDrafts = addLabel(labelDrafts, id, "New label", "grey");
    void tick().then(() => labelsDialog?.querySelector<HTMLInputElement>(`#label-name-${id}`)?.focus());
  }

  async function deleteLabelDraft(id: string) {
    const label = labelDrafts.find((entry) => entry.id === id);
    if (!label) return;
    const sceneCount = documents.filter((doc) => doc.labelId === id && !doc.trashed).length;
    const chapterCount = chapters.filter((chapter) => chapter.labelId === id && !chapter.trashed).length;
    const scenes = `${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"}`;
    const chaptersUsed = `${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}`;
    const confirmed = await confirmDestructiveAction(
      `Delete label “${label.name}”? ${scenes} and ${chaptersUsed} will lose it.`,
      { confirmLabel: "Delete label" }
    );
    if (!confirmed) return;
    labelDrafts = labelDrafts.filter((entry) => entry.id !== id);
  }

  async function resetLabelDrafts() {
    const confirmed = await confirmDestructiveAction(
      "Reset labels to the defaults? Custom labels are removed and the default names and colours are restored.",
      { confirmLabel: "Reset labels" }
    );
    if (!confirmed) return;
    labelDrafts = DEFAULT_LABELS.map((label) => ({ ...label }));
  }

  function saveLabels(event: SubmitEvent) {
    event.preventDefault();
    const nextLabels = labelDrafts.map((label) => ({ ...label, name: label.name.trim() }));
    if (nextLabels.some((label) => !label.name)) return;
    const keptIds = new Set(nextLabels.map((label) => label.id));
    for (const label of projectLabelList) {
      if (keptIds.has(label.id)) continue;
      const cleared = removeLabel(projectLabelList, label.id, documents, chapters);
      documents = cleared.documents as DocumentData[];
      chapters = cleared.chapters as ChapterData[];
    }
    projectLabelList = nextLabels;
    persistProjectCollection();
    labelsDialog.close();
  }

  onDestroy(() => {
    if (saveTimer) clearTimeout(saveTimer);
    if (aboutCopyTimer) clearTimeout(aboutCopyTimer);
    if (publishTimer) clearTimeout(publishTimer);
    if (richTextTypewriterFrame !== undefined) cancelAnimationFrame(richTextTypewriterFrame);
    if (markdownTypewriterFrame !== undefined) cancelAnimationFrame(markdownTypewriterFrame);
    if (richTextFadeFrame !== undefined) cancelAnimationFrame(richTextFadeFrame);
    persistNow();
    void flushVaultStorage();
    themeMediaQuery?.removeEventListener("change", handleSystemThemeChange);
  });

  onMount(() => {
    const unsubscribe = onVaultStorageError((error) => handleStorageError(error));
    const flush = () => {
      void flushVaultStorage().catch(() => undefined);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  // Browsers may evict site data under storage pressure. Ask for persistent
  // storage once the app is running; the vault itself remains in IndexedDB.
  onMount(() => {
    if (!navigator.storage?.persist) return;
    void navigator.storage
      .persisted()
      .then((persisted) => (persisted ? undefined : navigator.storage.persist()))
      .catch(() => undefined);
  });

  onMount(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { isTauri } = await import("@tauri-apps/api/core");
        if (!isTauri() || disposed) return;
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          event.preventDefault();
          try {
            await flushVaultStorage();
          } catch (error) {
            console.error("Could not flush the vault before closing.", error);
          } finally {
            await getCurrentWindow().destroy();
          }
        });
      } catch (error) {
        console.error("Could not register the window close handler.", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  });

  onMount(() => {
    window.addEventListener("resize", handleViewportResize);
    document.addEventListener("selectionchange", handleRichTextSelectionChange);
    // Capture phase so scrolling inside any pane hides the floating comment button.
    window.addEventListener("scroll", hideCommentSelectionPopover, true);
    // The proofreading popover re-anchors instead: typewriter mode scrolls on
    // every caret move, which would otherwise dismiss it instantly.
    window.addEventListener("scroll", repositionHarperPopover, true);
    return () => {
      window.removeEventListener("resize", handleViewportResize);
      document.removeEventListener("selectionchange", handleRichTextSelectionChange);
      window.removeEventListener("scroll", hideCommentSelectionPopover, true);
      window.removeEventListener("scroll", repositionHarperPopover, true);
      keepCommentPreview();
    };
  });

  onMount(() => {
    const savedSync = loadSyncState();
    if (savedSync) {
      syncProviderType = savedSync.provider;
      syncFolder = savedSync.folder;
      syncMode = savedSync.mode;
      googleDriveAccessToken = savedSync.googleDriveAccessToken;
      googleDriveRefreshToken = savedSync.googleDriveRefreshToken;
      googleDriveTokenExpiry = savedSync.googleDriveTokenExpiry;
      googleDriveEmail = savedSync.googleDriveEmail;
      googleDriveAuthenticated = Boolean(googleDriveAccessToken) && !isTokenExpired({
        accessToken: googleDriveAccessToken,
        refreshToken: googleDriveRefreshToken,
        expiry: googleDriveTokenExpiry,
        email: googleDriveEmail
      });
      // Refresh an expired access token in the background so the user does not
      // have to reconnect every hour.
      if (savedSync.provider === "googledrive"
        && !googleDriveAuthenticated
        && googleDriveRefreshToken) {
        void googleDriveAccessTokenForRequest().catch((error) => {
          console.error("Could not refresh the Google Drive session.", error);
          googleDriveAuthenticated = false;
          syncStatus = "Google Drive session expired. Please reconnect.";
        });
      }
    }
    void import("@tauri-apps/api/core")
      .then(({ isTauri }) => {
        desktopRuntime = isTauri();
        // On mobile (not desktop), default to Google Drive
        if (!isTauri()) {
          syncProviderType = "googledrive";
        }
      })
      .catch(() => {
        desktopRuntime = false;
        syncProviderType = "googledrive";
      });
    // Complete a Google Drive web authorization that redirected back to the
    // app (PWA flow). No-op unless the URL carries a response for a flow this
    // device started.
    void (async () => {
      try {
        const result = await completeWebRedirectIfPresent();
        if (!result) return;
        if (result.success && result.tokens) {
          applyGoogleDriveTokens(result.tokens);
          syncStatus = googleDriveReadyMessage();
        } else if (result.error) {
          syncStatus = result.error;
        }
      } catch (error) {
        console.error("Could not complete Google Drive authorization.", error);
      }
    })();
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
        const importEpubUnlisten = await listen("prosecraft:import-epub", triggerEpubImport);
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
        const shortcutsUnlisten = await listen("prosecraft:toggle-shortcuts", toggleShortcuts);
        if (disposed) {
          settingsUnlisten();
          projectSettingsUnlisten();
          newProjectUnlisten();
          importEpubUnlisten();
          switchProjectUnlisten();
          exportUnlisten();
          newSceneUnlisten();
          publishUnlisten();
          typewriterUnlisten();
          fadeParagraphsUnlisten();
          zenModeUnlisten();
          shortcutsUnlisten();
        } else {
          unlisten.push(
            settingsUnlisten,
            projectSettingsUnlisten,
            newProjectUnlisten,
            importEpubUnlisten,
            switchProjectUnlisten,
            exportUnlisten,
            newSceneUnlisten,
            publishUnlisten,
            typewriterUnlisten,
            fadeParagraphsUnlisten,
            zenModeUnlisten,
            shortcutsUnlisten
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

  onMount(() => {
    installedStandalone = isStandaloneDisplay();
    isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    try {
      installDismissed = localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
    } catch {
      installDismissed = false;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptEvent = event as BeforeInstallPromptEvent;
    };
    const onAppInstalled = () => {
      installPromptEvent = null;
      installedStandalone = true;
      installDismissed = false;
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  });

  onMount(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" || location.hostname.endsWith("localhost")) return;

    let disposed = false;
    let refreshing = false;
    const onControllerChange = () => {
      if (!updateApplying || refreshing) return;
      refreshing = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const watchInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          updateReady = true;
          updateDismissed = false;
        }
      });
    };

    const watchRegistration = (registration: ServiceWorkerRegistration) => {
      if (disposed) return;
      serviceWorkerRegistration = registration;
      if (registration.waiting && navigator.serviceWorker.controller) {
        updateReady = true;
      }
      registration.addEventListener("updatefound", () => {
        watchInstalling(registration.installing);
      });
      // The registration may already be installing before this page attached
      // its listeners (for example after a fast reload).
      watchInstalling(registration.installing);
    };

    navigator.serviceWorker
      .register(`${base}/service-worker.js`)
      .then(watchRegistration)
      .catch((error) => {
        console.error("Could not register the offline worker.", error);
      });

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !serviceWorkerRegistration) return;
      void serviceWorkerRegistration.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  // On Linux and macOS Tauri takes file drops over natively, so the webview can never
  // navigate to a dropped file. The paths arrive with a window position; images dropped
  // on the editor are read from disk and inserted there. (Windows keeps HTML5 drops,
  // see tauri.windows.conf.json.)
  function overEditorArea(x: number, y: number): boolean {
    const element = document.elementFromPoint(x, y);
    return Boolean(element && element.closest(".editor-column"));
  }

  async function handleNativeFileDrop(payload: DragDropEvent) {
    if (payload.type === "leave") {
      imageDropActive = false;
      return;
    }
    const scale = window.devicePixelRatio || 1;
    const clientX = payload.position.x / scale;
    const clientY = payload.position.y / scale;
    const over = workspaceView === "writing" && overEditorArea(clientX, clientY);
    if (payload.type !== "drop") {
      imageDropActive = over;
      return;
    }
    imageDropActive = false;
    if (!over) return;
    const range = markdownEditorMode ? null : editorRangeAtPoint({ clientX, clientY });
    const position = markdownEditorMode ? markdownImagePosition({ clientX, clientY }) : null;
    try {
      const files = await readImagePaths(payload.paths);
      if (files.length) await insertImageFiles(files, range, position);
      else imageInsertError = IMAGE_ERROR_MESSAGE;
    } catch (error) {
      console.error("Could not read the dropped file.", error);
      imageInsertError = "Could not read the dropped file.";
    }
  }

  onMount(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void (async () => {
      try {
        const { isTauri } = await import("@tauri-apps/api/core");
        if (!isTauri()) return;
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => void handleNativeFileDrop(event.payload));
        if (disposed) unlisten();
        else stop = unlisten;
      } catch (error) {
        console.error("Could not listen for file drops.", error);
      }
    })();
    return () => {
      disposed = true;
      stop?.();
    };
  });

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (pressTimer) handlePressMove(event);
      if (!openRowMenu && !openLabelMenu && !contextMenu) return;
      const target = event.target;
      if (target instanceof Element && target.closest(".ctx-menu, .ctx-add-wrap")) return;
      openRowMenu = null;
      closeLabelMenu();
      closeContextMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  });
</script>

<svelte:window
  onkeydown={handleKeydown}
  onkeyup={handleStoryboardPanKeyup}
  onblur={() => { boardSpacePan = false; }}
  onpointermove={updatePointerInteractions}
  onpointerup={finishPointerInteractions}
  onpointercancel={endChapterDrag}
  ondragend={resetTargetDrops}
  ondrop={resetTargetDrops}
/>

<svelte:head>
  <title>{title || "Untitled"} — ProseCraft</title>
  <meta name="description" content="A quiet place to find the words." />
</svelte:head>

<div class="app-shell" class:zen-hidden={zenInterfaceHidden}>
  {#if focusHintVisible}
    <p class="focus-hint" role="status">Focus mode · {modifierName}+Shift+Enter or Escape to leave</p>
  {/if}
  {#if mobileDrawerOpen}
    <button
      type="button"
      class="drawer-backdrop"
      tabindex="-1"
      aria-label="Close side panel"
      onclick={() => closeSidebarDrawers()}
    ></button>
  {/if}
  <aside
    class="sidebar"
    class:peek={!leftSidebarShown()}
    class:peek-open={!leftSidebarShown() && leftSidebarHovered}
    inert={zenInterfaceHidden || (!leftSidebarShown() && !leftSidebarHovered)}
    aria-label="Chapter and story navigation"
  >
    <div class="sidebar-mobile-head">
      <span class="nav-label">NAVIGATION</span>
      <button
        class="sidebar-mobile-close"
        type="button"
        aria-label="Close chapters sidebar"
        onclick={() => closeSidebarDrawers()}
      ><X size={18} aria-hidden="true" /></button>
    </div>
    <div class="project-identity">
      <select aria-label="Switch project" value={activeProjectId} onchange={(event) => switchProject((event.currentTarget as HTMLSelectElement).value)}>
        {#each liveProjects as project (project.id)}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
      <div class="project-identity-actions">
        <button aria-label="Project settings" title="Project settings" onclick={openProjectSettings}><Settings size={14} aria-hidden="true" /></button>
        <button
          aria-label="Move current project to Trash"
          title={liveProjects.length > 1 ? "Move project to Trash" : "The last project cannot be moved to Trash"}
          disabled={liveProjects.length <= 1}
          onclick={trashActiveProject}
        ><Trash2 size={14} aria-hidden="true" /></button>
        <button
          aria-label="Import EPUB"
          title="Import EPUB…"
          disabled={epubImportBusy}
          onclick={triggerEpubImport}
        ><Download size={14} aria-hidden="true" /></button>
        <button aria-label="Create project" title="Create project" onclick={createProject}><Plus size={14} aria-hidden="true" /></button>
      </div>
      <span class="author-name">{authorName ? `by ${authorName}` : "Add author name"}</span>
    </div>

    <div class="sidebar-tree">
      <div class="tree-heading">
        <span class="nav-label">CHAPTERS</span>
        <button class="tree-add" aria-label="Add chapter" title="Add chapter" onclick={() => createChapter()}><Plus size={14} aria-hidden="true" /></button>
      </div>
      <div class="label-filter">
        <label class="label-filter-label" for="label-filter-select">Filter scenes by label</label>
        <select id="label-filter-select" class="label-filter-select" bind:value={labelFilter}>
          <option value="">All labels</option>
          {#each projectLabelList as label (label.id)}
            <option value={label.id}>{label.name}</option>
          {/each}
        </select>
        {#if filterLabelDef}
          <button
            class="label-filter-chip"
            type="button"
            aria-label="Clear label filter: {filterLabelDef.name}"
            onclick={() => (labelFilter = "")}
          >
            <span class="label-filter-dot" style={`--label-color: ${labelColorCss(filterLabelDef.color)}`} aria-hidden="true"></span>
            <span>Filter: {filterLabelDef.name} · clear</span>
          </button>
        {/if}
      </div>
      <div class="chapter-list">
        {#each visibleChapters as chapter (chapter.id)}
          {@const chapterLabelDef = labelFor(chapter.labelId)}
          <div
            class="chapter-group"
            class:dragging={draggedChapterId === chapter.id}
            class:drop-before={dropTargetChapterId === chapter.id && !dropAfterChapter}
            class:drop-after={dropTargetChapterId === chapter.id && dropAfterChapter}
            role="group"
            aria-label="{chapterLabel(chapter)} chapter"
            data-chapter-id={chapter.id}
          >
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
            <div
              class="chapter-row"
              class:scene-drop-target={sceneDropChapterId === chapter.id}
              oncontextmenu={(event) => handleRowContextMenu(event, { kind: "chapter", id: chapter.id })}
              onpointerdown={(event) => handleRowPointerDown(event, { kind: "chapter", id: chapter.id })}
              onpointermove={handlePressMove}
              onpointerup={cancelPressTimer}
              onpointercancel={cancelPressTimer}
              onkeydown={(event) => handleRowKeydown(event, { kind: "chapter", id: chapter.id }, event.currentTarget as HTMLElement)}
              ondragover={(event) => handleChapterSceneDragOver(event, chapter.id)}
              ondragleave={(event) => handleChapterSceneDragLeave(event, chapter.id)}
              ondrop={(event) => handleChapterSceneDrop(event, chapter.id)}
            >
              <button
                class="chapter-drag"
                aria-label="Drag to reorder {chapterLabel(chapter)}"
                title="Drag to reorder"
                onpointerdown={(event) => startChapterDrag(event, chapter.id)}
              ><GripVertical size={14} aria-hidden="true" /></button>
              {#if editingChapterId === chapter.id}
                  <input
                    bind:this={chapterNameInput}
                    class="chapter-name-input"
                    aria-label="Rename {chapterLabel(chapter)}"
                    autocapitalize="sentences"
                    enterkeyhint="done"
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
                <button class="chapter-toggle" aria-label="Open {chapterLabel(chapter)}" aria-expanded={isChapterOpen(chapter.id)} onclick={() => openChapter(chapter.id)}>
                  <span class:rotated={isChapterOpen(chapter.id)} class="chevron"><ChevronRight size={14} color="var(--text-faint)" aria-hidden="true" /></span>
                  <span class="folder-icon"><Folder size={15} strokeWidth={1.5} color="var(--text-muted)" aria-hidden="true" /></span>
                  <span class="tree-name">{chapterLabel(chapter)}</span>
                </button>
              {/if}
              <div class="chapter-actions">
                <button class="row-add" aria-label="Add scene to {chapterLabel(chapter)}" title="Add scene" onclick={() => createScene(chapter.id)}><Plus size={13} aria-hidden="true" /></button>
                <button
                  class="label-trigger"
                  class:has-label={chapterLabelDef !== undefined}
                  aria-label="Label for {chapterLabel(chapter)}: {chapterLabelDef?.name ?? 'none'}. Activate for label options."
                  title={chapterLabelDef ? `Label: ${chapterLabelDef.name}` : "Set label"}
                  onclick={(event) => { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); openContextMenu({ kind: "chapter", id: chapter.id }, Math.max(8, rect.left - 170), rect.bottom + 4); }}
                >
                  <span class="label-dot" style={chapterLabelDef ? `--label-color: ${labelColorCss(chapterLabelDef.color)}` : undefined}></span>
                </button>
              </div>
            </div>
            {#if isChapterOpen(chapter.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="scene-list"
                class:scene-drop-target={sceneDropChapterId === chapter.id}
                ondragover={(event) => handleChapterSceneDragOver(event, chapter.id)}
                ondragleave={(event) => handleChapterSceneDragLeave(event, chapter.id)}
                ondrop={(event) => handleChapterSceneDrop(event, chapter.id)}
              >
                {#each documents.filter((doc) => doc.chapterId === chapter.id && !doc.trashed && (!filterLabelDef || doc.labelId === filterLabelDef.id)) as doc (doc.id)}
                  {@const sceneLabel = labelFor(doc.labelId)}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
                  <div
                    class:current={doc.id === activeDocumentId}
                    class="document-row scene-row"
                    class:dragging={draggedSceneId === doc.id}
                    class:drop-before={sceneDropTarget?.id === doc.id && !sceneDropTarget.after}
                    class:drop-after={sceneDropTarget?.id === doc.id && sceneDropTarget.after}
                    role="group"
                    aria-label={doc.title || "Untitled scene"}
                    draggable="true"
                    ondragstart={(event) => startSceneDrag(event, doc.id)}
                    ondragover={(event) => handleSceneDragOver(event, doc.id)}
                    ondragleave={(event) => handleSceneDragLeave(event, doc.id)}
                    ondrop={(event) => handleSceneDrop(event, doc.id)}
                    oncontextmenu={(event) => handleRowContextMenu(event, { kind: "scene", id: doc.id })}
                    onpointerdown={(event) => handleRowPointerDown(event, { kind: "scene", id: doc.id })}
                    onpointermove={handlePressMove}
                    onpointerup={cancelPressTimer}
                    onpointercancel={cancelPressTimer}
                    onkeydown={(event) => handleRowKeydown(event, { kind: "scene", id: doc.id }, event.currentTarget as HTMLElement)}
                  >
                    {#if editingSceneId === doc.id}
                      <input
                        bind:this={sceneNameInput}
                        class="chapter-name-input"
                        aria-label="Rename {doc.title || 'Untitled scene'}"
                        autocapitalize="sentences"
                        enterkeyhint="done"
                        bind:value={sceneTitleDraft}
                        maxlength="120"
                        onblur={() => saveSceneRename(doc.id)}
                        onkeydown={(event) => {
                          if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                          if (event.key === "Escape") cancelSceneRename();
                        }}
                        onpointerdown={(event) => event.stopPropagation()}
                        ondragstart={(event) => { event.preventDefault(); event.stopPropagation(); }}
                      />
                    {:else}
                      <button class="document-select" aria-current={doc.id === activeDocumentId ? "page" : undefined} onclick={(event) => { if (openRowBeside(event, docTarget(doc.id))) return; openSidebarDocument(doc.id); }}>
                        <span class="scene-mark">¶</span>
                        <span class="tree-name">{doc.title || "Untitled scene"}</span>
                      </button>
                    {/if}
                    <button
                      class="label-trigger"
                      class:has-label={sceneLabel !== undefined}
                      aria-label="Label for {doc.title || 'Untitled scene'}: {sceneLabel?.name ?? 'none'}. Activate for label options."
                      title={sceneLabel ? `Label: ${sceneLabel.name}` : "Set label"}
                      onclick={(event) => { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); openContextMenu({ kind: "scene", id: doc.id }, Math.max(8, rect.left - 170), rect.bottom + 4); }}
                    >
                      <span class="label-dot" style={sceneLabel ? `--label-color: ${labelColorCss(sceneLabel.color)}` : undefined}></span>
                    </button>
                  </div>
                {/each}
                {#if !documents.some((doc) => doc.chapterId === chapter.id && !doc.trashed && (!filterLabelDef || doc.labelId === filterLabelDef.id))}
                  <span class="empty-tree">No scenes yet</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
        {#if visibleChapters.length === 0}
          {#if filterLabelDef}
            <span class="empty-tree">No scenes with this label</span>
          {:else}
            <button class="empty-action" onclick={() => createChapter()}><Plus size={14} aria-hidden="true" /> Add your first chapter</button>
          {/if}
        {/if}
      </div>

      <div class="tree-divider"></div>
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
      <div
        class="tree-heading spaces-heading"
        oncontextmenu={(event) => handleRowContextMenu(event, { kind: "wiki-root" })}
        onpointerdown={(event) => handleRowPointerDown(event, { kind: "wiki-root" })}
        onpointermove={handlePressMove}
        onpointerup={cancelPressTimer}
        onpointercancel={cancelPressTimer}
        onkeydown={(event) => handleRowKeydown(event, { kind: "wiki-root" }, event.currentTarget as HTMLElement)}
      ><span class="nav-label">WIKI</span><button class="tree-add" aria-label="Add to Wiki" title="Add to Wiki" aria-haspopup="menu" onclick={(event) => openWikiAddMenu(event, null)}><Plus size={14} aria-hidden="true" /></button></div>
      <div class="space-group">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="space-items wiki-items"
            class:wiki-drop-root={wikiDropRoot}
            role="group"
            aria-label="Wiki root drop zone"
            ondragover={handleWikiRootDragOver}
            ondragleave={handleWikiRootDragLeave}
            ondrop={handleWikiRootDrop}
          >
            {#each researchTreeItems as item (item.kind === "folder"
              ? `folder-${item.folder.id}`
              : item.kind === "document"
                ? `document-${item.document.id}`
                : `${item.kind}-${item.item.id}`)}
              {#if item.kind === "folder"}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
                <div
                  class="note-folder-row research-folder-row"
                  class:dragging={draggedWiki?.id === item.folder.id}
                  class:drop-before={wikiDropTarget?.key === wikiRowKey("folder", item.folder.id) && !wikiDropTarget.after}
                  class:drop-after={wikiDropTarget?.key === wikiRowKey("folder", item.folder.id) && wikiDropTarget.after}
                  class:wiki-drop-target={wikiDropFolderId === item.folder.id}
                  style={`padding-left: ${item.depth * 14 + 2}px`}
                  draggable="true"
                  ondragstart={(event) => startWikiDrag(event, "folder", item.folder.id)}
                  ondragover={(event) => handleWikiRowDragOver(event, "folder", item.folder.id)}
                  ondragleave={(event) => handleWikiRowDragLeave(event, "folder", item.folder.id)}
                  ondrop={(event) => handleWikiRowDrop(event, "folder", item.folder.id)}
                  oncontextmenu={(event) => handleRowContextMenu(event, { kind: "wiki-folder", id: item.folder.id })}
                  onpointerdown={(event) => handleRowPointerDown(event, { kind: "wiki-folder", id: item.folder.id })}
                  onpointermove={handlePressMove}
                  onpointerup={cancelPressTimer}
                  onpointercancel={cancelPressTimer}
                  onkeydown={(event) => handleRowKeydown(event, { kind: "wiki-folder", id: item.folder.id }, event.currentTarget as HTMLElement)}
                >
                  {#if editingResearchFolderId === item.folder.id}
                    <input
                      bind:this={researchFolderInput}
                      class="chapter-name-input note-folder-name-input"
                      aria-label="Rename folder {item.folder.title}"
                      autocapitalize="sentences"
                      enterkeyhint="done"
                      bind:value={researchFolderNameDraft}
                      maxlength="60"
                      onblur={() => saveResearchFolderRename(item.folder.id)}
                      onkeydown={(event) => {
                        if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelResearchFolderRename();
                        }
                      }}
                      onpointerdown={(event) => event.stopPropagation()}
                    />
                  {:else}
                    <button
                      class="note-folder-toggle"
                      aria-expanded={expandedResearchFolders[item.folder.id] !== false}
                      onclick={() => toggleResearchFolder(item.folder.id)}
                    >
                      <span class:rotated={expandedResearchFolders[item.folder.id] !== false} class="chevron"><ChevronRight size={14} color="var(--text-faint)" aria-hidden="true" /></span>
                      <span class="note-folder-icon"><Folder size={13} color="var(--text-muted)" aria-hidden="true" /></span>
                      <span class="tree-name">{item.folder.title}</span>
                    </button>
                  {/if}
                  <div class="note-folder-actions">
                    <button class="row-add research-add" aria-label="Add to {item.folder.title}" title="Add to folder" aria-haspopup="menu" onclick={(event) => openWikiAddMenu(event, item.folder.id)}><Plus size={13} aria-hidden="true" /></button>
                  </div>
                </div>
              {:else if item.kind === "document"}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
                <div
                  class:current={item.document.id === activeDocumentId}
                  class="document-row note-document-row"
                  class:dragging={draggedWiki?.id === item.document.id}
                  class:drop-before={wikiDropTarget?.key === wikiRowKey("document", item.document.id) && !wikiDropTarget.after}
                  class:drop-after={wikiDropTarget?.key === wikiRowKey("document", item.document.id) && wikiDropTarget.after}
                  role="group"
                  aria-label={item.document.title || "wiki page"}
                  style={`padding-left: ${item.depth * 14 + 2}px`}
                  draggable="true"
                  ondragstart={(event) => { startTargetDrag(event, docTarget(item.document.id)); startWikiDrag(event, "document", item.document.id); }}
                  ondragover={(event) => handleWikiRowDragOver(event, "document", item.document.id)}
                  ondragleave={(event) => handleWikiRowDragLeave(event, "document", item.document.id)}
                  ondrop={(event) => handleWikiRowDrop(event, "document", item.document.id)}
                  oncontextmenu={(event) => handleRowContextMenu(event, { kind: "wiki-doc", id: item.document.id })}
                  onpointerdown={(event) => handleRowPointerDown(event, { kind: "wiki-doc", id: item.document.id })}
                  onpointermove={handlePressMove}
                  onpointerup={cancelPressTimer}
                  onpointercancel={cancelPressTimer}
                  onkeydown={(event) => handleRowKeydown(event, { kind: "wiki-doc", id: item.document.id }, event.currentTarget as HTMLElement)}
                >
                  <button class="document-select" aria-current={item.document.id === activeDocumentId ? "page" : undefined} onclick={(event) => { if (openRowBeside(event, docTarget(item.document.id))) return; openSidebarDocument(item.document.id); }}>
                    <span class="scene-mark">¶</span>
                    <span class="tree-name">{item.document.title || "Untitled"}</span>
                  </button>
                </div>
              {:else if item.kind === "file"}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
                <div
                  class="document-row note-document-row research-item-row"
                  class:dragging={draggedWiki?.id === item.item.id}
                  class:drop-before={wikiDropTarget?.key === wikiRowKey("file", item.item.id) && !wikiDropTarget.after}
                  class:drop-after={wikiDropTarget?.key === wikiRowKey("file", item.item.id) && wikiDropTarget.after}
                  role="group"
                  aria-label={researchItemTitle(item.item)}
                  style={`padding-left: ${item.depth * 14 + 2}px`}
                  draggable="true"
                  ondragstart={(event) => { startTargetDrag(event, fileTarget(item.item.id)); startWikiDrag(event, "file", item.item.id); }}
                  ondragover={(event) => handleWikiRowDragOver(event, "file", item.item.id)}
                  ondragleave={(event) => handleWikiRowDragLeave(event, "file", item.item.id)}
                  ondrop={(event) => handleWikiRowDrop(event, "file", item.item.id)}
                  oncontextmenu={(event) => handleRowContextMenu(event, { kind: "wiki-file", id: item.item.id })}
                  onpointerdown={(event) => handleRowPointerDown(event, { kind: "wiki-file", id: item.item.id })}
                  onpointermove={handlePressMove}
                  onpointerup={cancelPressTimer}
                  onpointercancel={cancelPressTimer}
                  onkeydown={(event) => handleRowKeydown(event, { kind: "wiki-file", id: item.item.id }, event.currentTarget as HTMLElement)}
                >
                  <button
                    class="document-select"
                    title={`${researchItemTitle(item.item)} — ${researchItemMeta(item.item)}`}
                    onclick={(event) => { if (openRowBeside(event, fileTarget(item.item.id))) return; openResearchFile(item.item); }}
                  >
                    {#if item.item.mimeType === "application/pdf"}
                      <span class="scene-mark research-file-mark">PDF</span>
                    {:else if item.item.mimeType.startsWith("image/")}
                      <span class="scene-mark research-file-mark"><ImageIcon size={14} aria-hidden="true" /></span>
                    {:else}
                      <span class="scene-mark research-file-mark"><FileText size={14} aria-hidden="true" /></span>
                    {/if}
                    <span class="tree-name">{researchItemTitle(item.item)}</span>
                  </button>
                </div>
              {:else}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
                <div
                  class="document-row note-document-row research-item-row"
                  class:dragging={draggedWiki?.id === item.item.id}
                  class:drop-before={wikiDropTarget?.key === wikiRowKey("link", item.item.id) && !wikiDropTarget.after}
                  class:drop-after={wikiDropTarget?.key === wikiRowKey("link", item.item.id) && wikiDropTarget.after}
                  style={`padding-left: ${item.depth * 14 + 2}px`}
                  draggable="true"
                  ondragstart={(event) => startWikiDrag(event, "link", item.item.id)}
                  ondragover={(event) => handleWikiRowDragOver(event, "link", item.item.id)}
                  ondragleave={(event) => handleWikiRowDragLeave(event, "link", item.item.id)}
                  ondrop={(event) => handleWikiRowDrop(event, "link", item.item.id)}
                  oncontextmenu={(event) => handleRowContextMenu(event, { kind: "wiki-link", id: item.item.id })}
                  onpointerdown={(event) => handleRowPointerDown(event, { kind: "wiki-link", id: item.item.id })}
                  onpointermove={handlePressMove}
                  onpointerup={cancelPressTimer}
                  onpointercancel={cancelPressTimer}
                  onkeydown={(event) => handleRowKeydown(event, { kind: "wiki-link", id: item.item.id }, event.currentTarget as HTMLElement)}
                >
                  <button
                    class="document-select"
                    title={researchItemMeta(item.item)}
                    onclick={() => openResearchLink(item.item)}
                  >
                    <span class="scene-mark research-link-mark"><ExternalLink size={14} aria-hidden="true" /></span>
                    <span class="tree-name">{researchItemTitle(item.item)}</span>
                  </button>
                </div>
              {/if}
            {/each}
            {#if researchEmpty}
              <span class="empty-tree">Add a page, file, or link</span>
            {/if}
            {#if researchStatus}
              <p class="research-status" role="status">{researchStatus}</p>
            {/if}
          </div>
      </div>

      <div class="tree-divider"></div>
      <div class="space-group trash-group">
        <div class="space-heading">
          <button class="space-toggle" aria-expanded={expandedSpaces.Trash} onclick={() => expandedSpaces.Trash = !expandedSpaces.Trash}>
            <span class:rotated={expandedSpaces.Trash} class="chevron"><ChevronRight size={14} color="var(--text-faint)" aria-hidden="true" /></span>
            <span class="space-icon"><Trash2 size={15} strokeWidth={1.5} color="var(--text-muted)" aria-hidden="true" /></span>
            <span class="tree-name">Trash</span>
            <span class="trash-count">{trashCount || ""}</span>
          </button>
        </div>
        {#if expandedSpaces.Trash}
          <div class="space-items">
            {#each chapters.filter((chapter) => chapter.trashed) as chapter (chapter.id)}
              <div class="document-row">
                <span class="document-select trashed-document">
                  <span class="scene-mark"><Folder size={14} aria-hidden="true" /></span>
                  <span class="tree-name">{chapterLabel(chapter)}</span>
                </span>
                <button class="row-action restore-action" aria-label="Restore {chapterLabel(chapter)} and its scenes" title="Restore chapter and scenes" onclick={() => restoreChapter(chapter.id)}><RotateCcw size={13} aria-hidden="true" /></button>
                <button class="row-action delete-action" aria-label="Permanently delete {chapterLabel(chapter)} and its scenes" title="Delete chapter and scenes permanently" onclick={() => permanentlyDeleteChapter(chapter.id)}><Trash2 size={13} aria-hidden="true" /></button>
              </div>
            {/each}
            {#each projects.filter((project) => project.trashed) as project (project.id)}
              <div class="document-row">
                <span class="document-select trashed-document">
                  <span class="scene-mark"><BookOpen size={14} aria-hidden="true" /></span>
                  <span class="tree-name">{project.name}</span>
                </span>
                <button class="row-action restore-action" aria-label="Restore project {project.name}" title="Restore project" onclick={() => restoreProject(project.id)}><RotateCcw size={13} aria-hidden="true" /></button>
                <button class="row-action delete-action" aria-label="Permanently delete project {project.name}" title="Delete project permanently" onclick={() => permanentlyDeleteProject(project.id)}><Trash2 size={13} aria-hidden="true" /></button>
              </div>
            {/each}
            {#each documents.filter((doc) => doc.trashed && !chapters.some((chapter) => chapter.id === doc.chapterId && chapter.trashed)) as doc (doc.id)}
              <div class="document-row">
                <span class="document-select trashed-document">
                  <span class="scene-mark">¶</span>
                  <span class="tree-name">{doc.title || "Untitled"}</span>
                </span>
                <button class="row-action restore-action" aria-label="Restore {doc.title}" title="Restore" onclick={() => restoreDocument(doc.id)}><RotateCcw size={13} aria-hidden="true" /></button>
                <button class="row-action delete-action" aria-label="Permanently delete {doc.title}" title="Delete permanently" onclick={() => permanentlyDelete(doc.id)}><Trash2 size={13} aria-hidden="true" /></button>
              </div>
            {/each}
            {#if trashCount === 0}
              <span class="empty-tree">Trash is empty</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    {#if contextMenu}
      {@const ctx = contextMenu.target}
      {@const ctxChapter = ctx.kind === "chapter" ? chapters.find((c) => c.id === ctx.id) : undefined}
      {@const ctxScene = ctx.kind === "scene" ? documents.find((d) => d.id === ctx.id) : undefined}
      {@const ctxFolder = ctx.kind === "wiki-folder" ? researchFolders.find((f) => f.id === ctx.id) : undefined}
      {@const ctxDoc = ctx.kind === "wiki-doc" ? documents.find((d) => d.id === ctx.id) : undefined}
      {@const ctxFile = ctx.kind === "wiki-file" ? researchItems.find((i) => i.id === ctx.id) : undefined}
      {@const ctxLink = ctx.kind === "wiki-link" ? researchItems.find((i) => i.id === ctx.id) : undefined}
      {@const ctxChapterIndex = ctxChapter ? liveChapters.findIndex((c) => c.id === ctxChapter.id) : -1}
      <div
        class="ctx-menu"
        role="menu"
        tabindex="-1"
        aria-label="Row actions"
        bind:this={contextMenuElement}
        style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
        onpointerdown={(event) => event.stopPropagation()}
        oncontextmenu={(event) => event.preventDefault()}
      >
        {#if ctx.kind === "chapter" && ctxChapter}
          <div class="ctx-section" role="group" aria-label="Labels">
            {#each projectLabelList as label (label.id)}
              <button type="button" role="menuitemradio" aria-checked={ctxChapter.labelId === label.id} onclick={() => { applyLabel("chapter", ctxChapter.id, label.id); closeContextMenu(); }}>
                <span class="label-dot" style={`--label-color: ${labelColorCss(label.color)}`}></span>
                <span class="label-menu-name">{label.name}</span>
              </button>
            {/each}
            <button type="button" role="menuitemradio" aria-checked={!ctxChapter.labelId} class="label-menu-none" onclick={() => { applyLabel("chapter", ctxChapter.id, undefined); closeContextMenu(); }}>No label</button>
          </div>
          <div class="ctx-divider"></div>
          <button type="button" role="menuitem" disabled={!chapterFirstScene(ctxChapter.id)} onclick={() => { const scene = chapterFirstScene(ctxChapter.id); closeContextMenu(); if (scene) openBesideTarget(docTarget(scene.id)); }}>Open beside</button>
          <button type="button" role="menuitem" onclick={() => { startChapterRename(ctxChapter); closeContextMenu(); }}>Rename chapter</button>
          <button type="button" role="menuitem" disabled={ctxChapterIndex <= 0} onclick={() => { moveChapter(ctxChapter.id, -1); closeContextMenu(); }}>Move up</button>
          <button type="button" role="menuitem" disabled={ctxChapterIndex < 0 || ctxChapterIndex >= liveChapters.length - 1} onclick={() => { moveChapter(ctxChapter.id, 1); closeContextMenu(); }}>Move down</button>
          <button type="button" role="menuitem" onclick={() => { createScene(ctxChapter.id); closeContextMenu(); }}>Add scene</button>
          <button type="button" role="menuitem" class="danger" onclick={() => { trashChapter(ctxChapter.id); closeContextMenu(); }}>Move to Trash</button>
          <div class="ctx-divider"></div>
          <button type="button" role="menuitem" onclick={() => { openLabelsDialog(); closeContextMenu(); }}>Manage labels…</button>
        {:else if ctx.kind === "scene" && ctxScene}
          <div class="ctx-section" role="group" aria-label="Labels">
            {#each projectLabelList as label (label.id)}
              <button type="button" role="menuitemradio" aria-checked={ctxScene.labelId === label.id} onclick={() => { applyLabel("scene", ctxScene.id, label.id); closeContextMenu(); }}>
                <span class="label-dot" style={`--label-color: ${labelColorCss(label.color)}`}></span>
                <span class="label-menu-name">{label.name}</span>
              </button>
            {/each}
            <button type="button" role="menuitemradio" aria-checked={!ctxScene.labelId} class="label-menu-none" onclick={() => { applyLabel("scene", ctxScene.id, undefined); closeContextMenu(); }}>No label</button>
          </div>
          <div class="ctx-divider"></div>
          <button type="button" role="menuitem" onclick={() => { openSidebarDocument(ctxScene.id); closeContextMenu(); }}>Open scene</button>
          <button type="button" role="menuitem" onclick={() => { openBesideTarget(docTarget(ctxScene.id)); closeContextMenu(); }}>Open beside</button>
          <button type="button" role="menuitem" onclick={() => { const scene = documents.find((doc) => doc.id === ctxScene.id); closeContextMenu(); if (scene) startSceneRename(scene); }}>Rename scene</button>
          {@const ctxSceneList = ctxScene.chapterId ? scenesInChapter(ctxScene.chapterId) : []}
          {@const ctxSceneIndex = ctxSceneList.findIndex((entry) => entry.id === ctxScene.id)}
          <button type="button" role="menuitem" disabled={ctxSceneIndex <= 0} onclick={() => { moveScene(ctxScene.id, -1); closeContextMenu(); }}>Move up</button>
          <button type="button" role="menuitem" disabled={ctxSceneIndex < 0 || ctxSceneIndex >= ctxSceneList.length - 1} onclick={() => { moveScene(ctxScene.id, 1); closeContextMenu(); }}>Move down</button>
          {#if liveChapters.length > 1}
            <button type="button" role="menuitem" aria-expanded={contextMenuMoveOpen} onclick={() => (contextMenuMoveOpen = !contextMenuMoveOpen)}>Move to chapter…</button>
            {#if contextMenuMoveOpen}
              <div class="ctx-subsection" role="group" aria-label="Move to chapter">
                {#each liveChapters as targetChapter (targetChapter.id)}
                  <button type="button" role="menuitemradio" aria-checked={ctxScene.chapterId === targetChapter.id} onclick={() => { moveSceneToChapterEnd(ctxScene.id, targetChapter.id); closeContextMenu(); }}>{chapterLabel(targetChapter)}</button>
                {/each}
              </div>
            {/if}
          {/if}
          <button type="button" role="menuitem" class="danger" onclick={() => { moveToTrash(ctxScene.id); closeContextMenu(); }}>Move to Trash</button>
          <div class="ctx-divider"></div>
          <button type="button" role="menuitem" onclick={() => { openLabelsDialog(); closeContextMenu(); }}>Manage labels…</button>
        {:else if ctx.kind === "wiki-root"}
          <button type="button" role="menuitem" onclick={() => { createSpaceDocument("Wiki"); closeContextMenu(); }}>Add page</button>
          <button type="button" role="menuitem" onclick={() => { createResearchFolder(); closeContextMenu(); }}>Add folder</button>
          <button type="button" role="menuitem" disabled={researchBusy} onclick={() => { addResearchFiles(); closeContextMenu(); }}>Add file</button>
          <button type="button" role="menuitem" onclick={() => { openResearchLinkDialog(); closeContextMenu(); }}>Add web link</button>
        {:else if ctx.kind === "wiki-folder" && ctxFolder}
          {@const folderSiblings = researchFolders.filter((entry) => entry.parentId === ctxFolder.parentId)}
          {@const folderIndex = folderSiblings.findIndex((entry) => entry.id === ctxFolder.id)}
          <button type="button" role="menuitem" onclick={() => { createSpaceDocument("Wiki", ctxFolder.id); closeContextMenu(); }}>Add page</button>
          <button type="button" role="menuitem" onclick={() => { createResearchFolder(ctxFolder.id); closeContextMenu(); }}>Add subfolder</button>
          <button type="button" role="menuitem" disabled={researchBusy} onclick={() => { addResearchFiles(ctxFolder.id); closeContextMenu(); }}>Add file</button>
          <button type="button" role="menuitem" onclick={() => { openResearchLinkDialog(ctxFolder.id); closeContextMenu(); }}>Add web link</button>
          <div class="ctx-divider"></div>
          <button type="button" role="menuitem" onclick={() => { startResearchFolderRename(ctxFolder); closeContextMenu(); }}>Rename folder</button>
          <button type="button" role="menuitem" disabled={folderIndex <= 0} onclick={() => { moveWikiFolder(ctxFolder.id, -1); closeContextMenu(); }}>Move up</button>
          <button type="button" role="menuitem" disabled={folderIndex < 0 || folderIndex >= folderSiblings.length - 1} onclick={() => { moveWikiFolder(ctxFolder.id, 1); closeContextMenu(); }}>Move down</button>
          <button type="button" role="menuitem" disabled={ctxFolder.parentId === null} onclick={() => { moveWikiFolderToTop(ctxFolder.id); closeContextMenu(); }}>Move to top level</button>
          <button type="button" role="menuitem" class="danger" onclick={() => { removeResearchFolder(ctxFolder); closeContextMenu(); }}>Remove folder</button>
        {:else if ctx.kind === "wiki-doc" && ctxDoc}
          <button type="button" role="menuitem" onclick={() => { openSidebarDocument(ctxDoc.id); closeContextMenu(); }}>Open page</button>
          <button type="button" role="menuitem" onclick={() => { openBesideTarget(docTarget(ctxDoc.id)); closeContextMenu(); }}>Open beside</button>
          {#if researchFolderChoices.length > 0}
            <button type="button" role="menuitem" aria-expanded={contextMenuMoveOpen} onclick={() => (contextMenuMoveOpen = !contextMenuMoveOpen)}>Move to folder…</button>
            {#if contextMenuMoveOpen}
              <div class="ctx-subsection" role="group" aria-label="Move to folder">
                <button type="button" role="menuitemradio" aria-checked={!ctxDoc.folderId} onclick={() => { moveResearchDocument(ctxDoc.id, ""); closeContextMenu(); }}>Unfiled</button>
                {#each researchFolderChoices as choice (choice.folder.id)}
                  <button type="button" role="menuitemradio" aria-checked={ctxDoc.folderId === choice.folder.id} onclick={() => { moveResearchDocument(ctxDoc.id, choice.folder.id); closeContextMenu(); }}><span style={`padding-left: ${choice.depth * 12}px`}>{choice.folder.title}</span></button>
                {/each}
              </div>
            {/if}
          {/if}
          <button type="button" role="menuitem" class="danger" onclick={() => { moveToTrash(ctxDoc.id); closeContextMenu(); }}>Move to Trash</button>
        {:else if ctx.kind === "wiki-file" && ctxFile}
          <button type="button" role="menuitem" onclick={(event) => { const file = ctxFile as ResearchFile; const beside = openRowBeside(event as unknown as MouseEvent, fileTarget(file.id)); closeContextMenu(); if (!beside) openResearchFile(file); }}>Open file</button>
          <button type="button" role="menuitem" onclick={() => { openBesideTarget(fileTarget(ctxFile.id)); closeContextMenu(); }}>Open beside</button>
          {#if desktopRuntime}
            <button type="button" role="menuitem" onclick={() => { revealResearchFile(ctxFile as ResearchFile); closeContextMenu(); }}>Reveal in folder</button>
          {/if}
          {#if researchFolderChoices.length > 0}
            <button type="button" role="menuitem" aria-expanded={contextMenuMoveOpen} onclick={() => (contextMenuMoveOpen = !contextMenuMoveOpen)}>Move to folder…</button>
            {#if contextMenuMoveOpen}
              <div class="ctx-subsection" role="group" aria-label="Move to folder">
                <button type="button" role="menuitemradio" aria-checked={!ctxFile.folderId} onclick={() => { moveResearchItem(ctxFile.id, ""); closeContextMenu(); }}>Unfiled</button>
                {#each researchFolderChoices as choice (choice.folder.id)}
                  <button type="button" role="menuitemradio" aria-checked={ctxFile.folderId === choice.folder.id} onclick={() => { moveResearchItem(ctxFile.id, choice.folder.id); closeContextMenu(); }}><span style={`padding-left: ${choice.depth * 12}px`}>{choice.folder.title}</span></button>
                {/each}
              </div>
            {/if}
          {/if}
          <button type="button" role="menuitem" class="danger" onclick={() => { removeResearchItem(ctxFile as ResearchItem); closeContextMenu(); }}>Remove and delete file</button>
        {:else if ctx.kind === "wiki-link" && ctxLink}
          <button type="button" role="menuitem" onclick={() => { openResearchLink(ctxLink as ResearchLink); closeContextMenu(); }}>Open link</button>
          {#if researchFolderChoices.length > 0}
            <button type="button" role="menuitem" aria-expanded={contextMenuMoveOpen} onclick={() => (contextMenuMoveOpen = !contextMenuMoveOpen)}>Move to folder…</button>
            {#if contextMenuMoveOpen}
              <div class="ctx-subsection" role="group" aria-label="Move to folder">
                <button type="button" role="menuitemradio" aria-checked={!ctxLink.folderId} onclick={() => { moveResearchItem(ctxLink.id, ""); closeContextMenu(); }}>Unfiled</button>
                {#each researchFolderChoices as choice (choice.folder.id)}
                  <button type="button" role="menuitemradio" aria-checked={ctxLink.folderId === choice.folder.id} onclick={() => { moveResearchItem(ctxLink.id, choice.folder.id); closeContextMenu(); }}><span style={`padding-left: ${choice.depth * 12}px`}>{choice.folder.title}</span></button>
                {/each}
              </div>
            {/if}
          {/if}
          <button type="button" role="menuitem" class="danger" onclick={() => { removeResearchItem(ctxLink as ResearchItem); closeContextMenu(); }}>Remove link</button>
        {/if}
      </div>
    {/if}

    <div class="sidebar-footer">
      <button
        class="settings-button"
        aria-label="Settings"
        onclick={openSettings}
      >
        <Settings size={15} aria-hidden="true" />
        <span>Settings</span>
      </button>
      <div class="sync-status"><span class="sync-dot"></span> Your writing is private<button type="button" class="shortcuts-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onclick={toggleShortcuts}><Keyboard size={13} aria-hidden="true" /></button><button type="button" class="version-button" aria-label="About {APP_NAME}" onclick={openAbout}>v{APP_VERSION}</button></div>
    </div>
  </aside>

  <main class="main-panel" class:left-hidden={!leftSidebarShown()} class:right-hidden={!rightSidebarShown()} inert={mobileDrawerOpen}>
    {#if showUpdateBanner}
      <div class="app-banner" role="status">
        <span class="app-banner-message"><strong>A new version is ready.</strong> Reload when you reach a stopping point.</span>
        <span class="app-banner-actions">
          <button type="button" class="data-button" onclick={applyServiceWorkerUpdate} disabled={updateApplying}>
            {updateApplying ? "Updating…" : "Reload to update"}
          </button>
          <button type="button" class="app-banner-dismiss" aria-label="Dismiss update notice" onclick={() => updateDismissed = true}><X size={14} aria-hidden="true" /></button>
        </span>
      </div>
    {:else if showInstallBanner}
      <div class="app-banner" role="status">
        <span class="app-banner-message">
          <strong>Install ProseCraft.</strong>
          {isIosDevice
            ? "Add it to your Home Screen for full-screen, offline writing."
            : "Keep it on your Home Screen and write offline."}
        </span>
        <span class="app-banner-actions">
          <button type="button" class="data-button" onclick={handleInstallAction}>
            {isIosDevice && !canInstallApp ? "How to install" : "Install"}
          </button>
          <button type="button" class="app-banner-dismiss" aria-label="Dismiss install suggestion" onclick={dismissInstallBanner}><X size={14} aria-hidden="true" /></button>
        </span>
      </div>
    {/if}
    {#if storageError}
      <div class="storage-banner" role="alert">
        <span class="storage-banner-message">{storageError}</span>
        <span class="storage-banner-actions">
          <button type="button" class="data-button" onclick={exportDataBundle}>Export backup</button>
          <button type="button" class="data-button" onclick={openSettings}>Settings</button>
          <button type="button" class="storage-banner-dismiss" aria-label="Dismiss storage warning" onclick={() => storageError = ""}><X size={14} aria-hidden="true" /></button>
        </span>
      </div>
    {/if}
    <section class="writing-area" class:storyboard-active={workspaceView === "storyboard"} id="editor">
      <div class="workspace-controls" aria-label="Workspace panels">
        <div class="workspace-modes" role="tablist" aria-label="Workspace view">
          <button class="workspace-mode" class:active={workspaceView === "outline"} role="tab" aria-selected={workspaceView === "outline"} onclick={openOutlineView}>Outline</button>
          <button class="workspace-mode" class:active={workspaceView === "writing"} role="tab" aria-selected={workspaceView === "writing"} onclick={() => setWorkspaceView("writing")}>Write</button>
          {#if !compactChapterLayout}
          <button class="workspace-mode" class:active={workspaceView === "storyboard"} role="tab" aria-selected={workspaceView === "storyboard"} onclick={() => setWorkspaceView("storyboard")}>Storyboard</button>
          {/if}
          {#if timelineEnabled}
          <button class="workspace-mode" class:active={workspaceView === "timeline"} role="tab" aria-selected={workspaceView === "timeline"} onclick={() => setWorkspaceView("timeline")}>Timeline</button>
          {/if}
          <button class="workspace-mode" class:active={workspaceView === "publish"} role="tab" aria-selected={workspaceView === "publish"} onclick={openPublishView}>Publish</button>
        </div>
        {#if workspaceView === "storyboard"}
          <div class="board-controls" role="toolbar" aria-label="Storyboard tools">
            <button class="add-timeline-row" title="Add blank card" aria-label="Add blank card" onclick={() => addStoryboardCard("blank", "")}><Plus size={14} aria-hidden="true" /><span>Add blank card</span></button>
            <button class="add-timeline-row" title="Reset zoom and position" aria-label="Reset zoom and position" onclick={resetBoardView}><RotateCcw size={14} aria-hidden="true" /><span>Reset view</span></button>
            <span class="board-zoom-level" aria-live="polite">{Math.round(boardZoom * 100)}%</span>
            <span class="board-divider" aria-hidden="true"></span>
            {#each storyboardDrawingTools as item (item.tool)}
              {@const Icon = item.icon}
              <button
                class="drawing-tool"
                class:active={activeDrawingTool === item.tool}
                aria-label={`${item.label} tool`}
                aria-pressed={activeDrawingTool === item.tool}
                title={`${item.label} tool`}
                onclick={() => { activeDrawingTool = item.tool; }}
              ><Icon size={15} aria-hidden="true" /><span>{item.label}</span></button>
            {/each}
            {#if activeDrawingTool === "text" || selectedStoryboardTextDrawing()}
              <label class="drawing-font-size">
                <span>Text size</span>
                <input
                  type="range"
                  min="8"
                  max="72"
                  step="1"
                  aria-label="Diagram text font size"
                  value={selectedStoryboardTextDrawing()?.fontSize ?? defaultStoryboardTextFontSize}
                  oninput={(event) => updateStoryboardTextFontSize((event.currentTarget as HTMLInputElement).value)}
                />
                <output>{selectedStoryboardTextDrawing()?.fontSize ?? defaultStoryboardTextFontSize}px</output>
              </label>
            {/if}
            <button
              class="drawing-delete"
              aria-label="Delete selected diagram element"
              title="Delete selected element"
              disabled={!selectedDrawingId}
              onclick={() => { if (selectedDrawingId) removeStoryboardDrawing(selectedDrawingId); }}
            >Delete</button>
          </div>
        {/if}
        <div class="panel-toggles">
          {#if workspaceView === "writing"}
          <button class="panel-toggle" aria-label="Search project" title="Search project (Ctrl+F)" onclick={() => openProjectSearch()}>
            <Search size={15} aria-hidden="true" />
            <span>Search</span>
          </button>
          <button class="panel-toggle split-toggle" class:active={splitPanes.length > 0} aria-pressed={splitPanes.length > 0} aria-label={splitPanes.length > 0 ? "Close split view" : "Open split view"} title={splitPanes.length > 0 ? "Close split view" : "Open split view"} onclick={toggleSplitView}>
            <Columns2 size={15} aria-hidden="true" />
            <span>Split</span>
          </button>
          {/if}
          {#if workspaceView !== "storyboard"}
          <button class="panel-toggle" aria-label={leftSidebarVisible ? "Hide chapter sidebar" : "Show chapter sidebar"} title={leftSidebarVisible ? "Hide chapter sidebar" : "Show chapter sidebar"} aria-pressed={leftSidebarVisible} onclick={toggleLeftSidebar}>
            <PanelLeft size={15} aria-hidden="true" />
            <span>Chapters</span>
          </button>
          <button class="panel-toggle" aria-label={rightSidebarVisible ? "Hide progress sidebar" : "Show progress sidebar"} title={rightSidebarVisible ? "Hide progress sidebar" : "Show progress sidebar"} aria-pressed={rightSidebarVisible} onclick={toggleRightSidebar}>
            <PanelRight size={15} aria-hidden="true" />
            <span>Progress</span>
          </button>
          {/if}
          <button class="panel-toggle shortcuts-toggle" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (Ctrl/Cmd+/)" aria-pressed={shortcutsOpen} onclick={toggleShortcuts}>
            <Keyboard size={15} aria-hidden="true" />
            <span>Shortcuts</span>
          </button>
        </div>
      </div>
      <div class="editor-panel" class:editor-panel-hidden={workspaceView !== "writing"} class:typewriter-mode={typewriterMode} class:split-open={tilesOpen}>
      <div class="tile-grid" class:split-open={tilesOpen} class:stacked-tiles={tilesOpen && splitColumns === 1} class:target-drop-active={gridDropActive} style={`--tile-columns: ${splitColumns}; --tile-rows: ${tileRows}; --tile-grid-top: ${tileGridTop}px; --tile-grid-bottom: ${tileGridBottom}px`} bind:this={tileGridElement} bind:clientWidth={tileGridWidth} role="group" aria-label="Editor and reference tiles" ondragenter={handleGridDragEnter} ondragover={handleTargetDragOver} ondragleave={handleGridDragLeave} ondrop={handleTargetDrop}>
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
        <div class="editor-scroll">
        <input
          bind:this={imageFileInput}
          class="data-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onchange={handleImagePickerChange}
        />
        {#if markdownEditorMode}
          <div class="markdown-utilities">
            {#if markdownEditorEnabled}
              <button
                type="button"
                class="markdown-mode-toggle"
                aria-pressed={markdownEditorMode}
                onclick={toggleEditorMode}
              >Rich text editor</button>
            {/if}
            <button type="button" class="markdown-mode-toggle" onclick={openImagePicker}>Insert image</button>
          </div>
        {/if}
        {#if imageInsertError}
          <p class="image-insert-error" role="status">{imageInsertError}</p>
        {/if}

        <input
          class="title-input"
          data-undo-key={inChapterMode && activeChapter ? `title:chapter:${activeChapter.id}` : `title:${activeDocumentId}`}
          aria-label={inChapterMode ? "Chapter title" : "Document title"}
          placeholder="Untitled"
          autocapitalize="sentences"
          enterkeyhint="done"
          bind:value={title}
          oninput={persist}
          maxlength="120"
        />

        <div class="editor-tools">
        {#if !markdownEditorMode}
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
          <button class="tool-button" aria-label="Bulleted list" title="Bulleted list" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("insertUnorderedList")}><List size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Numbered list" title="Numbered list" onpointerdown={(event) => event.preventDefault()} onclick={() => runCommand("insertOrderedList")}><ListOrdered size={16} aria-hidden="true" /></button>
          <span class="toolbar-divider"></span>
          <button class="tool-button" aria-label="Add link" title="Add link" onpointerdown={(event) => event.preventDefault()} onclick={addLink}><LinkIcon size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Undo" title="Undo" onpointerdown={(event) => event.preventDefault()} onclick={() => runFieldHistory(editor, "undo")}><Undo2 size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Redo" title="Redo" onpointerdown={(event) => event.preventDefault()} onclick={() => runFieldHistory(editor, "redo")}><Redo2 size={16} aria-hidden="true" /></button>
          <span class="toolbar-divider"></span>
          <button class="tool-button image-tool-button" aria-label="Insert image" title="Insert image" onpointerdown={(event) => event.preventDefault()} onclick={openImagePicker}><ImagePlus size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Comments" title="Comments" onpointerdown={(event) => event.preventDefault()} onclick={openComments}><MessageSquareText size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Snapshots" title="Snapshots" onpointerdown={(event) => event.preventDefault()} onclick={openSnapshots}><History size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Insert equation" title="Insert equation" onpointerdown={(event) => event.preventDefault()} onclick={() => openRichDialog("math")}><Sigma size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Insert diagram" title="Insert diagram" onpointerdown={(event) => event.preventDefault()} onclick={() => openRichDialog("diagram")}><Workflow size={16} aria-hidden="true" /></button>
          <button class="tool-button" aria-label="Insert calculation" title="Insert calculation" onpointerdown={(event) => event.preventDefault()} onclick={() => openRichDialog("calc")}><Calculator size={16} aria-hidden="true" /></button>
          {#if markdownEditorEnabled}
            <button class="tool-button tool-button-wide" aria-label="Markdown editor" title="Markdown editor" onpointerdown={(event) => event.preventDefault()} onclick={toggleEditorMode}>MD</button>
          {/if}
        </div>
        {/if}

        {#if selectedEditorImage && !markdownEditorMode}
          <div
            class="image-edit-toolbar"
            role="toolbar"
            tabindex="0"
            aria-label="Selected image tools"
            onkeydown={(event) => {
              if (event.key !== "Escape") return;
              selectEditorImage(null);
              editor.focus();
            }}
          >
            <span class="image-edit-label">Image size</span>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(50)}>50%</button>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(75)}>75%</button>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(100)}>Fit width</button>
            <button type="button" onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWidth(null)}>Original size</button>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <span class="image-edit-label">Column width</span>
            <div class="image-layout-group" role="group" aria-label="Image column width">
              {#each IMAGE_SIZE_OPTIONS as option (option.size)}
                <button
                  type="button"
                  aria-label={option.ariaLabel}
                  aria-pressed={selectedImageLayout.size === option.size}
                  onpointerdown={(event) => event.preventDefault()}
                  onclick={() => setSelectedImageSize(option.size)}
                >{option.label}</button>
              {/each}
              <button
                type="button"
                aria-pressed={selectedImageLayout.size === "custom"}
                onpointerdown={(event) => event.preventDefault()}
                onclick={useCustomImageWidth}
              >Custom</button>
              {#if selectedImageLayout.size === "custom" || customImageWidthEditing}
                <label class="image-custom-width">
                  <input
                    type="number"
                    min={MIN_IMAGE_WIDTH}
                    max={MAX_IMAGE_WIDTH}
                    step="5"
                    aria-label="Custom image width in percent"
                    value={customImageWidthDraft ?? String(selectedImageLayout.width ?? MAX_IMAGE_WIDTH)}
                    oninput={handleImageWidthInput}
                    onblur={() => { customImageWidthDraft = null; }}
                    onkeydown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); }}
                  />
                  <span aria-hidden="true">%</span>
                </label>
              {/if}
            </div>
            <span class="image-edit-label">Align</span>
            <div class="image-layout-group" role="group" aria-label="Image alignment">
              {#each IMAGE_ALIGN_OPTIONS as option (option.align)}
                <button
                  type="button"
                  aria-label={`Align image ${option.label.toLowerCase()}`}
                  aria-pressed={selectedImageLayout.align === option.align}
                  onpointerdown={(event) => event.preventDefault()}
                  onclick={() => setSelectedImageAlign(option.align)}
                >{option.label}</button>
              {/each}
            </div>
            <span class="image-edit-label">Text flow</span>
            <div class="image-layout-group" role="group" aria-label="Text flow around image">
              <button type="button" aria-label="Image on its own line" aria-pressed={selectedImageLayout.wrap === "block"} onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWrap("block")}>Own line</button>
              <button type="button" aria-label="Wrap text beside left-aligned image" aria-pressed={selectedImageLayout.wrap === "wrap-left"} onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWrap("wrap-left")}>Wrap left</button>
              <button type="button" aria-label="Wrap text beside right-aligned image" aria-pressed={selectedImageLayout.wrap === "wrap-right"} onpointerdown={(event) => event.preventDefault()} onclick={() => setSelectedImageWrap("wrap-right")}>Wrap right</button>
            </div>
            <button type="button" class="remove-image-button" onpointerdown={(event) => event.preventDefault()} onclick={removeSelectedImage}>Remove image</button>
          </div>
        {/if}
        </div>

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
          oncopy={handleEditorClipboard}
          oncut={handleEditorClipboard}
          onclick={handleEditorClick}
          onpointermove={handleEditorPointerMove}
          onpointerleave={() => { wikiMentionPreview = null; hideCommentPreviewSoon(); }}
          onkeydown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
              if (handleChapterEnter(event)) return;
            }
            if (event.key === "Backspace" && handleChapterBoundaryDelete(event, false)) return;
            if (event.key === "Delete" && handleChapterBoundaryDelete(event, true)) return;
            if (event.key !== "Escape") return;
            selectEditorImage(null);
            hideCommentPreview();
            hideCommentSelectionPopover();
            hideHarperPopover();
          }}
        >{@html starterContent}</div>

        {#if selectedEditorImage && !markdownEditorMode && imageResizeHandle}
          <div
            class="image-resize-handle"
            role="slider"
            tabindex="0"
            aria-label="Image width"
            aria-valuemin={MIN_IMAGE_WIDTH}
            aria-valuemax={MAX_IMAGE_WIDTH}
            aria-valuenow={Math.round(selectedImageWidthPercent())}
            style={`left: ${imageResizeHandle.left}px; top: ${imageResizeHandle.top}px`}
            onpointerdown={startImageResize}
            onpointermove={moveImageResize}
            onpointerup={endImageResize}
            onpointercancel={endImageResize}
            onkeydown={handleImageResizeKeydown}
          ></div>
        {/if}

        {#if wikiMentionPreview}
          <aside
            class="wiki-mention-preview"
            role="tooltip"
            style={`left: ${wikiMentionPreview.left}px; top: ${wikiMentionPreview.top}px`}
          >
            <strong>{wikiMentionPreview.article.title}</strong>
            <p>{wikiMentionPreview.excerpt || "This Wiki article has no text yet."}</p>
          </aside>
        {/if}

        {#if commentPreview}
          <aside
            class="comment-preview"
            role="group"
            aria-label="Comment on this text"
            style={`left: ${commentPreview.left}px; top: ${commentPreview.top}px`}
            onpointerenter={keepCommentPreview}
            onpointerleave={hideCommentPreviewSoon}
          >
            {#each commentPreview.comments as comment (comment.id)}
              <div class="comment-preview-entry">
                <div class="comment-preview-meta">
                  <strong>{comment.author}</strong>
                  <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                </div>
                <p>{comment.body}</p>
                <div class="comment-preview-actions">
                  <button
                    type="button"
                    onpointerdown={(event) => event.preventDefault()}
                    onclick={() => goToCommentFromPreview(comment)}
                  >Go to</button>
                  <button
                    type="button"
                    onpointerdown={(event) => event.preventDefault()}
                    onclick={() => resolveComment(comment.id, true)}
                  >Resolve</button>
                </div>
              </div>
            {/each}
          </aside>
        {/if}

        {#if commentSelectionPopover}
          <div
            class="comment-selection-popover"
            role="toolbar"
            aria-label="Comment on selection"
            style={`left: ${commentSelectionPopover.left}px; top: ${commentSelectionPopover.top}px`}
          >
            <button
              type="button"
              onpointerdown={(event) => event.preventDefault()}
              onclick={openComments}
              aria-label="Add comment"
              title="Add comment"
            >
              <MessageSquareText size={14} aria-hidden="true" />
              <span>Comment</span>
            </button>
          </div>
        {/if}

        {#if harperPopover}
          <div
            class="harper-popover"
            role="dialog"
            tabindex="-1"
            aria-label="Proofreading suggestion"
            style={`left: ${harperPopover.left}px; top: ${harperPopover.top}px`}
            onpointerdown={(event) => event.stopPropagation()}
            onkeydown={(event) => { if (event.key === "Escape") hideHarperPopover(); }}
          >
            <p class="harper-message"><strong>{harperPopover.lint.kindPretty}</strong> · {harperPopover.lint.message}</p>
            {#if harperPopover.lint.suggestions.length > 0}
              <div class="harper-suggestions">
                {#each harperPopover.lint.suggestions as suggestion}
                  <button
                    type="button"
                    onclick={() => applyHarperSuggestion(harperPopover!.lint, suggestion)}
                  >{suggestion || "(remove)"}</button>
                {/each}
              </div>
            {:else}
              <p class="harper-no-suggestion">No automatic fix — edit the passage directly.</p>
            {/if}
            <div class="harper-actions">
              <button
                type="button"
                onclick={() => harperPopover && ignoreHarperLint(harperPopover.lint)}
              >Ignore</button>
              <button
                type="button"
                onclick={hideHarperPopover}
              >Close</button>
            </div>
          </div>
        {/if}

        <footer class="editor-footer">
          <span>{wordCount} words <span class="footer-separator">·</span> {characterCount} characters</span>
          <span class="footer-actions">
            <span class="save-indicator"><span class:unsaved={saveState !== "All changes saved"} class="save-dot"></span>{saveState}</span>
            <button class="export-button" onclick={exportDocument}>
              <Download size={16} aria-hidden="true" />
              Export
            </button>
          </span>
        </footer>
        </div>
      </div>
      {#each splitPanes as pane, index (pane.id)}
        <div
          class="split-tile"
          class:target-drop-active={paneDropActive === pane.id}
          role="group"
          aria-label={`Tile ${index + 1}`}
          ondragenter={(event) => handlePaneDragEnter(event, pane.id)}
          ondragover={handleTargetDragOver}
          ondragleave={(event) => handlePaneDragLeave(event, pane.id)}
          ondrop={(event) => handlePaneDrop(event, pane.id)}
        >
          <SplitPane
            target={pane.target}
            groups={splitGroups}
            {documents}
            {chapters}
            sceneSeparator={publishOptions.sceneSeparator}
            files={splitFiles}
            isActiveDocument={pane.target === docTarget(activeDocumentId)}
            canAdd={canAddSplitPane(splitPanes)}
            readBytes={readResearchBytes}
            openExternally={(file) => void openResearchFile(file, { external: true })}
            openUrl={openExternalUrl}
            canMoveLeft={index > 0}
            canMoveRight={index < splitPanes.length - 1}
            canSwap={parseSplitTarget(pane.target)?.kind === "doc" && Boolean(activeDocumentId)}
            onSwap={() => swapTileWithEditor(pane.id)}
            onMove={(delta) => { splitPanes = moveSplitPane(splitPanes, pane.id, delta); }}
            onTarget={(value) => { splitPanes = setSplitTarget(splitPanes, pane.id, value); }}
            onAdd={() => { splitPanes = addSplitPane(splitPanes, crypto.randomUUID()); }}
            onEditTitle={(id, value) => updateTileDocument(id, { title: value })}
            onEditChapterTitle={(chapterId, value) => updateTileChapterTitle(chapterId, value)}
            onEditContent={(id, html) => updateTileDocument(id, { content: html })}
            onClose={() => { splitPanes = removeSplitPane(splitPanes, pane.id); }}
          />
        </div>
      {/each}
      </div>
      </div>
        {#if workspaceView === "outline"}
          <OutlineView
            chapters={liveChapters}
            {chapterWordCounts}
            {chapterSceneCounts}
            chapterLabels={outlineChapterLabelInfo}
            sceneLabelSummary={outlineSceneLabelSummary}
            onAddChapter={addOutlineChapter}
            onSummaryChange={updateChapterSummary}
          />
        {/if}
        <div class="storyboard-view" class:storyboard-view-hidden={workspaceView !== "storyboard"} class:left-hidden={!leftSidebarShown()} class:right-hidden={!rightSidebarShown()}>
          <aside class="storyboard-sources" aria-label="Story elements to add">
            <div class="board-sources-heading">
              <span class="board-eyebrow">STORY ELEMENTS</span>
              <h2>Add to storyboard</h2>
              <p>Drag an element onto the canvas, or use + to place it near the center.</p>
            </div>
            <section class="board-source-group">
              <h3>Cards</h3>
              <div class="board-source">
                <button class="source-drag-handle" aria-label="Drag a blank card onto the storyboard canvas" title="Drag onto canvas" onpointerdown={(event) => startStoryboardDrag(event, "blank", "")}><GripVertical size={14} aria-hidden="true" /></button>
                <Square size={16} color="var(--eyebrow)" aria-hidden="true" /><span class="source-name">Blank card</span>
                <button class="source-add" aria-label="Add a blank card near the canvas center" title="Add to canvas" onclick={() => addStoryboardCard("blank", "")}><Plus size={13} aria-hidden="true" /></button>
              </div>
            </section>
            <section class="board-source-group">
              <h3>Chapters</h3>
              {#each liveChapters as chapter (chapter.id)}
                <div class="board-source">
                  <button class="source-drag-handle" aria-label="Drag {chapterLabel(chapter)} onto the storyboard canvas" title="Drag onto canvas" onpointerdown={(event) => startStoryboardDrag(event, "chapter", chapter.id)}><GripVertical size={14} aria-hidden="true" /></button>
                  <Folder size={16} color="var(--eyebrow)" aria-hidden="true" /><span class="source-name">{chapterLabel(chapter)}</span>
                  <button class="source-add" aria-label="Add {chapterLabel(chapter)} near the canvas center" title="Add to canvas" onclick={() => addStoryboardCard("chapter", chapter.id)}><Plus size={13} aria-hidden="true" /></button>
                </div>
              {:else}
                <p class="board-source-empty">No chapters yet</p>
              {/each}
            </section>
            <section class="board-source-group">
              <h3>Scenes</h3>
              {#each documents.filter((doc) => doc.chapterId && !doc.trashed) as doc (doc.id)}
                <div class="board-source">
                  <button class="source-drag-handle" aria-label="Drag {doc.title || 'Untitled scene'} onto the storyboard canvas" title="Drag onto canvas" onpointerdown={(event) => startStoryboardDrag(event, "scene", doc.id)}><GripVertical size={14} aria-hidden="true" /></button>
                  <FileText size={16} color="var(--eyebrow)" aria-hidden="true" /><span class="source-name">{doc.title || "Untitled scene"}</span>
                  <button class="source-add" aria-label="Add {doc.title || 'Untitled scene'} near the canvas center" title="Add to canvas" onclick={() => addStoryboardCard("scene", doc.id)}><Plus size={13} aria-hidden="true" /></button>
                </div>
              {:else}
                <p class="board-source-empty">No scenes yet</p>
              {/each}
            </section>
            <section class="board-source-group">
              <h3>Wiki</h3>
              {#each documents.filter((doc) => doc.space === "Wiki" && !doc.trashed) as doc (doc.id)}
                <div class="board-source">
                  <button class="source-drag-handle" aria-label="Drag {doc.title || 'Untitled'} onto the storyboard canvas" title="Drag onto canvas" onpointerdown={(event) => startStoryboardDrag(event, "Wiki", doc.id)}><GripVertical size={14} aria-hidden="true" /></button>
                  <BookOpen size={16} color="var(--eyebrow)" aria-hidden="true" />
                  <span class="source-name">{doc.title || "Untitled"}</span>
                  <button class="source-add" aria-label="Add {doc.title || 'Untitled'} near the canvas center" title="Add to canvas" onclick={() => addStoryboardCard("Wiki", doc.id)}><Plus size={13} aria-hidden="true" /></button>
                </div>
              {:else}
                <p class="board-source-empty">No wiki pages yet</p>
              {/each}
            </section>
          </aside>
          <section class="storyboard-canvas" aria-label="Freeform storyboard">
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="storyboard-viewport"
              class:board-panning={boardPanDrag !== null}
              bind:this={boardViewport}
              role="application"
              tabindex="0"
              onpointerdown={startStoryboardCanvasInteraction}
              class:board-pan-tool={activeDrawingTool === "pan"}
              style={boardGridStyle()}
              aria-label="Freeform storyboard canvas. Select a diagram tool to draw. Hold Space while dragging to pan, pinch to zoom, or use two fingers on touch screens."
            >
              <div class="storyboard-pan-surface" aria-hidden="true" onpointerdown={startStoryboardPan}></div>
              <div
                class="storyboard-world"
                style:transform={`scale(${boardZoom}) translate3d(${-boardPan.x}px, ${-boardPan.y}px, 0)`}
              >
                <svg class="storyboard-drawing-layer" role="group" aria-label="Diagram shapes">
                  <defs>
                    <marker id="storyboard-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                      <path d="M 0 0 L 8 4 L 0 8 z" />
                    </marker>
                  </defs>
                  {#each storyboardDrawings.filter((drawing) => drawing.type !== "text") as drawing (drawing.id)}
                    <g
                      class="storyboard-vector"
                      class:selected={selectedDrawingId === drawing.id}
                      data-drawing-id={drawing.id}
                      role="button"
                      tabindex="0"
                      aria-label={`Select ${drawing.type} diagram element`}
                      aria-pressed={selectedDrawingId === drawing.id}
                      onfocus={() => { selectedDrawingId = drawing.id; }}
                      onpointerdown={(event) => startStoryboardDrawingMove(event, drawing)}
                      onkeydown={(event) => handleStoryboardDrawingKeydown(event, drawing)}
                    >
                      {#if drawing.type === "line" || drawing.type === "arrow"}
                        <line class="drawing-hit-line" x1={drawing.startX} y1={drawing.startY} x2={drawing.endX} y2={drawing.endY} />
                        <line
                          class="drawing-visible-line"
                          x1={drawing.startX}
                          y1={drawing.startY}
                          x2={drawing.endX}
                          y2={drawing.endY}
                          marker-end={drawing.type === "arrow" ? "url(#storyboard-arrowhead)" : undefined}
                        />
                      {:else}
                        <rect x={drawing.x} y={drawing.y} width={drawing.width} height={drawing.height} />
                      {/if}
                    </g>
                  {/each}
                </svg>
                {#each storyboardDrawings as drawing (drawing.id)}
                  {#if drawing.type === "text"}
                    <div
                      class="storyboard-text-drawing"
                      class:selected={selectedDrawingId === drawing.id}
                      style:left={`${drawing.x}px`}
                      style:top={`${drawing.y}px`}
                      style:width={`${drawing.width}px`}
                      style:height={`${drawing.height}px`}
                    >
                      <textarea
                        id={`storyboard-drawing-text-${drawing.id}`}
                        class="storyboard-text-editor"
                        data-undo-key={`label:${drawing.id}`}
                        style:font-size={`${drawing.fontSize}px`}
                        aria-label="Diagram text"
                        placeholder="Type a label…"
                        maxlength="2000"
                        value={drawing.text}
                        onfocus={() => { selectedDrawingId = drawing.id; }}
                        onpointerdown={(event) => { event.stopPropagation(); selectedDrawingId = drawing.id; }}
                        oninput={(event) => updateStoryboardDrawingText(drawing.id, (event.currentTarget as HTMLTextAreaElement).value)}
                        onblur={() => finishStoryboardTextEdit(drawing.id)}
                      ></textarea>
                      {#if selectedDrawingId === drawing.id}
                        <button class="drawing-move-handle" aria-label="Move text label" title="Drag to move" onpointerdown={(event) => startStoryboardDrawingMove(event, drawing)}><GripVertical size={14} aria-hidden="true" /></button>
                        <button class="drawing-resize-handle" aria-label="Resize text area" title="Drag to resize" onpointerdown={(event) => startStoryboardDrawingResize(event, drawing)}></button>
                      {/if}
                    </div>
                  {:else if drawing.type === "box" && selectedDrawingId === drawing.id}
                    <div
                      class="storyboard-drawing-selection"
                      style:left={`${drawing.x}px`}
                      style:top={`${drawing.y}px`}
                      style:width={`${drawing.width}px`}
                      style:height={`${drawing.height}px`}
                    >
                      <button class="drawing-resize-handle" aria-label="Resize box" title="Drag to resize" onpointerdown={(event) => startStoryboardDrawingResize(event, drawing)}></button>
                    </div>
                  {/if}
                {/each}
                {#each storyboardCards as card (card.id)}
                  {@const dragged = boardDragSource?.kind === "board-card" && boardDragSource.sourceId === card.id}
                  <article
                    class="storyboard-card"
                    class:blank-card={card.kind === "blank"}
                    class:dragging={dragged}
                    data-board-card-id={card.id}
                    style:left={`${dragged && boardDropPosition ? boardDropPosition.x : card.x}px`}
                    style:top={`${dragged && boardDropPosition ? boardDropPosition.y : card.y}px`}
                  >
                    <div class="storyboard-card-top">
                      <button
                        class="card-drag-handle"
                        aria-label="Move {card.title}. Use arrow keys to nudge the card, or drag to position it."
                        title="Drag to move; arrow keys to nudge"
                        onpointerdown={(event) => startStoryboardDrag(event, "board-card", card.id)}
                        onkeydown={(event) => handleStoryboardCardKeydown(event, card.id)}
                      ><GripVertical size={14} aria-hidden="true" /></button>
                      <span class="card-kind">{card.kind === "blank" ? "blank" : card.kind}</span>
                      <button class="remove-board-card" aria-label="Remove {card.title} from storyboard" title="Remove from storyboard" onclick={() => removeStoryboardCard(card.id)}><X size={14} aria-hidden="true" /></button>
                    </div>
                    <input class="board-card-title" data-undo-key={`card-title:${card.id}`} aria-label="Storyboard card title" autocapitalize="sentences" enterkeyhint="done" value={card.title} maxlength="120" oninput={(event) => updateStoryboardCard(card.id, "title", (event.currentTarget as HTMLInputElement).value)} />
                    <textarea
                      class="board-card-note"
                      data-undo-key={card.kind === "chapter" ? `chapter-summary:${card.sourceId}` : `card-note:${card.id}`}
                      aria-label={card.kind === "chapter" ? `Chapter summary for ${card.title}` : `Planning notes for ${card.title}`}
                      placeholder={card.kind === "chapter" ? "Chapter summary — synced with Outline" : "Write a note about this story element…"}
                      value={card.note}
                      maxlength={card.kind === "chapter" ? 4000 : undefined}
                      use:autoResize={card.note}
                      oninput={(event) => updateStoryboardCard(card.id, "note", (event.currentTarget as HTMLTextAreaElement).value)}
                    ></textarea>
                  </article>
                {/each}
                {#if boardDragSource && boardDragSource.kind !== "board-card" && boardDropPosition}
                  <div class="storyboard-drop-preview" style:left={`${boardDropPosition.x}px`} style:top={`${boardDropPosition.y}px`}>Drop to add card</div>
                {/if}
              </div>
              {#if storyboardCards.length === 0 && storyboardDrawings.length === 0}
                <p class="storyboard-empty-hint">Add a card or choose a diagram tool to start planning on the canvas.</p>
              {/if}
            </div>
            <p class="storyboard-pan-hint">Draw with the toolbar · Pan tool, Space + drag, or middle mouse · Pinch or two fingers to zoom and move</p>
          </section>
        </div>
        {#if workspaceView === "timeline"}
          <TimelineView
            nodes={timelineNodes}
            onAdd={addTimelineNode}
            onUpdate={updateTimelineNode}
            onRemove={removeTimelineNode}
            onMove={moveTimelineNode}
            onReorder={reorderTimelineNodes}
          />
        {/if}
        {#if workspaceView === "publish"}
          <PublishView
            chapters={liveChapters}
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
      class:peek={!rightSidebarShown()}
      class:peek-open={!rightSidebarShown() && rightSidebarHovered}
      inert={zenInterfaceHidden || (!rightSidebarShown() && !rightSidebarHovered)}
      aria-label="Sidebar"
    >
      <div class="sidebar-tabs" role="tablist" aria-label="Sidebar views">
        <button type="button" role="tab" class="sidebar-tab" class:active={rightSidebarTab === "progress"} aria-selected={rightSidebarTab === "progress"} onclick={() => (rightSidebarTab = "progress")}>Progress</button>
        <button type="button" role="tab" class="sidebar-tab" class:active={rightSidebarTab === "comments"} aria-selected={rightSidebarTab === "comments"} onclick={() => (rightSidebarTab = "comments")}>Comments</button>
        <button type="button" role="tab" class="sidebar-tab" class:active={rightSidebarTab === "snapshots"} aria-selected={rightSidebarTab === "snapshots"} onclick={() => (rightSidebarTab = "snapshots")}>Snapshots</button>
        <button class="progress-close" type="button" aria-label="Hide progress sidebar" title="Hide progress sidebar" onclick={() => closeSidebarDrawers()}><X size={15} aria-hidden="true" /></button>
      </div>

      {#if rightSidebarTab === "progress"}
      <div class="progress-header">
        <div>
          <span class="progress-eyebrow">YOUR WRITING</span>
          <h2>Progress</h2>
        </div>
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
        <div class="section-title"><strong>Chapter goals</strong><span>{liveChapters.length}</span></div>
        {#if liveChapters.length > 0}
          <div class="chapter-goal-list">
            {#each liveChapters as chapter (chapter.id)}
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
            <button aria-label="Previous month" onclick={() => changeViewedMonth(-1)}><ChevronLeft size={14} aria-hidden="true" /></button>
            <button aria-label="Next month" onclick={() => changeViewedMonth(1)}><ChevronRight size={14} aria-hidden="true" /></button>
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
      {:else if rightSidebarTab === "comments"}
      <div class="progress-header"><div><span class="progress-eyebrow">FEEDBACK</span><h2>Comments</h2></div></div>
      <section class="progress-section">
        <div class="section-title"><strong>New comment</strong></div>
        <p class="section-subtitle">Notes for yourself or a proofreader. Never part of the text or any export.</p>
        {#if pendingAnchor}
          <form class="comment-form side-form" onsubmit={addComment}>
            <blockquote class="comment-quote">{pendingAnchor.quote.length > 160 ? `${pendingAnchor.quote.slice(0, 160)}…` : pendingAnchor.quote}</blockquote>
            <textarea class="preference-select" rows="2" placeholder="Your comment" maxlength="4000" bind:value={commentDraft} aria-label="Comment text" required></textarea>
            <div class="comment-form-row">
              <input class="preference-select" type="text" placeholder="Name" maxlength="60" bind:value={commentAuthor} aria-label="Author name" />
              <button class="data-button" type="submit">Add comment</button>
            </div>
          </form>
        {:else if markdownEditorMode}
          <p class="data-help">Comments attach to the rich text editor. Switch back to it to add or jump to a comment.</p>
        {:else}
          <p class="data-help">Select some text in the scene, then use the comment button in the toolbar.</p>
        {/if}
      </section>
      <section class="progress-section">
        <div class="section-title"><strong>{showAllComments ? "All comments" : "This chapter"}</strong><span>{activeComments.length}</span></div>
        <label class="comment-resolved-toggle"><input type="checkbox" bind:checked={showAllComments} /> Show all project comments</label>
        {#if resolvedCommentCount > 0}
          <label class="comment-resolved-toggle"><input type="checkbox" bind:checked={showResolvedComments} /> Show resolved ({resolvedCommentCount})</label>
        {/if}
        {#if activeComments.length === 0}
          <p class="empty-progress">No comments yet. Select text in the editor, then add one above.</p>
        {:else}
          <ul class="comment-list">
            {#each activeComments as comment (comment.id)}
              <li class="comment-item" class:resolved={comment.resolved}>
                {#if showAllComments}
                  <div class="comment-location">{commentLocation(comment)}</div>
                {/if}
                <blockquote class="comment-quote">{comment.quote.length > 120 ? `${comment.quote.slice(0, 120)}…` : comment.quote}</blockquote>
                <p class="comment-body">{comment.body}</p>
                <div class="comment-meta">{comment.author} · {new Date(comment.createdAt).toLocaleDateString()}{commentPositions[comment.id] === null ? " · text not found any more" : ""}</div>
                <div class="comment-actions">
                  <button class="side-action" type="button" disabled={markdownEditorMode || commentPositions[comment.id] === null} onclick={() => goToComment(comment)}>Go to</button>
                  <button class="side-action" type="button" onclick={() => resolveComment(comment.id, !comment.resolved)}>{comment.resolved ? "Reopen" : "Resolve"}</button>
                  <button class="side-action danger" type="button" aria-label="Delete comment" onclick={() => deleteComment(comment.id)}>Delete</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      {:else}
      <div class="progress-header"><div><span class="progress-eyebrow">VERSIONS</span><h2>Snapshots</h2></div></div>
      <section class="progress-section">
        <div class="section-title"><strong>Save this version</strong></div>
        <p class="section-subtitle">Keeps a copy of “{title || "Untitled"}” as it is now. Up to ten are kept per scene.</p>
        <form class="snapshot-form side-form" onsubmit={takeSnapshot}>
          <input class="preference-select" type="text" placeholder="Optional note" maxlength="120" autocapitalize="sentences" bind:value={snapshotNote} aria-label="Snapshot note" />
          <button class="data-button" type="submit">Take snapshot</button>
        </form>
      </section>
      <section class="progress-section">
        <div class="section-title"><strong>Earlier versions</strong><span>{activeSnapshots.length}</span></div>
        <p class="section-subtitle">Restoring first saves the current text, so you can go back.</p>
        {#if activeSnapshots.length === 0}
          <p class="empty-progress">No snapshots yet. Save one above to freeze this moment.</p>
        {:else}
          <ul class="snapshot-list">
            {#each activeSnapshots as snapshot (snapshot.id)}
              <li class="snapshot-item">
                <div class="snapshot-meta">
                  <strong>{snapshotLabel(snapshot)}</strong>
                  <span>{inChapterMode ? `${snapshotSceneTitle(snapshot)} · ` : ""}{countWords(htmlToPlainText(snapshot.content))} words{snapshot.note ? ` · ${snapshot.note}` : ""}</span>
                </div>
                <div class="snapshot-actions">
                  <button class="side-action" type="button" onclick={() => { snapshotPreviewId = snapshotPreviewId === snapshot.id ? null : snapshot.id; }}>{snapshotPreviewId === snapshot.id ? "Hide" : "Preview"}</button>
                  <button class="side-action" type="button" onclick={() => restoreSnapshot(snapshot.id)}>Restore</button>
                  <button class="side-action danger" type="button" aria-label="Delete snapshot" onclick={() => deleteSnapshot(snapshot.id)}>Delete</button>
                </div>
                {#if snapshotPreviewId === snapshot.id}
                  <div class="snapshot-preview">{@html cleanHtml(snapshot.content)}</div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      {/if}
    </aside>
</div>

<dialog class="settings-dialog research-markdown-dialog" bind:this={researchMarkdownDialog} onclick={(event) => {
  if (event.target === researchMarkdownDialog) researchMarkdownDialog.close();
}}>
  <div class="settings-header">
    <div><span class="settings-kicker">WIKI FILE</span><h2>{researchMarkdownTitle}</h2></div>
    <button class="close-settings" aria-label="Close Markdown preview" onclick={() => researchMarkdownDialog.close()}><X size={15} aria-hidden="true" /></button>
  </div>
  <article class="research-markdown-content">{@html researchMarkdownHtml}</article>
</dialog>

<ShortcutsSheet open={shortcutsOpen} onClose={() => (shortcutsOpen = false)} onSavePdf={saveShortcutsPdf} />

<dialog class="settings-dialog main-settings-dialog" bind:this={settingsDialog} onclick={(event) => {
  if (event.target === settingsDialog) settingsDialog.close();
}}>
  <div class="settings-header">
    <div><span class="settings-kicker">PROSECRAFT</span><h2>Settings</h2></div>
    <button class="close-settings" aria-label="Close settings" onclick={() => settingsDialog.close()}><X size={15} aria-hidden="true" /></button>
  </div>
  <div class="settings-layout">
    <div class="settings-nav" role="tablist" aria-label="Settings categories" aria-orientation="vertical" tabindex="-1" onkeydown={handleSettingsCategoryKey}>
      {#each settingsCategories as { id, label, icon: Icon } (id)}
        {#if id !== "install" || !desktopRuntime}
          <button
            type="button"
            class="settings-nav-item"
            class:active={activeSettingsCategory === id}
            id={`settings-tab-${id}`}
            role="tab"
            aria-selected={activeSettingsCategory === id}
            aria-controls={`settings-panel-${id}`}
            tabindex={activeSettingsCategory === id ? 0 : -1}
            onclick={() => selectSettingsCategory(id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        {/if}
      {/each}
    </div>
    <div class="settings-panes">
    <div class="settings-pane" id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general" hidden={activeSettingsCategory !== "general"}>
      <h3 class="settings-pane-title">General</h3>
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
    </div>
    <div class="settings-pane" id="settings-panel-writing" role="tabpanel" aria-labelledby="settings-tab-writing" hidden={activeSettingsCategory !== "writing"}>
      <h3 class="settings-pane-title">Writing</h3>
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
        <span>Hide the interface while typing (Zen mode)</span>
      </label>
      <p class="preference-help">Only hides the interface once you start typing in the editor. Move the mouse outside the editor or press Escape to bring it back.</p>
      <div class="preference-heading"><strong>Focus mode</strong><span>Hides everything except your text right now. Press {modifierName}+Shift+Enter (or Escape) to bring it back.</span></div>
      <button class="data-button" type="button" onclick={() => { settingsDialog.close(); toggleFocusMode(); }}>Enter focus mode</button>
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
      <div class="preference-heading"><strong>Timeline view</strong><span>An experimental chronological view of your story</span></div>
      <label class="preference-toggle">
        <input
          type="checkbox"
          checked={timelineEnabled}
          onchange={(event) => setTimelineEnabled((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>Show Timeline view</span>
      </label>
      <p class="preference-help">The Timeline is still taking shape. Turn it on to try it; your timeline data is kept either way.</p>
    </section>
    </div>
    <div class="settings-pane" id="settings-panel-proofreading" role="tabpanel" aria-labelledby="settings-tab-proofreading" hidden={activeSettingsCategory !== "proofreading"}>
      <h3 class="settings-pane-title">Proofreading</h3>
    <section class="preference-section">
      <div class="preference-heading"><strong>Proofreading</strong><span>Offline spelling and grammar checking</span></div>
      <label class="preference-toggle">
        <input
          type="checkbox"
          checked={harperEnabled}
          onchange={(event) => setHarperEnabled((event.currentTarget as HTMLInputElement).checked)}
        />
        <span>Check spelling and grammar</span>
      </label>
      <p class="preference-help">Runs entirely on this device — your writing never leaves the app. The checker downloads once (about 8&nbsp;MB) and then works offline. Click an underlined passage to see suggestions.</p>
      {#if harperEnabled}
        <label class="preference-label" for="harper-dialect">English dialect</label>
        <select id="harper-dialect" class="preference-select" value={harperDialect} onchange={(event) => setHarperDialect((event.currentTarget as HTMLSelectElement).value)}>
          {#each HARPER_DIALECTS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        {#if harperChecking}
          <p class="preference-help" role="status">Checking the current {inChapterMode ? "chapter" : "scene"}…</p>
        {:else if harperError}
          <p class="preference-error" role="status">{harperError}</p>
        {:else if harperCheckedDocumentId === activeDocumentId && activeDocumentId}
          <p class="preference-help" role="status">
            {harperLints.length === 0
              ? `No issues found in the current ${inChapterMode ? "chapter" : "scene"}.`
              : `${harperLints.length} suggestion${harperLints.length === 1 ? "" : "s"} in the current ${inChapterMode ? "chapter" : "scene"}.`}
          </p>
        {/if}
      {/if}
    </section>
    </div>
    <div class="settings-pane" id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" hidden={activeSettingsCategory !== "data"}>
      <h3 class="settings-pane-title">Data and sync</h3>
    <section class="preference-section">
      <div class="preference-heading"><strong>Data</strong><span>Back up or move your projects between devices</span></div>
      <div class="data-group">
        <span class="data-group-label">Local storage</span>
        <p class="data-help">Projects are stored in this app's local database. {storageUsageText()}</p>
        {#if storageError}
          <p class="data-help storage-warning">{storageError}</p>
        {/if}
      </div>
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
      <div class="data-group">
        <span class="data-group-label">Import a manuscript</span>
        <div class="data-actions">
          <button
            type="button"
            class="data-button"
            onclick={triggerEpubImport}
            disabled={epubImportBusy}
          >{epubImportBusy ? "Importing…" : "Import EPUB…"}</button>
          <button
            type="button"
            class="data-button"
            onclick={triggerMarkdownFolderImport}
            disabled={markdownImportBusy}
          >Import Markdown folder…</button>
        </div>
        <p class="data-help">Creates a new project from an EPUB file. Chapter structure and supported illustrations are preserved, and the cover becomes the project cover when it can be embedded.</p>
        <p class="data-help">Creates a new project from a folder of Markdown files (for example an Obsidian vault). You choose which folders are the manuscript and which become wiki pages.</p>
      </div>
      <div class="data-group">
        <span class="data-group-label">Device sync</span>
        <p class="data-help">
          {syncProviderType === "folder"
            ? "Keep this device in sync through a folder your devices already share, such as a Nextcloud folder."
            : "Keep this device in sync through Google Drive. Projects are encrypted with your passphrase before they are stored in your app data folder."}
        </p>
        {#if desktopRuntime}
          <div class="sync-provider-selector">
            <label>
              <input
                type="radio"
                name="sync-provider"
                value="folder"
                checked={syncProviderType === "folder"}
                onchange={() => handleSyncProviderChange("folder")}
                disabled={syncBusy}
              />
              <span>Local folder</span>
            </label>
            <label>
              <input
                type="radio"
                name="sync-provider"
                value="googledrive"
                checked={syncProviderType === "googledrive"}
                onchange={() => handleSyncProviderChange("googledrive")}
                disabled={syncBusy}
              />
              <span>Google Drive</span>
            </label>
          </div>
        {/if}
        <div class="sync-mode-options" role="radiogroup" aria-label="Sync method">
          <label class="sync-mode-option" class:selected={syncMode === "encrypted-file"}>
            <input
              type="radio"
              name="sync-method"
              value="encrypted-file"
              checked={syncMode === "encrypted-file"}
              onchange={() => setSyncMode("encrypted-file")}
              disabled={syncBusy}
            />
            <span class="sync-mode-copy">
              <strong>Single encrypted file</strong>
              <span>All projects in one passphrase-protected file. Best for cloud folders and Google Drive.</span>
            </span>
          </label>
          <label class="sync-mode-option" class:selected={syncMode === "open-folder"}>
            <input
              type="radio"
              name="sync-method"
              value="open-folder"
              checked={syncMode === "open-folder"}
              onchange={() => setSyncMode("open-folder")}
              disabled={syncBusy}
            />
            <span class="sync-mode-copy">
              <strong>Open folder</strong>
              <span>Plain Markdown and JSON, one folder per project. Not encrypted.</span>
            </span>
          </label>
          {#if syncMode === "encrypted-folder"}
            <label class="sync-mode-option selected">
              <input
                type="radio"
                name="sync-method"
                value="encrypted-folder"
                checked
                onchange={() => setSyncMode("encrypted-folder")}
                disabled={syncBusy}
              />
              <span class="sync-mode-copy">
                <strong>Encrypted folder (existing layout)</strong>
                <span>One encrypted file per project record. Keeps existing sync folders working.</span>
              </span>
            </label>
          {/if}
        </div>
        {#if syncMode === "open-folder"}
          <p class="data-warning">This sync location is not encrypted. Anyone with access to it can read and edit your writing. Delete scenes in ProseCraft rather than removing their files.</p>
        {:else if syncMode === "encrypted-file"}
          <p class="data-help">Writes one <code>prosecraft-sync.prosecraft</code> file. Projects are encrypted with your passphrase before they are written.</p>
        {:else}
          <p class="data-help">Writes <code>vault.json</code> and one encrypted file per project record.</p>
        {/if}
        {#if syncProviderType === "folder"}
          <div class="sync-folder-row">
            <span class="sync-folder-path" title={syncFolder}>{syncFolder || "No folder chosen"}</span>
            <button type="button" class="data-button" onclick={chooseSyncFolder} disabled={syncBusy}>Choose folder…</button>
          </div>
          {#if syncFolder}
            {#if syncMode !== "open-folder"}
              <input
                class="preference-select passphrase-input"
                type="password"
                aria-label="Sync passphrase"
                placeholder="Sync passphrase"
                autocomplete="current-password"
                bind:value={syncPassphrase}
                disabled={syncBusy}
              />
            {/if}
            <div class="data-actions">
              <button
                type="button"
                class="data-button"
                onclick={runSync}
                disabled={syncBusy || (syncMode !== "open-folder" && syncPassphrase.length < 8)}
              >
                {syncBusy ? "Syncing…" : "Sync now"}
              </button>
              <button type="button" class="data-button" onclick={forgetSyncSettings} disabled={syncBusy}>Forget folder</button>
            </div>
          {/if}
        {:else}
          <div class="google-drive-config">
            {#if googleDriveConfigured}
              <p class="google-drive-status">
                {googleDriveAuthenticated
                  ? `Connected as ${googleDriveEmail || "your Google account"}`
                  : "Google Drive is connected. The access token will be refreshed when you sync."}
              </p>
            {:else if googleDriveCodeVerifier}
              <p class="data-help">Complete the approval in the browser — you will return here automatically. If a code is shown instead (older desktop builds), copy the entire address bar, or just the <code>code=</code> value, and paste it below.</p>
              {#if googleDriveAuthUrl}
                <div class="data-actions">
                  <a class="data-button data-link" href={googleDriveAuthUrl} target="_blank" rel="noreferrer">Open authorization page</a>
                </div>
              {/if}
              <p class="data-help">If the code expired, choose Cancel and start again.</p>
              <input
                class="preference-select"
                type="text"
                aria-label="Authorization code"
                placeholder="Paste authorization code or redirect URL"
                bind:value={googleDriveAuthCode}
                disabled={syncBusy}
              />
              <div class="data-actions">
                <button type="button" class="data-button" onclick={exchangeAuthCode} disabled={syncBusy || !googleDriveAuthCode}>
                  Complete connection
                </button>
                <button type="button" class="data-button" onclick={cancelGoogleDriveAuth} disabled={syncBusy}>
                  Cancel
                </button>
              </div>
            {:else if googleDriveAuthorizing}
              <p class="data-help">Finish approving access in your browser. This window will update automatically.</p>
              <div class="data-actions">
                <button type="button" class="data-button" onclick={cancelGoogleDriveAuth}>
                  Cancel
                </button>
              </div>
            {:else}
              <div class="data-actions">
                <button type="button" class="data-button" onclick={connectGoogleDrive} disabled={syncBusy}>Connect to Google Drive</button>
              </div>
            {/if}
          </div>
          {#if googleDriveConfigured}
            {#if syncMode !== "open-folder"}
              <input
                class="preference-select passphrase-input"
                type="password"
                aria-label="Sync passphrase"
                placeholder="Sync passphrase"
                autocomplete="current-password"
                bind:value={syncPassphrase}
                disabled={syncBusy}
              />
            {/if}
            <div class="data-actions">
              <button
                type="button"
                class="data-button"
                onclick={runSync}
                disabled={syncBusy || (syncMode !== "open-folder" && syncPassphrase.length < 8)}
              >
                {syncBusy ? "Syncing…" : "Sync now"}
              </button>
              <button type="button" class="data-button" onclick={disconnectGoogleDrive} disabled={syncBusy}>Disconnect Google Drive</button>
            </div>
          {/if}
        {/if}
        {#if syncStatus}<p class="data-status" role="status">{syncStatus}</p>{/if}
      </div>
      <div class="data-group">
        <span class="data-group-label">Wiki files</span>
        {#if desktopRuntime}
          <p class="data-help">Imported wiki files live in a project folder on this device. They are stored as plain files, not encrypted, and are not included in project backups or device sync. Their metadata travels with the project. Files can be up to 200 MB each.</p>
          <div class="sync-folder-row">
            <span class="sync-folder-path" title={researchRoot}>{researchRoot || "No folder chosen"}</span>
            <button type="button" class="data-button" onclick={chooseResearchRoot}>Choose folder…</button>
          </div>
          <div class="data-actions">
            <button type="button" class="data-button" onclick={revealResearchProjectFolder}>Reveal project folder</button>
          </div>
          {#if researchSettingsStatus}<p class="data-status" role="status">{researchSettingsStatus}</p>{/if}
        {:else}
          <p class="data-help">Imported wiki files are stored as plain files in this browser’s local database. They are not encrypted or included in project backups or device sync. Files can be up to 200 MB each.</p>
        {/if}
      </div>
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
      <input
        id="epub-import-input"
        class="data-file-input"
        type="file"
        accept=".epub,application/epub+zip"
        bind:this={epubImportInput}
        onchange={handleEpubImport}
      />
      <input
        id="markdown-folder-input"
        class="data-file-input"
        type="file"
        multiple
        {...{ webkitdirectory: true }}
        bind:this={markdownFolderInput}
        onchange={handleMarkdownFolder}
      />
      {#if dataStatus}<p class="data-status" role="status">{dataStatus}</p>{/if}
    </section>
    {#if !preferencesSaved}
      <p class="preference-error" role="status">Could not save preferences. They may reset when you close the app.</p>
    {/if}
    </div>
    {#if !desktopRuntime}
    <div class="settings-pane" id="settings-panel-install" role="tabpanel" aria-labelledby="settings-tab-install" hidden={activeSettingsCategory !== "install"}>
      <h3 class="settings-pane-title">Updates and install</h3>
      <section class="preference-section">
        <div class="preference-heading"><strong>Install app</strong><span>Keep ProseCraft on this device</span></div>
        {#if installedStandalone}
          <p class="preference-help">ProseCraft is installed and running as an app on this device. The app shell opens offline; your projects stay in this device’s local database.</p>
        {:else if canInstallApp}
          <div class="data-actions">
            <button type="button" class="data-button" onclick={installApp}>Install ProseCraft</button>
          </div>
          <p class="preference-help">Install adds ProseCraft to your Home Screen or applications menu and keeps the writing app available offline.</p>
        {:else if isIosDevice}
          <p class="preference-help">On iPhone or iPad, open ProseCraft in Safari, tap the Share button, then choose <strong>Add to Home Screen</strong>. It will open full-screen and keep working offline.</p>
        {:else}
          <p class="preference-help">Use your browser’s install option to add ProseCraft to your device. In Chrome or Edge, choose <strong>Install app</strong> from the menu; in Firefox, choose <strong>Add to Home Screen</strong>. The app shell then opens offline.</p>
        {/if}
        {#if updateReady}
          <div class="data-actions">
            <button type="button" class="data-button" onclick={applyServiceWorkerUpdate} disabled={updateApplying}>
              {updateApplying ? "Updating…" : "Reload to update"}
            </button>
          </div>
          <p class="preference-help">An update is ready. Reloading keeps your writing saved and switches to the newest version.</p>
        {/if}
      </section>
    </div>
    {/if}
    <div class="settings-pane" id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about" hidden={activeSettingsCategory !== "about"}>
      <h3 class="settings-pane-title">About</h3>
    <div class="about-row">
      <button type="button" class="about-row-button" onclick={openAbout}>About {APP_NAME} · version {APP_VERSION}</button>
      <button type="button" class="about-row-button about-shortcuts-button" onclick={showShortcutsFromSettings}>Keyboard shortcuts</button>
    </div>
    </div>
    </div>
  </div>
  <div class="settings-footer"><span>Preferences are saved on this device.</span><button class="done-button" onclick={() => settingsDialog.close()}>Done</button></div>
</dialog>

<dialog class="settings-dialog" bind:this={aboutDialog} onclick={(event) => {
  if (event.target === aboutDialog) aboutDialog.close();
}}>
  <div class="settings-header">
    <div><span class="settings-kicker">ABOUT</span><h2>{APP_NAME}</h2></div>
    <button class="close-settings" aria-label="Close about" onclick={() => aboutDialog.close()}><X size={15} aria-hidden="true" /></button>
  </div>
  <div class="settings-body">
    <section class="preference-section">
      <div class="preference-heading">
        <strong>Version {APP_VERSION}</strong>
        <span>Licensed under the {APP_LICENSE} license</span>
        <span>Created by {APP_AUTHOR}</span>
      </div>
      <p class="about-link-row">
        <a class="about-link" href={APP_REPOSITORY_URL} target="_blank" rel="noreferrer" onclick={(event) => {
          event.preventDefault();
          void openExternalUrl(APP_REPOSITORY_URL);
        }}>{APP_REPOSITORY_URL}</a>
      </p>
    </section>
    <section class="preference-section">
      <div class="preference-heading"><strong>Diagnostics</strong><span>The report below contains no titles or text from your writing. It only describes the app and your setup.</span></div>
      <textarea
        class="about-diagnostics"
        aria-label="Diagnostics report"
        readonly
        bind:this={aboutDiagnosticsTextarea}
        bind:value={aboutDiagnostics}
      ></textarea>
      <div class="data-actions">
        <button type="button" class="data-button" onclick={copyDiagnostics}>Copy diagnostics</button>
      </div>
      <p class="preference-help" role="status">{aboutCopyStatus}</p>
    </section>
  </div>
  <div class="settings-footer"><span>{APP_NAME} {APP_VERSION}</span><button class="done-button" onclick={() => aboutDialog.close()}>Done</button></div>
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
      <button class="close-settings" aria-label="Close passphrase dialog" type="button" disabled={passphraseBusy} onclick={() => passphraseDialog.close()}><X size={15} aria-hidden="true" /></button>
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

<dialog class="settings-dialog starter-dialog" bind:this={starterDialog} onclick={(event) => {
  if (event.target === starterDialog) starterDialog.close();
}}>
  <form onsubmit={createProjectFromStarter}>
    <div class="settings-header">
      <div><span class="settings-kicker">PROSECRAFT</span><h2>Start from</h2></div>
      <button class="close-settings" aria-label="Close starter selection" type="button" onclick={() => starterDialog.close()}><X size={15} aria-hidden="true" /></button>
    </div>
    <div class="settings-body starter-body">
      <section class="starter-presets" aria-label="Wiki template">
        <div class="preference-heading"><strong>Wiki template</strong><span>Adds starter folders and template pages to the new project.</span></div>
        <div class="starter-options" role="radiogroup" aria-label="Starter">
          {#each STARTERS as starter (starter.id)}
            <label class="starter-option" class:selected={starterDraft === starter.id}>
              <input
                type="radio"
                name="starter"
                value={starter.id}
                checked={starterDraft === starter.id}
                onchange={() => selectStarter(starter.id)}
              />
              <span class="starter-copy">
                <strong>{starter.label}</strong>
                <span>{starter.description}</span>
              </span>
            </label>
          {/each}
        </div>
        {#if starterCustomStarters.length > 0}
          <div class="preference-heading starter-subheading"><strong>My templates</strong><span>Saved in this browser.</span></div>
          <div class="starter-options" role="radiogroup" aria-label="My templates">
            {#each starterCustomStarters as template (template.id)}
              <div class="starter-template">
                <label class="starter-option" class:selected={starterDraft === `custom:${template.id}`}>
                  <input
                    type="radio"
                    name="starter"
                    value={`custom:${template.id}`}
                    checked={starterDraft === `custom:${template.id}`}
                    onchange={() => selectStarter(`custom:${template.id}`)}
                  />
                  <span class="starter-copy">
                    <strong>{template.name}</strong>
                    <span>{starterSummary(template.blueprint)}</span>
                  </span>
                </label>
                <button
                  type="button"
                  class="starter-icon"
                  aria-label={`Delete ${template.name}`}
                  onclick={() => deleteStarterTemplate(template.id)}
                ><Trash2 size={13} aria-hidden="true" /></button>
              </div>
            {/each}
          </div>
        {/if}
      </section>
      <section class="starter-customise" aria-label="Customise">
        <div class="preference-heading">
          <strong>Customise</strong>
          <span>{starterSummary(filterBlueprint(starterWorking, starterSelected))}</span>
        </div>
        <div class="starter-modules">
          <div class="starter-modules-head">
            <strong>Modules</strong>
            <span class="starter-modules-count">{starterIncludedModules.length} of {STARTER_MODULES.length} included</span>
            {#if starterIncludedModules.length > 0}
              <button type="button" class="starter-clear" onclick={clearStarterModules}>Clear</button>
            {/if}
          </div>
          <p class="starter-modules-hint">Choose the world-building modules to include in the new project.</p>
          <div class="starter-module-grid">
            {#each STARTER_MODULES as module (module.id)}
              {@const folder = starterWorking.folders.find((entry) => entry.key === moduleFolderKey(module.id))}
              {@const included = folder ? isStarterFolderIncluded(folder) : false}
              <button
                type="button"
                class="starter-module"
                class:active={included}
                aria-pressed={included}
                onclick={() => toggleStarterModule(module.id)}
              >
                <span class="starter-module-label">
                  <strong>{module.label}</strong>
                  {#if included}<Check size={12} aria-hidden="true" />{/if}
                </span>
                <span class="starter-module-copy">{module.description}</span>
              </button>
            {/each}
          </div>
        </div>
        {#if starterExtraFolders.length > 0}
          <div class="starter-modules">
            <div class="starter-modules-head">
              <strong>Template content</strong>
              <span class="starter-modules-count">{starterIncludedExtras.length} of {starterExtraFolders.length} included</span>
            </div>
            <p class="starter-modules-hint">Folders from the selected template that aren't modules.</p>
            <div class="starter-module-grid">
              {#each starterExtraFolders as folder (folder.key)}
                {@const included = isStarterFolderIncluded(folder)}
                <button
                  type="button"
                  class="starter-module"
                  class:active={included}
                  aria-pressed={included}
                  onclick={() => setStarterFolderIncluded(folder, !included)}
                >
                  <span class="starter-module-label">
                    <strong>{folder.name}</strong>
                    {#if included}<Check size={12} aria-hidden="true" />{/if}
                  </span>
                  <span class="starter-module-copy">{folder.pages.length === 0 ? "Empty folder" : folder.pages.map((page) => page.title).join(" · ")}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
        <div class="starter-save">
          <input
            type="text"
            bind:value={starterTemplateName}
            placeholder="Template name"
            aria-label="Template name"
            onkeydown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveStarterTemplate(); } }}
          />
          <button type="button" class="starter-add-button" onclick={saveStarterTemplate} disabled={!starterTemplateName.trim()}>Save as my template</button>
        </div>
        {#if starterNotice}<p class="starter-notice" role="status">{starterNotice}</p>{/if}
      </section>
    </div>
    <div class="settings-footer">
      <span>You can add pages later.</span>
      <div class="starter-dialog-actions">
        <button type="button" class="starter-cancel" onclick={() => starterDialog.close()}>Cancel</button>
        <button class="done-button" type="submit">Create</button>
      </div>
    </div>
  </form>
</dialog>

<dialog class="settings-dialog project-settings-dialog" bind:this={projectSettingsDialog} onclick={(event) => {
  if (event.target === projectSettingsDialog) projectSettingsDialog.close();
}}>
  <form onsubmit={saveProjectSettings}>
    <div class="settings-header">
      <div><span class="settings-kicker">PROSECRAFT</span><h2>Project Settings</h2></div>
      <button class="close-settings" aria-label="Close project settings" type="button" onclick={() => projectSettingsDialog.close()}><X size={15} aria-hidden="true" /></button>
    </div>
    <div class="settings-body">
      <section class="preference-section">
        <div class="preference-heading"><strong>Project details</strong><span>Set the title and author shown in your workspace</span></div>
        <label class="preference-label" for="project-name">Project name</label>
        <input id="project-name" class="preference-select" type="text" bind:value={projectNameDraft} maxlength="100" required />
        <label class="preference-label project-author-label" for="author-name">Author name</label>
        <input id="author-name" class="preference-select" type="text" bind:value={authorNameDraft} maxlength="100" />
      </section>
      <section class="preference-section">
        <div class="preference-heading"><strong>Labels</strong><span>Rename, recolour or remove the labels used on scenes and chapters</span></div>
        <button class="data-button" type="button" onclick={(event) => openLabelsDialog(event.currentTarget)}>Manage labels…</button>
      </section>
      {#if !projectSettingsSaved}
        <p class="preference-error" role="status">Could not save project settings. Please check available storage and try again.</p>
      {/if}
    </div>
    <div class="settings-footer"><span>Project details are saved on this device.</span><button class="done-button" type="submit">Save</button></div>
  </form>
</dialog>

<dialog class="settings-dialog labels-dialog" bind:this={labelsDialog} onclose={restoreLabelsDialogFocus} onclick={(event) => {
  if (event.target === labelsDialog) labelsDialog.close();
}}>
  <form onsubmit={saveLabels}>
    <div class="settings-header">
      <div><span class="settings-kicker">PROSECRAFT</span><h2>Labels</h2></div>
      <button class="close-settings" aria-label="Close labels" type="button" onclick={() => labelsDialog.close()}><X size={15} aria-hidden="true" /></button>
    </div>
    <div class="settings-body">
      <section class="preference-section">
        <div class="preference-heading"><strong>Scene and chapter labels</strong><span>Rename a label, pick its colour or remove it. Changes apply to this project when you save.</span></div>
        {#each labelDrafts as label, index (label.id)}
          <div class="label-editor">
            <span class="label-editor-dot" style={`--label-color: ${labelColorCss(label.color)}`} aria-hidden="true"></span>
            <input
              id={`label-name-${label.id}`}
              class="preference-select label-editor-name"
              type="text"
              aria-label={`Name for label ${index + 1}`}
              bind:value={label.name}
              maxlength="40"
              required
            />
            <div class="label-swatches" role="radiogroup" aria-label={`Colour for ${label.name || "label"}`}>
              {#each LABEL_COLORS as entry (entry.key)}
                <label class="label-swatch" style={`--label-color: ${entry.css}`} title={entry.key}>
                  <input
                    type="radio"
                    name={`label-color-${label.id}`}
                    value={entry.key}
                    aria-label={entry.key}
                    checked={label.color === entry.key}
                    onchange={() => (label.color = entry.key)}
                  />
                  <span class="label-swatch-dot" aria-hidden="true"></span>
                </label>
              {/each}
            </div>
            <button class="data-button danger-button label-delete" type="button" aria-label={`Delete label ${label.name || "unnamed"}`} onclick={() => deleteLabelDraft(label.id)}>Delete</button>
          </div>
        {/each}
        <div class="labels-actions">
          <button class="data-button" type="button" disabled={labelDrafts.length >= 24} onclick={addLabelDraft}>Add label</button>
          <button class="data-button" type="button" onclick={resetLabelDrafts}>Reset to defaults</button>
        </div>
      </section>
    </div>
    <div class="settings-footer"><span>Labels are saved with this project.</span><button class="done-button" type="submit">Save</button></div>
  </form>
</dialog>

<dialog class="settings-dialog comments-dialog" bind:this={commentsDialog} onclick={(event) => {
  if (event.target === commentsDialog) commentsDialog.close();
}}>
  <div class="settings-header">
    <div><span class="settings-kicker">SCENE</span><h2>Comments</h2></div>
    <button class="close-settings" aria-label="Close comments" type="button" onclick={() => commentsDialog.close()}>×</button>
  </div>
  <div class="settings-body">
    <section class="preference-section">
      <div class="preference-heading"><strong>New comment</strong><span>Notes for yourself, a co-author, a proofreader or an agent. They are not part of the text or of any export.</span></div>
      {#if pendingAnchor}
        <form class="comment-form" onsubmit={addComment}>
          <blockquote class="comment-quote">{pendingAnchor.quote.length > 160 ? `${pendingAnchor.quote.slice(0, 160)}…` : pendingAnchor.quote}</blockquote>
          <textarea class="preference-select" rows="3" placeholder="Your comment" maxlength="4000" bind:value={commentDraft} aria-label="Comment text" required></textarea>
          <div class="comment-form-row">
            <input class="preference-select" type="text" placeholder="Name" maxlength="60" bind:value={commentAuthor} aria-label="Author name" />
            <button class="data-button" type="submit">Add comment</button>
          </div>
        </form>
      {:else if markdownEditorMode}
        <p class="data-help">Comments attach to the rich text editor. Switch back to it to add or jump to a comment.</p>
      {:else}
        <p class="data-help">Select some text in the scene, then press the comment button again.</p>
      {/if}
    </section>
    <section class="preference-section">
      <div class="preference-heading">
        <strong>{showAllComments ? "All project comments" : "In this scene"}</strong>
        {#if resolvedCommentCount > 0}
          <label class="comment-resolved-toggle"><input type="checkbox" bind:checked={showResolvedComments} /> Show resolved ({resolvedCommentCount})</label>
        {/if}
      </div>
      {#if activeComments.length === 0}
        <p class="data-help">No comments yet.</p>
      {:else}
        <ul class="comment-list">
          {#each activeComments as comment (comment.id)}
            <li class="comment-item" class:resolved={comment.resolved}>
              {#if showAllComments}
                <div class="comment-location">{commentLocation(comment)}</div>
              {/if}
              <blockquote class="comment-quote">{comment.quote.length > 120 ? `${comment.quote.slice(0, 120)}…` : comment.quote}</blockquote>
              <p class="comment-body">{comment.body}</p>
              <div class="comment-meta">{comment.author} · {new Date(comment.createdAt).toLocaleDateString()}{commentPositions[comment.id] === null ? " · text not found any more" : ""}</div>
              <div class="comment-actions">
                <button class="data-button" type="button" disabled={markdownEditorMode || commentPositions[comment.id] === null} onclick={() => goToComment(comment)}>Go to</button>
                <button class="data-button" type="button" onclick={() => resolveComment(comment.id, !comment.resolved)}>{comment.resolved ? "Reopen" : "Resolve"}</button>
                <button class="data-button danger-button" type="button" aria-label="Delete comment" onclick={() => deleteComment(comment.id)}>Delete</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</dialog>

<dialog class="settings-dialog snapshots-dialog" bind:this={snapshotsDialog} onclick={(event) => {
  if (event.target === snapshotsDialog) snapshotsDialog.close();
}}>
  <div class="settings-header">
    <div><span class="settings-kicker">{inChapterMode ? "CHAPTER" : "SCENE"}</span><h2>Snapshots</h2></div>
    <button class="close-settings" aria-label="Close snapshots" type="button" onclick={() => snapshotsDialog.close()}><X size={15} aria-hidden="true" /></button>
  </div>
  <div class="settings-body">
    <section class="preference-section">
      <div class="preference-heading"><strong>Save this version</strong><span>Keeps a copy of “{title || "Untitled"}” as it is now. Up to ten are kept per scene.</span></div>
      <form class="snapshot-form" onsubmit={takeSnapshot}>
        <input class="preference-select" type="text" placeholder="Optional note" maxlength="120" autocapitalize="sentences" bind:value={snapshotNote} aria-label="Snapshot note" />
        <button class="data-button" type="submit">Take snapshot</button>
      </form>
    </section>
    <section class="preference-section">
      <div class="preference-heading"><strong>Earlier versions</strong><span>Restoring first saves the current text, so you can go back.</span></div>
      {#if activeSnapshots.length === 0}
        <p class="data-help">No snapshots of this {inChapterMode ? "chapter" : "scene"} yet.</p>
      {:else}
        <ul class="snapshot-list">
          {#each activeSnapshots as snapshot (snapshot.id)}
            <li class="snapshot-item">
              <div class="snapshot-meta">
                <strong>{snapshotLabel(snapshot)}</strong>
                <span>{inChapterMode ? `${snapshotSceneTitle(snapshot)} · ` : ""}{countWords(htmlToPlainText(snapshot.content))} words{snapshot.note ? ` · ${snapshot.note}` : ""}</span>
              </div>
              <div class="snapshot-actions">
                <button class="data-button" type="button" onclick={() => { snapshotPreviewId = snapshotPreviewId === snapshot.id ? null : snapshot.id; }}>{snapshotPreviewId === snapshot.id ? "Hide" : "Preview"}</button>
                <button class="data-button" type="button" onclick={() => restoreSnapshot(snapshot.id)}>Restore</button>
                <button class="data-button danger-button" type="button" aria-label="Delete snapshot" onclick={() => deleteSnapshot(snapshot.id)}>Delete</button>
              </div>
              {#if snapshotPreviewId === snapshot.id}
                <div class="snapshot-preview">{@html cleanHtml(snapshot.content)}</div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</dialog>

<dialog class="settings-dialog markdown-import-dialog" bind:this={markdownImportDialog} onclick={(event) => {
  if (event.target === markdownImportDialog && !markdownImportBusy) markdownImportDialog.close();
}}>
  <form onsubmit={(event) => void importMarkdownFolder(event)}>
    <div class="settings-header">
      <div><span class="settings-kicker">IMPORT</span><h2>Markdown folder</h2></div>
      <button class="close-settings" aria-label="Close import" type="button" onclick={() => markdownImportDialog.close()}>×</button>
    </div>
    <div class="settings-body">
      <section class="preference-section">
        <div class="preference-heading"><strong>Project name</strong><span>{markdownImportFiles.length} Markdown file(s) found{markdownImportIgnored > 0 ? `, ${markdownImportIgnored} other file(s) ignored` : ""}.</span></div>
        <input class="preference-select" type="text" maxlength="100" bind:value={markdownImportName} aria-label="Project name" required />
      </section>
      <section class="preference-section">
        <div class="preference-heading"><strong>What is in each folder?</strong><span>Manuscript folders become chapters and scenes, wiki folders become wiki pages. A folder with several subfolders (say, several drafts) can be set per subfolder. Hidden folders and folders starting with “_” are skipped.</span></div>
        <ul class="markdown-folder-list">
          {#each markdownImportFolders as folder (folder.path)}
            <li style={`padding-left: ${folder.depth * 16}px`}>
              <span class="markdown-folder-name">{folder.name} <em>({folder.files})</em></span>
              <select class="preference-select" aria-label="Use {folder.path} as" bind:value={markdownImportRoles[folder.path]}>
                <option value="manuscript">Manuscript</option>
                <option value="wiki">Wiki</option>
                <option value="skip">Skip</option>
              </select>
            </li>
          {/each}
        </ul>
        {#if markdownImportOnLocalStorage}
          <p class="data-help" class:data-warning={markdownImportStoredChars > STORAGE_WARN_CHARS}>
            {markdownImportStoredChars > STORAGE_WARN_CHARS
              ? "This is probably too much for ProseCraft's storage, which holds roughly four million characters in total. Try skipping large folders, such as research cards or older drafts."
              : `Selected: about ${(markdownImportStoredChars / 1_000_000).toFixed(1)} of roughly 4 million characters of storage.`}
          </p>
        {:else}
          <p class="data-help">{markdownImportSelectedCount} Markdown file(s) selected.</p>
        {/if}
      </section>
      {#if Object.values(markdownImportRoles).includes("manuscript")}
        <section class="preference-section">
          <div class="preference-heading"><strong>Chapters</strong><span>Files are ordered by their <code>position</code> header when they all have one, otherwise by name.</span></div>
          <select class="preference-select" aria-label="How to make chapters" bind:value={markdownImportMode}>
            <option value="folders">Every folder is a chapter, every file a scene</option>
            <option value="files">Every file is a chapter</option>
          </select>
        </section>
      {/if}
    </div>
    <div class="settings-footer"><span>Nothing in your folder is changed.</span><button class="done-button" type="submit" disabled={markdownImportBusy}>Import</button></div>
  </form>
</dialog>

<dialog class="settings-dialog research-link-dialog" bind:this={researchLinkDialog} onclick={(event) => {
  if (event.target === researchLinkDialog) researchLinkDialog.close();
}}>
  <form onsubmit={saveResearchLink}>
    <div class="settings-header">
      <div><span class="settings-kicker">WIKI</span><h2>Add web link</h2></div>
      <button class="close-settings" aria-label="Close link dialog" type="button" onclick={() => researchLinkDialog.close()}><X size={15} aria-hidden="true" /></button>
    </div>
    <div class="settings-body">
      <section class="preference-section">
        <div class="preference-heading"><strong>Link details</strong><span>Save a website or online resource in the Wiki</span></div>
        <label class="preference-label" for="research-link-url">Web address</label>
        <input
          id="research-link-url"
          class="preference-select"
          type="text"
          inputmode="url"
          placeholder="https://example.com"
          autocapitalize="off"
          autocorrect="off"
          enterkeyhint="done"
          bind:value={researchLinkUrl}
          required
        />
        <label class="preference-label research-link-label" for="research-link-title">Title</label>
        <input
          id="research-link-title"
          class="preference-select"
          type="text"
          placeholder="Optional — defaults to the site name"
          maxlength="200"
          bind:value={researchLinkTitle}
        />
        <label class="preference-label research-link-label" for="research-link-description">Description</label>
        <textarea
          id="research-link-description"
          class="preference-select research-link-description"
          rows="3"
          placeholder="Optional note about this resource"
          maxlength="2000"
          bind:value={researchLinkDescription}
        ></textarea>
        {#if researchLinkError}<p class="preference-error" role="alert">{researchLinkError}</p>{/if}
      </section>
    </div>
    <div class="settings-footer"><span>Only http and https links are supported.</span><button class="done-button" type="submit">Add link</button></div>
  </form>
</dialog>

{#if projectSearchOpen}
  <SearchDialog
    documents={documents}
    chapters={chapters}
    initialQuery={searchInitialQuery}
    onOpen={openSearchResult}
    onClose={() => projectSearchOpen = false}
    onFlush={flushEditorForReplace}
    onSnapshot={snapshotBeforeReplace}
    onReplace={applyProjectReplace}
  />
{/if}

<dialog class="settings-dialog rich-dialog" bind:this={richDialog} onclick={(event) => {
  if (event.target === richDialog) closeRichDialog();
}} onclose={() => { richDialogOpen = false; }}>
  <form onsubmit={(event) => { event.preventDefault(); saveRichDialog(); }}>
    <div class="settings-header">
      <div>
        <span class="settings-kicker">{richDialogNoun.toUpperCase()}</span>
        <h2>{richEditTarget ? "Edit" : "Insert"} {richDialogNoun}</h2>
      </div>
      <button class="close-settings" aria-label="Close {richDialogNoun} editor" type="button" onclick={closeRichDialog}><X size={15} aria-hidden="true" /></button>
    </div>
    <div class="settings-body rich-dialog-body">
      {#if richDialogKind === "math"}
        <div class="rich-kind-toggle" role="group" aria-label="Equation layout">
          <button type="button" class:active={richDisplay === "inline"} onclick={() => (richDisplay = "inline")}>Inline</button>
          <button type="button" class:active={richDisplay === "block"} onclick={() => (richDisplay = "block")}>Block</button>
        </div>
        <label class="preference-label" for="rich-math-source">LaTeX</label>
        <textarea
          id="rich-math-source"
          class="preference-select rich-source"
          rows="5"
          maxlength={MAX_MATH_SOURCE_LENGTH}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder="E = mc^2"
          bind:value={richSource}
        ></textarea>
        <p class="rich-help">Inline equations sit in a sentence; block equations centre on their own line.</p>
      {:else if richDialogKind === "diagram"}
        <label class="preference-label" for="rich-diagram-source">Mermaid</label>
        <textarea
          id="rich-diagram-source"
          class="preference-select rich-source"
          rows="9"
          maxlength={MAX_DIAGRAM_SOURCE_LENGTH}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder={"graph TD\n  A[Start] --> B[Finish]"}
          bind:value={richSource}
        ></textarea>
        <p class="rich-help">Use any Mermaid diagram type, such as flowchart, sequence, class, state, or gantt.</p>
      {:else}
        <label class="preference-label" for="rich-calc-source">Calculation</label>
        <textarea
          id="rich-calc-source"
          class="preference-select rich-source"
          rows="9"
          maxlength={MAX_CALC_SOURCE_LENGTH}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder={"m := 5 kg\na := 9.81 m/s^2\nF := m a =\nF = kN"}
          bind:value={richSource}
        ></textarea>
        <p class="rich-help">MathCAD-style worksheet, evaluated top to bottom. <code>x := 5 m</code> defines, a trailing <code>=</code> shows the value, and <code>= kN</code> picks the unit. Define functions with <code>f(x) := x^2</code>; lines starting with <code>#</code> are text.</p>
      {/if}
      <div class="rich-preview-frame" aria-live="polite">
        {#if richPreviewBusy}
          <span class="rich-preview-status">Rendering…</span>
        {:else if richPreviewError}
          <p class="preference-error rich-preview-error">{richPreviewError}</p>
        {:else if richPreviewSvg}
          <div class="rich-preview">{@html richPreviewSvg}</div>
        {:else}
          <span class="rich-preview-status">Preview appears here.</span>
        {/if}
      </div>
      {#if richDialogError}<p class="preference-error" role="alert">{richDialogError}</p>{/if}
    </div>
    <div class="settings-footer">
      <span>Saved as editable source.</span>
      <div class="rich-dialog-actions">
        {#if richEditTarget}
          <button type="button" class="rich-remove" onclick={removeRichTarget}>Remove</button>
        {/if}
        <button type="button" class="rich-cancel" onclick={closeRichDialog}>Cancel</button>
        <button type="submit" class="done-button">{richEditTarget ? "Update" : "Insert"}</button>
      </div>
    </div>
  </form>
</dialog>

<input
  class="data-file-input"
  type="file"
  multiple
  aria-label="Add wiki files"
  bind:this={researchFileInput}
  onchange={handleBrowserResearchFiles}
/>

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
  :global(html) { min-height: 100%; background: var(--page-bg); -webkit-text-size-adjust: 100%; }
  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
    min-height: 100dvh;
    color: var(--text-primary);
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    overscroll-behavior-y: none;
    -webkit-font-smoothing: antialiased;
  }
  :global(button), :global(input), :global(select) { font: inherit; }
  :global(button) { color: inherit; }
  :global(button), :global(a) { -webkit-tap-highlight-color: transparent; }
  :global(button), :global(a) { touch-action: manipulation; }
  :global(html), :global(body) { overscroll-behavior-y: none; }
  /* Long-press menus own these rows: never let iOS text selection or the
     system callout fight them. Editor text stays selectable. */
  .tree-name, .chapter-drag, .scene-mark, .label-dot, .chevron, .folder-icon,
  .space-icon, .note-folder-icon { -webkit-touch-callout: none; user-select: none; }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: block;
    padding: 0;
    border: 0;
    background: var(--backdrop);
    backdrop-filter: blur(1px);
    cursor: pointer;
  }
  .sidebar-mobile-head { display: none; }

  .app-shell { display: flex; min-height: 100vh; min-height: 100dvh; }
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
  .project-identity-actions button:disabled { opacity: .35; cursor: default; }
  .project-identity-actions button:disabled:hover { background: transparent; color: var(--text-muted); }
  .author-name { overflow: hidden; max-width: 100%; color: var(--text-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .project-identity .author-name { grid-column: 1; grid-row: 2; padding-top: 2px; }
  .nav-label { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1px; }
  .sidebar-tree { min-height: 0; flex: 1; overflow-y: auto; margin-top: 28px; padding: 0 1px; scrollbar-width: thin; scrollbar-color: var(--scrollbar) transparent; overscroll-behavior: contain; }
  .tree-heading, .space-heading, .chapter-row { display: flex; min-width: 0; align-items: center; }
  .tree-heading { justify-content: space-between; padding: 0 7px 7px; }
  .tree-add, .row-add, .row-action { display: grid; width: 23px; height: 23px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1; }
  .tree-add:hover, .row-add:hover, .row-action:hover { background: var(--hover-bg); color: var(--selected-text); }
  .chapter-list { display: flex; flex-direction: column; gap: 2px; }
  .chapter-group, .space-group { min-width: 0; }
  .chapter-group.dragging { opacity: .45; }
  .chapter-group { position: relative; }
  .chapter-group.drop-before::before, .chapter-group.drop-after::after { position: absolute; right: 2px; left: 2px; z-index: 1; height: 2px; border-radius: 2px; background: var(--accent); content: ""; pointer-events: none; }
  .scene-row { position: relative; }
  .scene-row.dragging { opacity: .45; }
  .scene-row.drop-before::before, .scene-row.drop-after::after { position: absolute; right: 2px; left: 2px; z-index: 1; height: 2px; border-radius: 2px; background: var(--accent); content: ""; pointer-events: none; }
  .scene-row.drop-before::before { top: -2px; }
  .scene-row.drop-after::after { bottom: -2px; }
  .chapter-row.scene-drop-target, .scene-list.scene-drop-target { outline: 2px dashed var(--accent); outline-offset: -2px; }
  .chapter-group.drop-before::before { top: -2px; }
  .chapter-group.drop-after::after { bottom: -2px; }
  .chapter-row, .space-heading { min-height: 32px; padding: 0 4px; border-radius: 5px; }
  .chapter-row:hover, .space-heading:hover { background: var(--hover-bg); }
  .chapter-toggle, .space-toggle { display: flex; min-width: 0; height: 30px; flex: 1; align-items: center; gap: 7px; padding: 0 3px; border: 0; background: transparent; color: var(--text-nav); cursor: pointer; text-align: left; }
  .chapter-drag { display: grid; width: 19px; height: 23px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: grab; font-size: 15px; line-height: 1; touch-action: none; opacity: 0; }
  .chapter-drag:active { cursor: grabbing; }
  .chapter-row:hover .chapter-drag, .chapter-row:focus-within .chapter-drag, .chapter-drag:focus-visible { opacity: 1; }
  .chapter-actions { display: flex; flex: 0 0 auto; align-items: center; }
  .chapter-drag:hover { background: var(--hover-bg); color: var(--text-primary); }
  .chapter-name-input { min-width: 0; flex: 1; padding: 2px 3px; border: 1px solid var(--border-control); border-radius: 3px; background: var(--control-bg); color: var(--text-primary); font-size: 10px; }
  .chapter-name-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .chevron { display: inline-block; width: 14px; flex: 0 0 auto; color: var(--text-faint); font-size: 17px; line-height: 1; transform: rotate(0deg); transition: transform .12s ease; }
  .chevron.rotated { transform: rotate(90deg); }
  .folder-icon { width: 15px; height: 15px; flex: 0 0 auto; color: var(--text-muted); }
  .tree-name { overflow: hidden; min-width: 0; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
  .chapter-toggle .tree-name, .space-toggle .tree-name { color: var(--text-nav); font-size: 11px; font-weight: 550; }
  .row-add { opacity: 0; }
  .chapter-row:hover .row-add:not(:disabled), .row-add:focus-visible { opacity: 1; }
  .row-add.research-add { opacity: .55; }
  .row-add.research-add:focus-visible { opacity: 1; }
  .row-add:disabled { opacity: .18; cursor: default; }
  .ctx-menu { position: fixed; z-index: 80; display: flex; min-width: 210px; max-width: min(280px, calc(100vw - 16px)); max-height: min(70vh, 480px); flex-direction: column; gap: 1px; overflow-y: auto; overscroll-behavior: contain; padding: 4px; border: 1px solid var(--border-control); border-radius: 8px; background: var(--surface-raised); box-shadow: var(--shadow-panel); }
  .ctx-menu button { display: flex; width: 100%; min-height: 38px; align-items: center; gap: 8px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--text-primary); cursor: pointer; font-size: 12px; text-align: left; }
  .ctx-menu button:hover:not(:disabled), .ctx-menu button:focus-visible { background: var(--hover-bg); color: var(--text-heading); outline: none; }
  .ctx-menu button:disabled { opacity: .4; cursor: default; }
  .ctx-menu button.danger { color: var(--danger); }
  .ctx-menu button.danger:hover:not(:disabled), .ctx-menu button.danger:focus-visible { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
  .ctx-menu button[aria-checked="true"] { font-weight: 600; }
  .ctx-menu .label-dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--label-color); }
  .ctx-section { display: flex; flex-direction: column; gap: 1px; }
  .ctx-divider { height: 1px; margin: 4px 6px; background: var(--border-soft); }
  .ctx-subsection { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 2px 10px; padding-left: 6px; border-left: 1px solid var(--border-soft); }
  .ctx-add-wrap { display: flex; flex: 0 0 auto; align-items: center; }
  .label-trigger { display: grid; width: 16px; height: 22px; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
  .label-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .label-trigger .label-dot { width: 10px; height: 10px; border: 1.5px solid var(--text-faint); border-radius: 50%; opacity: .75; transition: opacity .12s ease, border-color .12s ease; }
  .document-row:hover .label-trigger .label-dot, .chapter-row:hover .label-trigger .label-dot, .label-trigger:hover .label-dot, .label-trigger:focus-visible .label-dot { border-color: var(--text-muted); opacity: 1; }
  .label-trigger.has-label .label-dot { border-color: var(--label-color); background: var(--label-color); opacity: 1; }
  /* Scene rows pad 2px on the right vs 4px on chapter rows; nudge the scene
     label so both dots share the same right edge. */
  .scene-row .label-trigger { margin-right: 2px; }
  .label-filter { display: grid; gap: 5px; padding: 0 7px 9px; }
  .label-filter-label { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }
  .label-filter-select { width: 100%; height: 27px; padding: 0 6px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); font-size: 10px; }
  .label-filter-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .label-filter-chip { display: inline-flex; justify-self: start; align-items: center; gap: 6px; max-width: 100%; padding: 3px 8px; border: 1px solid var(--border-control); border-radius: 999px; background: var(--surface-raised); color: var(--text-secondary); cursor: pointer; font-size: 9px; }
  .label-filter-chip:hover { border-color: var(--accent); color: var(--text-heading); }
  .label-filter-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .label-filter-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--label-color); }
  .label-editor { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; padding: 8px 0; border-bottom: 1px solid var(--border-soft); }
  .label-editor-dot { width: 10px; height: 10px; flex: 0 0 auto; border-radius: 50%; background: var(--label-color); }
  .label-editor-name { flex: 1 1 150px; width: auto; min-width: 0; height: 30px; }
  .label-swatches { display: flex; flex-wrap: wrap; gap: 2px; }
  .label-swatch { position: relative; display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; cursor: pointer; }
  .label-swatch input { position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0; }
  .label-swatch-dot { width: 13px; height: 13px; border: 1px solid var(--border-control); border-radius: 50%; background: var(--label-color); }
  .label-swatch input:checked + .label-swatch-dot { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--text-heading); }
  .label-swatch input:focus-visible + .label-swatch-dot { outline: 2px solid var(--accent); outline-offset: 2px; }
  .label-delete { margin-left: auto; height: 27px; padding: 0 9px; font-size: 10px; }
  .labels-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
  .label-menu-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .label-menu-none { color: var(--text-muted); }
  .scene-list, .space-items { display: flex; flex-direction: column; gap: 1px; margin: 1px 0 5px 22px; padding-left: 7px; border-left: 1px solid var(--tree-divider); }
  .space-items.wiki-items { margin-left: 0; padding-left: 0; border-left: 0; }
  .space-items.wiki-items.wiki-drop-root { outline: 2px dashed var(--accent); outline-offset: 4px; border-radius: 6px; }
  .note-folder-row, .note-document-row { position: relative; }
  .note-folder-row.dragging, .note-document-row.dragging { opacity: .45; }
  .note-folder-row.drop-before::before, .note-folder-row.drop-after::after,
  .note-document-row.drop-before::before, .note-document-row.drop-after::after { position: absolute; right: 2px; left: 2px; z-index: 1; height: 2px; border-radius: 2px; background: var(--accent); content: ""; pointer-events: none; }
  .note-folder-row.drop-before::before, .note-document-row.drop-before::before { top: -2px; }
  .note-folder-row.drop-after::after, .note-document-row.drop-after::after { bottom: -2px; }
  .note-folder-row.wiki-drop-target { outline: 2px dashed var(--accent); outline-offset: -2px; }
  .note-folder-row { display: flex; min-width: 0; min-height: 29px; align-items: center; gap: 1px; padding-right: 2px; border-radius: 5px; }
  .note-folder-row:hover { background: var(--hover-bg); }
  .note-folder-toggle { display: flex; min-width: 0; height: 27px; flex: 1; align-items: center; gap: 5px; padding: 0 3px; border: 0; background: transparent; color: var(--text-nav); cursor: pointer; text-align: left; font-size: 10px; }
  .note-folder-icon { width: 13px; flex: 0 0 auto; color: var(--text-muted); font-size: 13px; text-align: center; }
  .note-folder-actions { display: flex; flex: 0 0 auto; align-items: center; }
  .note-folder-name-input { height: 23px; }
  .note-document-row { padding-right: 2px; }
  .document-row { display: flex; min-width: 0; min-height: 29px; align-items: center; gap: 1px; padding: 0 2px; border-radius: 5px; }
  .document-row:hover, .document-row.current { background: var(--selected-bg); }
  .document-select { display: flex; min-width: 0; height: 27px; flex: 1; align-items: center; gap: 7px; padding: 0 4px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; text-align: left; font-size: 10px; }
  .document-row.current .document-select { color: var(--selected-text); font-weight: 600; }
  .scene-mark { flex: 0 0 auto; color: var(--text-faint); font-family: Georgia, serif; font-size: 13px; }
  .row-action { width: 21px; height: 21px; opacity: .45; font-size: 15px; }
  .document-row:hover .row-action, .row-action:focus-visible { opacity: 1; }
  .restore-action, .delete-action { opacity: 1; }
  .research-file-mark { min-width: 20px; font-size: 9px; letter-spacing: -.02em; text-align: center; }
  .research-link-mark { color: var(--text-muted); font-family: inherit; font-size: 12px; }
  .research-item-row .document-select { gap: 5px; }
  .focus-hint { position: fixed; z-index: 50; bottom: 22px; left: 50%; margin: 0; padding: 7px 14px; transform: translateX(-50%); border: 1px solid var(--border-control); border-radius: 999px; background: var(--surface); color: var(--text-muted); font-size: 10px; pointer-events: none; }
  .research-status { margin: 4px 6px 3px; color: var(--text-muted); font-size: 10px; line-height: 1.45; overflow-wrap: anywhere; }
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
  .shortcuts-button { display: grid; width: 22px; height: 22px; margin-left: auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .shortcuts-button:hover { background: var(--hover-bg); color: var(--text-primary); }
  .shortcuts-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .sync-status { display: flex; align-items: center; gap: 7px; padding: 0 8px 13px; color: var(--text-muted); font-size: 10px; }
  .version-button { margin-left: auto; padding: 0; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 9px; letter-spacing: .3px; }
  .version-button:hover { color: var(--text-secondary); }
  .version-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .sync-dot, .save-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

  .progress-sidebar { position: fixed; inset: 0 0 0 auto; z-index: 2; display: flex; width: 286px; flex-direction: column; overflow-y: auto; padding: 27px 19px 22px; border-left: 1px solid var(--border); background: var(--sidebar-bg); scrollbar-width: thin; scrollbar-color: var(--scrollbar) transparent; overscroll-behavior: contain; transition: transform .18s ease, opacity .18s ease; }
  .progress-sidebar.peek { transform: translateX(100%); pointer-events: none; }
  .progress-sidebar.peek.peek-open { transform: translateX(0); pointer-events: auto; box-shadow: var(--shadow-panel-left); }
  .progress-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 0 3px 19px; }
  .sidebar-tabs { display: flex; align-items: center; gap: 5px; margin-bottom: 14px; padding: 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); }
  .sidebar-tab { height: 26px; flex: 1; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; white-space: nowrap; }
  .sidebar-tab:hover { color: var(--text-primary); }
  .sidebar-tab.active { background: var(--selected-bg); color: var(--selected-text); font-weight: 600; }
  .sidebar-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .sidebar-tabs .progress-close { margin-left: auto; }
  .progress-close { display: none; width: 26px; height: 26px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 20px; line-height: 1; }
  .progress-close:hover { background: var(--hover-bg); color: var(--text-primary); }
  .progress-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .progress-eyebrow { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.1px; }
  .progress-header h2 { margin: 7px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 23px; font-weight: 500; letter-spacing: -.4px; }
  .progress-section { padding: 16px 3px 18px; border-top: 1px solid var(--tree-divider); }
  .section-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .section-title strong { color: var(--text-nav); font-size: 11px; font-weight: 600; }
  .section-subtitle { margin: 6px 0 0; color: var(--text-muted); font-size: 9px; line-height: 1.5; }
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

  .main-panel { display: flex; min-width: 0; min-height: 100vh; min-height: 100dvh; flex: 1; flex-direction: column; margin-right: 286px; margin-left: 258px; transition: margin .18s ease; }
  .main-panel.left-hidden { margin-left: 0; }
  .main-panel.right-hidden { margin-right: 0; }
  .storage-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border-control); background: var(--control-bg); color: var(--text-primary); font-size: 11px; }
  .storage-banner-message { min-width: 0; }
  .storage-banner-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
  .storage-banner-dismiss { width: 26px; height: 26px; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1; }
  .storage-banner-dismiss:hover { background: var(--hover-bg); color: var(--text-heading); }
  .app-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border-control); background: var(--surface-raised); color: var(--text-primary); font-size: 11px; }
  .app-banner-message { min-width: 0; line-height: 1.5; }
  .app-banner-message strong { color: var(--text-heading); font-weight: 600; }
  .app-banner-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
  .app-banner-dismiss { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .app-banner-dismiss:hover { background: var(--hover-bg); color: var(--text-heading); }
  .storage-warning { color: var(--danger); }
  .save-indicator { display: flex; align-items: center; gap: 7px; color: var(--text-muted); font-size: 10px; }
  .save-dot.unsaved { background: var(--warning); }
  .export-button { display: flex; height: 30px; align-items: center; gap: 7px; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 11px; }
  .export-button:hover { background: var(--control-hover); }
  .writing-area { display: flex; flex: 1; flex-direction: column; align-items: center; padding: 15px 32px 44px; container: writing-area / inline-size; }
  .workspace-controls {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    width: min(100%, 1120px);
    align-items: center;
    justify-content: space-between;
    margin-top: -15px;
    margin-bottom: 14px;
    padding: 15px 0 8px;
    background: var(--page-bg);
  }
  .board-controls { display: flex; min-width: 0; flex: 1; align-items: center; gap: 4px; overflow-x: auto; margin: 0 8px; padding: 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); scrollbar-width: none; }
  .board-controls::-webkit-scrollbar { display: none; }
  .board-controls .add-timeline-row { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; min-width: 28px; padding: 0 6px; }
  .board-controls .add-timeline-row span, .board-controls .drawing-tool span { display: none; }
  .board-controls .drawing-tool { min-width: 0; }
  .board-controls .board-zoom-level { flex: 0 0 auto; padding: 0 2px; }
  .board-controls .drawing-font-size { flex: 0 0 auto; }
  .board-divider { width: 1px; flex: 0 0 auto; align-self: stretch; margin: 2px 3px; background: var(--border); }
  .workspace-modes, .panel-toggles { display: flex; align-items: center; gap: 5px; }
  .workspace-modes { padding: 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); }
  .workspace-mode { height: 26px; padding: 0 11px; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; }
  .workspace-mode:hover { color: var(--text-primary); }
  .workspace-mode.active { background: var(--selected-bg); color: var(--selected-text); font-weight: 600; }
  .panel-toggle { display: inline-flex; height: 28px; align-items: center; gap: 6px; padding: 0 7px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 9px; }
  .panel-toggle:hover { border-color: var(--border); background: var(--surface); color: var(--text-secondary); }
  .editor-panel { display: flex; width: 100%; justify-content: center; }
  .editor-panel.typewriter-mode { padding-bottom: 50vh; }
  /* The tile's scroll area carries the typewriter padding once the editor scrolls on its own. */
  .editor-panel.split-open.typewriter-mode { padding-bottom: 0; }
  .editor-panel.split-open.typewriter-mode .editor-scroll { padding-bottom: 50vh; }
  .editor-panel-hidden { display: none; }
  .editor-column { position: relative; width: min(100%, 690px); }
  /* Tiles share their row equally; the column count follows the measured width, so tiles wrap on narrow screens. */
  .tile-grid { display: grid; width: 100%; min-width: 0; align-items: start; gap: 14px; grid-template-columns: repeat(var(--tile-columns, 1), minmax(0, 1fr)); }
  .tile-grid:not(.split-open) { justify-items: center; }
  .tile-grid.split-open .editor-column { width: 100%; min-width: 0; }
  .tile-grid.split-open .toolbar { flex-wrap: wrap; }
  .split-tile { display: flex; min-width: 0; }
  /* Open tiles split the viewport like a tiling window manager: the grid takes the space below the controls and every tile scrolls on its own. */
  .tile-grid.split-open {
    height: calc(100vh - var(--tile-grid-top, 0px) - var(--tile-grid-bottom, 0px));
    height: calc(100dvh - var(--tile-grid-top, 0px) - var(--tile-grid-bottom, 0px));
    align-items: stretch;
    grid-template-rows: repeat(var(--tile-rows, 1), minmax(0, 1fr));
  }
  .tile-grid.split-open > .editor-column,
  .tile-grid.split-open > .split-tile { height: 100%; min-height: 0; overflow: hidden; }
  .tile-grid.split-open:not(.stacked-tiles) > .editor-column { grid-column: 1; grid-row: 1 / -1; }
  .tile-grid.split-open .editor-scroll { height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  /* The toolbar sticks to the tile instead of the page; its own surface stays opaque above the text. */
  .tile-grid.split-open:not(.stacked-tiles) .editor-tools { top: 0; }
  /* One column stacks the tiles instead of squeezing them, and the page scrolls again. */
  .tile-grid.split-open.stacked-tiles { height: auto; grid-template-rows: none; }
  .tile-grid.split-open.stacked-tiles > .editor-column,
  .tile-grid.split-open.stacked-tiles > .split-tile { height: auto; min-height: 320px; }
  .tile-grid.split-open.stacked-tiles .editor-scroll { height: auto; overflow: visible; }
  .tile-grid.target-drop-active { outline: 2px dashed var(--accent); outline-offset: 10px; border-radius: 4px; }
  .split-tile.target-drop-active { outline: 2px dashed var(--accent); outline-offset: 4px; border-radius: 9px; }
  .panel-toggle.active { border-color: var(--border); background: var(--surface); color: var(--text-secondary); }
  .editor-column.image-drop-active { outline: 2px dashed var(--accent); outline-offset: 10px; border-radius: 4px; }
  .markdown-utilities { display: flex; gap: 8px; margin: 0 0 4px; }
  .markdown-utilities .markdown-mode-toggle { margin-left: 0; }
  .title-input { display: block; width: 100%; margin: 21px 0 22px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--text-heading); font-family: var(--writing-font, var(--interface-font)); font-size: clamp(calc(32px * var(--editor-scale)), calc(4vw * var(--editor-scale)), calc(40px * var(--editor-scale))); font-weight: 500; letter-spacing: -1.35px; line-height: 1.2; }
  .title-input::placeholder { color: var(--text-faint); }
  .editor-tools { position: sticky; top: 58px; z-index: 1; display: flex; flex-direction: column; gap: 6px; }
  .toolbar { display: flex; min-height: 41px; align-items: center; gap: 3px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface-raised); box-shadow: var(--shadow-soft); }
  .style-select { width: 112px; height: 28px; padding: 0 6px; border: 0; outline: 0; background: transparent; color: var(--text-secondary); font-size: 10px; cursor: pointer; }
  .toolbar-divider { width: 1px; height: 18px; margin: 0 5px; background: var(--border); }
  .tool-button { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 4px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 13px; }
  .tool-button:hover { background: var(--toolbar-hover); color: var(--selected-text); }
  .tool-button-wide { width: auto; padding: 0 8px; font-size: 10px; font-weight: 700; letter-spacing: .5px; }
  .italic { font-family: Georgia, serif; font-style: italic; }
  .underline { text-decoration: underline; text-underline-offset: 2px; }
  .strike { text-decoration: line-through; }
  .markdown-mode-toggle { margin-left: auto; padding: 5px 8px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-secondary); cursor: pointer; font-size: 9px; }
  .markdown-mode-toggle:hover { border-color: var(--accent); color: var(--text-heading); }
  .image-tool-button { font-size: 17px; }
  .image-insert-error { margin: 8px 0 0; color: var(--danger, #b42318); font-size: 11px; }
  .image-edit-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 0; padding: 7px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-raised); }
  .image-edit-label { margin: 0 4px; color: var(--text-muted); font-size: 10px; }
  .image-edit-toolbar button { min-height: 25px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 4px; background: var(--surface); color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .image-edit-toolbar button:hover { border-color: var(--accent); color: var(--text-heading); }
  .image-edit-toolbar .remove-image-button { margin-left: auto; color: var(--danger, #b42318); }
  .image-edit-toolbar button[aria-pressed="true"] { border-color: var(--accent); background: var(--selected-bg); color: var(--selected-text); }
  .image-layout-group { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .image-custom-width { display: inline-flex; align-items: center; gap: 2px; color: var(--text-muted); font-size: 10px; }
  .image-custom-width input { width: 46px; min-height: 25px; padding: 0 4px; border: 1px solid var(--border-control); border-radius: 4px; background: var(--surface); color: var(--text-secondary); font-size: 10px; }
  .image-resize-handle { position: absolute; z-index: 5; width: 15px; height: 15px; transform: translate(-50%, -50%); border: 2px solid var(--surface-raised); border-radius: 50%; background: var(--accent); box-shadow: 0 1px 3px rgb(0 0 0 / 30%); cursor: nwse-resize; touch-action: none; }
  @media (pointer: coarse) {
    .image-resize-handle { width: 24px; height: 24px; }
  }
  .image-resize-handle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
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
  .scene-break { margin: 30px auto; color: var(--text-faint); font-size: 15px; letter-spacing: 6px; text-align: center; user-select: none; }
  .scene-break-blank:empty::before { content: "· · ·"; opacity: .7; }
  .scene-break-line::after { display: block; width: 120px; height: 1px; margin: 0 auto; background: var(--border); content: ""; }
  .scene-break-blank { min-height: 26px; }
  .editor-content { min-height: 430px; padding: 37px 1px 35px; outline: none; color: var(--text-body); font-family: var(--writing-font, var(--interface-font)); font-size: calc(16px * var(--editor-scale)); line-height: 1.85; }
  :global(::highlight(prosecraft-wiki-mention)) {
    background-color: color-mix(in srgb, var(--accent) 13%, transparent);
    text-decoration: underline dotted var(--accent);
    text-underline-offset: .15em;
  }
  .wiki-mention-preview {
    position: fixed;
    z-index: 20;
    width: min(340px, calc(100vw - 16px));
    max-height: 180px;
    overflow: hidden;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-panel);
    color: var(--text-body);
    pointer-events: none;
  }
  .wiki-mention-preview strong { display: block; margin-bottom: 5px; color: var(--text-heading); font-family: Georgia, serif; font-size: 15px; font-weight: 500; }
  .wiki-mention-preview p { display: -webkit-box; overflow: hidden; margin: 0; color: var(--text-muted); font-size: 11px; line-height: 1.5; line-clamp: 6; -webkit-box-orient: vertical; -webkit-line-clamp: 6; }
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
  .editor-content :global(img[data-size="small"]) { width: 25%; height: auto; max-width: 100%; }
  .editor-content :global(img[data-size="medium"]) { width: 50%; height: auto; max-width: 100%; }
  .editor-content :global(img[data-size="large"]) { width: 75%; height: auto; max-width: 100%; }
  .editor-content :global(img[data-size="full"]) { width: 100%; height: auto; max-width: 100%; }
  .editor-content :global(img[data-size="custom"]) { max-width: 100%; }
  .editor-content :global(img[data-align="left"]) { margin-right: auto; }
  .editor-content :global(img[data-align="center"]) { margin-right: auto; margin-left: auto; }
  .editor-content :global(img[data-align="right"]) { margin-left: auto; }
  .editor-content :global(img[data-wrap="wrap-left"]) { float: left; width: 50%; max-width: 50%; margin: 4px 18px 14px 0; }
  .editor-content :global(img[data-wrap="wrap-right"]) { float: right; width: 50%; max-width: 50%; margin: 4px 0 14px 18px; }
  .editor-content :global(img[data-wrap="wrap-left"][data-size="small"]),
  .editor-content :global(img[data-wrap="wrap-right"][data-size="small"]) { width: 25%; max-width: 25%; }
  /* Headings and dividers must start below a floated image. */
  .editor-content :global(h1), .editor-content :global(h2), .editor-content :global(h3),
  .editor-content :global(blockquote), .editor-content :global(pre),
  .editor-content :global(table), .editor-content :global(.scene-break),
  .editor-content :global(.math-block), .editor-content :global(.mermaid-diagram),
  .editor-content :global(.calc-worksheet) { clear: both; }
  .editor-content :global(.math-inline) { display: inline; white-space: nowrap; }
  .editor-content :global(.math-inline svg) { display: inline-block; max-width: 100%; max-height: 1.6em; width: auto; height: auto; vertical-align: middle; }
  .editor-content :global(.math-block), .editor-content :global(.mermaid-diagram), .editor-content :global(.calc-worksheet) { display: block; max-width: 100%; margin: .85em auto; text-align: center; }
  .editor-content :global(.math-block svg), .editor-content :global(.mermaid-diagram svg), .editor-content :global(.calc-worksheet svg) { display: block; max-width: 100%; max-height: 60vh; width: auto; height: auto; margin: 0 auto; }
  .editor-content :global(.rich-render-error) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; white-space: pre-wrap; }
  .editor-content :global(pre) { overflow-x: auto; padding: 12px 14px; border-radius: 5px; background: var(--surface-raised); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; line-height: 1.55; }
  .editor-content :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .editor-content :global(table) { display: block; width: 100%; overflow-x: auto; border-collapse: collapse; font-size: .9em; }
  .editor-content :global(th), .editor-content :global(td) { padding: 5px 8px; border: 1px solid var(--border); text-align: left; }
  .editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 15px; border-top: 1px solid var(--border-soft); color: var(--text-faint); font-size: 10px; }
  .footer-actions { display: flex; align-items: center; gap: 12px; }
  .footer-separator { margin: 0 4px; color: var(--border); }
  .sr-only { position: absolute; overflow: hidden; width: 1px; height: 1px; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .storyboard-view { display: grid; width: min(100%, 1120px); min-height: 0; flex: 1; grid-template-columns: minmax(185px, 230px) minmax(0, 1fr); gap: 22px; }
  .storyboard-view-hidden { display: none; }
  /* Storyboard fills the whole window while active, with the app controls
     floating on top of it. Sidebars and popovers keep their higher layers.
     Container queries would contain the fixed view to the writing area, so
     they are off while the board is up (tiles are hidden then anyway). */
  .writing-area.storyboard-active { container: none; }
  .writing-area.storyboard-active .workspace-controls {
    position: sticky;
    top: 0;
    z-index: 5;
    width: 100%;
    background: transparent;
    pointer-events: none;
  }
  .writing-area.storyboard-active .workspace-modes,
  .writing-area.storyboard-active .panel-toggles,
  .writing-area.storyboard-active .board-controls,
  .writing-area.storyboard-active .storyboard-sources { pointer-events: auto; }
  .writing-area.storyboard-active .panel-toggles { padding: 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); }
  .writing-area.storyboard-active .storyboard-view {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 258px;
    right: 286px;
    z-index: 1;
    width: auto;
    max-width: none;
    padding: calc(70px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom));
    background: transparent;
    pointer-events: none;
    transition: left .18s ease, right .18s ease;
    grid-template-rows: minmax(0, 1fr);
  }
  .writing-area.storyboard-active .storyboard-view.left-hidden { left: 0; }
  .writing-area.storyboard-active .storyboard-view.right-hidden { right: 0; }
  .app-shell.zen-hidden .writing-area.storyboard-active .storyboard-view { right: 0; left: 0; }
  .writing-area.storyboard-active .storyboard-canvas {
    background: transparent;
    border: 0;
    pointer-events: none;
  }
  /* The viewport is positioned, so it paints above static content: the
     floating sources panel needs its own elevation to stay visible. */
  .writing-area.storyboard-active .storyboard-sources { position: relative; z-index: 2; }
  /* The panel floats on its own so its scroll never depends on grid sizing. */
  .writing-area.storyboard-active .storyboard-sources {
    position: fixed;
    top: calc(82px + env(safe-area-inset-top));
    bottom: calc(12px + env(safe-area-inset-bottom));
    left: 270px;
    width: 240px;
    max-height: none;
    overflow-y: auto;
    overscroll-behavior: contain;
    transition: left .18s ease;
  }
  .writing-area.storyboard-active .storyboard-view.left-hidden .storyboard-sources,
  .app-shell.zen-hidden .writing-area.storyboard-active .storyboard-sources { left: 12px; }
  .writing-area.storyboard-active .storyboard-viewport {
    position: fixed;
    inset: 0;
    z-index: 0;
    border: 0;
    border-radius: 0;
    pointer-events: auto;
    background-color: var(--surface-raised);
    background-image: radial-gradient(circle, color-mix(in srgb, var(--text-muted) 38%, transparent) 1.2px, transparent 1.7px);
  }
  .main-panel:has(.storyboard-active) .app-banner,
  .main-panel:has(.storyboard-active) .storage-banner { position: relative; z-index: 6; }
  .storyboard-sources { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 13px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); scrollbar-width: thin; }
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
  .board-source-empty { margin: 5px 3px; color: var(--text-muted); font-size: 9px; }
  .storyboard-canvas { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; padding: 18px 20px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .board-zoom-level { padding-bottom: 3px; color: var(--text-muted); font-size: 9px; font-variant-numeric: tabular-nums; }
  .add-timeline-row { height: 28px; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 9px; }
  .add-timeline-row:hover { background: var(--control-hover); color: var(--selected-text); }
  .drawing-tool, .drawing-delete { display: inline-flex; min-height: 28px; align-items: center; justify-content: center; gap: 5px; padding: 0 8px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--surface-raised); color: var(--text-nav); cursor: pointer; font-size: 9px; }
  .drawing-tool { min-width: 54px; }
  .drawing-tool.active { border-color: var(--accent); background: var(--selected-bg); color: var(--selected-text); }
  .drawing-font-size { display: inline-flex; min-height: 28px; align-items: center; gap: 6px; padding: 0 7px; color: var(--text-muted); font-size: 9px; }
  .drawing-font-size input { width: 90px; accent-color: var(--accent); }
  .drawing-font-size output { min-width: 24px; color: var(--text-nav); font-variant-numeric: tabular-nums; }
  .drawing-delete { margin-left: auto; }
  .drawing-delete:disabled { opacity: .45; cursor: default; }
  .drawing-tool:focus-visible, .drawing-delete:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .storyboard-viewport { position: relative; min-height: 0; flex: 1 1 480px; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background-color: var(--surface-raised); background-image: radial-gradient(var(--border-control) .7px, transparent .7px); background-position: 8px 8px; background-size: 24px 24px; outline: none; }
  .storyboard-viewport:focus-visible { box-shadow: 0 0 0 2px var(--accent-ring); }
  .storyboard-viewport.board-pan-tool { cursor: grab; }
  .storyboard-viewport.board-pan-tool.board-panning { cursor: grabbing; }
  .storyboard-pan-surface { position: absolute; z-index: 0; inset: 0; cursor: grab; touch-action: none; }
  .storyboard-viewport.board-panning .storyboard-pan-surface { cursor: grabbing; }
  .storyboard-world { position: absolute; z-index: 1; inset: 0; pointer-events: none; will-change: transform; transform-origin: 0 0; }
  .storyboard-drawing-layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .storyboard-drawing-layer marker path { fill: var(--accent); }
  .storyboard-vector { pointer-events: visiblePainted; cursor: move; }
  .storyboard-vector .drawing-hit-line { stroke: transparent; stroke-width: 14; }
  .storyboard-vector .drawing-visible-line { stroke: var(--accent); stroke-width: 2.5; }
  .storyboard-vector rect { fill: var(--selected-bg); fill-opacity: .18; stroke: var(--accent); stroke-width: 2; }
  .storyboard-vector.selected .drawing-visible-line, .storyboard-vector.selected rect { stroke: var(--selected-text); }
  .storyboard-text-drawing { position: absolute; pointer-events: auto; border: 1px dashed var(--border-control); background: var(--surface); }
  .storyboard-text-drawing.selected { z-index: 3; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-ring); }
  .storyboard-text-editor { display: block; width: 100%; height: 100%; padding: 8px; resize: none; border: 0; outline: none; background: transparent; color: var(--text-primary); font-family: var(--interface-font); font-size: 12px; line-height: 1.4; }
  .storyboard-text-editor::placeholder { color: var(--text-muted); }
  .drawing-move-handle { position: absolute; top: -12px; right: 12px; display: grid; width: 22px; height: 20px; place-items: center; padding: 0; border: 1px solid var(--border-control); border-radius: 4px; background: var(--surface); color: var(--text-muted); cursor: grab; font-size: 13px; touch-action: none; }
  .drawing-resize-handle { position: absolute; right: -5px; bottom: -5px; width: 11px; height: 11px; padding: 0; border: 1px solid var(--surface); border-radius: 2px; background: var(--accent); cursor: nwse-resize; touch-action: none; }
  .storyboard-drawing-selection { position: absolute; z-index: 2; border: 1px dashed var(--accent); pointer-events: none; }
  .storyboard-drawing-selection .drawing-resize-handle { pointer-events: auto; }
  .storyboard-text-drawing .drawing-resize-handle { z-index: 1; }
  .storyboard-card { position: absolute; width: 220px; min-width: 200px; padding: 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-shadow: var(--shadow-card); pointer-events: auto; transition: border-color .12s, box-shadow .12s, opacity .12s; }
  .storyboard-card.dragging { z-index: 2; opacity: .78; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-ring), var(--shadow-card); }
  .storyboard-card.blank-card { border-style: dashed; }
  .storyboard-card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 9px; }
  .card-drag-handle, .remove-board-card { display: grid; width: 21px; height: 22px; flex: 0 0 auto; place-items: center; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .card-drag-handle { cursor: grab; font-size: 15px; touch-action: none; }
  .card-drag-handle:active { cursor: grabbing; }
  .remove-board-card { font-size: 12px; }
  .card-drag-handle:hover, .remove-board-card:hover { background: var(--control-hover); color: var(--text-primary); }
  .card-drag-handle:focus-visible, .remove-board-card:focus-visible, .add-timeline-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .card-kind { overflow: hidden; min-width: 0; flex: 1; color: var(--eyebrow); font-size: 8px; font-weight: 700; letter-spacing: .7px; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .board-card-title { width: 100%; padding: 2px 0 7px; border: 0; border-bottom: 1px solid var(--border-soft); outline: none; background: transparent; color: var(--text-heading); font-family: var(--interface-font); font-size: 15px; font-weight: 500; }
  .board-card-title:focus { border-color: var(--accent); }
  .board-card-note { display: block; width: 100%; min-height: 106px; margin-top: 8px; padding: 4px 0; resize: none; overflow-y: hidden; border: 0; outline: none; background: transparent; color: var(--text-body); font-family: var(--interface-font); font-size: 12px; line-height: 1.6; }
  .board-card-note::placeholder { color: var(--text-muted); font-family: Inter, ui-sans-serif, sans-serif; font-size: 9px; }
  .storyboard-drop-preview { position: absolute; width: 220px; height: 110px; display: grid; place-items: center; border: 1px dashed var(--accent); border-radius: 8px; background: var(--selected-bg); color: var(--selected-text); font-size: 9px; pointer-events: none; }
  .storyboard-empty-hint { position: absolute; top: 50%; left: 50%; width: min(300px, calc(100% - 32px)); margin: 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; text-align: center; transform: translate(-50%, -50%); pointer-events: none; }
  .storyboard-pan-hint { margin: 8px 0 0; color: var(--text-muted); font-size: 8px; text-align: right; }

  .settings-dialog { width: min(440px, calc(100vw - 32px)); max-height: min(680px, calc(100vh - 32px)); max-height: min(680px, calc(100dvh - 32px)); padding: 0; overflow: auto; overscroll-behavior: contain; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text-primary); box-shadow: var(--shadow-dialog); }
  .research-markdown-dialog { width: min(820px, calc(100vw - 32px)); max-height: min(860px, calc(100vh - 32px)); max-height: min(860px, calc(100dvh - 32px)); }
  .research-markdown-content { overflow: auto; padding: 24px 32px 36px; color: var(--text-body); font-family: var(--writing-font, Georgia, serif); font-size: 15px; line-height: 1.8; overflow-wrap: anywhere; }
  .research-markdown-content :global(h1), .research-markdown-content :global(h2), .research-markdown-content :global(h3) { margin: 1.5em 0 .55em; color: var(--text-heading); font-family: var(--interface-font); line-height: 1.25; }
  .research-markdown-content :global(h1) { margin-top: 0; font-size: 1.8em; }
  .research-markdown-content :global(h2) { font-size: 1.45em; }
  .research-markdown-content :global(p), .research-markdown-content :global(ul), .research-markdown-content :global(ol), .research-markdown-content :global(blockquote), .research-markdown-content :global(pre) { margin: 0 0 1em; }
  .research-markdown-content :global(a) { color: var(--link); text-decoration: underline; text-underline-offset: 3px; }
  .research-markdown-content :global(blockquote) { margin-left: 0; padding-left: 16px; border-left: 2px solid var(--accent); color: var(--text-secondary); }
  .research-markdown-content :global(code) { padding: .12em .35em; border-radius: 4px; background: var(--control-hover); font-family: ui-monospace, monospace; font-size: .88em; }
  .research-markdown-content :global(pre) { overflow: auto; padding: 14px; border: 1px solid var(--border); border-radius: 7px; background: var(--control-hover); }
  .research-markdown-content :global(pre code) { padding: 0; background: transparent; }
  .research-markdown-content :global(table) { width: 100%; margin-bottom: 1em; border-collapse: collapse; }
  .research-markdown-content :global(th), .research-markdown-content :global(td) { padding: 6px 9px; border: 1px solid var(--border); text-align: left; }
  .research-markdown-content :global(img) { max-width: 100%; height: auto; }
  .project-settings-dialog form { margin: 0; }
  .research-link-dialog form { margin: 0; }
  .starter-dialog form { margin: 0; }
  .starter-options { display: grid; gap: 6px; }
  .starter-option { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 8px 10px; border: 1px solid var(--border-control); border-radius: 6px; cursor: pointer; }
  .starter-option.selected { border-color: var(--accent); background: var(--control-bg); }
  .starter-option input { margin: 2px 0 0; flex: 0 0 auto; accent-color: var(--accent); }
  .starter-copy { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
  .starter-copy strong { color: var(--text-heading); font-size: 11px; font-weight: 600; }
  .starter-copy span { color: var(--text-muted); font-size: 10px; line-height: 1.4; }
  .starter-dialog-actions { display: flex; align-items: center; gap: 8px; }
  .starter-cancel { height: 30px; padding: 0 12px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .starter-cancel:hover { border-color: var(--accent); color: var(--text-heading); }
  /* The tree scrolls inside the body so the footer buttons stay visible. */
  .starter-dialog { width: min(760px, calc(100vw - 32px)); overflow: hidden; }
  .starter-dialog[open] { display: flex; flex-direction: column; }
  .starter-dialog form { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; max-height: inherit; }
  .starter-dialog .settings-body { min-height: 0; flex: 1 1 auto; overflow: hidden; }
  .starter-body { display: grid; grid-template-columns: 220px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); align-items: stretch; gap: 20px; min-width: 0; }
  .starter-presets, .starter-customise { min-width: 0; min-height: 0; overflow-y: auto; padding: 17px 0; }
  .starter-subheading { margin-top: 16px; }
  .starter-template { display: flex; align-items: center; gap: 6px; }
  .starter-template .starter-option { flex: 1; min-width: 0; }
  .starter-icon { display: grid; width: 22px; height: 22px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .starter-icon:hover { background: var(--hover-bg); color: var(--text-heading); }
  .starter-modules { display: grid; gap: 7px; min-width: 0; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--border-soft); }
  .starter-modules-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 7px; }
  .starter-modules-head strong { color: var(--text-heading); font-size: 11px; font-weight: 600; }
  .starter-modules-count { color: var(--text-muted); font-size: 10px; }
  .starter-clear { margin-left: auto; padding: 0; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; text-decoration: underline; text-underline-offset: 2px; }
  .starter-clear:hover { color: var(--text-heading); }
  .starter-clear:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .starter-modules-hint { margin: 0; color: var(--text-muted); font-size: 10px; }
  .starter-module-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 6px; min-width: 0; }
  .starter-module { display: grid; gap: 3px; min-width: 0; padding: 8px 9px; border: 1px solid var(--border-control); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; text-align: left; overflow-wrap: anywhere; }
  .starter-module:hover { border-color: var(--accent); background: var(--hover-bg); }
  .starter-module.active { border-color: var(--accent); background: var(--selected-bg); }
  .starter-module:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .starter-module-label { display: flex; align-items: center; gap: 4px; color: var(--text-heading); font-size: 11px; font-weight: 600; }
  .starter-module-label :global(svg) { flex: 0 0 auto; margin-left: auto; color: var(--accent); }
  .starter-module-copy { color: var(--text-muted); font-size: 10px; line-height: 1.4; }
  .starter-save { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
  .starter-save input[type="text"] { height: 26px; min-width: 0; flex: 1; padding: 0 7px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-primary); font-size: 10px; }
  .starter-add-button { height: 26px; flex: 0 0 auto; padding: 0 9px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .starter-add-button:hover:not(:disabled) { border-color: var(--accent); color: var(--text-heading); }
  .starter-add-button:disabled { opacity: 0.5; cursor: default; }
  .starter-notice { margin: 8px 0 0; color: var(--text-muted); font-size: 10px; }
  .settings-dialog::backdrop { background: var(--backdrop); backdrop-filter: blur(2px); }
  .settings-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 23px 25px 18px; border-bottom: 1px solid var(--border-soft); }
  .settings-kicker { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
  .settings-header h2 { margin: 7px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 25px; font-weight: 500; }
  .close-settings { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 20px; }
  .close-settings:hover { background: var(--hover-bg); color: var(--text-primary); }
  .settings-body { padding: 7px 25px 10px; }
  .main-settings-dialog { width: min(860px, calc(100vw - 32px)); height: min(620px, calc(100vh - 32px)); height: min(620px, calc(100dvh - 32px)); max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow: hidden; }
  .main-settings-dialog[open] { display: flex; flex-direction: column; }
  .main-settings-dialog .settings-header, .main-settings-dialog .settings-footer { flex: 0 0 auto; }
  .settings-layout { display: flex; min-height: 0; flex: 1 1 auto; }
  .settings-nav { display: flex; width: 200px; flex: 0 0 200px; flex-direction: column; gap: 2px; overflow-y: auto; padding: 12px; border-right: 1px solid var(--border-soft); }
  .settings-nav-item { position: relative; display: flex; width: 100%; height: 32px; flex: 0 0 auto; align-items: center; gap: 9px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; font-family: inherit; font-size: 11px; text-align: left; }
  .settings-nav-item:hover { background: var(--hover-bg); color: var(--text-primary); }
  .settings-nav-item.active { background: var(--hover-bg); color: var(--text-heading); }
  .settings-nav-item.active::before { position: absolute; top: 7px; bottom: 7px; left: 0; width: 2px; border-radius: 1px; background: var(--accent); content: ""; }
  .settings-nav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .settings-panes { min-width: 0; min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 20px 24px 24px; }
  .settings-pane[hidden] { display: none; }
  .settings-pane-title { margin: 0 0 4px; color: var(--text-heading); font-family: Georgia, serif; font-size: 18px; font-weight: 500; }
  .settings-pane > .preference-section:last-child { border-bottom: 0; }
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
  .research-link-label { margin-top: 14px; }
  .research-link-description { height: auto; min-height: 68px; padding: 8px 9px; resize: vertical; font-family: inherit; line-height: 1.45; }
  .rich-dialog form { margin: 0; }
  .rich-dialog-body { padding-bottom: 18px; }
  .rich-kind-toggle { display: inline-flex; margin-bottom: 14px; border: 1px solid var(--border-control); border-radius: 6px; overflow: hidden; }
  .rich-kind-toggle button { height: 27px; padding: 0 14px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .rich-kind-toggle button + button { border-left: 1px solid var(--border-control); }
  .rich-kind-toggle button.active { background: var(--selected-bg); color: var(--selected-text); }
  .rich-kind-toggle button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .rich-source { height: auto; min-height: 96px; padding: 8px 9px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.5; }
  .rich-help { margin: 7px 0 0; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .rich-help code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1em; }
  .rich-preview-frame { display: grid; min-height: 96px; margin-top: 14px; padding: 12px; place-items: center; overflow: auto; border: 1px dashed var(--border-control); border-radius: 7px; background: var(--control-bg); }
  .rich-preview { display: flex; width: 100%; align-items: center; justify-content: center; color: var(--text-heading); }
  .rich-preview :global(svg) { max-width: 100%; height: auto; max-height: 240px; }
  .rich-preview-status { color: var(--text-muted); font-size: 10px; }
  .rich-preview-error { margin: 0; text-align: center; }
  .rich-dialog-actions { display: flex; align-items: center; gap: 8px; }
  .rich-cancel, .rich-remove { height: 30px; padding: 0 12px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .rich-cancel:hover { border-color: var(--accent); color: var(--text-heading); }
  .rich-remove { border-color: transparent; background: transparent; color: var(--danger); }
  .rich-remove:hover { background: var(--hover-bg); }
  .rich-cancel:focus-visible, .rich-remove:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .project-author-label { margin-top: 16px; }
  .preference-select:focus-visible, .close-settings:focus-visible, .done-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .preference-error { margin: 12px 0 0; color: var(--danger); font-size: 10px; }
  .data-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .data-group { margin-bottom: 11px; }
  .data-group:last-of-type { margin-bottom: 4px; }
  .data-group-label { display: block; margin-bottom: 6px; color: var(--text-muted); font-size: 9px; letter-spacing: 0.04em; text-transform: uppercase; }
  .data-button { height: 32px; padding: 0 13px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-size: 11px; }
  .data-link { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
  .data-button:hover { border-color: var(--accent); color: var(--text-heading); }
  .danger-button { color: var(--danger); }
  .danger-button:hover { border-color: var(--danger); color: var(--danger); }
  :global(::highlight(prosecraft-comment)) {
    background-color: color-mix(in srgb, #e0b000 16%, transparent);
    text-decoration: underline dotted color-mix(in srgb, #e0b000 70%, transparent);
    text-underline-offset: .15em;
  }
  :global(::highlight(prosecraft-harper)) {
    text-decoration: underline wavy color-mix(in srgb, #b42318 75%, transparent);
    text-underline-offset: .18em;
  }
  .harper-popover {
    position: fixed;
    z-index: 22;
    width: min(300px, calc(100vw - 16px));
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-panel);
  }
  .harper-message { margin: 0 0 8px; color: var(--text-primary); font-size: 11px; line-height: 1.5; }
  .harper-message strong { color: var(--text-heading); }
  .harper-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .harper-suggestions button {
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--control-bg);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 11px;
  }
  .harper-suggestions button:hover { border-color: var(--accent); color: var(--text-heading); }
  .harper-suggestions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .harper-no-suggestion { margin: 0 0 8px; color: var(--text-muted); font-size: 11px; }
  .harper-actions { display: flex; justify-content: flex-end; gap: 6px; }
  .harper-actions button {
    min-height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 11px;
  }
  .harper-actions button:hover { background: var(--hover-bg); color: var(--text-heading); }
  .comment-preview {
    position: fixed;
    z-index: 21;
    display: flex;
    width: min(320px, calc(100vw - 16px));
    max-height: 260px;
    overflow: auto;
    padding: 10px 12px;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-panel);
    color: var(--text-body);
  }
  .comment-preview-entry { display: flex; flex-direction: column; gap: 5px; }
  .comment-preview-entry + .comment-preview-entry { padding-top: 10px; border-top: 1px solid var(--border); }
  .comment-preview-meta { display: flex; align-items: baseline; gap: 8px; }
  .comment-preview-meta strong { color: var(--text-heading); font-size: 12px; font-weight: 600; }
  .comment-preview-meta span { color: var(--text-muted); font-size: 10px; }
  .comment-preview-entry p { margin: 0; color: var(--text-body); font-size: 12px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .comment-preview-actions { display: flex; gap: 6px; }
  .comment-preview-actions button { height: 26px; padding: 0 10px; border: 1px solid var(--border-control); border-radius: 5px; background: var(--control-bg); color: var(--text-primary); cursor: pointer; font-size: 10px; }
  .comment-preview-actions button:hover { border-color: var(--accent); color: var(--text-heading); }
  .comment-preview-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .comment-selection-popover {
    position: fixed;
    z-index: 19;
    display: flex;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-panel);
  }
  .comment-selection-popover button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
  }
  .comment-selection-popover button:hover { background: var(--hover-bg); color: var(--text-heading); }
  .comment-selection-popover button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .comment-form { display: flex; flex-direction: column; gap: 8px; }
  .comment-form textarea { resize: vertical; font-family: inherit; }
  .comment-form-row { display: flex; gap: 8px; }
  .comment-form-row input { min-width: 0; flex: 1; }
  .comment-quote { margin: 0; padding: 2px 0 2px 10px; border-left: 2px solid var(--accent); color: var(--text-muted); font-size: 11px; font-style: italic; line-height: 1.5; }
  .comment-list { display: flex; margin: 0; padding: 0; flex-direction: column; gap: 12px; list-style: none; }
  .comment-item { display: flex; flex-direction: column; gap: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .comment-item.resolved { opacity: .6; }
  .progress-sidebar .comment-list { gap: 10px; }
  .progress-sidebar .comment-item,
  .progress-sidebar .snapshot-item { padding: 12px 13px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); box-shadow: var(--shadow-card); }
  .progress-sidebar .comment-item.resolved { opacity: .55; }
  .progress-sidebar .comment-location { margin-bottom: 2px; }
  .progress-sidebar .comment-quote { font-size: 10px; }
  .progress-sidebar .comment-body { font-size: 12px; }
  .progress-sidebar .comment-meta { font-size: 9px; }
  .progress-sidebar .comment-actions,
  .progress-sidebar .snapshot-actions { display: flex; align-items: center; gap: 12px; margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--border-soft); }
  .side-action { padding: 2px 0; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; font-weight: 600; }
  .side-action:hover:not(:disabled) { color: var(--text-heading); text-decoration: underline; text-underline-offset: 2px; }
  .side-action:disabled { opacity: .4; cursor: default; }
  .side-action.danger { color: var(--danger); }
  .side-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .progress-sidebar .side-form { gap: 7px; padding: 12px 13px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
  .progress-sidebar .side-form .preference-select { height: 30px; font-size: 10px; }
  .progress-sidebar .side-form textarea.preference-select { height: auto; min-height: 54px; padding-top: 7px; font-size: 11px; line-height: 1.5; }
  .progress-sidebar .side-form .comment-form-row { gap: 6px; }
  .progress-sidebar .side-form .comment-form-row .data-button,
  .progress-sidebar .side-form.snapshot-form .data-button { height: 30px; font-size: 10px; white-space: nowrap; }
  .progress-sidebar .snapshot-form.side-form { flex-direction: column; }
  .progress-sidebar .snapshot-form.side-form .data-button { width: 100%; }
  .progress-sidebar .comment-resolved-toggle { display: flex; margin: 10px 0 2px; font-size: 9px; }
  .progress-sidebar .snapshot-meta strong { font-size: 11px; }
  .progress-sidebar .snapshot-meta span { font-size: 9px; }
  .progress-sidebar .snapshot-preview { max-height: 160px; font-size: 11px; border-radius: 6px; background: var(--control-bg); }
  .comment-location { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
  .comment-body { margin: 0; font-size: 12px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .comment-meta { color: var(--text-muted); font-size: 10px; }
  .comment-actions { display: flex; gap: 6px; }
  .comment-resolved-toggle { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 10px; }
  .snapshot-form { display: flex; gap: 8px; }
  .snapshot-form input { min-width: 0; flex: 1; }
  .snapshot-list { display: flex; margin: 0; padding: 0; flex-direction: column; gap: 10px; list-style: none; }
  .snapshot-item { padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .snapshot-meta { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
  .snapshot-meta span { color: var(--text-muted); }
  .snapshot-actions { display: flex; margin-top: 8px; gap: 6px; }
  .snapshot-preview { max-height: 200px; overflow: auto; margin-top: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; line-height: 1.6; }
  .snapshot-preview :global(img) { max-width: 100%; }
  .markdown-folder-list { display: flex; margin: 0; padding: 0; flex-direction: column; gap: 8px; list-style: none; }
  .markdown-folder-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .markdown-folder-name { min-width: 0; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .markdown-folder-name em { color: var(--text-muted); font-style: normal; }
  .markdown-folder-list select { width: auto; flex: none; }
  .data-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .data-file-input { display: none; }
  .data-status { margin: 10px 0 0; color: var(--text-muted); font-size: 10px; }
  .data-help { margin: 0 0 8px; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
  .data-button:disabled { opacity: 0.5; cursor: default; }
  .data-button:disabled:hover { border-color: var(--border-control); color: var(--text-primary); }
  .sync-folder-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .sync-mode-options { display: grid; gap: 6px; margin-bottom: 9px; }
  .sync-mode-option { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid var(--border-control); border-radius: 6px; cursor: pointer; }
  .sync-mode-option.selected { border-color: var(--accent); background: var(--control-bg); }
  .sync-mode-option input { margin: 2px 0 0; accent-color: var(--accent); }
  .sync-mode-copy { display: grid; gap: 2px; }
  .sync-mode-copy strong { color: var(--text-heading); font-size: 11px; font-weight: 600; }
  .sync-mode-copy span { color: var(--text-muted); font-size: 10px; line-height: 1.4; }
  .data-warning { margin: 0 0 8px; color: var(--danger); font-size: 10px; line-height: 1.5; }
  .sync-folder-path { flex: 1; overflow: hidden; color: var(--text-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .sync-provider-selector { display: flex; gap: 16px; margin-bottom: 12px; }
  .sync-provider-selector label { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-primary); cursor: pointer; }
  .sync-provider-selector input[type="radio"] { margin: 0; }
  .google-drive-config { margin-bottom: 8px; }
  .google-drive-status { color: var(--text-muted); font-size: 10px; margin-bottom: 8px; }
  .passphrase-input { margin-bottom: 8px; }
  .passphrase-input:last-of-type { margin-bottom: 0; }
  .passphrase-hint-note { margin: 8px 0 0; color: var(--text-muted); font-size: 10px; }
  .done-button:disabled { opacity: 0.6; cursor: default; }
  .settings-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 25px; border-top: 1px solid var(--border-soft); color: var(--text-muted); font-size: 9px; }
  .about-row { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px 0 4px; }
  .about-row-button { padding: 0; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px; text-align: left; }
  .about-row-button:hover { color: var(--text-primary); text-decoration: underline; text-underline-offset: 3px; }
  .about-row-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .about-link-row { margin: 0; }
  .about-link { color: var(--link); font-size: 10px; overflow-wrap: anywhere; text-underline-offset: 2px; }
  .about-diagnostics { width: 100%; height: 178px; margin-bottom: 10px; padding: 9px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-secondary); font-family: ui-monospace, monospace; font-size: 9px; line-height: 1.55; resize: vertical; }
  .done-button { height: 30px; padding: 0 14px; border: 1px solid transparent; border-radius: 5px; background: var(--accent-strong); color: var(--accent-contrast); cursor: pointer; font-size: 10px; }
  .done-button:hover { background: var(--accent-strong-hover); }

  @media (hover: none) {
    .row-add { opacity: .75; }
  }

  @media (max-width: 1050px) {
    .progress-sidebar { width: 270px; box-shadow: var(--shadow-panel-left); }
    .progress-close { display: grid; }
    .main-panel { margin-right: 0; }
    .workspace-controls { justify-content: flex-start; gap: 8px; }
    .storyboard-view { gap: 14px; }
    .writing-area.storyboard-active .storyboard-view { right: 0; }
  }
  @media (max-width: 760px), (pointer: coarse) and (max-height: 520px) {
    .sidebar {
      z-index: 40;
      width: min(340px, 92vw);
      height: 100vh;
      height: 100dvh;
      padding-top: calc(12px + env(safe-area-inset-top));
      padding-right: max(12px, env(safe-area-inset-right));
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
      padding-left: max(12px, env(safe-area-inset-left));
      box-shadow: var(--shadow-panel);
    }
    .sidebar.peek { box-shadow: none; }
    .sidebar-mobile-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 4px 8px;
    }
    .sidebar-mobile-close {
      display: grid;
      width: 40px;
      height: 40px;
      place-items: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
    }
    .sidebar-mobile-close:hover { background: var(--hover-bg); color: var(--text-primary); }
    .sidebar-mobile-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .sidebar .project-identity { margin-top: 0; }
    .progress-sidebar {
      z-index: 40;
      width: min(340px, 92vw);
      height: 100vh;
      height: 100dvh;
      padding-top: calc(20px + env(safe-area-inset-top));
      padding-right: max(16px, env(safe-area-inset-right));
      padding-bottom: calc(18px + env(safe-area-inset-bottom));
    }
    .main-panel,
    .main-panel.left-hidden,
    .main-panel.right-hidden { margin-right: 0; margin-left: 0; }
    .writing-area.storyboard-active .storyboard-view {
      right: 0;
      left: 0;
      padding-top: calc(120px + env(safe-area-inset-top));
    }
    .writing-area.storyboard-active .storyboard-sources {
      left: 12px;
      top: calc(132px + env(safe-area-inset-top));
    }
    .writing-area {
      padding-top: calc(12px + env(safe-area-inset-top));
      padding-right: max(16px, env(safe-area-inset-right));
      padding-bottom: calc(32px + env(safe-area-inset-bottom));
      padding-left: max(16px, env(safe-area-inset-left));
    }
    .workspace-controls {
      position: static;
      flex-wrap: wrap;
      margin-top: calc(-12px - env(safe-area-inset-top));
      margin-bottom: 14px;
      padding-top: calc(12px + env(safe-area-inset-top));
    }
    .editor-tools { top: calc(8px + env(safe-area-inset-top)); }
    .panel-toggles { margin-left: auto; }
    .panel-toggle span { display: none; }
    /* Split view and keyboard shortcuts need a keyboard and wide screen, so hide those options on phones. */
    .split-toggle, .shortcuts-toggle, .shortcuts-button, .about-shortcuts-button { display: none; }
    .storage-banner { align-items: flex-start; flex-direction: column; gap: 8px; }
    .storage-banner-actions { width: 100%; }
    .storage-banner .data-button { flex: 1; }
    .app-banner { align-items: flex-start; flex-direction: column; gap: 8px; }
    .app-banner-actions { width: 100%; }
    .app-banner .data-button { flex: 1; }
    .note-folder-row { flex-wrap: wrap; padding-bottom: 2px; }
    .note-folder-actions { flex-wrap: wrap; justify-content: flex-end; }
    .storyboard-view { grid-template-columns: 1fr; }
    .storyboard-sources { max-height: 230px; }
    .storyboard-sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0 12px; }
    .board-sources-heading { grid-column: 1 / -1; }
    .board-card-title { font-size: 16px; }
    .board-card-note, .storyboard-text-editor { font-size: 16px; }
    .storyboard-pan-hint { font-size: 10px; }
    .toolbar { gap: 1px; overflow-x: auto; scrollbar-width: none; }
    .toolbar::-webkit-scrollbar { display: none; }
    .style-select { width: 100px; flex: 0 0 auto; }
    .toolbar-divider { margin: 0 3px; }

    /* Dialogs become full-screen sheets so fields and buttons stay reachable. */
    .settings-dialog {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      height: 100dvh;
      max-height: 100dvh;
      margin: 0;
      border: 0;
      border-radius: 0;
      overflow: hidden;
    }
    .settings-dialog[open] { display: flex; flex-direction: column; }
    .settings-dialog > form { display: flex; min-height: 0; flex: 1; flex-direction: column; }
    .settings-header { padding: calc(16px + env(safe-area-inset-top)) 18px 14px; }
    .settings-body { min-height: 0; flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 18px 12px; }
    .settings-footer { flex-wrap: wrap; padding: 12px 18px calc(12px + env(safe-area-inset-bottom)); }
    .starter-body { display: flex; flex-direction: column; gap: 0; align-items: stretch; min-width: 0; min-height: 0; }
    .starter-dialog .settings-body { overflow-y: auto; overflow-x: hidden; }
    .starter-presets, .starter-customise { flex: 0 0 auto; width: 100%; max-width: 100%; min-width: 0; min-height: 0; overflow: visible; }
    .starter-presets { padding-bottom: 0; }
    .starter-customise { padding-top: 12px; }
    .starter-module-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); }
    .starter-save { flex-wrap: wrap; }
    .starter-save input[type="text"] { min-height: 40px; height: 40px; flex: 1 1 160px; }
    .starter-add-button { min-height: 40px; height: 40px; }
    .starter-cancel { min-height: 40px; }
    .starter-dialog .settings-footer { gap: 8px; }
    .starter-dialog-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .close-settings { width: 40px; height: 40px; }
    .research-markdown-dialog { width: 100vw; max-width: 100vw; }
    .research-markdown-dialog .research-markdown-content { min-height: 0; flex: 1; }
    .research-markdown-content { padding: 18px 18px calc(28px + env(safe-area-inset-bottom)); }

    /* iOS zooms the page when a focused control is smaller than 16px. */
    .settings-dialog input:not([type="checkbox"]):not([type="radio"]),
    .settings-dialog select,
    .settings-dialog textarea,
    .chapter-name-input,
    .note-folder-name-input,
    .goal-input,
    .chapter-goal-input input,
    .label-filter-select,
    .style-select,
    .image-custom-width input { font-size: 16px; }

    .editor-content { font-size: calc(17px * var(--editor-scale)); line-height: 1.75; }
    .title-input { font-size: clamp(calc(30px * var(--editor-scale)), 9vw, calc(40px * var(--editor-scale))); }
    .markdown-utilities { flex-wrap: wrap; row-gap: 4px; }
  }
  @media (max-width: 640px) {
    .main-settings-dialog { height: 100vh; height: 100dvh; max-height: 100dvh; }
    .settings-layout { flex-direction: column; }
    .settings-nav { width: auto; flex: 0 0 auto; flex-direction: row; gap: 4px; overflow-x: auto; overflow-y: hidden; padding: 8px 12px; border-right: 0; border-bottom: 1px solid var(--border-soft); scrollbar-width: none; }
    .settings-nav::-webkit-scrollbar { display: none; }
    .settings-nav-item { width: auto; padding: 0 10px; white-space: nowrap; }
    .settings-nav-item.active::before { top: auto; right: 8px; bottom: 0; left: 8px; width: auto; height: 2px; }
    .settings-panes { padding: 16px 18px 20px; }
  }
  @media (max-width: 440px) {
    .progress-sidebar { width: min(340px, 92vw); }
    .writing-area {
      padding-top: calc(10px + env(safe-area-inset-top));
      padding-right: max(12px, env(safe-area-inset-right));
      padding-bottom: calc(28px + env(safe-area-inset-bottom));
      padding-left: max(12px, env(safe-area-inset-left));
    }
    .workspace-controls { margin-top: calc(-10px - env(safe-area-inset-top)); padding-top: calc(10px + env(safe-area-inset-top)); }
    .workspace-modes { width: 100%; gap: 0; overflow-x: auto; scrollbar-width: none; }
    .workspace-modes::-webkit-scrollbar { display: none; }
    .workspace-mode { flex: 1 0 auto; padding: 0 8px; font-size: 12px; white-space: nowrap; }
    .panel-toggle { gap: 4px; padding: 0 8px; }
    .storyboard-canvas { padding: 14px 12px; }
    .editor-footer { align-items: flex-start; flex-direction: column; }
    .footer-actions { width: 100%; justify-content: space-between; }
    .title-input { margin-top: 17px; }
    .editor-content { padding-top: 30px; }
    .toolbar { padding-right: 4px; padding-left: 4px; }
    .toolbar-divider { margin: 0 1px; }
    .starter-module-grid { grid-template-columns: minmax(0, 1fr); }
    .starter-save { flex-direction: column; align-items: stretch; }
    .starter-save input[type="text"], .starter-add-button { width: 100%; flex: none; }
    .starter-dialog .settings-footer > span { flex: 1 1 100%; }
    .starter-dialog-actions { width: 100%; margin-left: 0; }
    .starter-dialog-actions .starter-cancel, .starter-dialog-actions .done-button { flex: 1; min-height: 44px; }
  }
  /* Comfortable touch targets without changing the desktop visual density. */
  @media (pointer: coarse) {
    .tree-add, .row-add, .row-action { width: 38px; height: 38px; }
    .chapter-row, .space-heading { min-height: 44px; }
    .chapter-toggle, .space-toggle { height: 42px; }
    .chapter-toggle .tree-name, .space-toggle .tree-name { font-size: 13px; }
    .nav-label { font-size: 10px; }
    .author-name { font-size: 11px; }
    .empty-tree, .empty-action, .research-status { font-size: 12px; }
    .note-folder-toggle { height: 38px; font-size: 12px; }
    .document-row { min-height: 42px; }
    .document-select { height: 40px; font-size: 13px; }
    .chapter-drag { display: none; }
    .row-add { opacity: .8; }
    .project-identity-actions button { width: 38px; height: 38px; }
    .settings-button { height: 44px; font-size: 12px; }
    .panel-toggle { min-height: 40px; padding: 0 10px; }
    .workspace-mode { height: 40px; padding: 0 12px; font-size: 12px; }
    .tool-button { width: 40px; height: 40px; }
    .markdown-mode-toggle { min-height: 36px; font-size: 12px; }
    .export-button { height: 40px; font-size: 12px; }
    .style-select { height: 40px; font-size: 12px; }
    .progress-close, .close-settings { width: 40px; height: 40px; }
    .done-button, .data-button { min-height: 40px; }
    .board-source { min-height: 40px; }
    .source-drag-handle, .source-add { width: 36px; height: 36px; }
    .drawing-tool, .drawing-delete { min-height: 40px; font-size: 11px; }
    .drawing-move-handle { width: 36px; height: 32px; }
    .drawing-resize-handle { width: 24px; height: 24px; }
    .storyboard-card { width: 250px; }
    /* iOS zooms the page when a focused control is smaller than 16px. */
    .markdown-source-editor :global(.cm-editor) { font-size: max(16px, calc(13px * var(--editor-scale))); }
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
  .app-shell.zen-hidden .split-tile,
  .app-shell.zen-hidden .workspace-controls,
  .app-shell.zen-hidden .sidebar,
  .app-shell.zen-hidden .title-input,
  .app-shell.zen-hidden .editor-tools,
  .app-shell.zen-hidden .markdown-utilities,
  .app-shell.zen-hidden .image-edit-toolbar,
  .app-shell.zen-hidden .image-insert-error,
  .app-shell.zen-hidden .editor-footer {
    display: none;
  }
</style>
