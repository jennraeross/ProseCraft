import { describe, expect, it } from "vitest";
import { extractProofreadText, nodeAtOffset, rangeFromSpan } from "./harper";

function makeRoot(): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = "<p>Hello <strong>brave</strong> new world</p><p>Second line</p>";
  return root;
}

describe("harper proofread text extraction", () => {
  it("concatenates text nodes while skipping code and math", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>Plain <code>code()</code> text</p><p class=\"math-inline\">x^2</p><p>More</p>";
    const map = extractProofreadText(root);
    expect(map.text).toBe("Plain  textMore");
    expect(map.nodes.length).toBeGreaterThan(0);
  });

  it("maps offsets back to the originating text nodes", () => {
    const root = makeRoot();
    const map = extractProofreadText(root);
    expect(map.text).toBe("Hello brave new worldSecond line");
    const at = nodeAtOffset(map, 7);
    expect(at?.node.data).toBe("brave");
    expect(at?.offset).toBe(1);
  });

  it("builds ranges that can span node boundaries", () => {
    const root = makeRoot();
    const map = extractProofreadText(root);
    const range = rangeFromSpan(map, 0, 11);
    expect(range).not.toBeNull();
    expect(range?.toString()).toBe("Hello brave");
  });

  it("rejects empty or inverted spans", () => {
    const map = extractProofreadText(makeRoot());
    expect(rangeFromSpan(map, 5, 5)).toBeNull();
    expect(rangeFromSpan(map, 9, 2)).toBeNull();
    expect(rangeFromSpan({ text: "", nodes: [] }, 0, 1)).toBeNull();
  });
});
