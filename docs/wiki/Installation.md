# Installation

The extension is not yet published on the Chrome Web Store: you have to build it, then load it in
developer mode. It also runs on Firefox 140 or later (desktop): see [Load the extension in Firefox](#load-the-extension-in-firefox).

## Requirements

| Item | Version |
|------|---------|
| Browser | Recent Google Chrome or Chromium (Brave, Edge, Vivaldi... should work, untested), or **Firefox 140 or later** on desktop (Firefox for Android is not supported) |
| HomeBox | [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) instance exposing the `/api/v1/entities` API (tested with **v0.27.0**) |
| Account | An account on a supported Amazon store (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com), signed in in the same browser |
| To build | [Bun](https://bun.sh) 1.4 (version pinned in `package.json`) and [Node.js](https://nodejs.org) LTS |

`mise install` installs Bun and Node at the right versions thanks to the repository's `mise.toml` file.

## Build

```bash
git clone https://github.com/Foufou-exe/homebox-clipper.git
cd homebox-clipper
bun install
bun run build      # produces .output/chrome-mv3/ and .output/firefox-mv3/
```

There is **one build per browser** (Chrome and Firefox, same permissions), and the same build whatever your HomeBox instance: the rule on accepted addresses (HTTPS, or
HTTP on the local network) is enforced at runtime, not at build time.

## Without building: install from a release

Download `homebox-clipper-<version>-chrome.zip` (Chrome) or `homebox-clipper-<version>-firefox.zip` (Firefox)
from the [latest release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (the `.sha256` file
next to each lets you check it). For Chrome, unzip it into a folder you will keep, then load that folder as
described below. For Firefox, load the `.zip` as described in the Firefox section; a third archive,
`-sources.zip`, is only for the addons.mozilla.org reviewers.

## Load the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `.output/chrome-mv3/` folder.
4. Pin the extension icon to the toolbar for easy access.

The settings page opens automatically on first install. Next: [Configuration](Configuration.md).

## Load the extension in Firefox

Requirements: **Firefox 140 or later** on desktop. The archive from GitHub is **not signed by Mozilla**: it can
only be loaded temporarily, and Firefox removes it when it restarts. A durable installation comes from
Firefox Add-ons (addons.mozilla.org), once the add-on is published there.

1. Build (`bun run build`, which also produces `.output/firefox-mv3/`) or download
   `homebox-clipper-<version>-firefox.zip` from a release.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select the `.zip` file, or the `manifest.json` inside
   `.output/firefox-mv3/`.
4. Open the settings page of the extension (`about:addons` › the extension › **Preferences**, or the toolbar
   menu) and continue with [Configuration](Configuration.md). Firefox asks for access to the address of your
   HomeBox instance only.

The add-on has a fixed identifier (`homebox-clipper@foufou-exe.github.io`), so the settings you saved should be kept
between two loads of it. For development, `bun run dev:firefox` starts a Firefox that reloads the extension
at each code change (Firefox must be installed). Private windows: Firefox does not run the extension there
unless you allow it in `about:addons` › the extension › **Run in Private Windows**.

## Update

```bash
git pull
bun install
bun run build
```

Then click the reload icon (↻) on the extension's card in `chrome://extensions`. Your settings are kept.
In Firefox, click **Reload** on the extension in `about:debugging#/runtime/this-firefox` (or load the new
`.zip` again). An installation from Firefox Add-ons is updated by Firefox itself.

## Uninstall

Remove the extension from `chrome://extensions` (in Firefox: `about:addons` › the extension › **Remove**; a
temporarily loaded add-on is removed with **Remove** in `about:debugging`): its local data (instance address, encrypted API key) is
deleted with it. You can also, beforehand, use **Delete settings** in the settings page, which also
removes the access permission granted for your instance.

## For development

See [Maintaining-the-dev-environment](Maintaining-the-dev-environment.md) and the
[contributing guide](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md): `bun run dev`
starts a development Chrome with automatic reload (`bun run dev:firefox` does the same for Firefox).
