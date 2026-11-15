# Security and privacy

The HomeBox API key gives access to your whole inventory: protecting it is the project's central
principle. This page describes what the extension does, what it does not do, and its limits. To report a
vulnerability, see the [security policy](https://github.com/Foufou-exe/homebox-clipper/blob/main/SECURITY.md).

## What the API key never does

- It is **never sent to Amazon** (or to any other merchant).
- It is **never sent to an intermediary server**: there is none, and no usage statistics or telemetry
  exist. The extension contacts only the merchant (to read the page and download the invoice with your
  session) and **your** HomeBox instance.
- It is **never written to logs**.
- It is **never included in the source code** (neither in versioned files nor in test fixtures).

## Threat model

| Threat | Protection |
|--------|------------|
| A file of the Chrome profile is read (disk copy, backup) | The key is stored only **encrypted** (AES-GCM 256, key derived from your passphrase with PBKDF2-SHA256, 600,000 iterations, random salt and IV) in `storage.local`. The import history is encrypted too (see [Import history](#import-history)): only the number of entries and their approximate size can be seen. |
| Someone edits the stored address to divert the key to another server | The instance address is used as **associated data** for the encryption: changing it without the passphrase makes decryption impossible. |
| A web page (Amazon) tries to read the key | Only the **service worker** uses the key. The script injected into the page has access to neither storage nor the settings, and no message addressed to it contains the address or the key. |
| A page script tries to call the service worker | Messages are **typed and validated** on reception; those touching settings, unlocking, detection and imports are refused unless they come from an extension page (popup, options). |
| The key is sent to the wrong host | The `Authorization: Bearer` header is added only to requests whose address starts with the configured address. |
| Eavesdropping on the local network over HTTP | HTTP is accepted only for the local network, with the "Unencrypted HTTP" warning; HTTPS is required for any public address. |
| Creation of unwanted items | No write to HomeBox without a click on "Add to HomeBox"; all fields can be edited before sending. |
| Booby-trapped image URL (modified merchant page) | The URL is checked twice (at extraction, then in the service worker): `https`, host **strictly equal** to the merchant's (`m.media-amazon.com`), no port or credentials. Redirects refused. |
| Booby-trapped file passed off as a photo (HTML, SVG, GIF) | Only JPEG, PNG and WebP (byte signature checked) of 5 MB at most are sent; the type sent comes from the signature, not from the response header. |
| Booby-trapped file passed off as an invoice | Only real PDFs (`%PDF-` signature) of 15 MB at most are sent; download limited to the exact origin of the Amazon store of the order (for example `https://www.amazon.de`); a link to another store or site is refused. |

## Where data is stored

| Data | Location | Lifetime |
|------|----------|----------|
| Instance address, **encrypted** API key, masked key (`hb_••••abcd`), result of the last test | `storage.local` | Until "Delete settings" or uninstallation |
| **Decrypted** API key | `storage.session` (memory) | Until locking (🔒), browser close, or extension reload, update or disabling |
| Passphrase | **Nowhere** | Never saved |
| In-progress imports (purchase data needed for a recovery) | `storage.session` (memory) | Erased as soon as the import succeeds or is abandoned; without file bytes. Only a minimal, **encrypted** extract is kept in the import history (next row) |
| Import history (`importHistory:<id>`, one **encrypted** envelope per product) and its on/off setting (`importHistorySettings`) | `storage.local` | At most 200 entries and 12 months; erased by "Clear all", turning the history off, or "Delete settings" (the on/off setting is kept) |
| History key, **sealed** with the passphrase (in the configuration) / **open** (next to the decrypted API key) | `storage.local` / `storage.session` (memory) | Like the API key |
| Photo URL of an in-progress import | `storage.session` (memory) | Erased with the import (success or abandon); **never the image bytes** |
| Last location used, per instance (`lastLocationByInstance`): **identifiers only**, never a location name | `storage.local` | Until "Delete settings" (erased with it) or uninstallation |
| Chosen theme | `storage.local` | Display preference |

No data is placed in `storage.sync`.

## Import history

The extension keeps a short history of the imports you confirmed, **only in this browser**:

- **Stored**, per product: name, store identifier, order number, import and purchase dates, instance
  address, item identifier, result (complete, partial, failed, in progress) and what is missing (purchase
  details, invoice, manual, warranty, delivery note, documents, photo), with an error **code** for a failure.
- **Never stored**: the API key, your delivery address, your payment method, invoice or photo contents,
  the address of the Amazon page, the photo address, the price, the seller, the description or the
  location.
- **Encryption**: each entry is encrypted with AES-GCM 256 under a random 256-bit **history key**, with a
  fresh random IV at every write and the storage key as associated data. Nothing about an entry (date,
  status, store) is stored in clear. The history key is sealed with the **same** passphrase-derived key
  as the API key (PBKDF2-SHA256, 600,000 iterations): a single derivation per unlock. While unlocked, the
  open history key sits in session memory next to the API key, and leaves with it.
- **Locked**: the history cannot be read; the extension says "History locked". Deleting an entry,
  "Clear all" and turning the history off still work (they delete encrypted data without reading it).
- **Forgotten passphrase**: the history cannot be recovered, like the API key. Setting up the extension
  again with a new passphrase while it is **locked** erases it; the settings page warns before sending.
  While **unlocked**, changing the passphrase keeps it.
- No log, no network request, no new permission. The `history/*` messages are refused unless they come
  from an extension page.
- Pruning (200 entries, 12 months) needs the key, since the dates are encrypted: it runs when the
  history is opened and at each new import, while the extension is unlocked. Unlocking alone does not
  prune. The list is pruned before it is shown, so an entry beyond the limits is never displayed.

## Manifest permissions

| Permission | Why |
|------------|-----|
| `storage` | Remember the address, the encrypted key, the theme and the state of in-progress imports. |
| `activeTab` | Read the Amazon tab **only when you open the extension**. No permanent access to Amazon. |
| `scripting` | Inject the detection code into that tab, at that moment. |
| Access to your instance (**optional**, `https://*/*` and `http://*/*`) | Requested at runtime for **the exact origin** you configure, removed when you delete the settings. The wildcard is never granted wholesale; the restriction of HTTP to the local network is enforced by the code. |

The manifest declares neither static `host_permissions` nor static content scripts, and its content
security policy forbids `eval` and remote code. `bun run test:build` checks these points on the
production build.

## The product photo

- The image request to the merchant's server is an **anonymous GET**: no cookies, no `Referer` header, no
  API key, to the merchant's exact host only. It is made by a module separate from the HomeBox client
  (`src/background/import/photo-fetch.ts`), which has no access to the key.
- The photo is read only after your click on "Add to HomeBox", and only if its box is checked.
- The bytes are **never kept** (neither in `storage.session` nor in `storage.local`); a recovery
  downloads the photo again.
- **No permission is added** to the manifest for this.
- **No image URL is written to logs** (only a template, a status and a duration are).
- The popup shows the thumbnail from the merchant's image server: this is the only image request made
  before your confirmation, and it is made by your browser, as on Amazon's page.

## The location

- The list of locations is a **read** (`GET /entities/tree`) on the instance you configured, with the API
  key, like the other calls: nothing is sent elsewhere.
- `location/*` messages are reserved for extension pages (popup, options), never for scripts injected
  into a merchant page.
- `storage.local` contains only identifiers (`lastLocationByInstance`); they are erased with the
  settings.
- **No location name or path is written to logs.**
- **No permission is added** to the manifest for this.

## Logs and personal data

The only access point to the console is `src/shared/logger.ts`. Its signature is closed: it accepts only
error codes, HTTP statuses, durations and an endpoint **template** (for example
`POST /entities/{id}/attachments`), never a real address, a product name, a price or an order number.
Debug logs are emitted only in development mode; in production only a generic warning ("handler threw"
and the message type) is emitted. An ESLint rule forbids `console.*` elsewhere.

Only the fields listed in [Usage](Usage.md) are read from the order page: never your delivery address or
your payment method.

## Limits to know about

- **Unlocked extension**: the key is then in memory. Malicious software controlling your browser session
  can read it, as with any unlocked password manager. Encryption protects the profile files and the
  **locked** extension.
- **Weak passphrase**: the minimum is 10 characters; a short or guessable passphrase weakens the
  encryption. Prefer a long passphrase.
- **Local HTTP**: on a network where other machines are hostile, the key can be intercepted. Use HTTPS.
- **Lost passphrase**: no recovery is possible, by design (for the API key and the import history).
- **Import history**: the number of entries is visible on disk; entries beyond the limits (older than
  12 months, or past the 200th) stay encrypted on disk until the history is opened or an import is made
  with the extension unlocked, which prunes them. In the "unavailable" state (history key unreadable, or
  key migrated without a passphrase), nothing is pruned until the extension is set up again with a
  passphrase, which erases them; "Clear all" works at any time.
- **Dedicated key**: create in HomeBox a key reserved for the extension, with an expiration date, to limit
  the impact of a leak.

To go further on the implementation: `src/background/config/key-vault.ts` (encryption),
`config-store.ts` (storage) and `url-policy.ts` (addresses), detailed in [Architecture](Architecture.md).
