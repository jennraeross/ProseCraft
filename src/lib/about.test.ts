import { describe, expect, it, vi } from "vitest";
import { APP_NAME, APP_LICENSE, APP_AUTHOR, APP_REPOSITORY_URL, APP_VERSION } from "./about";
import type { DiagnosticsInput } from "./about";
import { buildDiagnosticsReport, summarizeUserAgent } from "./about";

describe("about module", () => {
  describe("constants", () => {
    it("has expected app name", () => {
      expect(APP_NAME).toBe("ProseCraft");
    });

    it("has expected license", () => {
      expect(APP_LICENSE).toBe("MIT");
    });

    it("has expected author", () => {
      expect(APP_AUTHOR).toBe("Jennifer Roylance");
    });

    it("has expected repository URL", () => {
      expect(APP_REPOSITORY_URL).toBe("https://github.com/jennraeross/ProseCraft");
    });

    it("has version from package.json", () => {
      expect(APP_VERSION).toBe("0.4.6");
    });
  });

  describe("DiagnosticsInput type", () => {
    it("accepts valid input", () => {
      const input: DiagnosticsInput = {
        version: "0.4.6",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 5,
          chapters: 10,
          scenes: 20,
          wikiPages: 3,
          words: 15000,
          comments: 50,
          snapshots: 2,
        },
        features: { darkMode: true, autosave: false },
      };
      expect(input).toBeDefined();
    });
  });

  describe("summarizeUserAgent", () => {
    it("parses Linux user agent", () => {
      const ua =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
      const result = summarizeUserAgent(ua);
      expect(result).toContain("Linux");
      expect(result).toContain("WebKitGTK");
    });

    it("parses Windows user agent with WebView2", () => {
      const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
      const result = summarizeUserAgent(ua);
      expect(result).toContain("Windows");
      expect(result).toContain("WebView2");
    });

    it("parses macOS user agent", () => {
      const ua =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.16";
      const result = summarizeUserAgent(ua);
      expect(result).toContain("macOS");
      expect(result).toContain("WebKit");
    });

    it("handles unknown user agent without crashing", () => {
      const ua = "Some random user agent string";
      const result = summarizeUserAgent(ua);
      expect(result).toBeDefined();
      expect(result).toContain("unknown");
    });
  });

  describe("buildDiagnosticsReport", () => {
    it("contains version and counts", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 5,
          chapters: 10,
          scenes: 20,
          wikiPages: 3,
          words: 15000,
          comments: 50,
          snapshots: 2,
        },
        features: { darkMode: true, autosave: false },
      };

      const report = buildDiagnosticsReport(input);

      expect(report).toContain(APP_VERSION);
      expect(report).toContain("projects: 5");
      expect(report).toContain("chapters: 10");
      expect(report).toContain("scenes: 20");
      expect(report).toContain("wiki pages: 3");
      expect(report).toContain("words: 15000");
      expect(report).toContain("comments: 50");
      expect(report).toContain("snapshots: 2");
    });

    it("never contains marker strings from userAgent unrelated fields", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent: "/home/alice/secret data here",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 0,
          chapters: 0,
          scenes: 0,
          wikiPages: 0,
          words: 0,
          comments: 0,
          snapshots: 0,
        },
        features: undefined,
      };

      const report = buildDiagnosticsReport(input);

      expect(report).not.toContain("alice");
      expect(report).not.toContain("secret");
    });

    it("unknown user agent does not crash", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent: "totally random garbage",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 0,
          chapters: 0,
          scenes: 0,
          wikiPages: 0,
          words: 0,
          comments: 0,
          snapshots: 0,
        },
        features: undefined,
      };

      const report = buildDiagnosticsReport(input);
      expect(report).toBeDefined();
      expect(report.length).toBeGreaterThan(0);
    });

    it("stable output for a fixed date", () => {
      const fixedDate = new Date("2024-01-15T10:30:00Z");
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 1,
          chapters: 2,
          scenes: 3,
          wikiPages: 0,
          words: 100,
          comments: 0,
          snapshots: 0,
        },
        features: undefined,
      };

      const report1 = buildDiagnosticsReport(input, fixedDate);
      const report2 = buildDiagnosticsReport(input, fixedDate);

      expect(report1).toBe(report2);
    });

    it("includes online field when true", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 0,
          chapters: 0,
          scenes: 0,
          wikiPages: 0,
          words: 0,
          comments: 0,
          snapshots: 0,
        },
        features: undefined,
      };

      const report = buildDiagnosticsReport(input);
      expect(report).toContain("online: true");
    });

    it("includes online field when false", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "localStorage",
        online: false,
        counts: {
          projects: 0,
          chapters: 0,
          scenes: 0,
          wikiPages: 0,
          words: 0,
          comments: 0,
          snapshots: 0,
        },
        features: undefined,
      };

      const report = buildDiagnosticsReport(input);
      expect(report).toContain("online: false");
    });

    it("includes storage backend", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "IndexedDB",
        online: true,
        counts: {
          projects: 0,
          chapters: 0,
          scenes: 0,
          wikiPages: 0,
          words: 0,
          comments: 0,
          snapshots: 0,
        },
        features: undefined,
      };

      const report = buildDiagnosticsReport(input);
      expect(report).toContain("storage backend: IndexedDB");
    });

    it("includes feature flags as name: on/off", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 0,
          chapters: 0,
          scenes: 0,
          wikiPages: 0,
          words: 0,
          comments: 0,
          snapshots: 0,
        },
        features: { darkMode: true, autosave: false, spellcheck: true },
      };

      const report = buildDiagnosticsReport(input);
      expect(report).toContain("darkMode: on");
      expect(report).toContain("autosave: off");
      expect(report).toContain("spellcheck: on");
    });

    it("does not contain project titles, chapter titles, scene text, wiki text, author names or file paths", () => {
      const input: DiagnosticsInput = {
        version: APP_VERSION,
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/535.11",
        storageBackend: "localStorage",
        online: true,
        counts: {
          projects: 0,
          chapters: 0,
          scenes: 0,
          wikiPages: 0,
          words: 0,
          comments: 0,
          snapshots: 0,
        },
        features: undefined,
      };

      const report = buildDiagnosticsReport(input);
      // These should never appear in the report
      expect(report).not.toContain("Chapter 1");
      expect(report).not.toContain("Scene 5");
      expect(report).not.toContain("Wiki Home");
      expect(report).not.toContain("Jennifer Roylance");
      expect(report).not.toContain("/path/to/file");
    });
  });
});

describe("summarizeUserAgent engines", () => {
  it("does not call a Chromium user agent WebKitGTK", () => {
    const chrome = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    expect(summarizeUserAgent(chrome)).toBe("Linux, Chromium 126");
  });

  it("still recognises WebKitGTK without a Chrome token", () => {
    const gtk = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(summarizeUserAgent(gtk)).toBe("Linux, WebKitGTK");
  });
});
