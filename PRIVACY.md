**English** | [Français](PRIVACY.fr.md)

# Privacy policy

**homebox-clipper** (the "extension", published as "HomeBox Clipper") · Effective date: **22 November 2026**

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
| Purchase details read from the order page of a supported Amazon store (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) you have open: product name, price, quantity, purchase date, order number, seller, order page address, product photo address | The "Order Details" page of that Amazon store, read **only when you open the extension** on that tab | Pre-fill the summary you review and edit | Shown in the popup; sent to **your HomeBox instance** after you confirm (except the duplicate search described in the next row) |
| Order number and up to 3 words of the name of each checked product | The summary you review | Flag items already in your inventory or with a similar name | Searched on **your HomeBox instance** as soon as you click "Add", before you choose in the duplicate window and even if you then cancel; nothing is stored or logged; no other recipient. If the order-fields option is on, the order number is also sent as a custom-field filter to **your HomeBox instance**, and at most 5 existing items with the same name may be read back to confirm; still nothing stored or logged, no other recipient |
| The HomeBox item you choose to complete instead of creating a duplicate (its name, quantity, notes, custom fields, tags, attachment names, purchase and warranty values) | **Your HomeBox instance**, read only after you choose "Complete" in the duplicate window, then again just before the update | Compute and show what completing the item would add, then write only the additions you confirmed, never overwriting a value already set | Read and then updated **on your HomeBox instance only**, after you confirm; nothing of the item is stored outside the import in progress or logged; no other recipient. The import history only records that the item was "completed" |
| PDF invoice | Downloaded only from the origin of the store of the order (for example `https://www.amazon.de`), with your own session on that store, or a PDF you pick from your computer | Attach it to the HomeBox item | Sent to your HomeBox instance after you confirm |
| Product photo | Downloaded from Amazon's image server (`m.media-amazon.com`) without cookies, referrer or API key, only if its box is checked | Attach it as the item's main image | Sent to your HomeBox instance after you confirm; never kept by the extension |
| HomeBox instance address and display name (1 to 10 instances) | You enter them in the settings | Know where to send the import; tell the instances apart | Stored locally in the browser (`homeboxInstances`) |
| HomeBox API key, one per instance | You enter it in the settings | Authenticate requests to that instance | Stored **encrypted** locally (AES-GCM 256, key derived from your passphrase with PBKDF2-SHA256, 600,000 iterations, the address of the instance bound to its key); sent only to **its own** instance |
| Passphrase | You choose it | Encrypt and unlock the API keys: a single passphrase protects the keys of every instance | **Never stored** |
| HomeBox location list and last location used (identifiers only) | Your HomeBox instance | Let you choose where the item is filed | Read from your instance; identifiers kept locally |
| Warranty proposed with each item (expiry date, lifetime flag, details), calculated from the purchase date, and the default-warranty setting (on/off, duration) | The extension and you | Fill the warranty fields of the HomeBox item | The warranty is sent to your HomeBox instance after you confirm and is never kept by the extension once the import is done; the setting is stored locally (no personal data) |
| Suggested HomeBox tags (the store brand, for example "Amazon", and the tags of your own rules) and the tags you check in the summary | The extension, your rules and you | Tag the item in HomeBox | Read from and, for a tag that does not exist yet, created on **your HomeBox instance** (`GET`/`POST /api/v1/tags`); tags are created and applied only after your confirmation, and only the checked ones. Kept only with the import in progress (`storage.session`), never in the import history |
| Automatic-tag setting (`tagSettings`: whether to suggest the store name, and your rules "the product name contains … → tag …") | You | Suggest tags in the summary | Stored locally in `storage.local`, in clear (no secret, no purchase data), never in `storage.sync` |
| HomeBox item templates chosen in the summary (template, its default values and the custom field values you confirm) and the default item template of each instance (identifier and name of the template, `defaultTemplateByInstance`) | Your HomeBox instance and you | Create the item from the template with exactly the values shown | The templates and their values are read only from the HomeBox instance you chose and sent only to it, after your confirmation; the template chosen and its values are kept only with the import in progress (`storage.session`), never in the import history. Nothing of a template is kept after the import except this default (identifier and name, stored locally, erased with the instance or the settings). No template name, field name or field value is written to the logs |
| HomeBox item type chosen in the summary (the types of your instance, read read-only) and the identifier of the last item type used with each instance (`lastEntityTypeByInstance`, an identifier only, never a name), erased with the instance or the settings | Your HomeBox instance and you | Create each item with the type you chose, instead of the default one | The types are read only from the HomeBox instance you chose (`GET /api/v1/entity-types`) and the identifier of the type you chose is sent only to it, after your confirmation; a type is never created, changed or deleted. The identifier of the last item type used is kept locally in `storage.local`; the type chosen is otherwise kept only with the import in progress (`storage.session`), never in the import history. No type name or identifier is written to the logs |
| Order details saved as HomeBox custom fields (order number, merchant, order page address) and the order-fields setting of each instance (the option and the three field names, `orderFieldsByInstance`), erased with the instance or the settings | The order page, your settings and you | Store the order as HomeBox custom fields, only when you turn the option on for that instance (off by default) | The order fields (order number, merchant, order page address) are written only to the HomeBox instance you chose, after your confirmation; their values are kept only with the import in progress (`storage.session`), never in the import history, and the item notes stay the same. The names of the existing custom fields of the instance are read for the suggestions, never their values, and are never kept. No field name or field value is written to the logs |
| Link to the order page on the imported item (the address of the merchant's order page, already written in the item notes) and the link setting of each instance (the option, `orderLinkByInstance`), erased with the instance or the settings | The order page, your settings and you | Add the order page as an external link on the HomeBox item, only when you turn the option on for that instance (off by default) and leave the box ticked for the product | The link points to the merchant's website and is written only to the HomeBox instance you chose, after your confirmation (the summary shows the address); it is then **stored in HomeBox**, where you manage how long it stays. The extension keeps only the option, and the address only with the import in progress (`storage.session`), never in the import history. No link address or title is written to the logs |
| Theme preference | You | Display | Stored locally |
| Automatic lock setting (`lockSettings`: when the browser closes, after 15 minutes, 1 hour or 4 hours of inactivity, or every time the extension is opened) | You | Decide when the passphrase is asked again | Stored locally; a choice only, no secret |
| Last time the extension was used while unlocked (`homeboxActivity`, a technical timestamp) | The extension | Apply the inactivity lock | Browser memory only (`storage.session`), never on disk; erased when the extension locks or the browser closes; never shown or logged |
| Version numbers: the version announced after an update (`updateNotice`) and the version the browser has ready to install (`updateReady`) | The extension and the browser | Show "Updated to vX" and the "Update now" button | `updateNotice` stored locally; `updateReady` in browser memory only (`storage.session`) |
| Import history: product name, store, order number, import and purchase dates, HomeBox instance address, item identifier, result (complete, partial, failed) and what is missing (invoice, manual, warranty, delivery note, documents, photo, purchase details) | Each import you confirm | Let you find an imported item, open it in HomeBox and spot an incomplete import | Stored locally, **encrypted with your passphrase**; never sent anywhere (on by default, can be turned off) |

The extension does **not** read your delivery address, your payment method, your browsing history or
any page other than the Amazon order page you open it on. The invoice PDF is sent as it is: it may
contain information printed by Amazon on the document, such as your name or address; it goes only to
your HomeBox instance.

## Several HomeBox instances

You can set up **several HomeBox instances** (1 to 10), for example one at home and one for a workshop, and
choose the target in the summary before confirming an import. They are stored locally as one list
(`homeboxInstances`): for each instance, its address, its display name, its API key encrypted, its masked key
and the result of its last connection test. **A single passphrase** protects every key; each key is encrypted
separately and can only be decrypted for the address of its own instance. Each instance has **its own access
permission**, limited to the **exact origin** of its address and asked when you add the instance; it is removed
as soon as no other instance uses it. The data of an import goes only to the instance you chose (a resume always
goes to the instance where the import started), never to another one. The last instance used for a successful
import (`lastInstanceId`, an identifier) is remembered to propose it next time.

Each import history entry carries an **opaque identifier** (`inst`, outside the encrypted content) of the
instance it was made to, so that its link opens the item in that instance and so that it can be erased with it.
This identifier says nothing about the instance by itself (no address, no name).

**Deleting an instance** (Settings → **Delete this instance**) erases its address, name, encrypted API key,
masked key, last connection test, last location, last item type, default item template, its history entries and its interrupted imports, and removes its
access permission if no other instance uses it. **Delete all settings** (from two instances on; **Delete
settings** with a single one) erases every instance and what is attached to them.

## Where the data is processed and stored

- **In your browser** (`storage.local`): the list of instances (`homeboxInstances`: addresses, display names,
  encrypted API keys, masked keys such as `hb_••••abcd`, results of the last connection test), the last instance
  used for a successful import (`lastInstanceId`), the last location used per instance, the default item template of each instance (identifier and name of the template, `defaultTemplateByInstance`, erased with the instance or the settings), the order-page-link setting of each instance (`orderLinkByInstance`: the option, erased with the instance or the settings), the identifier of the last item type used with each instance (`lastEntityTypeByInstance`, erased with the instance or the settings), the order-fields setting of each instance (`orderFieldsByInstance`: the option and the three field names, erased with the instance or the settings), theme, the default-warranty setting, the automatic-tag setting (`tagSettings`: store-name option and tag rules), and the
  import history (each entry encrypted with AES-GCM 256 under a random history key, itself sealed with
  your passphrase like the API key) with its on/off setting, the automatic lock setting
  (`lockSettings`) and the version of the last update notice (`updateNotice`).
- **In browser memory** (`storage.session`, cleared when the browser closes or the extension is
  locked, reloaded, updated or disabled): the decrypted API keys of the instances while the extension is unlocked, and
  the data of an import in progress so that it can be resumed after an error (without file contents),
  the time of the last use of the extension (`homeboxActivity`) and the version the browser has ready to install
  (`updateReady`).
- **On your HomeBox instance**: the items, invoices and photos you choose to import. Its retention and
  security are your responsibility.
- Nothing is placed in `storage.sync`. Nothing is stored on a server operated by the extension's
  author.

## No transfer to third parties

- The extension contacts only: (1) the Amazon store page you opened it on (its exact origin, for
  example `https://www.amazon.de`), to download your invoice, and Amazon's image server
  (`m.media-amazon.com`) for the product photo, at the moment of import; (2) **your** HomeBox
  instances, each one only for the operations that target it (an API key is never sent to another
  instance than its own). It never contacts another Amazon store than the one of the order.
- Suggested tags add **no new recipient**: the tag list is read from your HomeBox instance
  (`GET /api/v1/tags`) and missing tags are created there (`POST /api/v1/tags`) only after your
  confirmation. No request is made to the store for tags: the store brand comes from the extension itself.
- Prices are kept in the currency of the order: no exchange-rate service or other third party is
  contacted (no currency conversion).
- Your data and your API key are **never** sent to the author, to an intermediary server, to Amazon
  (the API key never leaves the extension towards Amazon) or to any other third party.
- There is no advertising, no analytics, no telemetry, no tracking and no sale of data.
- The extension loads no remote code.
- Nothing is imported automatically: every import requires your explicit confirmation.

## Automatic lock

You choose when the extension forgets the decrypted API key and asks for your passphrase again
(Settings → **Automatic lock**): **when the browser closes** (default), **after 15 minutes**, **after 1 hour**
or **after 4 hours** of inactivity, or **every time the extension is opened**. Inactivity means not using the
extension (popup, settings, import); an import in progress is never interrupted, the lock applies once it
ends. There is **no “never” option**: the decrypted key would then be readable by anyone or any software with
access to your browser profile. Whatever you choose, the key is **forgotten when the browser closes**, and
you can lock the extension at any time with the lock button. Without an extra permission, the browser does
not wake the extension at a fixed time: the lock is applied at the latest the next time the extension is
used after the deadline, before the key can be used. The setting itself contains no secret.

## Updates

The extension makes **no network request** to check for updates: it only uses the signal the browser
gives by itself when an update has been installed or is ready. After an update, a short notice
("Updated to vX") links to the release notes on GitHub; that page is opened by the browser **only if you
click** the link. When the browser (Chrome or Firefox) has an update ready, an **Update now** button restarts the extension (the
passphrase is then asked again); it is disabled while an import is running or can still be resumed. Updates of
an installation from the Chrome Web Store come from that store, those of an installation from Firefox Add-ons
(addons.mozilla.org) come from Firefox Add-ons; the extension itself never contacts either of them. A Firefox
installation loaded temporarily from a GitHub archive receives no update from the browser.

## Logs

The extension writes no personal data to the browser console: only error codes, HTTP statuses,
durations and generic endpoint templates, never an address, a product name, a price, an order number,
a tag name, the text of a tag rule or the API key.

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
- Local data stays until you delete it. **Settings → Delete this instance** erases one instance (see
  "Several HomeBox instances" above). **Settings → Delete settings** (**Delete all settings** with several
  instances) erases every instance (addresses, names, encrypted keys), the in-progress imports, the last
  locations, the last instance used, the import history, and removes the access permission granted to each
  instance. The automatic lock setting, the last update notice and the automatic-tag setting (`tagSettings`, no personal data) are kept. Uninstalling the extension removes all its browser storage: in Chrome from `chrome://extensions`, in Firefox
  from `about:addons` (**Remove**).
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

## Firefox Add-ons (addons.mozilla.org)

The extension is also built for Firefox (version 140 or later, desktop) and can be published on Firefox
Add-ons (addons.mozilla.org). **The commitment is the same as above and nothing is weakened**: the data is
used only to provide the single purpose of the extension (importing a purchase into your HomeBox instance), is
not transferred to third parties, is not used for advertising or credit assessment, is not read by humans, and
the extension has no server, no account, no analytics and no telemetry.

- **Data collection declaration.** Firefox asks every extension to declare, in its manifest
  (`data_collection_permissions`), the data it collects or transmits. HomeBox Clipper declares one required
  category: `websiteContent` (website content). It means that the text and the product photo of the
  Amazon order page you open, and the invoice PDF, are read at your click and leave the browser **only towards
  your own HomeBox instance**, after you confirm the import. Nothing goes to the author or to any third party,
  and there is no telemetry; the declaration describes this single flow, not a data transfer to us.
- **Access to websites.** No access to any website is granted at installation. The extension reads the active
  tab only at your click, and asks for access to the **exact origin** of each HomeBox instance when you add it.
  In Firefox you can remove that access at any time in `about:addons` › the extension › **Permissions**; the
  effect is the same as removing it in Chrome: the extension can no longer reach that instance until you grant
  access again (the settings then offer to request access again).
- **Private windows.** Firefox does not run extensions in private windows unless you allow it
  (`about:addons` › the extension › **Run in Private Windows**). The data handling is the same if you do.
- **Uninstalling.** In `about:addons`, **Remove** deletes the extension and its local data, as `chrome://extensions`
  does in Chrome (see "Retention and deletion").

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
