## Summary

<!-- What and why, in a few lines. -->

## Type of change

- [ ] Bug fix
- [ ] New feature or improvement
- [ ] Merchant added or changed
- [ ] Documentation
- [ ] Translation (i18n)
- [ ] Refactoring, tests, tooling or CI

## Related issue

<!-- "Closes #…" or "Refs #…". Open an issue first for large changes. -->

## Checks

- [ ] `bun run ci` passes locally (typecheck, lint, tests, build, manifest)
- [ ] Tests added or updated for the change
- [ ] Tested in Chrome against a local HomeBox instance (`bun run homebox:up`), if the interface or the import are affected
- [ ] Interface checked in the light **and** dark themes, if the UI is affected
- [ ] `CHANGELOG.md` → `[Unreleased]` updated (or the change is not visible to users or contributors)
- [ ] New interface text added to both `src/locales/en.yml` and `src/locales/fr.yml`, if the UI is affected
- [ ] Merchant added or changed → `MERCHANTS.md` updated
- [ ] No personal data, raw merchant page, API key, pepper or real instance address in the files, logs or screenshots
- [ ] Manifest permissions (`permissions`, `host_permissions`, CSP) unchanged, or justified below
- [ ] No data sent to a third-party backend

## Points of attention

- [ ] This change modifies the manifest (permissions, `host_permissions`, CSP): justification below
- [ ] This change touches the API key, storage or internal messaging

<!-- Justification / notes for the review -->
