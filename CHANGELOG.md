# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [SemVer](https://semver.org) versioning. The change types (`Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security`) keep their standard names.

## [Unreleased]

### Added

- Bilingual English/French interface following the browser language (English by default, French if the browser is in French); the note written in HomeBox follows the interface language ("Amazon.fr order: <number>" in English), with no effect on duplicate detection.
- The product photo (Amazon.fr) is attached to the HomeBox item as its main image. A checkbox, ticked by default, lets you skip it; the result shows what happened to the photo for each product.
- Recovery of an import interrupted by the extension's service worker stopping: the import becomes retryable again, without recreating the item or sending the photo twice. In-progress imports are kept in session memory: they are lost when the browser closes and when the extension is updated (check in HomeBox then). If an item's creation is uncertain (lost response, stop during the upload), the retry first looks for an item with the same name in HomeBox and refuses to retry if it finds one; this check reduces the risk of duplicates without eliminating it.
- Location choice: a single "Location (optional)" field for one product, or "Location for the products" above the list when the order has several, with a "Same location as the other products" note per product (list of the instance's existing locations, with case- and accent-insensitive search, full path shown to tell namesakes apart) and per-product editing, with a way back to the order-wide choice. The location is read from the configured instance; the extension never creates, renames or deletes any. Without a choice, the item is created as before.
- Last location remembered per instance: it is preselected on the next import ("Clear" empties it). Only an identifier is kept in `storage.local` (no location name); it is erased with "Delete settings".
- If the chosen location has disappeared from HomeBox at upload time, no item is created: a new choice or an import without a location is offered.

### Fixed

- Location picker: on a prefilled field, typing starts a search instead of being appended to the displayed path; the list opens on click and on focus; "oeuvres" finds "Œuvres"; the product name is part of the accessible label of per-product pickers; the "Change" button meets the 4.5:1 contrast ratio in both themes.
- A malformed internal message now gets a `BAD_MESSAGE` reply instead of going unanswered.
- If HomeBox answers the creation successfully but the response is unreadable or has no identifier, the creation is treated as uncertain: the retry first looks for an item with the same name instead of recreating it.
- Amazon.fr: the product image and the "Invoice" button are detected again on the current order detail page (image in the left column, "Invoice" menu loaded via `data-a-popover`).
- Amazon.fr: the quantity shown in the image column badge (items ordered in several copies) is read instead of falling back to 1.

### Changed

- **Action required:** the project is renamed **homebox-clipper** (display name "HomeBox Clipper") to avoid confusion with another project of the same name; update the repository address (`git remote set-url origin …/homebox-clipper.git`).

## [0.1.0] - 2026-10-29

### Added

- Amazon.fr MVP: detection of an order detail page, confirmation before any import.
- 3-step import into HomeBox, with recovery after interruption.
- Download and attachment of the PDF invoice.
- Duplicate detection.
- API key encryption with a passphrase, with extension locking (PR #1).
- HomeBox-colored interface: light, dark and automatic themes, new logo (PR #6).
- Local HomeBox environment via Docker Compose and local testing guide (PR #3).
- Contribution environment (devcontainer, development configuration) and contribution guide (PR #7, #8).
- `bun run ci` command: local check equivalent to CI (PR #4).
- Translatable interface: all texts go through `t()` keys and a single French catalog `src/locales/fr.yml` (PR #9).
- `MERCHANTS.md`: list of supported, planned and requested merchants, checked by a test against the `src/content/merchants/registry.ts` registry.
- Project wiki in `docs/wiki/` (installation, configuration, architecture, adding a merchant, troubleshooting…), publishable with `bun run wiki:publish`.
- Issue templates (bug, feature idea, merchant detection, merchant request), labels in `.github/labels.yml` and `SECURITY.md`.
- `bun run check:config`: validation of the settings files and issue templates, run at the start of `bun run ci`.
- `bun run release:notes`: extraction of a version's notes from `CHANGELOG.md`.

### Changed

- **Action required:** set a passphrase on first launch; the existing API key is migrated to encrypted storage (PR #1).
- **Action required:** single build; remove the old "homelab" extension from the browser, then reconfigure the extension (PR #5).
- HTTP is only accepted for local network addresses; HTTPS is required elsewhere (PR #5).
- The HomeBox note of an imported item ("Commande Amazon.fr : <number>") is built from the translation catalog (PR #9).
- `README.md` rewritten as a short, multi-merchant version; the details are in the wiki.
- Issue templates generalized to all merchants (the old "misdetected page" template is replaced).

### Fixed

- The HomeBox client was missing from commits because of an overly broad `.gitignore` rule (PR #2).

### Security

- API key encrypted at rest (AES-GCM, PBKDF2 derivation with 600,000 iterations, bound to the instance URL) (PR #1).

[Unreleased]: https://github.com/Foufou-exe/homebox-clipper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Foufou-exe/homebox-clipper/releases/tag/v0.1.0
