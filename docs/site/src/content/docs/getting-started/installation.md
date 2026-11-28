---
title: "Installation"
description: "Install HomeBox Clipper in Chrome or Firefox, from a release or from the sources."
---

**Who this page is for**: anyone who wants to use HomeBox Clipper in Chrome (or a Chromium browser) or in
Firefox. At the end, the extension icon is in your toolbar and its settings page is open.

The extension is not yet published on the Chrome Web Store: you load it in developer mode. The simplest
way is to download a ready-made archive from a release; you do not need to build anything.

## Before you start

| You need | Version |
|----------|---------|
| A browser | Recent Google Chrome or Chromium (Brave, Edge, Vivaldi... should work, untested), or **Firefox 140 or later** on desktop (Firefox for Android is not supported) |
| A HomeBox instance | [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) exposing the `/api/v1/entities` API (tested with **v0.27.0**) |
| A merchant account | An account on a supported Amazon store (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com), signed in in the same browser |

## Install in Chrome (from a release)

1. Open the [latest release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) and download
   `homebox-clipper-<version>-chrome.zip`.
2. Optional, to check the download: also download `homebox-clipper-<version>-chrome.zip.sha256`, put both
   files in the same folder and run `sha256sum -c homebox-clipper-<version>-chrome.zip.sha256`.
   **Expected result**: `homebox-clipper-<version>-chrome.zip: OK`.
3. Unzip the archive into a folder **you will keep** (Chrome reads the extension from there; do not delete
   it).
4. Open `chrome://extensions`.
5. Turn on **Developer mode** (top right).
6. Click **Load unpacked** and select the unzipped folder.
   **Expected result**: a "HomeBox Clipper" card appears, and the settings page opens by itself.
7. Click the puzzle icon of the toolbar, then the pin next to HomeBox Clipper, to keep its icon visible.

Next: [Configuration](/homebox-clipper/configuration/).

## Load the extension in Firefox

Requirements: **Firefox 140 or later** on desktop. The archive from GitHub is **not signed by Mozilla**: it can
only be loaded temporarily, and Firefox removes it when it restarts. A durable installation comes from
Firefox Add-ons (addons.mozilla.org), once the add-on is published there.

1. Download `homebox-clipper-<version>-firefox.zip` from the
   [latest release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (or build it, see
   [Build from the sources](#build-from-the-sources): the build also produces `.output/firefox-mv3/`).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the `.zip` file, or the `manifest.json` inside
   `.output/firefox-mv3/`.
   **Expected result**: HomeBox Clipper appears in the list of temporary extensions.
4. Open the settings page of the extension (`about:addons` › the extension › **Preferences**, or the toolbar
   menu) and continue with [Configuration](/homebox-clipper/configuration/). Firefox asks for access to the address of your
   HomeBox instance only.

The add-on has a fixed identifier (`homebox-clipper@foufou-exe.github.io`), so the settings you saved should be kept
between two loads of it. Private windows: Firefox does not run the extension there
unless you allow it in `about:addons` › the extension › **Run in Private Windows**.

The release also contains a third archive, `-sources.zip`: you do not need it, it is only for the
addons.mozilla.org reviewers.

## Build from the sources

Only if you prefer to build the extension yourself. You also need [Bun](https://bun.sh) 1.4 (version
pinned in `package.json`) and [Node.js](https://nodejs.org) LTS; `mise install` installs both at the right
versions thanks to the repository's `mise.toml` file.

1. Get the code and build it:

   ```bash
   git clone https://github.com/Foufou-exe/homebox-clipper.git
   cd homebox-clipper
   bun install
   bun run build      # produces .output/chrome-mv3/ and .output/firefox-mv3/
   ```

   **Expected result**: the two folders `.output/chrome-mv3/` and `.output/firefox-mv3/` exist.
2. Load `.output/chrome-mv3/` in Chrome (steps 4 to 7 of [Install in Chrome](#install-in-chrome-from-a-release)),
   or `.output/firefox-mv3/` in Firefox (steps 2 to 4 of [the Firefox section](#load-the-extension-in-firefox)).

There is **one build per browser** (Chrome and Firefox, same permissions), and the same build whatever your HomeBox instance: the rule on accepted addresses (HTTPS, or
HTTP on the local network) is enforced at runtime, not at build time.

To change the code, `bun run dev` (Chrome) and `bun run dev:firefox` (Firefox) start a browser that reloads
the extension at each change: see [Set up the project](/homebox-clipper/contributing/development-setup/).

## Update

- **From a release, in Chrome**: download the new `-chrome.zip`, unzip it **into the same folder** (replace
  the old files), then click the reload icon (↻) on the extension's card in `chrome://extensions`. Your
  settings are kept.
- **From the sources**: run `git pull`, `bun install`, `bun run build`, then click ↻ on the card in
  `chrome://extensions`.
- **In Firefox**: click **Reload** on the extension in `about:debugging#/runtime/this-firefox` (or load the
  new `.zip` again). An installation from Firefox Add-ons is updated by Firefox itself.

## Uninstall

1. Optional: in the settings page, click **Delete settings**. It also removes the access permission granted
   for your instance.
2. Remove the extension from `chrome://extensions` (in Firefox: `about:addons` › the extension › **Remove**; a
   temporarily loaded add-on is removed with **Remove** in `about:debugging`).

Its local data (instance address, encrypted API key) is deleted with it.

## If it does not work

| Symptom | Fix |
|---------|-----|
| **Load unpacked** is missing in `chrome://extensions` | Turn on **Developer mode** (top right). |
| Chrome says the manifest is missing | You selected the wrong folder: pick the folder that directly contains `manifest.json`. |
| The extension disappeared after a Firefox restart | Normal for an archive loaded temporarily: load it again in `about:debugging`. |
| The extension disappeared from Chrome | The unzipped folder was moved or deleted: unzip the archive again and load it again. |

Other problems: [Troubleshooting and FAQ](/homebox-clipper/troubleshooting-and-faq/). Want to change the
code? See [Set up the project](/homebox-clipper/contributing/development-setup/).
