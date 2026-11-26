/**
 * Message parsing and rendering.
 *
 * Templates support `{name}` placeholders, `{count, number}`, ICU-style
 * plural/select branches and a small allowlist of inline tags. Tags are parsed
 * into real element nodes by `<Trans>`; string rendering drops them, so text
 * used in PDFs, exports and diagnostics never contains markup.
 */

/** Inline tags translators may use. Kept in sync with the validator. */
export const MESSAGE_TAGS = ["strong", "em", "code", "kbd"] as const;

export type MessageTag = (typeof MESSAGE_TAGS)[number];

export type MessageParams = Record<string, string | number>;

export type MessageNode =
  | { type: "text"; value: string }
  | { type: "param"; name: string }
  | { type: "number"; name: string }
  | { type: "pound" }
  | { type: "tag"; name: MessageTag; children: MessageNode[] }
  | { type: "plural"; name: string; options: Map<string, MessageNode[]> }
  | { type: "select"; name: string; options: Map<string, MessageNode[]> };

type RawNode =
  | { type: "text"; value: string }
  | { type: "param"; name: string }
  | { type: "number"; name: string }
  | { type: "pound" }
  | { type: "tag-open"; name: string }
  | { type: "tag-close"; name: string }
  | { type: "plural"; name: string; options: Map<string, RawNode[]> }
  | { type: "select"; name: string; options: Map<string, RawNode[]> };

const TAG_PATTERN = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)>/;
const parsedCache = new Map<string, MessageNode[]>();
const pluralRulesCache = new Map<string, Intl.PluralRules>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

export function isMessageTag(name: string): name is MessageTag {
  return (MESSAGE_TAGS as readonly string[]).includes(name);
}

/**
 * Parse a template, caching the result. Unbalanced or unknown tags never throw:
 * the message falls back to the same text with tags removed.
 */
export function parseMessage(template: string): MessageNode[] {
  const cached = parsedCache.get(template);
  if (cached) return cached;

  let nodes = finalize(scan(template, true, false));
  if (!nodes) nodes = finalize(scan(stripTags(template), false, false));
  if (!nodes) nodes = [{ type: "text", value: template }];

  parsedCache.set(template, nodes);
  return nodes;
}

/** Render a node tree to plain text, dropping inline tags. */
export function renderNodes(
  nodes: MessageNode[],
  locale: string,
  params: MessageParams = {}
): string {
  let output = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        output += node.value;
        break;
      case "param": {
        const value = params[node.name];
        output += value === undefined ? `{${node.name}}` : String(value);
        break;
      }
      case "number": {
        const value = Number(params[node.name]);
        output += Number.isFinite(value)
          ? formatNumber(value, locale)
          : `{${node.name}, number}`;
        break;
      }
      case "pound":
        output += "#";
        break;
      case "tag":
        output += renderNodes(node.children, locale, params);
        break;
      case "plural":
      case "select":
        output += renderNodes(selectOption(node, locale, params), locale, params);
        break;
    }
  }
  return output;
}

/**
 * Pick the branch for a plural/select node. Plural branches have their `#`
 * markers replaced by the locale-formatted count.
 */
export function selectOption(
  node:
    | { type: "plural"; name: string; options: Map<string, MessageNode[]> }
    | { type: "select"; name: string; options: Map<string, MessageNode[]> },
  locale: string,
  params: MessageParams = {}
): MessageNode[] {
  const value = params[node.name];
  let selector: string;

  if (node.type === "plural") {
    const count = Number(value);
    selector = Number.isFinite(count) ? pluralRules(locale).select(count) : "other";
  } else {
    selector = value === undefined ? "other" : String(value);
  }

  const branch =
    node.options.get(selector) ??
    node.options.get("other") ??
    node.options.values().next().value;
  if (branch === undefined) return [];

  if (node.type === "plural") {
    const count = Number(value);
    if (Number.isFinite(count)) return substitutePound(branch, formatNumber(count, locale));
  }
  return branch;
}

/** Locale-aware number formatting; use this instead of `toLocaleString()`. */
export function formatNumber(value: number, locale: string): string {
  let format = numberFormatCache.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale);
    numberFormatCache.set(locale, format);
  }
  return format.format(value);
}

function pluralRules(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

function scan(template: string, allowTags: boolean, pound: boolean): RawNode[] {
  const nodes: RawNode[] = [];
  let text = "";
  let index = 0;

  const flush = () => {
    if (text) {
      nodes.push({ type: "text", value: text });
      text = "";
    }
  };

  while (index < template.length) {
    const char = template[index];

    if (char === "{") {
      const close = findClosingBrace(template, index);
      if (close === -1) {
        text += char;
        index += 1;
        continue;
      }
      flush();
      nodes.push(...parseExpression(template.slice(index + 1, close), allowTags, pound));
      index = close + 1;
      continue;
    }

    if (char === "#" && pound) {
      flush();
      nodes.push({ type: "pound" });
      index += 1;
      continue;
    }

    if (char === "<" && allowTags) {
      const match = TAG_PATTERN.exec(template.slice(index));
      if (match) {
        const name = match[2]!.toLowerCase();
        if (isMessageTag(name)) {
          flush();
          nodes.push({ type: match[1] ? "tag-close" : "tag-open", name });
          index += match[0].length;
          continue;
        }
      }
    }

    text += char;
    index += 1;
  }

  flush();
  return nodes;
}

function parseExpression(expression: string, allowTags: boolean, pound: boolean): RawNode[] {
  const parts = splitTopLevel(expression);
  const name = (parts[0] ?? "").trim();
  const kind = (parts[1] ?? "").trim();

  if (!kind) {
    return name
      ? [{ type: "param", name }]
      : [{ type: "text", value: `{${expression}}` }];
  }

  if (kind === "number") {
    return [{ type: "number", name }];
  }

  if (kind === "plural" || kind === "select") {
    const options = new Map<string, RawNode[]>();
    for (const [selector, body] of parseOptions(parts.slice(2).join(","))) {
      options.set(selector, scan(body, allowTags, kind === "plural" ? true : pound));
    }
    return [{ type: kind, name, options }];
  }

  return [{ type: "text", value: `{${expression}}` }];
}

function finalize(raw: RawNode[]): MessageNode[] | null {
  const nodes: MessageNode[] = [];
  const stack: { name: MessageTag; children: MessageNode[] }[] = [];

  const append = (node: MessageNode) => {
    if (stack.length > 0) stack[stack.length - 1]!.children.push(node);
    else nodes.push(node);
  };

  for (const token of raw) {
    switch (token.type) {
      case "tag-open": {
        if (!isMessageTag(token.name)) return null;
        stack.push({ name: token.name, children: [] });
        break;
      }
      case "tag-close": {
        const frame = stack.pop();
        if (!frame || frame.name !== token.name) return null;
        append({ type: "tag", name: frame.name, children: frame.children });
        break;
      }
      case "plural":
      case "select": {
        const options = new Map<string, MessageNode[]>();
        for (const [selector, body] of token.options) {
          const finalized = finalize(body);
          if (!finalized) return null;
          options.set(selector, finalized);
        }
        append({ type: token.type, name: token.name, options });
        break;
      }
      default:
        append(token);
    }
  }

  return stack.length > 0 ? null : nodes;
}

function substitutePound(nodes: MessageNode[], text: string): MessageNode[] {
  return nodes.map((node) => {
    switch (node.type) {
      case "pound":
        return { type: "text", value: text };
      case "tag":
        return { ...node, children: substitutePound(node.children, text) };
      case "select":
        return {
          ...node,
          options: new Map(
            [...node.options].map(([selector, body]) => [selector, substitutePound(body, text)])
          )
        };
      default:
        return node;
    }
  });
}

function stripTags(template: string): string {
  return template.replace(/<\/?(?:strong|em|code|kbd)>/gi, "");
}

function findClosingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseOptions(text: string): Map<string, string> {
  const options = new Map<string, string>();
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
    if (index >= text.length) break;

    const selectorStart = index;
    while (index < text.length && !/[\s{]/.test(text[index] ?? "")) index += 1;
    const selector = text.slice(selectorStart, index);
    while (index < text.length && /\s/.test(text[index] ?? "")) index += 1;
    if (text[index] !== "{") break;

    const close = findClosingBrace(text, index);
    if (close === -1) break;
    options.set(selector, text.slice(index + 1, close));
    index = close + 1;
  }
  return options;
}
