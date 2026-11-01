import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_DIAGRAM_SOURCE_LENGTH } from "./model";
import { renderDiagramSvg } from "./mermaid";

const originalGetComputedTextLength = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  "getComputedTextLength"
);
const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getBBox");

beforeAll(() => {
  const textWidth = (element: SVGElement) => (element.textContent ?? "").length * 8;
  Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
    configurable: true,
    value(this: SVGElement) {
      return textWidth(this);
    }
  });
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value(this: SVGElement) {
      return { x: 0, y: 0, width: textWidth(this), height: 16 };
    }
  });
});

afterAll(() => {
  if (originalGetComputedTextLength) {
    Object.defineProperty(SVGElement.prototype, "getComputedTextLength", originalGetComputedTextLength);
  } else {
    Reflect.deleteProperty(SVGElement.prototype, "getComputedTextLength");
  }
  if (originalGetBBox) {
    Object.defineProperty(SVGElement.prototype, "getBBox", originalGetBBox);
  } else {
    Reflect.deleteProperty(SVGElement.prototype, "getBBox");
  }
});

describe("Mermaid rendering", () => {
  it("renders a diagram to standalone, bounded SVG", async () => {
    const result = await renderDiagramSvg("flowchart TD\n  A[Start] --> B[Finish]");
    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.width).toBeGreaterThan(0);
    expect(result.width).toBeLessThanOrEqual(680);
    expect(result.height).toBeGreaterThan(0);
    expect(result.height).toBeLessThanOrEqual(900);
  });

  it("rejects diagram source above the render limit", async () => {
    await expect(renderDiagramSvg("x".repeat(MAX_DIAGRAM_SOURCE_LENGTH + 1)))
      .rejects.toThrow(/too large to render/);
  });
});
