import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SUFFIX = "?font-data";

/**
 * Imports a font file as a zlib-compressed base64 string. The PDF exporter
 * needs the bytes synchronously in the browser and in tests, and keeping the
 * data compressed keeps the lazily loaded PDF chunk small.
 */
export default function fontData() {
  return {
    name: "prosecraft-font-data",
    enforce: "pre",
    /** @param {string} id */
    load(id) {
      const queryIndex = id.indexOf(SUFFIX);
      if (queryIndex === -1) return null;
      const filename = id.slice(0, queryIndex);
      const compressed = deflateSync(readFileSync(filename), { level: 9 });
      return `export default ${JSON.stringify(compressed.toString("base64"))};`;
    }
  };
}
