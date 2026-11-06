import { beforeEach, describe, expect, it } from "vitest";
import { commentText, offsetFromPoint } from "./comment-dom";

function editor(html: string): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe("offsetFromPoint", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = editor("<p>One <em>two</em> three</p><p>four</p>");
  });

  it("uses the same text as commentText", () => {
    const paragraph = root.querySelector("p")!;
    expect(commentText(root)).toBe("One two threefour");
    expect(offsetFromPoint(root, paragraph.firstChild!, 4)).toBe(4);
  });

  it("counts earlier text nodes and splits inside a nested element", () => {
    const emphasis = root.querySelector("em")!;
    expect(offsetFromPoint(root, emphasis.firstChild!, 0)).toBe(4);
    expect(offsetFromPoint(root, emphasis.firstChild!, 3)).toBe(7);
  });

  it("resolves a point on an element boundary", () => {
    const second = root.querySelectorAll("p")[1];
    expect(offsetFromPoint(root, second, 0)).toBe(13);
  });

  it("returns null for nodes outside the editor", () => {
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    document.body.append(outside);
    expect(offsetFromPoint(root, outside.firstChild!, 2)).toBeNull();
  });

  it("skips widgets that are not editable text", () => {
    document.body.innerHTML = "";
    root = editor('<p>a<span contenteditable="false">skip</span>b</p>');
    expect(commentText(root)).toBe("ab");
    const paragraph = root.querySelector("p")!;
    expect(offsetFromPoint(root, paragraph.lastChild!, 1)).toBe(2);
  });
});
