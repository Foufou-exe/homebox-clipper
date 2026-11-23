**English** | [Français](README.fr.md)

<div align="center">

<img src="public/icon/128.png" alt="" width="96" height="96">

# homebox-clipper

**Turn an online purchase into a [HomeBox](https://github.com/sysadminsmedia/homebox) inventory item, invoice included, in one click.**

[![CI](https://github.com/Foufou-exe/homebox-clipper/actions/workflows/ci.yml/badge.svg)](https://github.com/Foufou-exe/homebox-clipper/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Foufou-exe/homebox-clipper)](https://github.com/Foufou-exe/homebox-clipper/releases)
[![Discussions](https://img.shields.io/github/discussions/Foufou-exe/homebox-clipper)](https://github.com/Foufou-exe/homebox-clipper/discussions)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Foufou-exe_homebox-clipper&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Foufou-exe_homebox-clipper)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Foufou-exe_homebox-clipper&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Foufou-exe_homebox-clipper)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)
![Chrome / Chromium](https://img.shields.io/badge/Chrome%20%2F%20Chromium-supported-success)
![Firefox 140+](https://img.shields.io/badge/Firefox-140%2B-FF7139)
![Status: beta](https://img.shields.io/badge/status-beta-orange)

</div>

---

**homebox-clipper** is an import companion for online stores: from the order page, it detects the
product, price, date, order number, seller and PDF invoice, then creates the item in your HomeBox
instance. You review, you confirm, it is filed away. **Supported stores:** Amazon.fr (supported) and
Amazon.de, Amazon.es, Amazon.it, Amazon.com.be, Amazon.nl, Amazon.co.uk and Amazon.com (testing:
checked on reconstructed test pages, not yet on a real order page). More merchants are planned and the
architecture is built to add them easily: see [MERCHANTS.md](MERCHANTS.md).

> [!NOTE]
> Nothing is ever sent without your confirmation, and nothing is sent anywhere other than **your**
> HomeBox instance.

## Features

- **Automatic detection** of an Amazon order on its detail page, in the language of the page; prices in
  pounds or dollars are kept as is, with a warning before confirmation (no currency conversion).
- **Editable summary** before anything is sent, with undetected fields flagged.
- **3-step import** (item, invoice PDF, photo); multi-item orders, manual PDF attachment and **duplicate detection**, including similar names, and completing the existing item instead (attachments, missing tags, empty fields only, after a confirmation listing the changes).
- **Error recovery**: if a document could not be sent, retry without creating a duplicate.
- **Document types**: attached PDFs can be typed as manual, warranty, delivery note, invoice or order document, and are filed in the matching section of HomeBox.
- **Warranty**: the item's warranty (expiry date, lifetime, details) is proposed in the summary and sent to HomeBox: the legal guarantee where the duration is verified and the item is sold by the store itself, or the warranty shown on the order page. Indicative value, no legal force.
- **Automatic lock**: choose when the passphrase is asked again (browser close by default, after 15 minutes, 1 hour or 4 hours of inactivity, or at every opening; no "never" option).
- **Update notice and version**: a short notice after each update, an "Update now" button when the browser has one ready, and the installed version shown next to the GitHub link; no request is made to check for updates.
- **Import history**: your latest imports with their result and a link to the item, kept only in your browser and encrypted with your passphrase (200 entries, 12 months; can be cleared or turned off).
- **Product photo** attached to the item as its main image (can be unticked per product).
- **Link to the order page** (optional, off by default): an external link to the merchant's order page is added to the item, one click away in HomeBox; it points to the merchant's website and is stored in HomeBox.
- **Several HomeBox instances** (up to 10, one passphrase for all): choose the target in the summary; each instance keeps its own encrypted key and exact-origin permission.
- **Location choice** among your HomeBox locations, with search; the last one used is suggested.
- **Suggested tags**: the store brand and the tags of your own local rules are suggested per product, editable in the summary; missing tags are created in HomeBox only after your confirmation, and existing tags are never removed.
- **HomeBox-colored interface**, in light, dark or automatic theme, in **English or French** depending on your browser language.
- **Privacy**: no intermediary server; the API key is always encrypted with your passphrase (required)
  and only used by the service worker. HTTP is accepted only on the local network.
- **No broad permission**: no permanent access to any site; access to your instance is requested
  for its exact address only.
- **Support** and **GitHub** links in the popup and the settings page.

## Demo

From an Amazon order page to an item in HomeBox, with its photo, invoice and location:

<p align="center"><img src="docs/demo/homebox-clipper-demo.gif" alt="Demo: importing an Amazon order into HomeBox, with its photo and invoice" width="800"></p>

## Supported merchants

The up-to-date list (supported, partial, planned, requested) is in
**[MERCHANTS.md](MERCHANTS.md)**. Your store is not listed? Open a
[merchant request](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml).

## Installation

The extension is not yet published on the Chrome Web Store: install it from a release, or build it
yourself, then load it in developer mode. For Firefox, see [Firefox](#firefox) below.

### From a release (no build)

1. Download `homebox-clipper-<version>-chrome.zip` from the
   [latest release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (the `.sha256` file
   next to it lets you check the download with `sha256sum -c`).
2. Unzip it into a folder you will keep (Chrome reads the extension from there).
3. In `chrome://extensions`: enable **Developer mode**, click **Load unpacked** and select that folder.

### Firefox

Requires **Firefox 140 or later** on desktop (Firefox for Android is not supported).

- **From Firefox Add-ons (addons.mozilla.org)**: coming soon; the link will be added here once the add-on is
  published.
- **Temporary loading, from a release**: download `homebox-clipper-<version>-firefox.zip` from the
  [latest release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (check it with the `.sha256`
  file), then open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select the
  `.zip` file (or the `manifest.json` of the unzipped folder). The archive is **not signed by Mozilla**, so
  Firefox removes it when it restarts; a durable installation comes from Firefox Add-ons.
- **From source**: `bun run build` produces `.output/firefox-mv3/` next to `.output/chrome-mv3/`; load that
  folder the same way (`bun run dev:firefox` starts a development Firefox).

### From source

Prerequisites: Chrome or Chromium (or Firefox 140+), [Bun](https://bun.sh) and
[Node.js](https://nodejs.org) LTS, and a [HomeBox](https://github.com/sysadminsmedia/homebox)
instance (tested with **v0.27.0**).

```bash
git clone https://github.com/Foufou-exe/homebox-clipper.git
cd homebox-clipper
bun install
bun run build      # → .output/chrome-mv3/ and .output/firefox-mv3/
```

Then in `chrome://extensions`: enable **Developer mode**, click **Load unpacked** and select
`.output/chrome-mv3/`. Full guide:
[Installation](https://github.com/Foufou-exe/homebox-clipper/wiki/Installation).

## Quick setup

1. In HomeBox: **Profile** → **API keys** → create a key (preferably a dedicated one, with an
   expiry date).
2. In the extension (⚙ / *Options*): enter your instance address, the API key and a
   **passphrase** (at least 10 characters, impossible to recover if forgotten), then
   **Test and save**.
3. Open the detail page of an order at a supported merchant, then open the extension.

HTTPS is required, except for a local network address (HTTP accepted with a warning), e.g.
`https://homebox.example.com` or `http://localhost:3100`.
Details: [Configuration](https://github.com/Foufou-exe/homebox-clipper/wiki/Configuration) and
[Usage](https://github.com/Foufou-exe/homebox-clipper/wiki/Usage).

## Documentation

All the details are in the **[wiki](https://github.com/Foufou-exe/homebox-clipper/wiki)**:
[Installation](https://github.com/Foufou-exe/homebox-clipper/wiki/Installation),
[Configuration](https://github.com/Foufou-exe/homebox-clipper/wiki/Configuration),
[Usage](https://github.com/Foufou-exe/homebox-clipper/wiki/Usage),
[Security and privacy](https://github.com/Foufou-exe/homebox-clipper/wiki/Security-and-privacy),
[Troubleshooting and FAQ](https://github.com/Foufou-exe/homebox-clipper/wiki/Troubleshooting-and-FAQ),
[Architecture](https://github.com/Foufou-exe/homebox-clipper/wiki/Architecture).

## Contributing

Contributions are welcome: misdetected pages, new merchants, fixes.

```bash
bun run setup        # dependencies, local HomeBox instance .env, pre-push hook (optional)
bun run homebox:up   # HomeBox on http://localhost:3100
bun run dev
```

Before every push, run `bun run ci` (the same check runs on GitHub for pull requests). Project rules,
development container and workflow: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Community

Questions, ideas, or just want to say hello? Join the **[Discussions](https://github.com/Foufou-exe/homebox-clipper/discussions)**: ask for help in Q&A, suggest ideas, show your setup. Please read the **[Code of Conduct](CODE_OF_CONDUCT.md)**, and see **[SUPPORT.md](SUPPORT.md)** for where to go for what.

## Changelog

Notable changes are listed in **[CHANGELOG.md](CHANGELOG.md)**.

## Security

To report a vulnerability, follow **[SECURITY.md](SECURITY.md)** (no public issue).

Privacy: see the **[privacy policy](PRIVACY.md)**.

## Credits

- The logo reuses the [HomeBox](https://github.com/sysadminsmedia/homebox) box
  (© HomeBox contributors, AGPL-3.0 license), unmodified, with a "+" badge specific to
  homebox-clipper added (`src/assets/logo.svg`).
- The interface colors are those of HomeBox's default theme.
- Line icons inspired by [Feather Icons](https://feathericons.com) (MIT).

## License

Code released under the **[MIT license](LICENSE)**. The logo derived from HomeBox stays under AGPL-3.0 (see Credits).

---

<sub>homebox-clipper is an independent project, not affiliated with Amazon or the HomeBox team.</sub>
