import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_LAYOUT,
  applyImageLayout,
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
