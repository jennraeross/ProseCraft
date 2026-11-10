import { formatYamlValue, parseYamlValue } from "./storage/sync/open-layout";
import { normalizeMeta, type DocumentMeta } from "./story-meta";

/**
 * Scene metadata is shown as one `key: value` line per field, the same YAML
 * dialect the open layout uses for document frontmatter: strings are quoted and
 * lists/objects use JSON flow syntax. That keeps nested relations and sheet
 * values representable without a second YAML implementation.
 */
export type StoryMetaParseResult =
  | { ok: true; meta: DocumentMeta | undefined }
  | { ok: false; error: string };

export function serializeStoryMeta(meta: DocumentMeta | undefined): string {
  if (!meta) return "";
  return Object.entries(meta)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`)
    .join("\n");
}

export function parseStoryMeta(text: string): StoryMetaParseResult {
  const fields: Record<string, unknown> = {};
  for (const [index, line] of text.replace(/\r\n?/g, "\n").split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colon = line.indexOf(":");
    if (colon <= 0) {
      return { ok: false, error: `Line ${index + 1}: expected "key: value".` };
    }
    const key = line.slice(0, colon).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      return { ok: false, error: `Line ${index + 1}: "${key}" is not a valid key.` };
    }
    const raw = line.slice(colon + 1).trim();
    if (!raw) {
      return { ok: false, error: `Line ${index + 1}: missing value. Use [] for an empty list.` };
    }
    try {
      fields[key] = parseYamlValue(raw);
    } catch {
      return { ok: false, error: `Line ${index + 1}: invalid value. Use JSON for lists and objects.` };
    }
  }
  return { ok: true, meta: normalizeMeta(fields) };
}
