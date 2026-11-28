---
title: "Commands"
description: "Every project command a contributor uses, what it does and when to run it."
---

**Who this page is for**: contributors looking for the right command. Every command runs from the project
folder with `bun run <script>`. First time? Start with [Set up the project](/homebox-clipper/contributing/development-setup/).

## Every day

| Command | What it does | When |
|---------|--------------|------|
| `bun run dev` | Opens a development Chrome with the extension, reloaded at each change | While you code |
| `bun run dev:firefox` | Same with Firefox (Firefox must be installed) | To test on Firefox |
| `bun run test:watch` | Reruns the tests at each change | While you write tests |
| `bun run ci` | **All the checks**, in order: `check:config`, `typecheck`, `lint`, `test`, `build`, `test:build` | Before every push |

## Checks, one by one

| Command | What it does |
|---------|--------------|
| `bun run check:config` | Validates the settings files: JSON/YAML syntax, same Bun version everywhere, issue templates and labels, same keys in `en.yml` and `fr.yml` |
| `bun run typecheck` | Type checking (`vue-tsc`) |
| `bun run lint` | ESLint |
| `bun run test` | Unit and contract tests (Vitest; **not** `bun test`) |
| `bun run test:coverage` | Tests with a coverage report in `coverage/` (ignored by git). Informational: no threshold |
| `bun run build` | Builds the extension into `.output/chrome-mv3/` and `.output/firefox-mv3/` |
| `bun run test:build` | Checks the built manifest (permissions, CSP); run it **after** `bun run build` |

## Local HomeBox instance

| Command | What it does |
|---------|--------------|
| `bun run homebox:up` | Starts the test HomeBox instance on <http://localhost:3100> |
| `bun run homebox:down` | Stops it (the data is kept) |
| `bun run homebox:logs` | Follows its logs (Ctrl+C to leave) |

Details: [Local HomeBox instance](/homebox-clipper/contributing/local-homebox-instance/).

## Documentation site

| Command | What it does |
|---------|--------------|
| `bun run docs:dev` | Previews the site on <http://localhost:4321/homebox-clipper/>, reloaded on save |
| `bun run docs:build` | Builds the site and checks every internal link and anchor, in both languages |
| `bun run docs:install` | Installs the site dependencies only (the two commands above already do it) |

The site is not part of `bun run ci`: run `bun run docs:build` yourself after a documentation change.

## Occasional

| Command | What it does |
|---------|--------------|
| `bun run setup` | Prepares your machine: tools check, dependencies, `.env` of the local HomeBox, optional `pre-push` hook. Safe to re-run |
| `bun run zip` | Builds the distributable archives into `.output/` (`homebox-clipper-<version>-chrome.zip`, `-firefox.zip` and `-sources.zip`) |
| `bun run icons` | Regenerates `public/icon/*.png` from `src/assets/logo.svg` (needs `rsvg-convert`) |
