# Releasing

Releases are driven by [Release Please](https://github.com/googleapis/release-please) and published by
GitHub Actions. The decision to release belongs to the maintainer: merging the release pull request is
the only manual step. Numbering follows [SemVer](https://semver.org); commits follow
[Conventional Commits](https://www.conventionalcommits.org/en/), which is **mandatory** because the next
version and the changelog are computed from them.

> [!IMPORTANT]
> Merging the release pull request publishes a release immediately, and a published release is hard to
> undo: only do it with the maintainer's explicit approval.

## How it works

1. Every push to `main` runs `.github/workflows/release.yml`. Its `release-please` job reads the
   Conventional Commits since the last release and opens (or updates) a pull request titled
   `chore: release X.Y.Z` that bumps `package.json` and `.release-please-manifest.json` and adds a
   section to `CHANGELOG.md`.
2. When the maintainer merges that pull request, Release Please creates the `vX.Y.Z` tag and the GitHub
   release (with the changelog section as notes).
3. In the same workflow run, the `publish` job checks out the tag and:
   1. runs `bun run ci` (all checks and the build);
   2. fails if the tag is not exactly `v` + the `package.json` version;
   3. fails if `CHANGELOG.md` has no non-empty section for that version (`bun run release:notes`);
   4. builds the archive with `bun run zip` and checks that it exists under the expected name and that its
      `manifest.json` carries the same version;
   5. attaches `homebox-clipper-X.Y.Z-chrome.zip` and its `.sha256` to the release and completes the notes
      with the SHA-256 of the archive.

The build is in the same workflow because a tag created with the default `GITHUB_TOKEN` does not trigger
other workflows. The token is limited to `contents: write` (plus `pull-requests: write` for the bot) and no
other secret is used. Pushing a tag by hand no longer releases anything: it would bypass the changelog.

## Commit types and the changelog

| Type | Version bump (below 1.0.0) | Changelog section |
|------|---------------------------|-------------------|
| `feat` | minor | Features |
| `fix` | patch | Bug Fixes |
| `perf` | patch | Performance |
| `docs`, `refactor`, `revert`, `build` | none on their own | Documentation, Code Refactoring, Reverts, Build System |
| `ci`, `test`, `style`, `chore` | none | hidden |
| `!` after the type, or a `BREAKING CHANGE:` footer | minor (major from 1.0.0) | the entry is flagged as breaking |

The configuration is in `release-please-config.json`; the last released version is in
`.release-please-manifest.json`. Entries before 0.3.0 keep the
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format of
[CHANGELOG.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/CHANGELOG.md); `bun run release:notes`
reads both formats. Do not edit the changelog or the version by hand: fix a wrong entry by editing the
release pull request before merging it.

## If a release fails

If a check of the `publish` job fails, the tag and the release already exist but have no archive. Fix the
cause on `main`, then run the **Release** workflow manually (*Actions → Release → Run workflow*) with the
existing tag (for example `v0.3.0`): it rebuilds from that tag and attaches the files again. If the fix
must be part of the released code, delete the release and the tag, fix, and let Release Please recreate
them.

## After the release

- Open the release page and check the notes, the two attached files and the checksum.
- Check that the archive loads in Chrome: download it, verify with `sha256sum -c`, unzip it, then in
  `chrome://extensions` enable developer mode and use **Load unpacked** on the unzipped folder.
- If the wiki sources changed, republish it: see the next section.

## Publishing the wiki

The pages are versioned in `docs/wiki/`; the GitHub wiki is only a copy.

```bash
bun run wiki:publish -- --dry-run   # checks and link rewriting, 100% local, no network
bun run wiki:publish                # wiki clone, synchronization, git diff --stat, y/N confirmation, commit, push
```

The script checks that each page (except `_*.md`) is in `_Sidebar.md`, that each internal link points to
an existing page and that **no relative link leaves `docs/wiki/`** (targets outside the wiki such as
`MERCHANTS.md` or `CHANGELOG.md` are absolute `blob/main` URLs). It then rewrites the internal links to
remove the `.md` extension from the target (any anchor is kept), as the GitHub wiki expects.

Prerequisites for the real publication: the wiki must be enabled and its **first page created by hand**
from the repository's "Wiki" tab (GitHub does not initialize the `.wiki.git` repository before that), and
your SSH access to the repository must work. Without a `y` confirmation, nothing is pushed; the `--yes`
option is reserved for the maintainer.
