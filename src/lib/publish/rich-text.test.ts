import { describe, expect, it } from "vitest";
import { blocksFromHtml, trimRuns } from "./rich-text";

const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ0nWQAAAABJRU5ErkJggg==";

describe("rich text runs", () => {
  it("keeps inline equation images inside their paragraph", () => {
    const blocks = blocksFromHtml(
      `<p>Energy <img src="${IMAGE}" alt="Equation: E=mc^2" data-inline="true" width="20" height="10"> matters.</p>`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
    const image = blocks[0].runs.find((run) => run.image);
    expect(image?.image).toMatchObject({ src: IMAGE, alt: "Equation: E=mc^2", width: 20, height: 10 });
    expect(blocks[0].runs.map((run) => run.text).join("").replace(/\s+/g, " ").trim())
      .toBe("Energy matters.");
  });

  it("splits figures from surrounding paragraphs", () => {
    const blocks = blocksFromHtml(
      `<p>Before<img src="${IMAGE}" alt="Diagram" width="80" height="40"></p><p>After</p>`
    );
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "image", "paragraph"]);
    expect(blocks[1].image?.alt).toBe("Diagram");
  });

  it("keeps an image-only paragraph as a run rather than an empty line", () => {
    const blocks = blocksFromHtml(
      `<p><img src="${IMAGE}" alt="Equation" data-inline="true" width="20" height="10"></p>`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
    expect(blocks[0].runs[0].image?.alt).toBe("Equation");
  });

  it("trims surrounding whitespace without dropping images", () => {
    const runs = trimRuns([
      { text: "  " },
      { text: "", image: { src: IMAGE, alt: "Equation" } },
      { text: "  " }
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].image?.alt).toBe("Equation");
  });
});
