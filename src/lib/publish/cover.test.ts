import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCoverImage } from "./cover";
import { normalizePublishOptions, type CompiledBook } from "./types";

type Fill = { text: string; font: string };

// A canvas that keeps the font like a real one and records each fillText.
function recordCanvas(): Fill[] {
  const fills: Fill[] = [];
  const context = {
    font: "10px sans-serif",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "start",
    textBaseline: "alphabetic",
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    stroke() {},
    fill() {},
    measureText(text: string) {
      const size = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
      return { width: Array.from(text).length * size * 0.5 };
    },
    fillText(text: string) {
      fills.push({ text, font: this.font });
    }
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => context) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => "data:image/png;base64,AAAA");
  return fills;
}

function book(title: string, subtitle: string): CompiledBook {
  return { title, subtitle, author: "" } as unknown as CompiledBook;
}

describe("generated covers", () => {
  afterEach(() => vi.restoreAllMocks());

  for (const design of ["classic", "minimal"] as const) {
    it(`draws the ${design} title in its own font when there is a subtitle`, async () => {
      const fills = recordCanvas();
      const options = normalizePublishOptions({ cover: { mode: "generated", design } });
      await resolveCoverImage(book(`Harbor Lights ${design}`, "Second line"), options);
      const title = fills.filter((fill) => fill.text.includes("Harbor"));
      const subtitle = fills.find((fill) => fill.text === "Second line");
      expect(title.length).toBeGreaterThan(0);
      for (const fill of title) {
        expect(fill.font).toMatch(/^normal 400 \d+px /);
        expect(fill.font).not.toBe(subtitle?.font);
      }
      expect(subtitle?.font).toMatch(/^italic 400 /);
    });
  }
});
