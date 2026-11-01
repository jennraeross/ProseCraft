import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEpub } from "./epub";

/**
 * Optional smoke test against a real book. Point PROSECRAFT_EPUB_FIXTURE at a
 * local EPUB (the default is used when present) to verify the parser against
 * markup that synthetic fixtures do not cover.
 */
const fixturePath = process.env.PROSECRAFT_EPUB_FIXTURE ?? "/tmp/opencode/oz.epub";
const hasFixture = existsSync(fixturePath);

describe.skipIf(!hasFixture)("real epub fixture", () => {
  it("parses a complete illustrated book", async () => {
    const manuscript = await parseEpub(new Uint8Array(readFileSync(fixturePath)), {
      fallbackTitle: fixturePath.split(/[\\/]/).pop()
    });

    expect(manuscript.title.length).toBeGreaterThan(0);
    expect(manuscript.chapters.length).toBeGreaterThan(5);
    expect(manuscript.chapters.every((chapter) =>
      chapter.scenes.some((scene) => scene.content.length > 0)
    )).toBe(true);
    if (manuscript.coverImage) {
      expect(manuscript.coverImage).toMatch(/^data:image\//);
    }
  });
});
