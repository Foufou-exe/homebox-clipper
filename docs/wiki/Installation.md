# Installation

The extension is not yet published on the Chrome Web Store: you have to build it, then load it in
developer mode.

## Requirements

| Item | Version |
|------|---------|
| Browser | Recent Google Chrome or Chromium (Brave, Edge, Vivaldi... should work, untested) |
| HomeBox | [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) instance exposing the `/api/v1/entities` API (tested with **v0.27.0**) |
| Account | An account on a supported Amazon store (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com), signed in in the same browser |
| To build | [Bun](https://bun.sh) 1.4 (version pinned in `package.json`) and [Node.js](https://nodejs.org) LTS |

`mise install` installs Bun and Node at the right versions thanks to the repository's `mise.toml` file.

## Build

```bash
git clone https://github.com/Foufou-exe/homebox-clipper.git
cd homebox-clipper
bun install
bun run build      # produces .output/chrome-mv3/
```

There is only **one build**, whatever your HomeBox instance: the rule on accepted addresses (HTTPS, or
HTTP on the local network) is enforced at runtime, not at build time.

## Without building: install from a release

Download `homebox-clipper-<version>-chrome.zip` from the
[latest release](https://github.com/Foufou-exe/homebox-clipper/releases/latest), unzip it into a folder
you will keep, then load that folder as described below.

## Load the extension in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `.output/chrome-mv3/` folder.
4. Pin the extension icon to the toolbar for easy access.

The settings page opens automatically on first install. Next: [Configuration](Configuration.md).

## Update

```bash
git pull
bun install
bun run build
```

Then click the reload icon (↻) on the extension's card in `chrome://extensions`. Your settings are kept.

## Uninstall

Remove the extension from `chrome://extensions`: its local data (instance address, encrypted API key) is
deleted with it. You can also, beforehand, use **Delete settings** in the settings page, which also
removes the access permission granted for your instance.

## For development

See [Maintaining-the-dev-environment](Maintaining-the-dev-environment.md) and the
[contributing guide](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md): `bun run dev`
starts a development Chrome with automatic reload.
