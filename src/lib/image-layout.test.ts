import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_LAYOUT,
  applyImageLayout,
  applyImageLayoutStyles,
  clampImageWidth,
  imageLayoutStyle,
  readImageLayout,
  type ImageLayout
} from "./image-layout";

const SRC = "data:image/png;base64,AA==";

function image(attributes: Record<string, string> = {}): HTMLImageElement {
  const element = document.createElement("img");
  element.setAttribute("src", SRC);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function layoutDataAttributes(element: Element): Record<string, string> {
  return Object.fromEntries(
    element.getAttributeNames()
      .filter((name) => name.startsWith("data-"))
      .map((name) => [name, element.getAttribute(name) ?? ""])
  );
}

describe("readImageLayout", () => {
  it("reads a plain image as large, centered, and in its own block", () => {
    expect(readImageLayout(image())).toEqual(DEFAULT_IMAGE_LAYOUT);
  });

  it("reads stored layout attributes", () => {
    expect(readImageLayout(image({
      "data-size": "small",
      "data-align": "right",
      "data-wrap": "wrap-left"
    }))).toEqual({ size: "small", align: "right", wrap: "wrap-left" });
  });

  it("reads and clamps a custom width", () => {
    const custom = (width: string) => readImageLayout(image({
      "data-size": "custom",
      "data-width": width
    }));
    expect(custom("62")).toEqual({ size: "custom", width: 62, align: "center", wrap: "block" });
    expect(custom("5")).toEqual({ size: "custom", width: 10, align: "center", wrap: "block" });
    expect(custom("140")).toEqual({ size: "custom", width: 100, align: "center", wrap: "block" });
  });

  it("reads the original size", () => {
    expect(readImageLayout(image({ "data-size": "original", "data-align": "left" })))
      .toEqual({ size: "original", align: "left", wrap: "block" });
  });

  it("ignores hostile and unknown values", () => {
    expect(readImageLayout(image({
      "data-size": "x;background:url(https://evil.test/a.png)",
      "data-width": "60%",
      "data-align": "left; position: fixed",
      "data-wrap": "wrap-up"
    }))).toEqual(DEFAULT_IMAGE_LAYOUT);
  });

  it("rejects non-numeric widths", () => {
    for (const width of ["", "1e3", "60px", "-40", "Infinity", "10 0"]) {
      expect(readImageLayout(image({ "data-size": "custom", "data-width": width })))
        .toEqual(DEFAULT_IMAGE_LAYOUT);
    }
  });

  it("falls back to the default size when a custom width is missing", () => {
    expect(readImageLayout(image({ "data-size": "custom", "data-align": "left" })))
      .toEqual({ size: "large", align: "left", wrap: "block" });
  });
});

describe("applyImageLayout", () => {
  it("writes only the attributes that differ from the defaults", () => {
    const element = image();
    applyImageLayout(element, { size: "medium", align: "left", wrap: "block" });
    expect(layoutDataAttributes(element)).toEqual({ "data-size": "medium", "data-align": "left" });
  });

  it("writes a custom size with its clamped width", () => {
    const element = image();
    applyImageLayout(element, { size: "custom", width: 62, align: "center", wrap: "block" });
    expect(layoutDataAttributes(element)).toEqual({ "data-size": "custom", "data-width": "62" });
  });

  it("writes the original size without a width", () => {
    const element = image({ "data-size": "custom", "data-width": "62" });
    applyImageLayout(element, { size: "original", align: "center", wrap: "block" });
    expect(layoutDataAttributes(element)).toEqual({ "data-size": "original" });
  });

  it("removes stale attributes when the layout returns to the defaults", () => {
    const element = image({
      "data-size": "small",
      "data-width": "40",
      "data-align": "right",
      "data-wrap": "wrap-right"
    });
    applyImageLayout(element, { ...DEFAULT_IMAGE_LAYOUT });
    expect(layoutDataAttributes(element)).toEqual({});
  });

  it("validates hostile values before writing", () => {
    const element = image();
    applyImageLayout(element, {
      size: "custom",
      width: 900,
      align: "left; position: fixed",
      wrap: "inline"
    } as unknown as ImageLayout);
    expect(layoutDataAttributes(element)).toEqual({ "data-size": "custom", "data-width": "100" });
  });

  it("round-trips through the attributes", () => {
    const element = image();
    const layout: ImageLayout = { size: "small", align: "right", wrap: "wrap-right" };
    applyImageLayout(element, layout);
    expect(readImageLayout(element)).toEqual(layout);
    applyImageLayout(element, { ...layout, wrap: "block" });
    expect(readImageLayout(element)).toEqual({ ...layout, wrap: "block" });
  });
});

describe("clampImageWidth", () => {
  it("keeps widths inside the renderable range", () => {
    expect(clampImageWidth(5)).toBe(10);
    expect(clampImageWidth(-20)).toBe(10);
    expect(clampImageWidth(40)).toBe(40);
    expect(clampImageWidth(62.4)).toBe(62);
    expect(clampImageWidth(140)).toBe(100);
    expect(clampImageWidth(Number.NaN)).toBe(10);
  });
});

describe("imageLayoutStyle", () => {
  it("centers the default size with auto margins", () => {
    expect(imageLayoutStyle({ ...DEFAULT_IMAGE_LAYOUT }))
      .toBe("width: 75%; max-width: 100%; height: auto; margin-left: auto; margin-right: auto;");
  });

  it("aligns a block image to the left", () => {
    expect(imageLayoutStyle({ size: "small", align: "left", wrap: "block" }))
      .toBe("width: 25%; max-width: 100%; height: auto; margin-left: 0; margin-right: auto;");
  });

  it("uses the custom width in percent", () => {
    expect(imageLayoutStyle({ size: "custom", width: 40, align: "center", wrap: "block" }))
      .toBe("width: 40%; max-width: 100%; height: auto; margin-left: auto; margin-right: auto;");
  });

  it("keeps an original-size image at its natural width", () => {
    expect(imageLayoutStyle({ size: "original", align: "center", wrap: "block" }))
      .toBe("width: auto; max-width: 100%; height: auto; margin-left: auto; margin-right: auto;");
    expect(imageLayoutStyle({ size: "original", align: "left", wrap: "wrap-left" }))
      .toBe("width: auto; max-width: 50%; height: auto; float: left; margin: 4px 18px 14px 0;");
  });

  it("can leave the size to the image and only place it", () => {
    expect(imageLayoutStyle({ size: "large", align: "left", wrap: "block" }, { sizing: false }))
      .toBe("margin-left: 0; margin-right: auto;");
    expect(imageLayoutStyle({ size: "large", align: "center", wrap: "wrap-right" }, { sizing: false }))
      .toBe("float: right; margin: 4px 0 14px 18px;");
  });

  it("floats wrapped images with a margin towards the text", () => {
    expect(imageLayoutStyle({ size: "medium", align: "center", wrap: "wrap-right" }))
      .toBe("width: 50%; max-width: 100%; height: auto; float: right; margin: 4px 0 14px 18px;");
    expect(imageLayoutStyle({ size: "large", align: "center", wrap: "wrap-left" }))
      .toBe("width: 50%; max-width: 100%; height: auto; float: left; margin: 4px 18px 14px 0;");
  });

  it("caps a wide custom image that floats", () => {
    expect(imageLayoutStyle({ size: "custom", width: 80, align: "center", wrap: "wrap-left" }))
      .toBe("width: 50%; max-width: 100%; height: auto; float: left; margin: 4px 18px 14px 0;");
  });

  it("sanitizes hostile values", () => {
    expect(imageLayoutStyle({
      size: "custom",
      width: 900,
      align: "left;color:red",
      wrap: "wrap-left;position:fixed"
    } as unknown as ImageLayout))
      .toBe("width: 100%; max-width: 100%; height: auto; margin-left: auto; margin-right: auto;");
  });
});

describe("applyImageLayoutStyles", () => {
  const HTML = (attributes: string) => `<p><img src="${SRC}" alt="Chart"${attributes}></p>`;

  it("gives a plain image the default width and centering", () => {
    const html = applyImageLayoutStyles(HTML(""));
    expect(html).toContain(
      `style="width: 75%; max-width: 100%; height: auto; margin-left: auto; margin-right: auto;"`
    );
  });

  it("carries a custom width and alignment", () => {
    const html = applyImageLayoutStyles(HTML(` data-size="custom" data-width="40" data-align="left"`));
    expect(html).toContain(
      `style="width: 40%; max-width: 100%; height: auto; margin-left: 0; margin-right: auto;"`
    );
  });

  it("keeps an explicit pixel size and only places the image", () => {
    const html = applyImageLayoutStyles(HTML(` width="320" height="200" data-align="right"`));
    expect(html).toContain(`width="320"`);
    expect(html).toContain(`style="margin-left: auto; margin-right: 0;"`);
    expect(html).not.toContain("width: 75%");
  });

  it("leaves inline equation and diagram images alone", () => {
    const html = `<p><img src="${SRC}" alt="Equation" data-inline="true" width="20" height="10"></p>`;
    expect(applyImageLayoutStyles(html)).toBe(html);
  });

  it("returns untouched markup unchanged", () => {
    const html = "<p>No pictures here.</p>";
    expect(applyImageLayoutStyles(html)).toBe(html);
  });
});
