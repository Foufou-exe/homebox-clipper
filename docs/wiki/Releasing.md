# Releasing

Releases are published by GitHub Actions when the maintainer pushes a version tag. The procedure is
reserved for the maintainer. The format of the
[changelog](https://github.com/Foufou-exe/homebox-clipper/blob/main/CHANGELOG.md) is
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and numbering follows
[SemVer](https://semver.org).

> [!IMPORTANT]
> Pushing a tag publishes a release immediately, and a published release is hard to undo: only do it
> with the maintainer's explicit approval.

## Feeding the changelog day to day

Every change visible to a user or a contributor (feature, fix, security, permission, development
procedure) adds a line in the `[Unreleased]` section of `CHANGELOG.md`, under the right type: `Added`,
`Changed`, `Deprecated`, `Removed`, `Fixed` or `Security` (standard names). Internal refactorings and
tests alone do not go there. A change that requires an action from the user is prefixed with **Action
required:**. The pull request reminds you to do it (dedicated checkbox in the template).

## Release procedure

For a version `x.y.z`:

1. **Branch** from an up-to-date `main`: `git switch -c chore/release-x.y.z`.
2. **Version number**: `bun pm version x.y.z --no-git-tag-version` (updates `package.json`).
3. **Changelog**: rename `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`, recreate an empty `[Unreleased]` above
   it and update the comparison links at the bottom of the file (`[Unreleased]` compares
   `vx.y.z...HEAD`, and `[x.y.z]` compares the previous tag to `vx.y.z`).
4. **Verification**: `bun run ci` must pass; `bun run release:notes x.y.z` must print the notes.
5. **Pull request** to `main` (commit `chore(release): vX.Y.Z`), wait for the CI, then merge.
6. **Tag** (maintainer), on the merge commit of `main`:
   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

## What the release workflow does

`.github/workflows/release.yml` runs on every pushed `v*.*.*` tag, with a `GITHUB_TOKEN` limited to
`contents: write` and no other secret. It:

1. runs `bun run ci` (all checks and the build);
2. fails if the tag is not exactly `v` + the `package.json` version;
3. fails if `CHANGELOG.md` has no non-empty section for that version;
4. builds the archive with `bun run zip` and checks that it exists under the expected name and that its
   `manifest.json` carries the same version;
5. creates the GitHub release `vX.Y.Z` with the notes taken from the changelog, the SHA-256 of the
   archive, and two attached files: `homebox-clipper-X.Y.Z-chrome.zip` and its `.sha256`.

If a check fails, nothing is published. Fix the cause on `main`, then delete the tag (locally and on
`origin`) and tag again; a release that was already created must be deleted first.

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
