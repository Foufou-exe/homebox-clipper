# addons.mozilla.org: build instructions for the reviewer

This file is included in the source archive (`homebox-clipper-<version>-sources.zip`) attached to each
release and submitted to addons.mozilla.org. It explains how to rebuild the Firefox add-on from that archive.

## Requirements

- Linux, macOS or Windows.
- [Bun](https://bun.sh) 1.4.4 (version pinned in `package.json`, field `"packageManager"`).
- Node.js LTS (optional).
- No network service, no secret and no environment variable is needed.

## Steps

1. Unzip the source archive into an empty folder.
2. `bun install --frozen-lockfile --ignore-scripts`, then `bunx wxt prepare` (same steps as the CI).
3. `bunx wxt zip -b firefox` (or `bun run zip` to build Chrome and Firefox).
4. The add-on is `.output/homebox-clipper-<version>-firefox.zip`; its unpacked content is `.output/firefox-mv3/`.
   It is identical to the submitted file (same SHA-256).

## Bundler

WXT 0.21 (Vite 8 / Rolldown), minification only; no obfuscation, no remote code.
