import { describe, expect, it } from "vitest";
import { fitPreviewFrame } from "./preview-pagination";

function fakeFrame(width: number, bodyHtml: string, paginated: boolean) {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body data-page-width-pt="612" data-page-height-pt="792"${paginated ? ' data-paginated="true"' : ""}>${bodyHtml}</body></html>`,
    "text/html"
  );
  const frame = document.createElement("iframe");
  Object.defineProperty(frame, "clientWidth", { value: width });
  Object.defineProperty(frame, "clientHeight", { value: 800 });
  Object.defineProperty(frame, "contentDocument", { value: parsed });
  return frame;
}

describe("fitPreviewFrame", () => {
  it("scales narrow frames and compensates the transformed height", () => {
    const frame = fakeFrame(200, '<div id="preview-pages"><div class="page"></div></div>', true);
    fitPreviewFrame(frame);
    const doc = frame.contentDocument!;
    expect(doc.documentElement.style.getPropertyValue("--preview-scale")).not.toBe("1.0000");
    const pages = doc.getElementById("preview-pages") as HTMLElement;
    expect(pages.style.height).toMatch(/px$/);
  });

  it("leaves wide frames at full scale", () => {
    const frame = fakeFrame(2000, '<div class="book"><p>hi</p></div>', false);
    fitPreviewFrame(frame);
    expect(frame.contentDocument!.documentElement.style.getPropertyValue("--preview-scale")).toBe("1.0000");
  });

  it("ignores frames without page metrics", () => {
    const parsed = new DOMParser().parseFromString(
      "<!doctype html><html><body><p>x</p></body></html>",
      "text/html"
    );
    const frame = document.createElement("iframe");
    Object.defineProperty(frame, "contentDocument", { value: parsed });
    expect(() => fitPreviewFrame(frame)).not.toThrow();
  });
});
