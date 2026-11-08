## Purpose

<!-- What and why, in a few lines. Link the issue if there is one: "Closes #…" -->

## Checks

- [ ] `bun run ci` passes locally (typecheck, lint, tests, build, manifest)
- [ ] Tested in Chrome against a local HomeBox instance (`bun run homebox:up`), if the interface or the import are affected
- [ ] Interface checked in the light **and** dark themes, if the UI is affected
- [ ] No raw merchant page, API key, pepper or real instance address in the files
- [ ] Merchant added or changed → `MERCHANTS.md` updated
- [ ] `CHANGELOG.md` → `[Unreleased]` updated (or the change is not visible to users or contributors)
- [ ] New interface text added to both `src/locales/en.yml` and `src/locales/fr.yml`, if the UI is affected

## Points of attention

- [ ] This change modifies the manifest (permissions, `host_permissions`, CSP): justification below
- [ ] This change touches the API key, storage or internal messaging

<!-- Justification / notes for the review -->
