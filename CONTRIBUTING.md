# Contributing to homebox-clipper

Thank you for your interest! This guide gets you up and running in a few minutes.

## Quick start

**Option A: on your machine**

```bash
git clone https://github.com/Foufou-exe/homebox-clipper.git
cd homebox-clipper
mise install          # optional: installs Bun and Node at the project's versions (mise.toml)
bun run setup         # dependencies, HomeBox instance .env, pre-push hook (optional)
bun run homebox:up    # HomeBox on http://localhost:3100
bun run dev           # opens a development Chrome with the extension
```

**Option B: development container (VS Code / GitHub Codespaces)**

Open the repository in VS Code, then *Reopen in Container*. The container installs Bun, the
dependencies and the `.env`, and has its own Docker for HomeBox (port 3100 forwarded to your
machine). There is no browser in the container: run `bun run build` (or `bun run dev`, which
rebuilds continuously) and load the `.output/chrome-mv3/` folder (or `.output/chrome-mv3-dev/`)
in the Chrome on your machine.

Then:

1. Open <http://localhost:3100>, create a test account and an API key
   (details: [docs/local-homebox.md](docs/local-homebox.md)).
2. Configure the extension (address `http://localhost:3100`, key, passphrase).

### Prerequisites

| Tool | Version | Note |
|-------|---------|----------|
| [Bun](https://bun.sh) | 1.4 (`packageManager` in `package.json`) | package manager and scripts |
| [Node.js](https://nodejs.org) | LTS | used by Vite / WXT |
| Docker + Compose | recent | local HomeBox instance |
| Chrome or Chromium | recent | to load the extension |
| `rsvg-convert` (librsvg) | optional | only for `bun run icons` |

[mise](https://mise.jdx.dev) installs Bun and Node at the right versions thanks to `mise.toml`.

### Editor

VS Code suggests the recommended extensions (`.vscode/extensions.json`): Vue (Volar), ESLint,
Prettier, Vitest, EditorConfig, Bun. Formatting and ESLint fixes are applied on save. Common
tasks are in *Terminal → Run Task* (checks, dev mode, build, test watch, local HomeBox).

## Commands

Every command is run with `bun run <script>`.

| Command | Purpose |
|----------|------|
| `bun run setup` | Prepares your machine (safe to re-run) |
| `bun run dev` | Dev mode with automatic reload |
| `bun run build` | Build → `.output/chrome-mv3/` |
| `bun run zip` | Archive ready to publish |
| `bun run test` | Unit and contract tests (Vitest, **not** `bun test`) |
| `bun run test:watch` | Tests in watch mode |
| `bun run test:coverage` | Tests with a coverage report (`coverage/lcov.info`, not tracked by git) |
| `bun run test:build` | Checks the built manifest (permissions, CSP), after `bun run build` |
| `bun run typecheck` | Type checking (`vue-tsc`) |
| `bun run lint` | ESLint |
| `bun run check:config` | Validates the settings files: JSON/YAML, same Bun version everywhere, issue templates and labels |
| `bun run ci` | **All checks**: `check:config`, typecheck, lint, tests, build, manifest |
| `bun run homebox:up` | Starts the local HomeBox instance |
| `bun run homebox:down` | Stops the local HomeBox instance |
| `bun run homebox:logs` | Follows the HomeBox logs |
| `bun run icons` | Regenerates `public/icon/*.png` from `src/assets/logo.svg` |
| `bun run release:notes` | Prints a version's section of `CHANGELOG.md` (see "Changelog and releases") |
| `bun run wiki:publish` | Publishes `docs/wiki/` to the GitHub wiki (manual action, see "Documentation and wiki") |

`bun run dev` can be customized with a local `web-ext.config.ts` file: another browser, no
browser, start page. See `web-ext.config.example.ts`.

## Workflow

1. **One branch per topic**, created from an up-to-date `main`: `feat/…`, `fix/…`, `docs/…`,
   `chore/…`, `ci/…`.
2. **Commits** in [Conventional Commits](https://www.conventionalcommits.org/en/) format are
   **mandatory** (`feat:`, `fix:`, `perf:`, `docs:`, `refactor:`, `test:`, `chore:`…), in English or
   French: the next version number and the changelog are computed from them (see "Changelog and
   releases"). With squash merge, the **pull request title** is what counts, so write it in the same
   format.
3. **`bun run ci` must pass locally before every push.** GitHub CI runs the same check on
   code pull requests and on `main`, but catching errors locally is faster. `bun run setup` can install a `pre-push` hook that runs it automatically.
4. Open a **pull request** to `main` and fill in the template.

### SonarQube analysis

The `SonarQube` workflow analyses the source code on [SonarQube Cloud](https://sonarcloud.io/project/overview?id=Foufou-exe_homebox-clipper)
for pull requests opened from a branch of this repository and for `main`. The result (Quality Gate,
issues) is on the SonarQube Cloud project page and in the pull request checks. Pull requests from
forks cannot access the `SONAR_TOKEN` secret: the analysis is skipped for them, so it never blocks
them; maintainers can review the code after merging. The configuration is in
`sonar-project.properties`.

## Project rules

The full principles are in the project constitution. The essentials:

- **API key**: only the service worker uses it. It is encrypted at rest, never sent anywhere
  other than the HomeBox instance and never logged. No `console.*` outside
  `src/shared/logger.ts` (ESLint rule).
- **Explicit confirmation**: no write to HomeBox without a user click.
- **Minimal permissions**: any manifest change (permissions, CSP) must be flagged and justified
  in the PR. `bun run test:build` checks the built manifest.
- **Merchant selectors**: only in the `selectors.ts` of its folder (for example
  `src/content/merchants/amazon-fr/selectors.ts`), with several selectors per field.
- **Tests**: each extractor is tested on **anonymized** pages
  (for example `tests/fixtures/amazon-fr/`, procedure in that folder's README). **Never commit**
  a raw merchant page, an API key, a pepper or a real instance address.
- **Interface texts**: any interface text you add goes into both `src/locales/en.yml` **and**
  `src/locales/fr.yml` in the same contribution (same keys, same `$n` substitutions);
  `bun run check:config` checks this.

## Common cases

**Amazon changed its layout**: capture the page in `tests/fixtures/amazon-fr/raw/`
(ignored by git), anonymize it, add a failing test, then fix `selectors.ts`.

**Adding a merchant**: a `src/content/merchants/<merchant>/` folder that implements
`MerchantExtractor` (`src/content/merchants/types.ts`), with its selectors, its fixtures and an
injectable entry point in `src/entrypoints/`. Neither the import orchestrator, nor the HomeBox
client, nor the interface needs to change.

**Changing the interface**: colors are CSS variables in `src/ui/theme.css`.
Check your changes in both the light and dark themes.

## Changelog and releases

The changelog and the version number are **generated** by [Release Please](https://github.com/googleapis/release-please)
from the Conventional Commits merged into `main`; do not edit `CHANGELOG.md` or the `package.json`
version by hand.

| Commit type | Effect |
|-------------|--------|
| `feat:` | new minor version (while below 1.0.0), section *Features* |
| `fix:` | new patch version, section *Bug Fixes* |
| `perf:` | patch version, section *Performance* |
| `docs:`, `refactor:`, `revert:`, `build:` | appear in the changelog (*Documentation*, *Code Refactoring*, *Reverts*, *Build System*), without releasing on their own |
| `ci:`, `test:`, `style:`, `chore:` | hidden from the changelog, no release |
| `feat!:`, `fix!:` or a `BREAKING CHANGE:` footer | breaking change (minor version while below 1.0.0, major afterwards) |

How a release happens:

1. After each merge into `main`, the bot opens or updates a pull request titled
   `chore: release X.Y.Z` (new version in `package.json`, new section in `CHANGELOG.md`).
2. The maintainer reviews it and merges it when a release is wanted. This creates the `vX.Y.Z` tag
   and the GitHub release.
3. The same workflow (`.github/workflows/release.yml`) then builds the Chrome archive and attaches
   `homebox-clipper-X.Y.Z-chrome.zip` and its `.sha256` to the release.
4. Last, the `chrome-web-store` job uploads that archive to the Chrome Web Store and submits it for
   review (skipped if the environment secrets are not set; see the wiki page "Releasing").

`bun run release:notes X.Y.Z` prints a version's section of the changelog. Details and recovery
procedure: [Releasing](https://github.com/Foufou-exe/homebox-clipper/wiki/Releasing). The history before
0.3.0 follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and stays as it is.

## Supported merchants

The extension targets **all online stores**, not just Amazon. The merchant list is in
[MERCHANTS.md](MERCHANTS.md), maintained by hand and checked by a test against
`src/content/merchants/registry.ts`: add your merchant to the registry, then update `MERCHANTS.md`.
Step by step: [Adding-a-merchant](https://github.com/Foufou-exe/homebox-clipper/wiki/Adding-a-merchant) and [Supported-merchants](https://github.com/Foufou-exe/homebox-clipper/wiki/Supported-merchants).

## Translations

All visible texts go through `t()` (keys of the `src/locales/en.yml` and `src/locales/fr.yml`
catalogs): no hard-coded text in components. English is the reference catalog; French must have
the same keys and substitutions, and `bun run check:config` fails otherwise. Details: [Translations](https://github.com/Foufou-exe/homebox-clipper/wiki/Translations).

## Documentation and wiki

Wiki pages live in `docs/wiki/` (in English) and are reviewed like the rest of the code.
`bun run wiki:publish` pushes them to the GitHub wiki; it is a manual action, to be run only
with the maintainer's approval. Wiki links to repository files are absolute URLs (`blob/main`).

## Maintaining the dev environment

When Bun, Node, HomeBox, a VS Code extension or WXT changes, several files must change
together. The checklist is in the wiki:
[Maintaining-the-dev-environment](https://github.com/Foufou-exe/homebox-clipper/wiki/Maintaining-the-dev-environment), and
`bun run check:config` catches some of the omissions. Issue templates and `labels.yml` do not
trigger GitHub CI: running `bun run ci` locally is their only guard.

## Reporting a problem

Use the issue templates: bug, feature idea, **misdetected merchant page** or **new merchant
request**. For a wrong detection, state the merchant, the order type (third-party seller,
multiple items…) and the affected field, **without** attaching the raw page.

For a **vulnerability**, do not open a public issue: follow [SECURITY.md](SECURITY.md).
Maintainer: enable *Private vulnerability reporting* in the repository's *Settings → Code security*
if the repository allows it; otherwise the fallback described in `SECURITY.md` applies.

## Going further

The [wiki](https://github.com/Foufou-exe/homebox-clipper/wiki/Home) details the [architecture](https://github.com/Foufou-exe/homebox-clipper/wiki/Architecture), the
[tests and fixtures](https://github.com/Foufou-exe/homebox-clipper/wiki/Testing-and-fixtures) and the [configuration](https://github.com/Foufou-exe/homebox-clipper/wiki/Configuration).
