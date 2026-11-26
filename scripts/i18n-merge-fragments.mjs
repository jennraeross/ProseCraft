#!/usr/bin/env node
/**
 * Merge translated fragments into a locale catalog and write it in English key
 * order. Useful for splitting a large translation job across contributors or
 * automation.
 *
 *   node scripts/i18n-merge-fragments.mjs <locale> <fragment.json> [...]
 *
 * Fragments are flat JSON objects. Unknown keys and structural mistakes are
 * rejected; missing keys are allowed and fall back to English at runtime.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "../src/lib/i18n/validate.js";

const [locale, ...fragments] = process.argv.slice(2);
if (!locale || fragments.length === 0) {
  console.error("Usage: node scripts/i18n-merge-fragments.mjs <locale> <fragment.json> [...]");
  process.exit(2);
}

const messagesDir = new URL("../src/lib/i18n/messages/", import.meta.url);
const source = JSON.parse(fs.readFileSync(new URL("en.json", messagesDir), "utf8"));
const targetPath = new URL(`${locale}.json`, messagesDir);
const merged = fs.existsSync(targetPath)
  ? JSON.parse(fs.readFileSync(targetPath, "utf8"))
  : {};

const unknown = [];
for (const fragment of fragments) {
  const values = JSON.parse(fs.readFileSync(fragment, "utf8"));
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    console.error(`${fragment}: expected a JSON object of message keys`);
    process.exit(2);
  }
  for (const [key, value] of Object.entries(values)) {
    if (!Object.hasOwn(source, key)) unknown.push(`${fragment}: ${key}`);
    else merged[key] = value;
  }
}

if (unknown.length > 0) {
  console.error("Unknown keys:\n" + unknown.map((key) => `  - ${key}`).join("\n"));
  process.exit(1);
}

const ordered = {};
for (const key of Object.keys(source)) {
  if (Object.hasOwn(merged, key)) ordered[key] = merged[key];
}

fs.writeFileSync(targetPath, `${JSON.stringify(ordered, null, 2)}\n`);

const result = validateCatalog("en", locale, source, ordered);
console.log(
  `${locale}: ${result.translated}/${result.total} translated, ` +
    `${result.missingKeys.length} missing, ${result.errors.length} errors`
);
for (const error of result.errors) console.error(`  - ${error}`);
for (const warning of result.warnings) console.warn(`  - ${warning}`);
console.log(`Wrote ${fileURLToPath(targetPath)}`);
if (result.errors.length > 0) process.exit(1);
