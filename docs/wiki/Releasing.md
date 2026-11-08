# Releasing

**Local** procedure (no GitHub Actions minute is consumed), reserved for the maintainer. The format of the
[changelog](https://github.com/Foufou-exe/homebox-clipper/blob/main/CHANGELOG.md) is
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and numbering follows
[SemVer](https://semver.org).

> [!IMPORTANT]
> Creating a tag, pushing it and publishing a release are visible actions that are hard to undo: only do
> them with the maintainer's explicit approval.

## Feeding the changelog day to day

Every change visible to a user or a contributor (feature, fix, security, permission, development
procedure) adds a line in the `[Unreleased]` section of `CHANGELOG.md`, under the right type: `Added`,
`Changed`, `Deprecated`, `Removed`, `Fixed` or `Security` (standard names). Internal refactorings and
tests alone do not go there. A change that requires an action from the user is prefixed with **Action
required:**. The pull request reminds you to do it (dedicated checkbox in the template).

## Release procedure

For a version `x.y.z`:

1. **Version number**: `bun pm version x.y.z --no-git-tag-version` (updates `package.json`).
2. **Changelog**: rename `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`, recreate an empty `[Unreleased]` above
   it and update the comparison links at the bottom of the file (`[Unreleased]` compares `vx.y.z...HEAD`,
   and `[x.y.z]` points to the release).
3. **Verification**: `bun run ci` must pass.
4. **Commit**: `chore(release): vX.Y.Z`.
5. **Tag**: `git tag vX.Y.Z`.
6. **Archive**: `bun run zip`. WXT produces `.output/<name>-<version>-chrome.zip`.
7. **GitHub release** (after pushing the branch and the tag):
   ```bash
   bun scripts/release-notes.ts x.y.z | gh release create vX.Y.Z .output/*-chrome.zip --notes-file -
   ```
   `scripts/release-notes.ts` extracts from the changelog only the section of the requested version
   (without title or comparison links).

## First version

The `v0.1.0` tag does not exist until the maintainer creates it on the MVP commit. As long as it is
missing, the changelog's comparison links resolve to nothing.

## After the release

- Check that the attached archive loads in Chrome (`chrome://extensions`, developer mode, unzipped
  folder).
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
