# Troubleshooting and FAQ

This page lists **all the error messages** of the extension (the `error.*` catalog of
`src/locales/en.yml`, English being the default language), with their probable cause and the fix. If your
browser is set to French, the same messages appear in French (`src/locales/fr.yml`); the codes are the
same. Messages are grouped by when they appear.

## Configuration

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| The HomeBox address is invalid or does not point to a HomeBox instance. | `INVALID_URL` | Mistyped address, with a username/password or a protocol other than http/https; or the address does not answer like HomeBox (HTTP error other than 401/403 during the connection test). | Check the address. In a tab, `<address>/api/v1/status` must return JSON. |
| An HTTPS address is required. | `INSECURE_URL` | The address uses `http://` and points to a public host. | Switch to HTTPS (reverse proxy), or use the instance's local address (private IP, name ending in `.lan`...). See [Configuration](Configuration.md). |
| Access to your HomeBox instance was denied. | `PERMISSION_DENIED` | You refused the browser's request, or the permission was removed (in Firefox: `about:addons` › the extension › **Permissions**). | Click "Test and save" again and accept. With several instances, use **Request access again** on the card of that instance. |
| The passphrase must be at least 10 characters long. | `WEAK_PASSPHRASE` | Passphrase too short. | Choose one of at least 10 characters. |
| This HomeBox instance no longer exists. Choose another one. | `INSTANCE_NOT_FOUND` | The instance was deleted (in another settings tab) after the summary was opened, or an interrupted import belongs to an instance that no longer exists. | Choose another instance in the summary. Nothing was sent. |
| You already have the maximum number of HomeBox instances. | `INSTANCE_LIMIT` | 10 instances are already set up. | Delete an instance you no longer use, then add the new one. |
| This address is already configured. | `INSTANCE_EXISTS` | The address is already used by another instance (after normalization: trailing `/`, host case, default port). | Use that instance, or change its address. |
| The name must be 1 to 50 characters long. | `INSTANCE_NAME_INVALID` | The display name is empty (when renaming) or longer than 50 characters. | Choose a name of 1 to 50 characters. |
| Another instance already has this name. | `INSTANCE_NAME_TAKEN` | Another instance already has this name (case ignored). | Choose another name. |
| An import to this instance is in progress. Try again when it ends. | `INSTANCE_BUSY` | An import to this instance is running. | Wait for the end of the import, then delete the instance. |
| The API key of this instance cannot be read. Enter it again. | `KEY_UNREADABLE` | The key of this instance cannot be decrypted with the right passphrase (damaged data); shown as **Key to re-enter**. The other instances keep working. | **Change the address or key** of this instance and enter its API key again. |
| Set up your HomeBox instance first. | `NOT_CONFIGURED` | No saved settings (or a key migrated without a passphrase). | Open the settings and fill in the address, key and passphrase. |

## Connection to HomeBox

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| HomeBox is unreachable. Check the address and your connection. | `HOMEBOX_UNREACHABLE` | Instance stopped, wrong port, VPN or firewall, the 15-second timeout was exceeded, or HTTPS not set up correctly. | Check that the instance is running and that the address opens in the browser and is showing secure. |
| Invalid or expired API key. | `UNAUTHORIZED` | Key revoked, expired, badly copied, or invalidated because the server secret (pepper) changed. | Create a new key in HomeBox and save it again. |
| Extension locked: enter your passphrase. | `LOCKED` | The browser restarted, the extension was updated, you clicked 🔒, or the automatic lock applied (**Settings → Automatic lock**). | Enter the passphrase in the popup. |
| The HomeBox collection chosen for this instance can no longer be reached with this key. … | `COLLECTION_UNAVAILABLE` | You left the collection chosen in **Target collection**, or it was deleted. The extension never imports elsewhere. | Open the settings of the instance and choose another collection, or **Default collection of the key**. |
| The collections of this HomeBox instance could not be read. | `COLLECTIONS_UNAVAILABLE` | Instance unreachable, or an older HomeBox version. | Try again; the default collection of the key keeps working. |
| The import works but **Open in HomeBox** does not show the item. | — | The item is in another collection than the one open in your browser (the default collection of the key). | Open the collection named in the result in HomeBox, or choose the target collection in the settings. |
| Incorrect passphrase. | `WRONG_PASSPHRASE` | Wrong passphrase (capital letters?). | Enter it again. If forgotten: "Delete settings" then set up again. |

If you are using HTTPS to connect to homebox, the certificate needs to be set up correctly. Adding an exception when visiting your homebox instance does not carry over to the service workers used by the extension.

## Detection on the page

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| No purchase detected on this page. | `NOT_AN_ORDER_PAGE` | A page other than "Order Details" (order list, product page), unsupported site, or injection impossible. | Open the **Order Details** page, or use manual entry ([Usage](Usage.md)). |
| Could not identify the product. Fill in the details manually. | `PRODUCT_NOT_FOUND` | The product name was not detected (changed layout) or is empty. | Type the name by hand (required field). Report the badly detected page. |
| No invoice detected. | `INVOICE_MISSING` | The order shows no invoice link (third-party seller, recent order). | Attach the PDF by hand, or create the item without an invoice. |

## Invoices and files

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| The document is not available yet for this order. | `INVOICE_UNAVAILABLE` | Common right after the order or with some third-party sellers; missing link or error response from Amazon. | Try again later, or attach the PDF by hand. |
| The document download was refused (Amazon session expired?). | `DOWNLOAD_REFUSED` | Amazon session expired, tab closed or reloaded, or link outside the origin of the store of the order (for example `www.amazon.de`). | Sign in to Amazon again, reload the page, then retry. |
| The file is not a PDF. | `NOT_A_PDF` | The link leads to an HTML page (for example "Order summary"), or the chosen file does not have the `%PDF-` signature. | Download the invoice and attach it by hand. |
| The file is larger than 15 MB. | `FILE_TOO_LARGE` | Document too large. | Compress the PDF or send only part of it. |
| Select the file to attach again to retry. | `MANUAL_FILE_REQUIRED` | Recovery of an import whose file was added by hand: file bytes are never kept. | Select the file again, then "Retry". |

## Import and duplicates

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| A similar item already exists in HomeBox. | `DUPLICATE_SUSPECTED` | At the summary: an item with the same name already has this order number in its notes (certain duplicate), or an item has a close name (similar items, whatever its origin: another order, another store, added by hand). When recovering an uncertain creation: an item with the same name already exists (the order number is not used, the item does not have it yet), including a product bought another time. | Open the item (link shown) and compare; continue only if that is intended. After a refused recovery: abandon, then restart from the summary, which asks for confirmation. |
| The duplicate check could not be performed. | `DUPLICATE_CHECK_FAILED` | The search in HomeBox failed, for every product or only some of them. Not blocking at the summary: the duplicate window lists the products that could not be checked, and the message stays visible on the result screen, during the import and with its result. **Blocking when recovering an uncertain creation** (no creation is sent). | At the summary: check by hand in HomeBox, then continue. During recovery: check in HomeBox whether the item exists, then retry or abandon. |
| Creating the item in HomeBox failed. | `CREATE_FAILED` | HomeBox refused or could not process the creation. Nothing was created. | Check the state of the instance, then "Retry the import". |
| The item was created but its purchase details were not saved. | `UPDATE_FAILED` | The update (price, date, seller, notes) failed after the creation. | "Retry the import": the existing item is completed, never recreated. |
| The item was created but sending a document failed. | `ATTACHMENT_FAILED` | Instance unreachable or HomeBox error while uploading the attachment. The popup also names the document ("The manual could not be sent."). | "Retry the document upload": a single item, with its documents. |
| The item was created but the link to the order page could not be added. | `ORDER_LINK_FAILED` | The option **Add a link to the order page** is on, and the external link could not be added after the creation (instance unreachable or HomeBox error). | "Retry the order link": only the link is sent, and a link already on the item is never added twice. |
| The item was created, but this HomeBox instance does not accept external links. | `ORDER_LINK_UNSUPPORTED` | The instance answered 404 to the external link route (HomeBox older than 0.26.0, or a proxy that blocks it). | Update HomeBox or turn the option off for this instance in the settings, then abandon or retry. |
| The chosen HomeBox item no longer exists. Nothing was changed. | `ITEM_NOT_FOUND` | You chose **Complete** an existing item, and it was deleted in HomeBox (or is no longer readable with this key) before the preview or before the update. Nothing was written and no item was created instead. | Go back to the summary, run the duplicate check again, then choose **Create a new item** or another item. |

## Product photo

The photo is never blocking: the item and the invoice are kept, and **Retry the photo upload** reruns only
the photo.

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| The photo could not be retrieved from the merchant's site. | `PHOTO_UNAVAILABLE` | Network, timeout, redirect, deleted image or an image server that refuses the request. | Try again; otherwise add the photo by hand in HomeBox. |
| The retrieved file is not a valid image: it was not uploaded. | `PHOTO_NOT_IMAGE` | The server returned a page or a refused format (SVG, GIF). | Add the photo by hand in HomeBox. |
| The photo is larger than 5 MB: it was not uploaded. | `PHOTO_TOO_LARGE` | Image heavier than the limit. | Add a smaller version by hand in HomeBox. |
| The item was created but uploading the photo failed. | `PHOTO_UPLOAD_FAILED` | HomeBox refused the photo, or the extension could not check that it was not already attached. | "Retry the photo upload"; check in HomeBox that the item does not already have its photo. |

If the item has two photos, a reused connection was cut right after the upload was processed and the
browser resent the request by itself. The extension deletes nothing in HomeBox: delete the extra photo in
HomeBox.

**Residual risk.** Recovery after a service worker stop only covers that stop: in-progress imports are
kept in `storage.session`, which is cleared when the browser closes and when the extension is updated. In
those cases, nothing is resumed; check in HomeBox whether the item was created.

When the response to the creation is lost (network, timeout) or the service worker stops during the
upload, the item may have been created without the extension knowing (HomeBox offers no idempotency key).
On recovery, the extension then looks in HomeBox for an item with the **same name** (the order number is
only written at the next step) and refuses to retry if it finds one, or if this search fails. This check
has limits: a false positive if you bought the same product another time (abandon, then check in HomeBox
first, then abandon and restart from the summary. Caution: the summary asks for confirmation only if an
item with the same name already contains the order number, so not for an item left incomplete: a second
item can then be created without a new confirmation); a duplicate is still possible if the item was
renamed or if the search does not see it; item, invoice and photo can be doubled in a rare network case:
if a connection is cut right after the upload, the browser may resend the request by itself, and the
extension then shows a success without knowing it. If in doubt, check in HomeBox; this protection cannot
be guaranteed 100%. The same applies when HomeBox answers the creation successfully but the response is
unreadable: the creation is then treated as uncertain and the recovery first looks for the item by its
name.

## Location

The location is never blocking, unless it has disappeared from HomeBox.

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| The list of locations could not be retrieved. | `LOCATIONS_UNAVAILABLE` | HomeBox unreachable, key refused or unexpected response when reading the locations. | Import without a location (put the item away afterwards in HomeBox), or check the connection in the settings then reopen the popup. |
| This location no longer exists in HomeBox. Choose another one or import without a location. | `LOCATION_NOT_FOUND` | The location was deleted in HomeBox between the choice and the submission. No item was created for this product. | Choose another location and retry, or **Import without a location**. |

If the list is empty, first create a location in HomeBox: the extension does not create any. The last
remembered location, if it no longer exists, is simply ignored.

## Tags

Tags are never blocking: the item is always created first.

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| The list of HomeBox tags could not be retrieved. | `TAGS_UNAVAILABLE` | HomeBox unreachable or unexpected response when reading the tags. In the summary, the tags are marked *not verified*; at import, the tags were not added. | Import anyway: the tags are matched when you confirm. If the result shows *Tags not added*, check the connection, then **Retry**. |
| The item was created but some tags could not be added. | `TAG_FAILED` | HomeBox refused to create or attach a tag (for example a tag deleted in the meantime). The item and its purchase details are kept. | **Retry**: only the missing tags are applied; tags already created are found again, never duplicated. |

Tags already on an item are always kept: the extension only adds tags, it never removes one.

## Internal

| Message shown | Code | Probable cause | Fix |
|---------------|------|----------------|-----|
| Internal extension error. | `BAD_MESSAGE` | Invalid internal message, import not found, or unexpected error. | Reload the extension (↻ in `chrome://extensions`) then reopen the page. If it persists, [open an issue](https://github.com/Foufou-exe/homebox-clipper/issues). |

## FAQ

**Does the extension send my data anywhere?** No: only to your HomeBox instance (and to the merchant to
read the page). See [Security-and-privacy](Security-and-privacy.md).

**Why does the extension ask for a passphrase?** To encrypt your API key on disk. It is requested again
each time the extension locks: when the browser closes by default, or according to **Settings → Automatic
lock**.

**Why is the passphrase asked again?** The extension locked: the browser was closed, the extension was
updated or reloaded, you clicked 🔒, or the automatic lock you chose applied (inactivity, or every opening).
Check **Settings → Automatic lock**.

**Why is there no "never" option?** The decrypted key would then be readable by anyone or any software with
access to your browser profile. The longest choice keeps it until the browser closes.

**I forgot my passphrase.** It cannot be recovered: delete the settings in the options page, then set up
the extension again. If you forgot it while several instances are set up, no key can be read any more: use
**Delete all settings**, then add your instances again (the import history is erased, as with a single
instance).

**Can I use several HomeBox instances?** Yes, up to 10, with a single passphrase. Add them in the settings and
choose the target in the summary. See [Configuration](Configuration.md#several-homebox-instances).

**Can I use an HTTP instance?** Yes, on the local network only. See [Configuration](Configuration.md).

**All my API keys are refused after HomeBox restarted.** The server secret (pepper) changed: put back the
old one, or recreate the keys. See [Local-HomeBox-instance](Local-HomeBox-instance.md).

**Does it work on Firefox?** Yes: Firefox 140 or later on desktop (Firefox for Android is not supported). See
[Installation](Installation.md#load-the-extension-in-firefox).

- **Private windows.** Firefox does not run extensions in private windows by default: allow it in
  `about:addons` › the extension › **Run in Private Windows**.
- **Access removed in `about:addons`.** If you remove the access to your instance in `about:addons` ›
  the extension › **Permissions**, the extension shows the "access denied" message and **Request access again**:
  click it and accept.
- **No "Update now" button after loading from GitHub.** A temporarily loaded add-on is not updated by the
  browser (see below).
- **An invoice cannot be downloaded.** The existing messages apply (`INVOICE_UNAVAILABLE`, `DOWNLOAD_REFUSED`,
  see the table above): sign in to Amazon again and retry, or attach the PDF by hand.

**Differences between Firefox and Chrome.**

- The archive from GitHub (`-firefox.zip`) is not signed by Mozilla: it can only be loaded temporarily
  (`about:debugging`) and is removed when Firefox restarts. A durable installation comes from Firefox Add-ons.
- The **Update now** button appears only for an installation from Firefox Add-ons, not for a temporary loading.
- Private windows must be allowed by the user.
- Firefox for Android is not supported.
- The same permissions and the same behaviour otherwise: one build per browser, no extra access.

**My merchant's site is not supported.** See [Supported-merchants](Supported-merchants.md).

**The extension stopped detecting my Amazon orders.** Amazon probably changed its layout. Use manual entry
and report the problem without attaching the raw page. On the code side, the fix only touches
`src/content/merchants/amazon/selectors.ts` (or `amazon/page-locales.ts` for a label or a month name of a
page language) ([Architecture](Architecture.md)).

**In which language does the extension appear?** In English, unless the browser's interface language is
French. See [Translations](Translations.md).
