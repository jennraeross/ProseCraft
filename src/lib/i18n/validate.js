/**
 * Structural validation for translation catalogs. Plain JavaScript so both the
 * CLI check (`scripts/i18n-check.mjs`) and the unit tests can import it.
 *
 * @typedef {Record<string, string>} Catalog
 * @typedef {{ params: Set<string>, plurals: Map<string, Set<string>>, selects: Map<string, Set<string>> }} MessageShape
 * @typedef {{ errors: string[], warnings: string[], translated: number, total: number, missingKeys: string[], unknownKeys: string[] }} ValidationResult
 */

/** Inline tags translators may use. Keep in sync with `src/lib/i18n/message.ts`. */
export const ALLOWED_MESSAGE_TAGS = ["strong", "em", "code", "kbd"];

const ALLOWED_TAG_SET = new Set(ALLOWED_MESSAGE_TAGS);

/**
 * Check that inline tags are from the allowlist, have no attributes and are
 * balanced. Unknown tags are reported instead of being rendered as HTML.
 * @param {string} message
 * @param {string} label
 * @param {string[]} errors
 */
export function checkTags(message, label, errors) {
  /** @type {string[]} */
  const stack = [];
  let index = 0;
  while (index < message.length) {
    const open = message.indexOf("<", index);
    if (open === -1) break;

    const match = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)([^<>]*)>/.exec(message.slice(open));
    if (!match) {
      index = open + 1;
      continue;
    }

    const closing = match[1] === "/";
    const name = match[2] ?? "";
    const attributes = (match[3] ?? "").trim();

    if (attributes) errors.push(`${label}: <${name}> must not have attributes`);
    if (name !== name.toLowerCase()) errors.push(`${label}: tags must be lowercase`);

    if (!ALLOWED_TAG_SET.has(name.toLowerCase())) {
      errors.push(
        `${label}: <${name}> is not an allowed tag (${ALLOWED_MESSAGE_TAGS.join(", ")})`
      );
    } else if (closing) {
      if (stack.pop() !== name.toLowerCase()) {
        errors.push(`${label}: unexpected </${name}>`);
      }
    } else {
      stack.push(name.toLowerCase());
    }

    index = open + match[0].length;
  }

  if (stack.length > 0) {
    errors.push(`${label}: unclosed <${stack[stack.length - 1]}>`);
  }
}

/**
 * Describe the placeholders and choice branches a message uses.
 * @param {string} message
 * @returns {MessageShape}
 */
export function messageShape(message) {
  /** @type {Set<string>} */
  const params = new Set();
  /** @type {Map<string, Set<string>>} */
  const plurals = new Map();
  /** @type {Map<string, Set<string>>} */
  const selects = new Map();

  let index = 0;
  while (index < message.length) {
    const open = message.indexOf("{", index);
    if (open === -1) break;
    const close = findClosingBrace(message, open);
    if (close === -1) break;

    const parts = splitTopLevel(message.slice(open + 1, close));
    const name = (parts[0] ?? "").trim();
    if (name) params.add(name);

    const kind = (parts[1] ?? "").trim();
    if ((kind === "plural" || kind === "select") && parts.length > 2) {
      const target = kind === "plural" ? plurals : selects;
      const selectors = target.get(name) ?? new Set();
      const options = parseOptions(parts.slice(2).join(","));
      for (const selector of Object.keys(options)) selectors.add(selector);
      target.set(name, selectors);
    }

    index = close + 1;
  }

  return { params, plurals, selects };
}

/**
 * Compare one locale against the English source.
 * @param {string} sourceLocale
 * @param {string} locale
 * @param {Catalog} source
 * @param {Catalog} catalog
 * @returns {ValidationResult}
 */
export function validateCatalog(sourceLocale, locale, source, catalog) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const missingKeys = [];
  /** @type {string[]} */
  const unknownKeys = [];

  for (const [key, message] of Object.entries(source)) {
    if (!hasText(catalog[key])) missingKeys.push(key);

    if (countBraces(message, "{") !== countBraces(message, "}")) {
      errors.push(`${sourceLocale}/${key}: unbalanced braces`);
    }
    checkTags(message, `${sourceLocale}/${key}`, errors);
    const shape = messageShape(message);
    for (const [name, selectors] of shape.plurals) {
      if (!selectors.has("other")) {
        errors.push(`${sourceLocale}/${key}: plural "${name}" has no "other" branch`);
      }
    }
  }

  for (const key of Object.keys(catalog)) {
    if (!Object.hasOwn(source, key)) unknownKeys.push(key);
  }

  for (const [key, sourceMessage] of Object.entries(source)) {
    const message = catalog[key];
    if (!hasText(message)) continue;

    if (countBraces(message, "{") !== countBraces(message, "}")) {
      errors.push(`${locale}/${key}: unbalanced braces`);
      continue;
    }

    checkTags(message, `${locale}/${key}`, errors);

    const expected = messageShape(sourceMessage);
    const actual = messageShape(message);

    const missingParams = [...expected.params].filter((name) => !actual.params.has(name));
    const extraParams = [...actual.params].filter((name) => !expected.params.has(name));
    if (missingParams.length > 0) {
      errors.push(`${locale}/${key}: missing placeholder(s) ${missingParams.join(", ")}`);
    }
    if (extraParams.length > 0) {
      errors.push(`${locale}/${key}: unknown placeholder(s) ${extraParams.join(", ")}`);
    }

    for (const [name, expectedSelectors] of expected.plurals) {
      const actualSelectors = actual.plurals.get(name);
      if (!actualSelectors) {
        errors.push(`${locale}/${key}: plural "${name}" is missing`);
        continue;
      }
      if (!actualSelectors.has("other")) {
        errors.push(`${locale}/${key}: plural "${name}" has no "other" branch`);
      }
      for (const selector of actualSelectors) {
        if (selector !== "other" && !pluralCategories(locale).has(selector)) {
          warnings.push(
            `${locale}/${key}: plural branch "${selector}" is not used by ${locale}`
          );
        }
      }
    }

    for (const [name, expectedSelectors] of expected.selects) {
      const actualSelectors = actual.selects.get(name);
      if (!actualSelectors) {
        errors.push(`${locale}/${key}: select "${name}" is missing`);
        continue;
      }
      const missing = [...expectedSelectors].filter((selector) => !actualSelectors.has(selector));
      if (missing.length > 0) {
        errors.push(`${locale}/${key}: select "${name}" is missing ${missing.join(", ")}`);
      }
    }
  }

  const translated = Object.keys(source).filter((key) => hasText(catalog[key])).length;
  return {
    errors,
    warnings,
    translated,
    total: Object.keys(source).length,
    missingKeys,
    unknownKeys
  };
}

/**
 * @param {string} locale
 * @returns {Set<string>}
 */
export function pluralCategories(locale) {
  try {
    return new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  } catch {
    return new Set(["one", "other"]);
  }
}

/**
 * @param {string} text
 * @param {string} char
 * @returns {number}
 */
function countBraces(text, char) {
  let count = 0;
  for (const candidate of text) if (candidate === char) count += 1;
  return count;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * @param {string} text
 * @param {number} open
 * @returns {number}
 */
function findClosingBrace(text, open) {
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

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitTopLevel(text) {
  /** @type {string[]} */
  const parts = [];
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

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseOptions(text) {
  /** @type {Record<string, string>} */
  const options = {};
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
    options[selector] = text.slice(index + 1, close);
    index = close + 1;
  }
  return options;
}
