import { describe, expect, it } from "vitest";
import { renderMathSvg } from "./math";

describe("math rendering", () => {
  it("renders inline LaTeX to standalone SVG", async () => {
    const result = await renderMathSvg("E = mc^2", false, 16);
    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("viewBox");
    expect(result.svg.match(/<use\b/g)?.length ?? 0).toBeGreaterThan(1);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("renders display equations with the AMS package", async () => {
    const result = await renderMathSvg("\\begin{align} a &= b \\\\ c &= d \\end{align}", true, 16);
    expect(result.svg).toContain("<svg");
    expect(result.width).toBeGreaterThan(0);
  });

  it("rejects empty source instead of rendering a blank box", async () => {
    await expect(renderMathSvg("   ", false, 16)).rejects.toThrow(/Add some LaTeX/);
  });

  it("rejects equation source above the render limit", async () => {
    await expect(renderMathSvg("x".repeat(4_001), false, 16))
      .rejects.toThrow(/too large to render/);
  });
});
