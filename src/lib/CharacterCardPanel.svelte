<script lang="ts">
  import { X } from "@lucide/svelte";
  import CharacterSheet from "./CharacterSheet.svelte";
  import type { ChapterData, DocumentData, ResearchFolder } from "./publish/types";
  import type { DocumentMeta, SheetTemplate } from "./story-meta";

  type Props = {
    document: DocumentData;
    pages: readonly DocumentData[];
    folders: readonly ResearchFolder[];
    chapters?: readonly ChapterData[];
    projectTemplates?: readonly SheetTemplate[];
    onchange: (meta: DocumentMeta | undefined) => void;
    onsavetemplates: (templates: SheetTemplate[]) => void;
    onOpenGraphBeside?: (pageId: string) => void;
    onOpenScene?: (id: string) => void;
    onClose: () => void;
  };

  let {
    document,
    pages,
    folders,
    chapters = [],
    projectTemplates = [],
    onchange,
    onsavetemplates,
    onOpenGraphBeside,
    onOpenScene,
    onClose
  }: Props = $props();

  $effect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

<aside
  class="character-card-panel"
  data-testid="character-card"
  aria-label={`${document.title || "Untitled"} character card`}
>
  <header class="character-card-head">
    <span class="character-card-eyebrow">Character card</span>
    <button
      type="button"
      class="character-card-close"
      aria-label="Close character card"
      onclick={onClose}
    >
      <X size={13} aria-hidden="true" />
    </button>
  </header>
  <div class="character-card-body">
    <CharacterSheet
      {document}
      {pages}
      {folders}
      {chapters}
      {projectTemplates}
      {onchange}
      {onsavetemplates}
      {onOpenGraphBeside}
      {onOpenScene}
    />
  </div>
</aside>

<style>
  .character-card-panel {
    position: fixed;
    top: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 70;
    display: flex;
    width: min(380px, calc(100vw - 24px));
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-control);
    border-radius: 9px;
    background: var(--surface);
    box-shadow: var(--shadow-panel-left);
  }

  .character-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px 8px 12px;
    border-bottom: 1px solid var(--border-soft);
  }

  .character-card-eyebrow {
    color: var(--text-muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .character-card-close {
    display: flex;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }
  .character-card-close:hover { background: var(--surface-raised); color: var(--text-heading); }

  .character-card-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  }
</style>
