---
title: "Submit a change"
description: "From a branch to a pull request: commit format, local checks and what the review expects."
---

**Who this page is for**: contributors who have [set up the project](/homebox-clipper/contributing/development-setup/)
and want to propose a fix, a feature, a merchant, a translation or a documentation change.

## Before you start

- For a large change, open an issue (or an [Ideas discussion](https://github.com/Foufou-exe/homebox-clipper/discussions/categories/ideas))
  first, so the approach is agreed before you write the code.
- If you do not have write access to the repository, fork it on GitHub and clone your fork.

## Steps

1. Update `main` and create a branch named after the topic:

   ```bash
   git switch main
   git pull
   git switch -c fix/short-description
   ```

   Prefixes: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `ci/…`.

2. Make your change. Keep it on one topic. Depending on what you change, also read:
   - an interface text: [Translations](/homebox-clipper/contributing/translations/) (English **and** French
     in the same change);
   - a merchant page: [Tests and fixtures](/homebox-clipper/contributing/testing-and-fixtures/) and
     [Adding a merchant](/homebox-clipper/contributing/adding-a-merchant/);
   - the interface: check it in the light **and** dark themes (colors are CSS variables in
     `src/ui/theme.css`);
   - the documentation site: see [Change the documentation](#change-the-documentation).

3. Commit with a message in the [Conventional Commits](https://www.conventionalcommits.org/en/) format.
   It is **mandatory**: the version number and the changelog are computed from it.

   ```bash
   git commit -m "fix: keep the order date when the page is in English"
   ```

   | Your change | Type to use |
   |-------------|-------------|
   | New feature or new merchant | `feat:` |
   | Bug fix | `fix:` |
   | Performance | `perf:` |
   | Documentation only | `docs:` |
   | Code change without new behavior | `refactor:` |
   | Tests only | `test:` |
   | Tooling, dependencies | `chore:` or `build:` |
   | CI workflows | `ci:` |
   | Breaking change | `!` after the type (`feat!:`) or a `BREAKING CHANGE:` footer |

   English or French are both fine. Do not edit `CHANGELOG.md` or the `package.json` version: they are
   generated at release time.

4. Run all the checks:

   ```bash
   bun run ci
   ```

   **Expected result**: no error. If you installed the `pre-push` hook, it runs this command for you at
   each push and blocks the push on an error.

5. Push the branch:

   ```bash
   git push -u origin fix/short-description
   ```

6. On GitHub, open a pull request to `main` and fill in the template (summary, type of change, related
   issue, checks).
   - **Give the pull request a Conventional Commits title** (`fix: …`): the pull request is squash-merged,
     so its title becomes the commit that feeds the changelog.
   - If you changed the manifest (permissions, `host_permissions`, CSP), say so and justify it.

7. Wait for the checks of the pull request.
   **Expected result**: the CI is green. For a pull request opened from a branch of the repository, a
   SonarQube Cloud analysis also runs; for a pull request from a fork, it is skipped and never blocks you.

## Project rules the review checks

- **API key**: only the service worker uses it. It is encrypted at rest, sent only to the HomeBox
  instance and never logged. No `console.*` outside `src/shared/logger.ts` (an ESLint rule checks it).
- **Explicit confirmation**: nothing is written to HomeBox without a click from the user.
- **Minimal permissions**: any manifest change is flagged and justified in the pull request.
  `bun run test:build` checks the built manifest.
- **Merchant selectors**: only in the `selectors.ts` of the merchant folder, with several selectors per
  field; page-language texts only in `src/content/merchants/amazon/page-locales.ts`.
- **Tests on anonymized pages only**. **Never commit** a raw merchant page, an API key, a pepper or a real
  instance address.
- **Interface texts** in `src/locales/en.yml` **and** `src/locales/fr.yml`, in the same change.

## Change the documentation

The documentation site is the `docs/site/` folder (Astro Starlight). Every page exists in English
(`docs/site/src/content/docs/`) and in French (`docs/site/src/content/docs/fr/`, same file name): change
both in the same pull request.

1. Edit the page, or use the "Edit page" link at the bottom of a page of the site.
2. Preview it (optional):

   ```bash
   bun run docs:dev
   ```

   **Expected result**: the site is served on <http://localhost:4321/homebox-clipper/> and reloads on save.
3. Check it:

   ```bash
   bun run docs:build
   ```

   **Expected result**: the build ends with `All internal links are valid.` and `Complete!`.
   The site is not part of `bun run ci`: run this command yourself for any documentation change.

`docs:build` needs a recent Node.js (Astro checks the version and stops with a clear message if it is too
old): with mise, `mise install` takes care of it.

## If it does not work

| Symptom | Fix |
|---------|-----|
| The `pre-push` hook blocks the push | `bun run ci` found an error: read the first one, fix it, commit, push again. |
| The pull request title is not in the Conventional Commits format | Click **Edit** next to the title on GitHub and rename it (`fix: …`, `feat: …`). |
| `bun run docs:build` reports a broken link | Fix the link or anchor it names; links to another page start with `/homebox-clipper/` (or `/homebox-clipper/fr/` in French pages). |
| `bun run check:config` fails on `en.yml`/`fr.yml` | A key or a `$n` substitution exists in one catalog only: add it to the other one. |

Questions are welcome in the [Q&A discussions](https://github.com/Foufou-exe/homebox-clipper/discussions/categories/q-a).
