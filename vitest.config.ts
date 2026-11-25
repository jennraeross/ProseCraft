import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import fontData from "./vite-plugin-font-data.js";

export default defineConfig({
  plugins: [fontData()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    // PDF/font and IndexedDB sync tests can take several seconds under the
    // parallel runner; the old 5s default made unrelated tests flaky.
    testTimeout: 30_000,
    include: ["src/**/*.test.ts", "mcp/src/**/*.test.ts"]
  }
});
