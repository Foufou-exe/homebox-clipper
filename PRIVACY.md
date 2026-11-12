**English** | [Français](PRIVACY.fr.md)

# Privacy policy

**homebox-clipper** (the "extension", published as "HomeBox Clipper") · Effective date: **12 November 2026**

In short: the extension has **no server, no account, no analytics and no telemetry**. The data it
handles goes from your browser to **your own** HomeBox instance, only when you click "Add to HomeBox",
and nowhere else. The author of the extension never receives any of your data.

## Who is responsible

The extension runs entirely in your browser. There is no service operated by the author. The data you
send to your HomeBox instance is stored by **that instance, which you (or whoever hosts it for you)
control**; you are the controller of that data. Project page:
<https://github.com/Foufou-exe/homebox-clipper>.

## Data the extension handles

| Data | Source | Purpose | Where it goes |
|------|--------|---------|---------------|
| Purchase details read from the order page of a supported Amazon store (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) you have open: product name, price, quantity, purchase date, order number, seller, order page address, product photo address | The "Order Details" page of that Amazon store, read **only when you open the extension** on that tab | Pre-fill the summary you review and edit | Shown in the popup; sent to **your HomeBox instance** after you confirm |
| PDF invoice | Downloaded only from the origin of the store of the order (for example `https://www.amazon.de`), with your own session on that store, or a PDF you pick from your computer | Attach it to the HomeBox item | Sent to your HomeBox instance after you confirm |
| Product photo | Downloaded from Amazon's image server (`m.media-amazon.com`) without cookies, referrer or API key, only if its box is checked | Attach it as the item's main image | Sent to your HomeBox instance after you confirm; never kept by the extension |
| HomeBox instance address | You enter it in the settings | Know where to send the import | Stored locally in the browser |
| HomeBox API key | You enter it in the settings | Authenticate requests to your instance | Stored **encrypted** locally (AES-GCM 256, key derived from your passphrase with PBKDF2-SHA256, 600,000 iterations); sent only to your instance |
| Passphrase | You choose it | Encrypt and unlock the API key | **Never stored** |
| HomeBox location list and last location used (identifiers only) | Your HomeBox instance | Let you choose where the item is filed | Read from your instance; identifiers kept locally |
| Theme preference | You | Display | Stored locally |
| Import history: product name, store, order number, import and purchase dates, HomeBox instance address, item identifier, result (complete, partial, failed) and what is missing (invoice, photo, documents, purchase details) | Each import you confirm | Let you find an imported item, open it in HomeBox and spot an incomplete import | Stored locally, **encrypted with your passphrase**; never sent anywhere (on by default, can be turned off) |

The extension does **not** read your delivery address, your payment method, your browsing history or
any page other than the Amazon order page you open it on. The invoice PDF is sent as it is: it may
contain information printed by Amazon on the document, such as your name or address; it goes only to
your HomeBox instance.

## Where the data is processed and stored

- **In your browser** (`storage.local`): instance address, encrypted API key, masked key (for example
  `hb_••••abcd`), result of the last connection test, last location used per instance, theme, and the
  import history (each entry encrypted with AES-GCM 256 under a random history key, itself sealed with
  your passphrase like the API key) with its on/off setting.
- **In browser memory** (`storage.session`, cleared when the browser closes or the extension is
  locked, reloaded, updated or disabled): the decrypted API key while the extension is unlocked, and
  the data of an import in progress so that it can be resumed after an error (without file contents).
- **On your HomeBox instance**: the items, invoices and photos you choose to import. Its retention and
  security are your responsibility.
- Nothing is placed in `storage.sync`. Nothing is stored on a server operated by the extension's
  author.

## No transfer to third parties

- The extension contacts only: (1) the Amazon store page you opened it on (its exact origin, for
  example `https://www.amazon.de`), to download your invoice, and Amazon's image server
  (`m.media-amazon.com`) for the product photo, at the moment of import; (2) **your** HomeBox
  instance. It never contacts another Amazon store than the one of the order.
- Prices are kept in the currency of the order: no exchange-rate service or other third party is
  contacted (no currency conversion).
- Your data and your API key are **never** sent to the author, to an intermediary server, to Amazon
  (the API key never leaves the extension towards Amazon) or to any other third party.
- There is no advertising, no analytics, no telemetry, no tracking and no sale of data.
- The extension loads no remote code.
- Nothing is imported automatically: every import requires your explicit confirmation.

## Logs

The extension writes no personal data to the browser console: only error codes, HTTP statuses,
durations and generic endpoint templates, never an address, a product name, a price, an order number
or the API key.

## Retention and deletion

- **Import history**: at most **200 entries** and **12 months** are shown; older entries are deleted when
  you open the history or import a purchase with the extension unlocked (until then they stay encrypted
  and unreadable). It is **encrypted with your passphrase**, like the API key: it is **unreadable while the
  extension is locked**, and it **cannot be recovered** if you forget the passphrase. It never contains the
  API key, your delivery address, your payment method, invoices or photos, nor the address of the Amazon
  page. You can erase it at any time, even while locked: **Delete** on one entry, **Clear all**, or turn
  the history off in the settings (which erases it). **Delete settings** erases it too. Setting up the
  extension again with a new passphrase while it is locked erases it (a warning is shown before).
  Uninstalling the extension removes it.
- Local data stays until you delete it. **Settings → Delete settings** erases the address, the
  encrypted key, the in-progress imports, the last locations, the import history, and removes the access permission granted
  to your instance. Uninstalling the extension removes all its browser storage.
- You can also revoke the API key in HomeBox at any time.
- Items already imported belong to your HomeBox instance: delete them there.
- The author holds no copy of your data, so there is nothing to erase on their side.

## Your rights (GDPR)

Because the author does not receive or hold your data, there is no data held by the author to access,
correct or delete. Your data is under your control, in your browser and on your HomeBox instance, where
you can access, correct, export or delete it at any time. If you still have a question or a request
concerning this policy, contact us as described below. You also have the right to lodge a complaint
with your data protection authority (in France, the CNIL).

## Chrome Web Store User Data Policy (Limited Use)

The use of information received by homebox-clipper complies with the Chrome Web Store User Data Policy,
**including the Limited Use requirements**. Data is used only to provide the single purpose of the
extension (importing a purchase into your HomeBox instance), is not transferred to third parties, is
not used for advertising or credit assessment, and is not read by humans.

## Security

The API key is protected as described in the
[Security and privacy](https://github.com/Foufou-exe/homebox-clipper/wiki/Security-and-privacy) page.
To report a vulnerability, follow [SECURITY.md](SECURITY.md) (no public issue).

## Changes to this policy

Changes are published in this file, with an updated effective date; its history is visible in the
repository. A change that alters how data is handled will be announced in the release notes.

## Contact

For any question about this policy, open an issue on
<https://github.com/Foufou-exe/homebox-clipper/issues> (never include an API key, an instance address
or personal data), or for a security matter follow [SECURITY.md](SECURITY.md).

---

<sub>homebox-clipper is an independent project, not affiliated with Amazon or the HomeBox team.</sub>
