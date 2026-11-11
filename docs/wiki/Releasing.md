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
      with the SHA-256 of the archive;
4. then the `chrome-web-store` job downloads that archive from the release, uploads it to the Chrome Web
   Store and submits it for review (see [Chrome Web Store](#chrome-web-store)). It is skipped with a
   notice if its secrets are not configured.

The build is in the same workflow because a tag created with the default `GITHUB_TOKEN` does not trigger
other workflows. The `publish` token is limited to `contents: write` (plus `pull-requests: write` for the
bot); the only other secrets are the five of the `chrome-web-store` environment, used by that job alone. Pushing a tag by hand no longer releases anything: it would bypass the changelog.

## Chrome Web Store

After each release, the `chrome-web-store` job of `release.yml` uploads the archive to the store and
submits it for review with the [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api),
using plain `curl` calls (no third-party action). Google then reviews the update (this can take from hours
to days); once approved, it is published automatically. The job fails with an explicit message on any API
error, and is **skipped with a `::notice::`** (not an error) when the secrets below are missing.

The API can only update an existing item: the account, the listing and the first version are created by hand.

### 1. Create the developer account

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   with the Google account that will own the extension. Turn on **2-step verification** on it: Google
   requires it to publish.
2. Pay the one-time registration fee (5 USD) and accept the developer agreement.

### 2. Make the first submission by hand

1. Download `homebox-clipper-X.Y.Z-chrome.zip` from the latest GitHub release.
2. In the dashboard, **Add new item** and upload the zip.
3. Fill in the **Store listing** tab (description, screenshots, icon, category) and the **Privacy** tab
   (single purpose, permission justifications, privacy policy URL), then **Submit for review**.
4. Keep the default visibility. If you change the visibility by hand later, publish manually once before
   the API can publish again.
5. Note the two identifiers: the **item ID** (32 characters, on the item's *Package* tab, or in
   `chrome://extensions` with developer mode on) and the **publisher ID** (dashboard, *Publisher* then
   *Settings*; if you belong to several publishers, pick the right one).

### 3. Create the OAuth credentials (Google Cloud Console)

1. In the [Google Cloud Console](https://console.cloud.google.com), create or select a project, then enable
   the **Chrome Web Store API** (*APIs & Services* then *Library*).
2. *OAuth consent screen*: choose **External**, fill in the application name and your email, skip the
   scopes, and add your own Google account as a **test user**.
3. *Credentials* then *Create credentials* then **OAuth client ID**, type **Web application**, with the
   authorized redirect URI `https://developers.google.com/oauthplayground`. Keep the **client ID** and the
   **client secret**.
4. Back on the consent screen, click **Publish app** (status *In production*). Otherwise, while it stays
   in *Testing*, Google expires the refresh token after 7 days and the job starts failing with
   `invalid_grant`. No verification is needed for your own use; the "unverified app" warning only appears
   when you authorize.

### 4. Generate the refresh token

1. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), click the gear icon,
   tick **Use your own OAuth credentials** and enter the client ID and secret.
2. In *Step 1*, type the scope `https://www.googleapis.com/auth/chromewebstore` in the input field
   and click **Authorize APIs**. Sign in with the account that **owns the item** and accept.
3. In *Step 2*, click **Exchange authorization code for tokens** and copy the **refresh token**. Treat it
   as a password: never paste it in an issue, a commit or a chat.

### 5. Create the GitHub environment and secrets

1. In the repository: *Settings* then *Environments* then **New environment**, named exactly
   `chrome-web-store`.
2. Optional: tick **Required reviewers** and add yourself. Each release then waits for your approval
   before anything is sent to Google.
3. Add these five **environment secrets** (names are exact):

| Secret | Value |
|--------|-------|
| `CWS_CLIENT_ID` | OAuth client ID (step 3) |
| `CWS_CLIENT_SECRET` | OAuth client secret (step 3) |
| `CWS_REFRESH_TOKEN` | refresh token (step 4) |
| `CWS_PUBLISHER_ID` | publisher ID (step 2) |
| `CWS_EXTENSION_ID` | item ID (step 2) |

Until all five exist, the job is skipped with a notice. Forks never have them.

### Re-run a publication

If the job failed (expired token, store rejection, upload still in progress...) or was skipped, fix the
cause, then run the **Release** workflow manually (*Actions* then *Release* then *Run workflow*) with the
existing tag, for example `v0.3.0`. The `publish` job rebuilds and re-attaches the archive, then the
`chrome-web-store` job uploads it again. The store refuses an upload whose version is not higher than the
one it already has: if that version was already uploaded successfully, only the review submission remains,
which you can do from the dashboard. You can follow the review status in the dashboard.

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

## Automatic wiki publication

The workflow `.github/workflows/wiki.yml` runs the same script (`scripts/publish-wiki.sh --yes`) on every
push to `main` that changes `docs/wiki/`, and on demand from the "Actions" tab ("Wiki", **Run workflow**).
If the wiki is already up to date, nothing is pushed and the run succeeds. The commit message is the same
as for the manual publication (`docs: sync wiki from <sha>`).

The default `GITHUB_TOKEN` is not used for the wiki: the job needs a personal access token stored as the
secret `WIKI_TOKEN` of an environment named `wiki`. **Without that secret the job is skipped with a
notice and ends successfully**, so the workflow is harmless on forks or before the setup.

One-time setup (the wiki's first page must already exist, see the previous section):

1. On GitHub, open your avatar, then **Settings**, **Developer settings**, **Personal access tokens**,
   **Fine-grained tokens**, and **Generate new token**.
2. Give it a name (for example `homebox-clipper wiki`) and an **expiration** (for example 90 days or one
   year; put the renewal date in your calendar, the workflow fails with an authentication error once the
   token has expired).
3. **Repository access**: *Only select repositories*, then choose `homebox-clipper`.
4. **Permissions**, **Repository permissions**: *Contents: Read and write* (*Metadata: Read-only* is
   added automatically). No other permission.
5. Generate the token and copy it (it is shown only once).
6. In the repository, open **Settings**, **Environments**, **New environment**, name it exactly `wiki`.
   Optionally add *Required reviewers* to approve each publication, and restrict *Deployment branches* to
   `main`.
7. In that environment, under **Environment secrets**, **Add secret**: name `WIKI_TOKEN`, value the token.
8. Check with **Actions**, **Wiki**, **Run workflow**.

To rotate the token, generate a new one and replace the value of `WIKI_TOKEN`; to disable the automatic
publication, delete the secret (or the environment).

The manual publication (`bun run wiki:publish`, SSH) remains available and unchanged. Sources for this
procedure: GitHub documentation on [fine-grained personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
and on [environment secrets](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment).
GitHub's documentation on [editing wiki pages](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)
says the wiki is a Git repository (`<repository>.wiki.git`) but does not state which token permission
writes to it: *Contents: Read and write* is the permission that allows a Git push to a repository, and
the first run confirms it for the wiki (the job prints a clone or push error otherwise).
