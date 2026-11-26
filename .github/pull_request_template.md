## What changed

<!-- A short description of the problem and the fix. -->

## How to test

<!-- Steps, platforms, and anything a reviewer needs to know. -->

## Checks

- [ ] `npm test`
- [ ] `npm run check`
- [ ] `npm run i18n:check`
- [ ] `npm run build` (for interface changes)

## Translations

Delete this section if the pull request does not touch messages.

- [ ] I added or renamed keys in `src/lib/i18n/messages/en.json`
- [ ] I updated every locale file, or deliberately left entries to fall back to English
- [ ] Placeholders, plural categories and allowlisted tags (`strong`, `em`, `code`, `kbd`) are unchanged
- [ ] I checked the affected screens in a non-English language or with `npm run i18n:pseudo`
