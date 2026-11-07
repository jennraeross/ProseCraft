<script lang="ts">
  import { onMount } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade, scale } from "svelte/transition";
  import { X } from "@lucide/svelte";
  import { SHORTCUT_GROUPS, formatKey } from "$lib/shortcuts";

  type SaveStatus = { ok: boolean; message: string };

  let {
    open,
    onClose,
    onSavePdf
  }: {
    open: boolean;
    onClose: () => void;
    onSavePdf: () => Promise<SaveStatus | null>;
  } = $props();

  // Mirrors the ⌘/Ctrl detection used for the rest of the interface.
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  // A soft ease-out, close to the macOS sheet motion.
  const panelEase = cubicOut;
  const printClass = "printing-shortcuts";

  let panel = $state<HTMLDivElement>();
  let previousFocus: HTMLElement | null = null;
  let reducedMotion = $state(false);
  let saving = $state(false);
  let status = $state<SaveStatus | null>(null);

  onMount(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      reducedMotion = motionQuery.matches;
    };
    const clearPrintClass = () => document.body.classList.remove(printClass);
    updateMotion();
    motionQuery.addEventListener("change", updateMotion);
    window.addEventListener("afterprint", clearPrintClass);
    return () => {
      motionQuery.removeEventListener("change", updateMotion);
      window.removeEventListener("afterprint", clearPrintClass);
      document.body.classList.remove(printClass);
    };
  });

  // Move focus into the sheet while it is open and hand it back on close.
  $effect(() => {
    if (open) {
      if (!previousFocus && document.activeElement instanceof HTMLElement) {
        previousFocus = document.activeElement;
      }
      panel?.focus();
      return;
    }
    document.body.classList.remove(printClass);
    previousFocus?.focus();
    previousFocus = null;
    status = null;
  });

  function handleLayerClick(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }

  function printSheet() {
    // The class scopes the print stylesheet to this sheet only.
    document.body.classList.add(printClass);
    window.print();
  }

  async function saveAsPdf() {
    if (saving) return;
    saving = true;
    status = null;
    try {
      status = await onSavePdf();
    } catch (error) {
      console.error("Could not save the shortcuts sheet.", error);
      status = { ok: false, message: "Could not save the PDF." };
    } finally {
      saving = false;
    }
  }
</script>

{#if open}
  <div
    class="shortcuts-layer"
    in:fade={{ duration: reducedMotion ? 0 : 220 }}
    out:fade={{ duration: reducedMotion ? 0 : 160 }}
    onclick={handleLayerClick}
    role="presentation"
  >
    <div
      class="shortcuts-panel"
      bind:this={panel}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      tabindex="-1"
      in:scale={{ start: reducedMotion ? 1 : 0.96, opacity: reducedMotion ? 1 : 0, duration: reducedMotion ? 0 : 220, easing: panelEase }}
      out:scale={{ start: reducedMotion ? 1 : 0.96, opacity: reducedMotion ? 1 : 0, duration: reducedMotion ? 0 : 160, easing: panelEase }}
    >
      <header class="shortcuts-header">
        <div><span class="shortcuts-kicker">PROSECRAFT</span><h2>Keyboard shortcuts</h2></div>
        <div class="shortcuts-actions">
          {#if status}
            <span class="shortcuts-status" class:error={!status.ok} role="status">{status.message}</span>
          {/if}
          <button type="button" class="shortcuts-action" onclick={printSheet}>Print</button>
          <button type="button" class="shortcuts-action" onclick={saveAsPdf} disabled={saving}>{saving ? "Saving…" : "Save as PDF"}</button>
          <button type="button" class="shortcuts-close" aria-label="Close keyboard shortcuts" onclick={onClose}><X size={15} aria-hidden="true" /></button>
        </div>
      </header>
      <div class="shortcuts-body">
        <div class="shortcuts-columns">
          {#each SHORTCUT_GROUPS as group (group.title)}
            <section class="shortcuts-group">
              <h3>{group.title}</h3>
              {#each group.entries as entry (entry.action)}
                <div class="shortcuts-row">
                  <span class="shortcuts-name">{entry.action}</span>
                  <span class="shortcuts-keys">
                    {#each entry.keys as key (key)}
                      <kbd>{formatKey(key, isMac)}</kbd>
                    {/each}
                  </span>
                </div>
              {/each}
            </section>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .shortcuts-layer { position: fixed; z-index: 80; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; overflow: auto; background: var(--backdrop); }
  .shortcuts-panel { display: flex; width: min(720px, 100%); max-height: calc(100vh - 48px); flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-raised); box-shadow: var(--shadow-dialog); color: var(--text-primary); outline: none; }
  .shortcuts-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 23px 25px 18px; border-bottom: 1px solid var(--border-soft); }
  .shortcuts-kicker { color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.2px; }
  .shortcuts-header h2 { margin: 7px 0 0; color: var(--text-heading); font-family: Georgia, serif; font-size: 25px; font-weight: 500; }
  .shortcuts-actions { display: flex; align-items: center; gap: 7px; }
  .shortcuts-action { height: 28px; padding: 0 11px; border: 1px solid var(--border-control); border-radius: 6px; background: var(--control-bg); color: var(--text-secondary); cursor: pointer; font-size: 10px; }
  .shortcuts-action:hover:not(:disabled) { background: var(--hover-bg); color: var(--text-primary); }
  .shortcuts-action:disabled { cursor: default; opacity: .6; }
  .shortcuts-status { color: var(--text-muted); font-size: 10px; }
  .shortcuts-status.error { color: var(--danger); }
  .shortcuts-close { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .shortcuts-close:hover { background: var(--hover-bg); color: var(--text-primary); }
  .shortcuts-body { flex: 1 1 auto; overflow: auto; padding: 18px 25px 24px; }
  .shortcuts-columns { columns: 2; column-gap: 30px; }
  .shortcuts-group { margin: 0 0 20px; break-inside: avoid; }
  .shortcuts-group h3 { margin: 0 0 8px; color: var(--text-muted); font-size: 9px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; }
  .shortcuts-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid var(--border-soft); }
  .shortcuts-group .shortcuts-row:last-child { border-bottom: 0; }
  .shortcuts-name { color: var(--text-secondary); font-size: 11px; }
  .shortcuts-keys { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  kbd { min-width: 18px; padding: 2px 5px; border: 1px solid var(--border-control); border-radius: 4px; background: var(--control-bg); color: var(--text-primary); font-family: inherit; font-size: 10px; text-align: center; }

  @media (max-width: 640px) {
    .shortcuts-layer { padding: 12px; }
    .shortcuts-panel { max-height: calc(100vh - 24px); }
    .shortcuts-header { flex-wrap: wrap; }
    .shortcuts-columns { columns: 1; }
  }

  @media print {
    @page { margin: 16mm; }
    :global(body.printing-shortcuts) .shortcuts-layer { position: static; display: block; padding: 0; overflow: visible; background: none; }
    :global(body.printing-shortcuts) .shortcuts-panel { width: auto; max-width: none; max-height: none; overflow: visible; border: 0; border-radius: 0; background: #fff; box-shadow: none; color: #000; transform: none !important; opacity: 1 !important; }
    :global(body.printing-shortcuts) .shortcuts-body { overflow: visible; padding: 0; }
    :global(body.printing-shortcuts) .shortcuts-header { padding: 0 0 12px; border-color: #999; }
    :global(body.printing-shortcuts) .shortcuts-header h2 { color: #000; }
    :global(body.printing-shortcuts) .shortcuts-kicker,
    :global(body.printing-shortcuts) .shortcuts-group h3 { color: #444; }
    :global(body.printing-shortcuts) .shortcuts-actions { display: none; }
    :global(body.printing-shortcuts) .shortcuts-row { border-color: #ccc; }
    :global(body.printing-shortcuts) .shortcuts-name { color: #000; }
    :global(body.printing-shortcuts) kbd { border-color: #888; background: #fff; color: #000; }
    :global(body.printing-shortcuts .app-shell),
    :global(body.printing-shortcuts dialog),
    :global(body.printing-shortcuts .data-file-input) { display: none !important; }
  }
</style>
