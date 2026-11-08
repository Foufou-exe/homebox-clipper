# Maintaining the development environment

This page lists the files to update when a project tool changes, so that the local machine, the
development container and the CI stay consistent. An automatic check, `bun run check:config`, catches a
large part of the omissions.

## When X changes, what to update?

| If... | Files to update | Note |
|-------|-----------------|------|
| The **Bun** version changes | `package.json` (`packageManager`), `mise.toml`, `.devcontainer/post-create.sh` | The `.github/workflows/ci.yml` workflow installs Bun with `oven-sh/setup-bun`: check that it follows the same version. `check:config` verifies that the major.minor version is the same everywhere. |
| The **Node** version changes | `mise.toml`, `.devcontainer/devcontainer.json` (tag of the `typescript-node` image), `.github/workflows/ci.yml` (`node-version`) | The project follows the LTS version. |
| The **HomeBox** version changes | `compose.yaml` (`HOMEBOX_VERSION` variable), `.env.example`, `docs/local-homebox.md`, [Local-HomeBox-instance](Local-HomeBox-instance.md), the tested version in [Installation](Installation.md) | Rerun the local test scenarios after the update. |
| A **VS Code extension** is added or removed | `.vscode/extensions.json` and `.devcontainer/devcontainer.json` (`customizations.vscode.extensions`) | The two lists must stay consistent for the extensions useful to the project. |
| **WXT** or **Vite** changes | `package.json` (dependencies), `wxt.config.ts`, `vitest.config.ts`, `vitest.build.config.ts` | Run `bun run ci`: the build and the manifest test catch breakage. |
| A `package.json` **script** is added or renamed | `CONTRIBUTING.md` ("Commands" section), `.vscode/tasks.json`, `scripts/setup.sh` (final message) | Each script must appear in `CONTRIBUTING.md` in the form `bun run <script>`. |
| An **issue template** or a **label** changes | `.github/ISSUE_TEMPLATE/*.yml`, `.github/labels.yml`, `REQUIRED_FIELDS` in `scripts/check-config.ts` | Then apply the labels with `scripts/sync-labels.sh` (manual action). |
| An **interface text** is added or changed | `src/locales/en.yml` **and** `src/locales/fr.yml` | Same contribution (rule FR-004c); `check:config` verifies the parity. See [Translations](Translations.md). |

## Check the settings

```bash
bun run check:config
```

This check, run at the head of `bun run ci` (so by the `pre-push` hook), verifies:

- the syntax of JSON-with-comments files (`.vscode/*.json`, `.devcontainer/devcontainer.json`,
  `tsconfig.json`) and YAML files (`.github/**/*.yml`, `compose.yaml`, `src/locales/*.yml`);
- that `src/locales/en.yml` and `src/locales/fr.yml` have the same keys and the same `$n` substitutions;
- that `package.json`, `mise.toml` and `.devcontainer/post-create.sh` pin the same Bun version;
- that the labels cited by the issue templates exist in `.github/labels.yml`, and that this file is
  well formed (unique names, 6-digit hexadecimal color, description of at most 100 characters);
- that the required fields of the issue templates are really required, and that blank issues are
  disabled (`config.yml`).

The files of `.github/ISSUE_TEMPLATE/` and `.github/labels.yml` do not trigger the GitHub CI (limited
quota): `check:config`, run locally, is their only guard. Remember to run `bun run ci` before pushing.

The script is tested by `tests/unit/check-config.test.ts`, on dummy repositories in
`tests/fixtures/config/`.

## See also

- [Contributing guide](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md)
- [Local-HomeBox-instance](Local-HomeBox-instance.md)
- [Releasing](Releasing.md)
