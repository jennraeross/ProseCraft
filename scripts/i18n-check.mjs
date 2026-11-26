#!/usr/bin/env node
/**
 * Validate every translation catalog against the English source.
 *
 *   npm run i18n:check              validate and print a status summary
 *   npm run i18n:check -- --strict  also fail when a locale is incomplete
 *   npm run i18n:status             print a Markdown status table
 *
 * Incomplete locales are allowed: untranslated keys fall back to English at
 * runtime. Missing keys, unknown keys and placeholder mistakes are reported so
 * a rename or a typo cannot silently break the UI.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "../src/lib/i18n/validate.js";

const messagesDir = new URL("../src/lib/i18n/messages/", import.meta.url);
const strict = process.argv.includes("--strict");
const markdown = process.argv.includes("--markdown") || process.argv.includes("--status");
const sourceLocale = "en";

/** @type {Record<string, Record<string, string>>} */
const catalogs = {};
for (const file of fs.readdirSync(messagesDir).filter((name) => name.endsWith(".json")).sort()) {
  const path = new URL(file, messagesDir);
  const locale = file.slice(0, -".json".length);
  try {
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object of message keys");
    }
    catalogs[locale] = parsed;
  } catch (error) {
    console.error(`Could not read ${fileURLToPath(path)}: ${error.message}`);
    process.exitCode = 1;
  }
}

const source = catalogs[sourceLocale];
if (!source) {
  console.error(`Missing source catalog: src/lib/i18n/messages/${sourceLocale}.json`);
  process.exit(1);
}

const reviewStatus = JSON.parse(
  fs.readFileSync(new URL("../src/lib/i18n/review-status.json", import.meta.url), "utf8")
);
const previewLocales = new Set(reviewStatus.previewLocales ?? []);

const locales = Object.keys(catalogs).sort((left, right) => {
  if (left === sourceLocale) return -1;
  if (right === sourceLocale) return 1;
  return localeName(left).localeCompare(localeName(right));
});

let hasErrors = false;
let isIncomplete = false;
const rows = [];

for (const locale of locales) {
  const result = validateCatalog(sourceLocale, locale, source, catalogs[locale]);
  const errors = [...result.errors];

  for (const key of result.unknownKeys) {
    errors.push(`${locale}/${key}: key does not exist in the English source`);
  }
  for (const key of result.missingKeys) {
    if (locale === sourceLocale) errors.push(`${locale}/${key}: source message is empty`);
  }

  if (locale !== sourceLocale && result.missingKeys.length > 0) isIncomplete = true;
  if (errors.length > 0) hasErrors = true;

  rows.push({ locale, result, errors });
}

if (markdown) {
  console.log("| Locale | Language | Translated | Status |");
  console.log("| --- | --- | --- | --- |");
  for (const { locale, result } of rows) {
    const percent =
      result.total === 0 ? 100 : Math.round((result.translated / result.total) * 100);
    const status =
      locale === sourceLocale
        ? "source"
        : `${previewLocales.has(locale) ? "preview · " : ""}${
            result.missingKeys.length === 0 ? "complete" : `${result.missingKeys.length} missing`
          }`;
    console.log(
      `| \`${locale}\` | ${localeName(locale)} | ${result.translated}/${result.total} (${percent}%) | ${status} |`
    );
  }
} else {
  console.log(`ProseCraft translations (${locales.length} locales)\n`);
  for (const { locale, result } of rows) {
    const percent =
      result.total === 0 ? 100 : Math.round((result.translated / result.total) * 100);
    const suffix =
      locale === sourceLocale
        ? "source"
        : `${previewLocales.has(locale) ? "preview · " : ""}${
            result.missingKeys.length === 0 ? "complete" : `${result.missingKeys.length} missing`
          }`;
    console.log(
      `  ${locale.padEnd(8)} ${localeName(locale).padEnd(18)} ${String(result.translated).padStart(3)}/${result.total} (${String(percent).padStart(3)}%)  ${suffix}`
    );
  }

  if (locales.length === 1) {
    console.log("\nAdd a locale by copying src/lib/i18n/messages/en.json to <locale>.json.");
  }

  for (const { locale, result, errors } of rows) {
    if (result.missingKeys.length > 0 && locale !== sourceLocale) {
      console.log(`\nMissing in ${locale}:`);
      for (const key of result.missingKeys) console.log(`  - ${key}`);
    }
    if (errors.length > 0) {
      console.log(`\nErrors in ${locale}:`);
      for (const error of errors) console.log(`  - ${error}`);
    }
    if (result.warnings.length > 0) {
      console.log(`\nWarnings in ${locale}:`);
      for (const warning of result.warnings) console.log(`  - ${warning}`);
    }
  }
}

if (hasErrors) {
  if (markdown) {
    console.error("\nTranslation errors:");
    for (const { locale, errors } of rows) {
      for (const error of errors) console.error(`  - ${error}`);
    }
  }
  console.error("\nTranslation check failed: fix the errors above.");
  process.exit(1);
}
if (strict && isIncomplete) {
  console.error("\nTranslation check failed: --strict requires every locale to be complete.");
  process.exit(1);
}

/**
 * The language's name in that language, so the table is readable to translators.
 * @param {string} code
 * @returns {string}
 */
function localeName(code) {
  if (/-XA$/i.test(code)) return "Pseudo (en-XA)";
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}
