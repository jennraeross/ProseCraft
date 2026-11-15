<script lang="ts">
  import { tick } from "svelte";
  import { Link as LinkIcon, Quote, Trash2, X } from "@lucide/svelte";
  import {
    CITE_REF_SELECTOR,
    buildCiteData,
    citeMarkerHtml,
    parseCiteData,
    renderCitationLabels,
    type CiteRefItem
  } from "$lib/citations/cite-marker";
  import type { CslItem } from "$lib/citations/csl";
  import type { CitationLocale, CitationStyleId } from "$lib/citations/styles";
  import { sanitizeInlineHtml } from "$lib/sanitize";

  export type FootnoteCitationRequest = {
    rect: DOMRect;
    initialCites: CiteRefItem[];
    isEditing: boolean;
    onCommit: (cites: CiteRefItem[]) => void;
    onRemove?: () => void;
  };

  let {
    footnoteId,
    number,
    initialHtml,
    left,
    top,
    citations = [],
    citationStyle = "apa7",
    citationLocale = "en",
    onChange,
    onRemove,
    onClose,
    onRequestCitation
  }: {
    footnoteId: string;
    number: number | null;
    initialHtml: string;
    left: number;
    top: number;
    citations?: CslItem[];
    citationStyle?: CitationStyleId;
    citationLocale?: CitationLocale;
    onChange: (html: string) => void;
    onRemove: () => void;
    onClose: () => void;
    onRequestCitation?: (request: FootnoteCitationRequest) => void;
  } = $props();

  let noteEditor = $state<HTMLDivElement>();
  let linkInput = $state<HTMLInputElement>();
  let loadedId = "";
  let isBold = $state(false);
  let isItalic = $state(false);
  let linkEditorOpen = $state(false);
  let insideLink = $state(false);
  let linkUrl = $state("");
  let linkError = $state("");
  let savedRange: Range | null = null;

  function placeCaretAtEnd(target: HTMLElement) {
    target.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function refreshNoteCitations() {
    if (!noteEditor) return;
    renderCitationLabels(noteEditor, citations, citationStyle, citationLocale);
  }

  $effect(() => {
    const id = footnoteId;
    if (!noteEditor || id === loadedId) return;
    loadedId = id;
    noteEditor.innerHTML = sanitizeInlineHtml(initialHtml);
    refreshNoteCitations();
    linkEditorOpen = false;
    linkUrl = "";
    linkError = "";
    savedRange = null;
    void tick().then(() => {
      if (!noteEditor) return;
      placeCaretAtEnd(noteEditor);
      refreshFormatState();
    });
  });

  $effect(() => {
    void citations;
    void citationStyle;
    void citationLocale;
    refreshNoteCitations();
  });

  function emitChange() {
    if (!noteEditor) return;
    onChange(sanitizeInlineHtml(noteEditor.innerHTML));
  }

  function currentLinkElement(): HTMLAnchorElement | null {
    const selection = window.getSelection();
    if (!noteEditor || !selection || selection.rangeCount === 0) return null;
    const node = selection.anchorNode;
    if (!node || !noteEditor.contains(node)) return null;
    const el = node instanceof Element ? node : node.parentElement;
    const link = el?.closest("a");
    return link && noteEditor.contains(link) ? link : null;
  }

  function refreshFormatState() {
    if (!noteEditor) return;
    try {
      isBold = document.queryCommandState("bold");
      isItalic = document.queryCommandState("italic");
    } catch {
      isBold = false;
      isItalic = false;
    }
    insideLink = currentLinkElement() !== null;
  }

  function applyFormat(command: "bold" | "italic") {
    if (!noteEditor) return;
    noteEditor.focus();
    document.execCommand(command, false);
    emitChange();
    refreshNoteCitations();
    refreshFormatState();
  }

  function captureNoteSelection() {
    const selection = window.getSelection();
    if (!noteEditor || !selection || selection.rangeCount === 0) {
      savedRange = null;
      return;
    }
    const range = selection.getRangeAt(0);
    savedRange = noteEditor.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  function openLinkEditor() {
    if (!noteEditor) return;
    if (linkEditorOpen) {
      closeLinkEditor(true);
      return;
    }
    captureNoteSelection();
    const existing = currentLinkElement();
    linkUrl = existing?.getAttribute("href") ?? "";
    linkError = "";
    linkEditorOpen = true;
    void tick().then(() => linkInput?.focus());
  }

  function closeLinkEditor(refocus = true) {
    linkEditorOpen = false;
    linkError = "";
    if (refocus && noteEditor) {
      noteEditor.focus();
      if (savedRange && noteEditor.contains(savedRange.commonAncestorContainer)) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(savedRange);
      }
      refreshFormatState();
    }
  }

  function applyLink(event: SubmitEvent) {
    event.preventDefault();
    if (!noteEditor) return;
    const entered = linkUrl.trim();
    if (!entered) {
      linkError = "Enter a link address.";
      return;
    }
    const href = /^[a-z][a-z\d+.-]*:/i.test(entered) ? entered : `https://${entered}`;
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      linkError = "Please enter a valid link.";
      return;
    }
    if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
      linkError = "Please use a web link or email address.";
      return;
    }

    noteEditor.focus();
    const selection = window.getSelection();
    let range: Range;
    if (savedRange && noteEditor.contains(savedRange.commonAncestorContainer)) {
      range = savedRange;
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      range = document.createRange();
      range.selectNodeContents(noteEditor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    const existing = currentLinkElement();
    if (existing && range.collapsed) {
      existing.setAttribute("href", parsed.href);
    } else if (range.collapsed) {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", parsed.href);
      anchor.textContent = entered;
      range.insertNode(anchor);
      const after = document.createRange();
      after.setStartAfter(anchor);
      after.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(after);
    } else {
      const executed = typeof document.execCommand === "function"
        && document.execCommand("createLink", false, parsed.href);
      if (!executed) {
        const anchor = document.createElement("a");
        anchor.setAttribute("href", parsed.href);
        anchor.append(range.extractContents());
        range.insertNode(anchor);
      }
    }

    savedRange = null;
    linkEditorOpen = false;
    linkUrl = "";
    linkError = "";
    emitChange();
    refreshNoteCitations();
    refreshFormatState();
  }

  function removeLink() {
    if (!noteEditor) return;
    const existing = currentLinkElement();
    if (existing) {
      const parent = existing.parentNode;
      while (existing.firstChild) parent?.insertBefore(existing.firstChild, existing);
      existing.remove();
      emitChange();
    } else if (savedRange && noteEditor.contains(savedRange.commonAncestorContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange);
      document.execCommand("unlink", false);
      emitChange();
    }
    closeLinkEditor(true);
  }

  function insertLineBreak() {
    if (!noteEditor) return;
    const executed = typeof document.execCommand === "function"
      && document.execCommand("insertLineBreak");
    if (!executed) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!noteEditor.contains(range.commonAncestorContainer)) return;
      range.deleteContents();
      const br = document.createElement("br");
      range.insertNode(br);
      const after = document.createRange();
      after.setStartAfter(br);
      after.collapse(true);
      selection.removeAllRanges();
      selection.addRange(after);
    }
    emitChange();
  }

  function insertCitationMarkerInNote(cites: CiteRefItem[]) {
    if (!noteEditor) return;
    noteEditor.focus();
    const selection = window.getSelection();
    let range: Range;
    if (savedRange && noteEditor.contains(savedRange.commonAncestorContainer)) {
      range = savedRange.cloneRange();
      range.collapse(false);
    } else {
      range = document.createRange();
      range.selectNodeContents(noteEditor);
      range.collapse(false);
    }
    const tpl = document.createElement("div");
    tpl.innerHTML = citeMarkerHtml(cites);
    const marker = tpl.firstElementChild as HTMLElement;
    range.insertNode(marker);
    const after = document.createRange();
    after.setStartAfter(marker);
    after.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(after);
    savedRange = null;
    refreshNoteCitations();
    emitChange();
  }

  function openCitationInNote() {
    if (!noteEditor || !onRequestCitation) return;
    captureNoteSelection();
    const rect = savedRange?.getBoundingClientRect();
    const fallbackRect = noteEditor.getBoundingClientRect();
    const anchorRect = rect && (rect.width > 0 || rect.height > 0) ? rect : fallbackRect;
    onRequestCitation({
      rect: anchorRect,
      initialCites: [],
      isEditing: false,
      onCommit: insertCitationMarkerInNote
    });
  }

  function handleNoteClick(event: MouseEvent) {
    if (!noteEditor || !onRequestCitation) return;
    const target = event.target;
    const marker = target instanceof Element ? target.closest<HTMLElement>(CITE_REF_SELECTOR) : null;
    if (!marker || !noteEditor.contains(marker)) return;
    const cites = parseCiteData(marker.getAttribute("data-cites"));
    if (!cites) return;
    event.preventDefault();
    event.stopPropagation();
    onRequestCitation({
      rect: marker.getBoundingClientRect(),
      initialCites: cites,
      isEditing: true,
      onCommit: (nextCites) => {
        if (!noteEditor || !noteEditor.contains(marker)) return;
        marker.setAttribute("data-cites", buildCiteData(nextCites));
        refreshNoteCitations();
        emitChange();
        noteEditor.focus();
      },
      onRemove: () => {
        if (!noteEditor || !noteEditor.contains(marker)) return;
        marker.remove();
        emitChange();
        noteEditor.focus();
      }
    });
  }

  function handleNoteKeydown(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.altKey && !event.shiftKey
      && (event.key.toLowerCase() === "c" || event.code === "KeyC")) {
      if (onRequestCitation) {
        event.preventDefault();
        event.stopPropagation();
        openCitationInNote();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (linkEditorOpen) closeLinkEditor(true);
      else onClose();
      return;
    }
    if (mod && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Enter" && !mod && !event.altKey) {
      event.preventDefault();
      insertLineBreak();
      return;
    }
    if (mod && !event.altKey && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        applyFormat("bold");
      } else if (key === "i") {
        event.preventDefault();
        applyFormat("italic");
      } else if (key === "k") {
        event.preventDefault();
        openLinkEditor();
      }
    }
  }

  function handlePaste(event: ClipboardEvent) {
    if (!event.clipboardData || !noteEditor) return;
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const clean = html ? sanitizeInlineHtml(html) : "";
    if (clean) {
      document.execCommand("insertHTML", false, clean);
    } else if (text) {
      document.execCommand("insertText", false, text);
    }
    emitChange();
    refreshNoteCitations();
    refreshFormatState();
  }
</script>

<div
  class="footnote-popover"
  role="dialog"
  tabindex="-1"
  aria-label={number !== null ? `Footnote ${number}` : "Footnote"}
  style={`left: ${left}px; top: ${top}px`}
  onpointerdown={(event) => event.stopPropagation()}
  onkeydown={(event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (linkEditorOpen) closeLinkEditor(true);
      else onClose();
    }
  }}
>
  <div class="footnote-popover-head">
    <span class="footnote-popover-title">Footnote {number ?? ""}</span>
    <div class="footnote-popover-tools" role="toolbar" aria-label="Footnote formatting">
      <button
        type="button"
        class="footnote-tool"
        aria-label="Bold"
        title="Bold"
        aria-pressed={isBold}
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => applyFormat("bold")}
      ><strong>B</strong></button>
      <button
        type="button"
        class="footnote-tool italic"
        aria-label="Italic"
        title="Italic"
        aria-pressed={isItalic}
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => applyFormat("italic")}
      >I</button>
      <button
        type="button"
        class="footnote-tool"
        aria-label="Add link"
        title="Add link"
        aria-pressed={linkEditorOpen || insideLink}
        onpointerdown={(event) => event.preventDefault()}
        onclick={openLinkEditor}
      ><LinkIcon size={13} aria-hidden="true" /></button>
      {#if onRequestCitation}
        <button
          type="button"
          class="footnote-tool"
          aria-label="Insert citation"
          title="Insert citation"
          onpointerdown={(event) => event.preventDefault()}
          onclick={openCitationInNote}
        ><Quote size={13} aria-hidden="true" /></button>
      {/if}
    </div>
    <button
      type="button"
      class="footnote-close"
      aria-label="Close footnote editor"
      title="Close"
      onclick={onClose}
    ><X size={14} aria-hidden="true" /></button>
  </div>

  {#if linkEditorOpen}
    <form class="footnote-link-form" onsubmit={applyLink}>
      <input
        bind:this={linkInput}
        type="url"
        placeholder="https://example.com"
        aria-label="Link URL"
        bind:value={linkUrl}
        onkeydown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeLinkEditor(true);
          }
        }}
      />
      <button type="submit" class="footnote-link-apply">Apply</button>
      {#if insideLink}
        <button type="button" class="footnote-link-cancel" onclick={removeLink}>Unlink</button>
      {/if}
      <button type="button" class="footnote-link-cancel" onclick={() => closeLinkEditor(true)}>Cancel</button>
    </form>
    {#if linkError}
      <p class="footnote-link-error" role="alert">{linkError}</p>
    {/if}
  {/if}

  <div
    bind:this={noteEditor}
    class="footnote-note-editor"
    contenteditable="true"
    role="textbox"
    tabindex="0"
    aria-label="Footnote text"
    aria-multiline="true"
    data-placeholder="Write footnote…"
    oninput={() => { emitChange(); refreshNoteCitations(); refreshFormatState(); }}
    onclick={handleNoteClick}
    onkeyup={refreshFormatState}
    onmouseup={refreshFormatState}
    onpaste={handlePaste}
    onkeydown={handleNoteKeydown}
  ></div>

  <div class="footnote-popover-foot">
    <button
      type="button"
      class="footnote-remove"
      aria-label="Remove footnote"
      onclick={onRemove}
    ><Trash2 size={13} aria-hidden="true" /> Remove</button>
    <button type="button" class="footnote-done" onclick={onClose}>Done</button>
  </div>
</div>

<style>
  .footnote-popover {
    position: fixed;
    z-index: 23;
    width: min(330px, calc(100vw - 16px));
    padding: 10px 11px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-panel);
    color: var(--text-primary);
  }
  .footnote-popover-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .footnote-popover-title {
    margin-right: auto;
    color: var(--text-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .footnote-popover-tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .footnote-tool,
  .footnote-close {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-family: Georgia, serif;
    font-size: 12px;
  }
  .footnote-tool.italic { font-style: italic; }
  .footnote-tool:hover,
  .footnote-close:hover {
    background: var(--hover-bg);
    color: var(--text-heading);
  }
  .footnote-tool[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--selected-bg);
    color: var(--selected-text);
  }
  .footnote-tool:focus-visible,
  .footnote-close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .footnote-link-form {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 7px;
  }
  .footnote-link-form input {
    min-width: 0;
    height: 26px;
    flex: 1;
    padding: 0 7px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--control-bg);
    color: var(--text-primary);
    font-size: 11px;
  }
  .footnote-link-apply,
  .footnote-link-cancel {
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border-control);
    border-radius: 5px;
    background: var(--control-bg);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 10px;
  }
  .footnote-link-apply:hover,
  .footnote-link-cancel:hover {
    border-color: var(--accent);
    color: var(--text-heading);
  }
  .footnote-link-error {
    margin: 0 0 6px;
    color: var(--danger);
    font-size: 10px;
  }
  .footnote-note-editor {
    min-height: 58px;
    max-height: 170px;
    overflow-y: auto;
    padding: 7px 9px;
    border: 1px solid var(--border-control);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-body);
    font-family: var(--writing-font, var(--interface-font));
    font-size: 13px;
    line-height: 1.55;
    outline: none;
  }
  .footnote-note-editor:focus {
    border-color: var(--accent);
  }
  .footnote-note-editor:empty::before {
    content: attr(data-placeholder);
    color: var(--text-faint);
    pointer-events: none;
  }
  .footnote-note-editor :global(a) {
    color: var(--link);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .footnote-note-editor :global(span.cite-ref) {
    display: inline;
    margin: 0 1px;
    padding: 1px 4px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent) 11%, transparent);
    color: var(--accent-strong);
    font-size: 0.92em;
    cursor: pointer;
    user-select: none;
  }
  .footnote-note-editor :global(span.cite-ref::after) {
    content: attr(data-label);
  }
  .footnote-note-editor :global(span.cite-ref:hover) {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .footnote-popover-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }
  .footnote-remove,
  .footnote-done {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 9px;
    border: 1px solid transparent;
    border-radius: 5px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
  }
  .footnote-remove {
    background: transparent;
    color: var(--danger);
  }
  .footnote-remove:hover {
    background: var(--hover-bg);
  }
  .footnote-done {
    border-color: var(--border-control);
    background: var(--control-bg);
    color: var(--text-primary);
  }
  .footnote-done:hover {
    border-color: var(--accent);
    color: var(--text-heading);
  }

  @media (max-width: 760px), (pointer: coarse) and (max-height: 520px) {
    .footnote-popover {
      left: 0 !important;
      right: 0;
      top: auto !important;
      bottom: 0;
      width: 100%;
      border-radius: 14px 14px 0 0;
      padding: 12px 14px calc(14px + env(safe-area-inset-bottom));
    }
    .footnote-note-editor,
    .footnote-link-form input {
      font-size: 16px;
    }
    .footnote-tool,
    .footnote-close,
    .footnote-remove,
    .footnote-done {
      min-height: 34px;
    }
  }
</style>
