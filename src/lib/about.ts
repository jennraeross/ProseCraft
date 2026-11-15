import pkg from "../../package.json";

export const APP_NAME = "ProseCraft";
export const APP_LICENSE = "MIT";
export const APP_AUTHOR = "Jennifer Roylance";
export const APP_REPOSITORY_URL = "https://github.com/jennraeross/ProseCraft";

export const APP_VERSION = pkg.version;

export type DiagnosticsInput = {
  version: string;
  userAgent: string;
  storageBackend: string;
  online?: boolean;
  counts: {
    projects: number;
    chapters: number;
    scenes: number;
    wikiPages: number;
    words: number;
    comments: number;
    snapshots: number;
  };
  features?: Record<string, boolean>;
};

export function summarizeUserAgent(userAgent: string): string {
  const ua = userAgent;

  let os: string;
  if (/Windows NT|win32|win64/i.test(ua)) {
    os = "Windows";
  } else if (/Macintosh|Mac OS/i.test(ua)) {
    os = "macOS";
  } else if (/Linux|x11/i.test(ua)) {
    os = "Linux";
  } else {
    os = "unknown";
  }

  let engine: string;
  // WebView2 (Edge Chromium) — check for Edg/ before Chrome
  if (/Edg[\s\/]/i.test(ua) || /EdgiOS/i.test(ua)) {
    // Extract version if present
    const verMatch = ua.match(/Edg\/(\d+)/i);
    if (verMatch) {
      engine = `WebView2 (Chromium ${verMatch[1]})`;
    } else {
      engine = "WebView2 (Chromium)";
    }
  } else if (/Trident|MSIE/i.test(ua)) {
    engine = "Trident";
  } else if (/Chrome\/(\d+)/.test(ua)) {
    engine = `Chromium ${ua.match(/Chrome\/(\d+)/)![1]}`;
  } else if (/WEBKIT/i.test(ua)) {
    // Linux with WebKitGTK: has WebKit but not Chrome/Safari in typical pattern
    // If it's Linux + WebKit and no Edg/Chrome, assume WebKitGTK
    if (os === "Linux" || /Linux/i.test(ua)) {
      engine = "WebKitGTK";
    } else {
      engine = "WebKit";
    }
  } else if (/Blink/i.test(ua)) {
    engine = "Blink";
  } else {
    engine = "unknown";
  }

  return `${os}, ${engine}`;
}

export function buildDiagnosticsReport(
  input: DiagnosticsInput,
  now = new Date()
): string {
  const { version, userAgent, storageBackend, online, counts, features } = input;
  const osEngine = summarizeUserAgent(userAgent);
  const dateISO = now.toISOString();

  const lines: string[] = [];
  lines.push(`app: ${APP_NAME} ${version}`);
  lines.push(`date: ${dateISO}`);
  lines.push(`os: ${osEngine}`);
  lines.push(`storage backend: ${storageBackend}`);
  lines.push(`online: ${online ?? "unknown"}`);

  // counts
  lines.push(`projects: ${counts.projects}`);
  lines.push(`chapters: ${counts.chapters}`);
  lines.push(`scenes: ${counts.scenes}`);
  lines.push(`wiki pages: ${counts.wikiPages}`);
  lines.push(`words: ${counts.words}`);
  lines.push(`comments: ${counts.comments}`);
  lines.push(`snapshots: ${counts.snapshots}`);

  // feature flags
  if (features) {
    for (const [name, on] of Object.entries(features)) {
      lines.push(`${name}: ${on ? "on" : "off"}`);
    }
  }

  return lines.join("\n");
}