/**
 * Local proofreading with Harper (WASM, fully offline after first load).
 *
 * The WASM binary is ~20 MB (~8 MB over the wire), so it is only fetched when
 * the user enables proofreading. Lint spans are rendered with the CSS Custom
 * Highlights API, the same approach as comment and Wiki-mention highlights, so
 * the scene HTML itself is never modified.
 */
import type { Dialect, Lint, LocalLinter } from "harper.js";

export type HarperDialect = "american" | "british" | "australian" | "canadian";

export const HARPER_DIALECTS: Array<{ value: HarperDialect; label: string }> = [
  { value: "american", label: "American" },
  { value: "british", label: "British" },
  { value: "australian", label: "Australian" },
  { value: "canadian", label: "Canadian" }
];

export type HarperLint = {
  start: number;
  end: number;
  message: string;
  kind: string;
  kindPretty: string;
  suggestions: string[];
};

/** Plain text plus the text-node offsets each character range came from. */
export type ProofreadText = {
  text: string;
  /** Sorted by start; each entry is the plain-text offset where node starts. */
  nodes: Array<{ node: Text; start: number }>;
};

/** Subtrees that should never be proofread (code, math, diagrams, widgets). */
const SKIP_SELECTOR = "a,code,pre,.math-inline,.math-block,.mermaid-diagram,.calc-worksheet,[contenteditable=false]";

/** Extracts checkable text from the rich-text editor with an offset map. */
export function extractProofreadText(root: Node): ProofreadText {
  const nodes: Array<{ node: Text; start: number }> = [];
  let text = "";
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT) ?? null;
  if (!walker) return { text: "", nodes };
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    current = walker.nextNode();
    if (!(node.parentElement instanceof Element)) continue;
    if (node.parentElement.closest(SKIP_SELECTOR)) continue;
    nodes.push({ node, start: text.length });
    text += node.data;
  }
  return { text, nodes };
}

/** Finds the text node and in-node offset for a plain-text offset. */
export function nodeAtOffset(
  map: ProofreadText,
  offset: number
): { node: Text; offset: number } | null {
  if (map.nodes.length === 0) return null;
  const clamped = Math.max(0, Math.min(offset, map.text.length));
  let low = 0;
  let high = map.nodes.length - 1;
  let index = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (map.nodes[mid].start <= clamped) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const entry = map.nodes[index];
  return { node: entry.node, offset: clamped - entry.start };
}

/** Builds a live DOM Range for a plain-text span (may cross node boundaries). */
export function rangeFromSpan(map: ProofreadText, start: number, end: number): Range | null {
  if (start >= end || map.nodes.length === 0) return null;
  const from = nodeAtOffset(map, start);
  const to = nodeAtOffset(map, end);
  if (!from || !to) return null;
  const owner = from.node.ownerDocument;
  if (!owner) return null;
  try {
    const range = owner.createRange();
    range.setStart(from.node, Math.min(from.offset, from.node.data.length));
    range.setEnd(to.node, Math.min(to.offset, to.node.data.length));
    return range.collapsed ? null : range;
  } catch {
    return null;
  }
}

let linterPromise: Promise<LocalLinter> | null = null;
let linterDialect: HarperDialect | null = null;

const DIALECT_IDS: Record<HarperDialect, number> = {
  american: 0,
  british: 1,
  australian: 2,
  canadian: 3
};

/** Loads the WASM linter on first use; subsequent calls reuse the instance. */
export async function ensureHarperLinter(dialect: HarperDialect): Promise<LocalLinter> {
  if (linterPromise && linterDialect === dialect) return linterPromise;
  linterDialect = dialect;
  linterPromise = (async () => {
    const [{ LocalLinter }, { slimBinary }] = await Promise.all([
      import("harper.js"),
      import("harper.js/slimBinary")
    ]);
    const linter = new LocalLinter({
      binary: slimBinary,
      dialect: DIALECT_IDS[dialect] as Dialect
    });
    await linter.setup();
    return linter;
  })().catch((error) => {
    linterPromise = null;
    linterDialect = null;
    throw error;
  });
  return linterPromise;
}

/** Forgets the cached linter (used when the dialect changes mid-session). */
export function resetHarperLinter(): void {
  linterPromise = null;
  linterDialect = null;
}

const MAX_SUGGESTIONS = 4;

/** Lints plain text and returns JSON-safe results (frees WASM objects). */
export async function lintPlainText(linter: LocalLinter, text: string): Promise<HarperLint[]> {
  if (!text.trim()) return [];
  const lints: Lint[] = await linter.lint(text, { language: "plaintext" });
  try {
    return lints
      .filter((lint) => {
        const span = lint.span();
        return span.end > span.start;
      })
      .map((lint) => {
        const span = lint.span();
        return {
          start: span.start,
          end: span.end,
          message: lint.message(),
          kind: lint.lint_kind(),
          kindPretty: lint.lint_kind_pretty(),
          suggestions: lint.suggestions().slice(0, MAX_SUGGESTIONS).map((s) => s.get_replacement_text())
        };
      });
  } finally {
    for (const lint of lints) {
      try {
        lint.free();
      } catch {
        // Ignore disposal errors; results were already copied out.
      }
    }
  }
}
