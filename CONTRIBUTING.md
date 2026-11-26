# Contributing to ProseCraft

Thanks for helping. Bug reports, fixes, features, documentation and translations are all
welcome.

## Ways to help

- **Report a bug or ask for a feature** in the [issue tracker](https://github.com/jennraeross/ProseCraft/issues).
  Screenshots, the version from **About**, and whether you use the desktop or web build help.
- **Fix a bug or build a feature.** See [Development](#development) below.
- **Translate the interface.** See [Translating the interface](#translating-the-interface).
- **Improve documentation, templates, citation styles or export presets.**

## Development

ProseCraft is a Tauri desktop app with a SvelteKit/Svelte 5 frontend. The web build works
without Rust; the desktop build needs a Rust toolchain and the platform dependencies listed
in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run dev          # browser dev server
npm test             # unit tests (Vitest)
npm run check        # svelte-check + TypeScript
npm run i18n:check   # translation catalog check
npm run build        # static web build
npm run tauri dev    # desktop app
```

CI runs `npm test`, `npm run check`, `npm run i18n:check` and `npm run build` on every pull
request. Please run them before opening one.

## Pull requests

- Keep each pull request focused on one change.
- Explain the problem, the fix and how you tested it. Screenshots or a short recording help
  for UI changes.
- Follow the file structure, naming and plain-TypeScript style of the code around you.
- Do not hardcode new interface text in a component. Add a message key instead (below).
- If you translate or rename a message, update every catalog in the same pull request; the
  check will tell you if a placeholder or key no longer matches.

## Translating the interface

### How messages work

- **English is the source of truth:** `src/lib/i18n/messages/en.json`.
- Every language is **one flat JSON file** in `src/lib/i18n/messages/`. Adding
  `fr.json` is enough to make French appear in the language picker.
- Code calls `t("some.key")`. Keys are typed from `en.json`, so a mistyped key fails
  `npm run check`.
- Messages with inline tags use the `<Trans>` component from `$lib/i18n/Trans.svelte`
  (`<Trans key="some.key" params={{ file: "vault.json" }} />`). Never use `{@html}` for
  messages.
- **Untranslated keys fall back to English.** Partial translations are welcome and safe;
  nothing breaks in the app while a locale is incomplete.
- The runtime lives in `src/lib/i18n/` (`state.svelte.ts`, `format.ts`, `catalog.ts`).
  `validate.js` and `scripts/i18n-check.mjs` are the maintainer-facing checks.

### Add or improve a language

1. Copy `src/lib/i18n/messages/en.json` to `<locale>.json`, using a
   [BCP 47](https://www.rfc-editor.org/info/bcp47) tag: `de`, `fr`, `pt-BR`, `zh-Hans`.
2. Translate the **values only**. Keep keys, placeholders and the plural/select syntax
   exactly as they are.
3. Run the check and fix any errors:

   ```sh
   npm run i18n:check
   ```

4. Open the app with `npm run dev`, then go to **Settings → General → Interface language**
   and switch to your language. Walk through the settings dialog, About, both sidebars and
   the update banner. Long translations can overflow buttons and tabs — resize the window
   and check the narrow layout.
5. Open a pull request with the new file and tell us your language. A native-speaker review
   before the language is announced as supported is appreciated.

To see progress for every language:

```sh
npm run i18n:status
```

That prints a Markdown table you can paste into an issue or the README. Maintainers can run
`npm run i18n:check -- --strict` when a language is expected to be complete; normal CI only
rejects structural mistakes (unknown keys, broken placeholders, malformed plurals).

### Checking for hardcoded strings

Maintainers can generate a pseudo-locale for layout and coverage checks:

```sh
npm run i18n:pseudo
```

Then open **Settings → General → Interface language** and choose **Pseudo (en-XA)** (development
builds only). Catalog text appears bracketed and accented; text that stays plain English is not
extracted yet. The generated file is gitignored. See [docs/i18n.md](docs/i18n.md) for maintainer
notes and the remaining coverage map.

### Message syntax

| Syntax | Example | Result |
| --- | --- | --- |
| Value | `Hello` | `Hello` |
| Placeholder | `Version {version}` | `Version 0.6.1` |
| Number | `of {goal, number} words` | `of 50,000 words` (locale-aware) |
| Plural | `{count, plural, one {# word} other {# words}}` | `1 word`, `2 words` |
| Select | `{role, select, editor {edited by} other {by}}` | `edited by` |
| Inline tag | `Writes one <code>{file}</code> file.` | styled in the app, plain text in exports |

Rules:

- **Never rename or remove a placeholder** (`{count}`, `{goal}`) and never change the
  parameter names inside a plural or select. The check compares them with English.
- **Only these inline tags are allowed:** `<strong>`, `<em>`, `<code>`, `<kbd>`. They must be
  lowercase, balanced and have no attributes. `npm run i18n:check` rejects anything else.
- Inline tags are rendered as real elements by the `Trans` component in the app. Plain-text
  paths (PDF, DOCX, diagnostics, tests) use the same message with the tags removed, so never
  put essential meaning only in styling.
- **Placeholders are always text.** A project title or search query containing `<strong>`
  is escaped, not interpreted. Use a placeholder for filenames, URLs and user data; never
  copy them into the translated text where they could be altered.
- **Always include an `other` branch** in a plural. Add the CLDR categories your language
  needs: `zero`, `one`, `two`, `few`, `many`, `other`. For example Polish uses
  `one`/`few`/`many`/`other`.
- `#` inside a plural branch prints the number using the locale's formatting. Leave it out
  when the sentence should not repeat the number.
- Keep the comma/brace structure intact. Only translate the text between braces.
- The app formats numbers with `Intl.NumberFormat` for the selected language, so `{goal, number}`
  renders `50.000` in German and `50,000` in English automatically.

### What not to translate

- Product and project names: **ProseCraft**, **Citation Style Language**, author names.
- Message keys, placeholder names, file paths, URLs and code.
- **Stored data.** Label colours, relation types, style ids and similar values are saved in
  project files. Only their display names are translated; changing the stored value would
  break existing projects.
- **Project content and templates.** `src/lib/starters.ts` contains starter story content and
  `src/lib/publish/` contains export presets. These are content, not interface chrome, and
  will get their own workflow.
- Native file dialogs and OS menus outside ProseCraft are localized by the operating system.

### Glossary

| Term | Meaning |
| --- | --- |
| Scene | The smallest writing unit inside a chapter |
| Chapter | A group of scenes |
| Outline | The chapter/scene tree in the left sidebar |
| Storyboard | The card-based visual planning view |
| Wiki | Notes, characters, places and research attached to the project |
| Snapshot | A saved earlier version of a scene |
| Binder | The file tree that holds chapters, scenes and notes |
| Front matter / Back matter | Pages before/after the manuscript (title page, dedication, notes…) |
| Proofreading | Offline spelling and grammar checking (Harper) |
| Typewriter mode | Keeps the caret vertically centred while typing |
| Focus mode / Zen mode | Hides the interface so only the text is visible |
| Label | A coloured status tag such as Draft, Revised or Final |

Ask in the pull request if a term is ambiguous in context. Screenshots of the relevant
screen are in `Screenshots/`; the English string is always the best description of where it
appears.

### Keep in mind

- **Interface language is not citation language.** The citation picker has its own `en`/`de`
  setting for bibliography terms (pages, editors, “no date”). Changing the interface
  language does not change citation formatting, and vice versa.
- **Export language is not implemented yet.** PDF/DOCX/EPUB exports currently use English
  labels such as “Table of Contents” and the manuscript language is not detected.
- **Right-to-left languages are not supported yet.** Arabic, Hebrew, Persian and Urdu can be
  added to the catalog, but the layout and icon mirroring need work first. Please open an
  issue before starting an RTL translation.
- **Fonts:** the bundled fonts cover Latin, Greek and Cyrillic. CJK, Arabic, Devanagari and
  other scripts fall back to system fonts, and PDF export may need embedded fonts. Note any
  rendering problems in the pull request.
- **Proofreading** only supports certain English dialects. Do not enable Harper for a
  language it does not support; the setting stays English-only for now.
- **Long strings:** German, Finnish and other compounding languages can be much longer than
  English. Check buttons, tabs, table headers and the narrow mobile layout.

### Reviewing a translation

- Prefer a review by a native speaker. Machine-translated drafts are a fine starting point,
  but should be reviewed before the language is listed as supported.
- Check placeholders and plural categories, not just the words. The automated check covers
  structure; it cannot judge tone or terminology.
- Keep the glossary consistent across the file, and use the informal or formal address form
  consistently (the German pilot uses informal “du”).

### Preview languages

Some languages ship as AI-drafted previews: they are selectable, labelled **Preview** in the
language picker, and untranslated strings fall back to English. You can improve a few strings or a
whole namespace without touching the rest; `npm run i18n:check` accepts partial catalogs. A preview
language becomes supported once a native speaker has reviewed it, the catalog is complete, and
`npm run i18n:check -- --strict` passes.
