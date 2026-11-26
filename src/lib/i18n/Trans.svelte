<script lang="ts">
  import { messageTemplate } from "$lib/i18n/format";
  import { formatNumber, parseMessage, selectOption } from "$lib/i18n/message";
  import type { MessageKey } from "$lib/i18n/catalog";
  import type { MessageNode, MessageParams } from "$lib/i18n/message";
  import { localeState } from "$lib/i18n/state.svelte";

  let {
    key,
    message,
    params = {}
  }: {
    /** Catalog key to translate. */
    key?: MessageKey;
    /** Raw template for tests or one-off strings. Takes precedence over `key`. */
    message?: string;
    params?: MessageParams;
  } = $props();

  const template = $derived(
    message ?? (key === undefined ? "" : (messageTemplate(localeState.locale, key) ?? key))
  );
  const nodes = $derived(parseMessage(template));

  function paramText(name: string): string {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  }

  function numberText(name: string): string {
    const value = Number(params[name]);
    return Number.isFinite(value)
      ? formatNumber(value, localeState.locale)
      : `{${name}, number}`;
  }
</script>

{#snippet renderNodes(nodes: MessageNode[])}
  {#each nodes as node}
    {#if node.type === "text"}{node.value}
    {:else if node.type === "param"}{paramText(node.name)}
    {:else if node.type === "number"}{numberText(node.name)}
    {:else if node.type === "pound"}{"#"}
    {:else if node.type === "tag"}
      {#if node.name === "strong"}<strong>{@render renderNodes(node.children)}</strong>
      {:else if node.name === "em"}<em>{@render renderNodes(node.children)}</em>
      {:else if node.name === "code"}<code>{@render renderNodes(node.children)}</code>
      {:else}<kbd>{@render renderNodes(node.children)}</kbd>{/if}
    {:else}
      {@render renderNodes(selectOption(node, localeState.locale, params))}
    {/if}
  {/each}
{/snippet}

{@render renderNodes(nodes)}

<style>
  strong { font-weight: 600; }
  em { font-style: italic; }
  code {
    padding: 0.08em 0.34em;
    border-radius: 4px;
    background: var(--control-hover);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
  }
  kbd {
    padding: 0.08em 0.34em;
    border: 1px solid var(--border-control);
    border-radius: 4px;
    background: var(--control-bg);
    font-family: inherit;
    font-size: 0.9em;
  }
</style>
