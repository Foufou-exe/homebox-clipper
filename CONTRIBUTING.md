# Contributing to homebox-clipper

Thank you for your interest! This guide is for anyone who wants to change the code, the texts or the
documentation. It takes you from an empty machine to a pull request. Each step says what you should see;
if you do not see it, look at [If it does not work](#if-it-does-not-work).

The same guide, in English and French, with more detail per topic, is on the
[documentation site](https://foufou-exe.github.io/homebox-clipper/contributing/development-setup/).

## 1. Install the tools

| Tool | Version | Check with |
|------|---------|------------|
| Git | any recent | `git --version` |
| [Bun](https://bun.sh) | 1.4 (`packageManager` in `package.json`) | `bun --version` |
| [Node.js](https://nodejs.org) | LTS (used by Vite and WXT) | `node --version` |
| Docker with Compose | recent (local HomeBox instance) | `docker compose version` |
| Chrome or Chromium | recent | |
| Firefox | 140 or later (optional, to test the Firefox build) | |
| `rsvg-convert` (librsvg) | optional, only for `bun run icons` | |

[mise](https://mise.jdx.dev) installs Bun and Node at the right versions: run `mise install` in the
project folder (it reads `mise.toml`).

No tool on your machine? Use the [development container](#option-development-container) instead.

## 2. Get the project running

1. Get the code:

   ```bash
   git clone https://github.com/Foufou-exe/homebox-clipper.git
   cd homebox-clipper
   ```

2. Prepare the project (safe to re-run):

   ```bash
   bun run setup
   ```

   It checks your tools, installs the dependencies, creates the `.env` of the local HomeBox instance and
   offers a `pre-push` hook that runs `bun run ci` before every push (answer `y`, recommended).
   **Expected result**: the last lines start with `Ready. Next:`.

3. Start the local HomeBox instance:

   ```bash
   bun run homebox:up    # HomeBox on http://localhost:3100
   ```

4. Open <http://localhost:3100>, create a test account (a fictitious address such as `dev@example.com`),
   then **Profile → API Keys** → create a key and copy it (it starts with `hb_`). Full guide:
   [Local HomeBox instance](https://foufou-exe.github.io/homebox-clipper/contributing/local-homebox-instance/).

5. Start the extension in development mode:

   ```bash
   bun run dev           # opens a development Chrome with the extension
   bun run dev:firefox   # same with Firefox (Firefox must be installed)
   ```

   **Expected result**: a separate browser window opens with the extension loaded; it reloads each time
   you save a file.

6. In that window, open the extension settings and enter the address `http://localhost:3100`, your test
   key and a passphrase (at least 10 characters), then click **Test and save**.
   **Expected result**: the settings page shows the connected instance and its version.

7. Run all the checks once:

   ```bash
   bun run ci
   ```

   **Expected result**: no error.

### Option: development container

Open the repository in VS Code (or GitHub Codespaces), then run **Dev Containers: Reopen in Container**.
The container installs Bun, the dependencies and the `.env`, and has its own Docker for HomeBox (port
3100 forwarded to your machine). There is no browser in the container: run `bun run build` (or
`bun run dev`, which rebuilds continuously) and load the `.output/chrome-mv3/` folder (or
`.output/chrome-mv3-dev/`), or `.output/firefox-mv3/` for Firefox, in the browser on your machine.

### Editor

VS Code suggests the recommended extensions (`.vscode/extensions.json`): Vue (Volar), ESLint,
Prettier, Vitest, EditorConfig, Bun. Formatting and ESLint fixes are applied on save. Common
tasks are in *Terminal → Run Task* (checks, dev mode, build, test watch, local HomeBox).

`bun run dev` can be customized with a local `web-ext.config.ts` file (ignored by git): another
browser, no browser, start page. Copy `web-ext.config.example.ts` to start.

## 3. Make a change and open a pull request

1. Create a branch from an up-to-date `main`, named after the topic: `feat/…`, `fix/…`, `docs/…`,
   `chore/…`, `ci/…`.

   ```bash
   git switch main
   git pull
   git switch -c fix/short-description
   ```

2. Make your change, on one topic only.
3. Commit in the [Conventional Commits](https://www.conventionalcommits.org/en/) format. It is
   **mandatory**: the version number and the changelog are computed from it. English or French are both
   fine.

   | Your change | Type |
   |-------------|------|
   | New feature or new merchant | `feat:` |
   | Bug fix | `fix:` |
   | Performance | `perf:` |
   | Documentation only | `docs:` |
   | Code change without new behavior | `refactor:` |
   | Tests only | `test:` |
   | Tooling, dependencies | `chore:` or `build:` |
   | CI workflows | `ci:` |
   | Breaking change | `feat!:`, `fix!:` or a `BREAKING CHANGE:` footer |

   Do not edit `CHANGELOG.md` or the `package.json` version: they are generated at release time.

4. **Run `bun run ci` before every push.** GitHub CI runs the same check on pull requests, but catching
   errors locally is faster. The `pre-push` hook does it for you if you installed it.
5. Push the branch and open a **pull request** to `main`. Fill in the template.
   - The pull request is squash-merged: **its title is what counts**, so write it in the same
     Conventional Commits format (`fix: …`).
   - If you change the manifest (permissions, `host_permissions`, CSP), say so and justify it.
6. Wait for the checks. A SonarQube Cloud analysis also runs on pull requests opened from a branch of this
   repository; for pull requests from forks it is skipped and never blocks you.

## Commands

Every command is run with `bun run <script>`.

| Command | Purpose |
|---------|---------|
| `bun run setup` | Prepares your machine (safe to re-run) |
| `bun run dev` | Dev mode with automatic reload (Chrome) |
| `bun run dev:firefox` | Dev mode with automatic reload (Firefox) |
| `bun run build` | Build → `.output/chrome-mv3/` and `.output/firefox-mv3/` |
| `bun run zip` | Distributable archives in `.output/`: `homebox-clipper-X.Y.Z-chrome.zip`, `homebox-clipper-X.Y.Z-firefox.zip` and `homebox-clipper-X.Y.Z-sources.zip` |
| `bun run test` | Unit and contract tests (Vitest, **not** `bun test`) |
| `bun run test:watch` | Tests in watch mode |
| `bun run test:coverage` | Tests with a coverage report (`coverage/lcov.info`, not tracked by git) |
| `bun run test:build` | Checks the built manifest (permissions, CSP), after `bun run build` |
| `bun run typecheck` | Type checking (`vue-tsc`) |
| `bun run lint` | ESLint |
| `bun run check:config` | Validates the settings files: JSON/YAML, same Bun version everywhere, issue templates and labels, `en`/`fr` catalog parity |
| `bun run ci` | **All checks**: `check:config`, typecheck, lint, tests, build, manifest |
| `bun run homebox:up` | Starts the local HomeBox instance |
| `bun run homebox:down` | Stops the local HomeBox instance |
| `bun run homebox:logs` | Follows the HomeBox logs |
| `bun run icons` | Regenerates `public/icon/*.png` from `src/assets/logo.svg` |
| `bun run docs:install` | Installs the documentation site dependencies (`docs/site/`, frozen lockfile) |
| `bun run docs:dev` | Previews the documentation site with live reload |
| `bun run docs:build` | Builds the documentation site and checks its internal links and anchors |

## Project rules

The essentials (the review checks them):

- **API key**: only the service worker uses it. It is encrypted at rest, never sent anywhere
  other than the HomeBox instance and never logged. No `console.*` outside
  `src/shared/logger.ts` (ESLint rule).
- **Explicit confirmation**: no write to HomeBox without a user click.
- **Minimal permissions**: any manifest change (permissions, CSP) must be flagged and justified
  in the PR. `bun run test:build` checks the built manifest.
- **Merchant selectors**: only in the `selectors.ts` of its folder (for example
  `src/content/merchants/amazon/selectors.ts`), with several selectors per field; texts of a page
  language (labels, month names) only in `src/content/merchants/amazon/page-locales.ts`.
- **Tests**: each extractor is tested on **anonymized** pages
  (for example `tests/fixtures/amazon-fr/` or `tests/fixtures/amazon-de/`, procedure in the folder's
  README and `scripts/fixtures/anonymize-amazon.ts`). **Never commit**
  a raw merchant page, an API key, a pepper or a real instance address.
- **Interface texts**: any interface text you add goes into both `src/locales/en.yml` **and**
  `src/locales/fr.yml` in the same contribution (same keys, same `$n` substitutions);
  `bun run check:config` checks this.
- **Interface**: colors are CSS variables in `src/ui/theme.css`. Check your changes in both the light
  and dark themes.

## Common tasks

| You want to… | Guide |
|--------------|-------|
| Fix an extractor after Amazon changed its layout | [Tests and fixtures](https://foufou-exe.github.io/homebox-clipper/contributing/testing-and-fixtures/#when-amazon-changes-its-layout) |
| Add a merchant (then update [MERCHANTS.md](MERCHANTS.md) and [MERCHANTS.fr.md](MERCHANTS.fr.md)) | [Adding a merchant](https://foufou-exe.github.io/homebox-clipper/contributing/adding-a-merchant/) |
| Change or add an interface text | [Translations](https://foufou-exe.github.io/homebox-clipper/contributing/translations/) |
| Understand the code | [Architecture](https://foufou-exe.github.io/homebox-clipper/contributing/architecture/) |

### Change the documentation

The documentation site is `docs/site/` (Astro Starlight). Every page exists in English
(`docs/site/src/content/docs/`) and in French (`docs/site/src/content/docs/fr/`, same file name): change
both languages in the same pull request. Before pushing, run `bun run docs:build`: it fails on a broken
internal link or anchor. The site is not part of `bun run ci`.

## If it does not work

| Symptom | Fix |
|---------|-----|
| `bun run setup` stops with `Bun is required` or `Node.js LTS is required` | Install the missing tool (or `mise install`), then run `bun run setup` again. |
| `bun run homebox:up` fails with *Set HBOX_AUTH_API_KEY_PEPPER…* | The `.env` file is missing: run `bun run setup` again. |
| `bun run dev` opens no browser | A `web-ext.config.ts` with `disabled: true` exists: load the build folder by hand (see the development container option). |
| Tests fail or are not found with `bun test` | Use `bun run test` (Vitest). |
| The `pre-push` hook blocks the push | `bun run ci` found an error: read the first one, fix it, commit, push again. |
| `bun run check:config` fails on `en.yml`/`fr.yml` | A key or a `$n` substitution exists in one catalog only: add it to the other one. |

## Questions and ideas

Questions and early ideas go to [GitHub Discussions](https://github.com/Foufou-exe/homebox-clipper/discussions)
(Q&A, Ideas), not to issues: see [SUPPORT.md](SUPPORT.md). An idea that gets a clear plan can become an
issue. Everyone is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a problem

Use the issue templates: bug, feature idea, **misdetected merchant page** or **new merchant
request**. For a wrong detection, state the merchant, the order type (third-party seller,
multiple items…) and the affected field, **without** attaching the raw page.

For a **vulnerability**, do not open a public issue: follow [SECURITY.md](SECURITY.md).
