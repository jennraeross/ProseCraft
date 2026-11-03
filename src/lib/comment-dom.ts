/**
 * Maps between positions in the editor's text and DOM ranges. The "text" is
 * every text node under the root in document order, joined without separators,
 * skipping widgets that are not editable text (equations, diagrams).
 */
function textNodes(root: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest("[contenteditable='false'], svg")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

export function commentText(root: Element): string {
  return textNodes(root).map((node) => node.data).join("");
}

/** Text offsets of a DOM range inside `root`, or null when it lies outside or is empty. */
export function offsetsFromRange(root: Element, range: Range): { start: number; end: number } | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  let offset = 0;
  let start = -1;
  let end = -1;
  for (const node of textNodes(root)) {
    if (node === range.startContainer) start = offset + range.startOffset;
    if (node === range.endContainer) end = offset + range.endOffset;
    offset += node.data.length;
  }
  // A boundary inside an element (not a text node) is resolved against its children.
  if (start === -1 || end === -1) {
    const probe = document.createRange();
    probe.selectNodeContents(root);
    probe.setEnd(range.startContainer, range.startOffset);
    if (start === -1) start = probe.toString().length;
    probe.setEnd(range.endContainer, range.endOffset);
    if (end === -1) end = probe.toString().length;
  }
  return end > start ? { start, end } : null;
}

export function rangeFromOffsets(root: Element, start: number, end: number): Range | null {
  let offset = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  const range = document.createRange();
  for (const node of textNodes(root)) {
    const next = offset + node.data.length;
    if (!startNode && start < next) {
      startNode = node;
      startOffset = start - offset;
    }
    if (startNode && end <= next) {
      range.setStart(startNode, startOffset);
      range.setEnd(node, end - offset);
      return range;
    }
    offset = next;
  }
  return null;
}
