---
title: "Set up the project"
description: "Install the project, run the extension in development mode and pass the checks, step by step."
---

**Who this page is for**: anyone who wants to change the code, the texts or the documentation of HomeBox
Clipper. At the end, the extension runs from your copy of the code and `bun run ci` passes.

## Before you start

| Tool | Version | Check with |
|------|---------|------------|
| Git | any recent | `git --version` |
| [Bun](https://bun.sh) | 1.4 (pinned in `package.json`, field `packageManager`) | `bun --version` |
| [Node.js](https://nodejs.org) | LTS (used by Vite and WXT) | `node --version` |
| Docker with Compose | recent (for the test HomeBox instance) | `docker compose version` |
| Chrome or Chromium | recent | |
| Firefox | 140 or later (optional, to test the Firefox build) | |

[mise](https://mise.jdx.dev) can install Bun and Node at the right versions for you: run `mise install`
in the project folder (it reads `mise.toml`).

Prefer not to install anything? Use the [development container](#option-development-container) instead.

## Option: your machine

1. Get the code:

   ```bash
   git clone https://github.com/Foufou-exe/homebox-clipper.git
   cd homebox-clipper
   ```

2. Optional: install Bun and Node at the project versions:

   ```bash
   mise install
   ```

3. Prepare the project:

   ```bash
   bun run setup
   ```

   It checks your tools, installs the dependencies, creates the `.env` file of the test HomeBox instance
   (with a random secret) and offers to install a `pre-push` hook that runs `bun run ci` before every push.
   Answer `y` to install the hook (recommended).

   **Expected result**: the command ends with `Ready. Next:` and a list of commands. A `!` line is only a
   warning (for example Docker missing); a `✗` line stops the setup and says what is missing.

4. Start the test HomeBox instance:

   ```bash
   bun run homebox:up
   ```

   Then create an account and an API key in it: follow
   [Local HomeBox instance](/homebox-clipper/contributing/local-homebox-instance/), steps 3 and 4.

5. Start the extension in development mode:

   ```bash
   bun run dev           # Chrome
   bun run dev:firefox   # Firefox (Firefox must be installed)
   ```

   **Expected result**: a separate browser window opens with the extension already loaded. Each time you
   save a source file, the extension reloads.

6. Configure the extension in that window: address `http://localhost:3100`, your test API key and a
   passphrase, then **Test and save** (details: [Configuration](/homebox-clipper/configuration/)).

7. Run all the checks once:

   ```bash
   bun run ci
   ```

   **Expected result**: the command ends without error. It runs, in order, `check:config`, `typecheck`,
   `lint`, `test`, `build` and `test:build`.

## Option: development container

For VS Code with the Dev Containers extension, or GitHub Codespaces.

1. Open the repository in VS Code, then run **Dev Containers: Reopen in Container** from the command
   palette.
2. Wait for the first creation to finish. The container installs Bun, the dependencies and the `.env`
   file, and has its own Docker for HomeBox (port 3100 is forwarded to your machine).
3. In the container terminal, run `bun run homebox:up`, then create an account and an API key on
   <http://localhost:3100> (see [Local HomeBox instance](/homebox-clipper/contributing/local-homebox-instance/)).
4. There is no browser in the container. Run `bun run build` (or `bun run dev`, which rebuilds at each
   change), then, **in the browser of your machine**, load the build folder:
   - Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → `.output/chrome-mv3/` (or
     `.output/chrome-mv3-dev/` with `bun run dev`);
   - Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → the `manifest.json`
     of `.output/firefox-mv3/`.
5. Run `bun run ci` in the container terminal.

   **Expected result**: the command ends without error.

## Customize `bun run dev`

Copy `web-ext.config.example.ts` to `web-ext.config.ts` (ignored by git) and uncomment what you need:
no browser at all, another Chromium browser, Firefox Developer Edition, or a start page.

## Editor

VS Code suggests the recommended extensions (`.vscode/extensions.json`): Vue (Volar), ESLint, Prettier,
Vitest, EditorConfig, Bun. Formatting and ESLint fixes apply on save. Common tasks are in **Terminal** →
**Run Task** (checks, dev mode, build, test watch, local HomeBox).

## If it does not work

| Symptom | Fix |
|---------|-----|
| `bun run setup` stops with `Bun is required` or `Node.js LTS is required` | Install the missing tool (or run `mise install`), then run `bun run setup` again. It is safe to re-run. |
| `Docker not found` during the setup | Install Docker with Compose, or use the development container. Only the local HomeBox instance needs it. |
| `bun run homebox:up` fails with *Set HBOX_AUTH_API_KEY_PEPPER…* | The `.env` file is missing: run `bun run setup` again. |
| `bun run dev` opens no browser | A `web-ext.config.ts` file with `disabled: true` exists (normal in the container). Load the build folder by hand, as in the container option. |
| Tests fail or are not found with `bun test` | Use `bun run test`: the project tests run with Vitest, not with Bun's own test runner. |
| `bun run ci` fails | Read the first error: it names the step (`typecheck`, `lint`, `test`…). Fix it, then run `bun run ci` again. |

Next: [Submit a change](/homebox-clipper/contributing/submitting-changes/).
