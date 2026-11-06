export type CaretPoint = { path: number[]; offset: number };
export type CaretSelection = { anchor: CaretPoint; focus: CaretPoint } | null;

function encodePoint(root: Element, node: Node, nodeOffset: number): CaretPoint {
  const element = node instanceof Element ? node : node.parentElement ?? root;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, nodeOffset);
  const path: number[] = [];
  for (let current: Element = element; current !== root && current.parentElement; current = current.parentElement) {
    path.unshift(Array.prototype.indexOf.call(current.parentElement.children, current));
  }
  return { path, offset: range.toString().length };
}

function decodePoint(root: Element, point: CaretPoint): [Node, number] {
  let element = root;
  for (const index of point.path) {
    const child = element.children[Math.min(index, element.children.length - 1)];
    if (!child) break;
    element = child;
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = point.offset;
  let last: Text | null = null;
  while (walker.nextNode()) {
    last = walker.currentNode as Text;
    if (remaining <= last.length) return [last, remaining];
    remaining -= last.length;
  }
  return last ? [last, last.length] : [element, 0];
}

/**
 * Identifies a selection by element path and text offset. Node references would not
 * survive restoring the editor's HTML, and the restored HTML has no rendered widgets.
 */
export function encodeSelection(root: Element): CaretSelection {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
    return null;
  }
  return {
    anchor: encodePoint(root, selection.anchorNode, selection.anchorOffset),
    focus: encodePoint(root, selection.focusNode, selection.focusOffset)
  };
}

export function restoreSelection(root: Element, saved: CaretSelection) {
  const selection = window.getSelection();
  if (!selection || !saved) return;
  const [anchorNode, anchorOffset] = decodePoint(root, saved.anchor);
  const [focusNode, focusOffset] = decodePoint(root, saved.focus);
  selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}
