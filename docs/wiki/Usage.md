# Usage

Prerequisite: the extension is [installed](Installation.md) and [configured](Configuration.md), and
unlocked (it stays unlocked until it locks again, see [Automatic lock](#automatic-lock)).

## Import an Amazon purchase

1. On your Amazon store (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk or .com), open your orders,
   then the order details page ("Order Details"). The page may be in the main language of the store or
   in English (French or Dutch on Amazon.com.be).
2. Click the extension icon. Only at that moment does the extension inject its detection code into that
   tab (`activeTab` permission) and display the purchase summary.
3. Check and fix the fields: product name (required), description, purchase price, quantity, purchase
   date, order number, seller. Fields that were not detected are marked "not detected".
4. Review the documents to attach (detected invoice or local file). Each document has a type
   (*Invoice*, *Manual*, *Warranty*, *Delivery note* or *Order document*) that you can change on its row
   before confirming.
5. Each product has a **Warranty** section (see [Warranty](#warranty)): check it, change it or remove it.
6. For each product, the detected photo is shown (64 px) with the **Upload this photo with the item**
   checkbox, checked by default: uncheck it to send nothing. Without a photo, the summary says so.
7. Click **Add to HomeBox**. A message confirms the addition, with the **Open in HomeBox** link.

Nothing is written to HomeBox before this click. The popup always shows the targeted instance
("HomeBox: <address>"), with the "Unencrypted HTTP" label if it uses HTTP.

## What is created in HomeBox

| Summary information | HomeBox field |
|---------------------|---------------|
| Product name | Name |
| Description (default "Purchased on <store> on 22 October 2026", for example "Purchased on Amazon.de on 9 November 2026", date in the interface language) | Description |
| Quantity | Quantity |
| Unit price | Purchase price |
| Purchase date | Purchase date |
| Seller (default: the store, for example "Amazon.de") | Purchased from |
| Warranty expiry date | Warranty expires |
| **Lifetime warranty** box | Lifetime warranty |
| Warranty details | Warranty details |
| Order number and order page link | Notes ("<store> order: <number>", for example "Amazon.de order: ...", then the page address; "Order: <number>" in manual entry) |
| PDF invoice | Attachment of type **Receipt** |
| Manual added by hand | Attachment of type **Manual** |
| Warranty added by hand | Attachment of type **Warranty** |
| Delivery note | Attachment of type **Attachment**, with a name starting with `delivery-note-` (`bon-de-livraison-` in French) unless it already says so |
| Order document added by hand | Attachment of type **Attachment** |
| Product photo (box checked) | Attachment of type **Photo**, the item's primary image |

The item is created with HomeBox's default type, without a label. The location is the one you chose (see
[Choose the location](#choose-the-location)); without a choice, the item is created without a location.

## Warranty

**Indicative value, not legal advice.** The warranty proposed by the extension is an aid, calculated from the
**purchase date** (the law starts the legal guarantee at delivery, so the proposed date is a little shorter).
It does not guarantee any right: check it for the product (new or second-hand), the seller and the country.

Each product of the summary has a **Warranty** section, shown before you confirm and sent with the item:

- **Expires on** (a date), the **Lifetime warranty** box (it disables the date) and **Details**. Anything you type
  is kept as is: the date is recalculated when you change the purchase date only as long as you have not edited
  the warranty. **Remove the warranty** sends nothing; **Add a warranty** starts a new one.
- **Where it comes from** is always shown: *the legal guarantee of the store's country*, *the warranty shown on
  the order page*, or *entered by you*.
- **Legal guarantee, only when the item is sold by the store itself** and its country is one of **France,
  Germany, Italy, Belgium (2 years) and Spain (3 years)**. The durations come from the official texts of
  each country, listed in the project repository.
- **No default warranty** for Amazon.nl, Amazon.co.uk, Amazon.com, for an item sold by a third party (marketplace
  seller), for a store whose duration is not verified, or in manual entry: the section is empty, says why, and
  **Add a warranty** lets you enter one (it proposes the duration of your setting, or 2 years).
- **Warranty shown on the order page**: when a merchant displays one (a duration, a lifetime warranty or an
  extension), it is proposed instead of the legal one, unless it is shorter: the longest one wins and the
  details mention both. No Amazon page shows a warranty today.
- **Settings**: the **Warranty** card of the settings page turns the default warranty off and can set another
  duration (1 to 10 years). A duration replaces the legal one in the countries above and is used by **Add a
  warranty**; it never creates a default warranty elsewhere. A warranty shown on the order page is always proposed.
- The extension only changes items it created and never overwrites a warranty already filled in HomeBox.

## The product photo

The photo is retrieved from the merchant's server at import time (only if the box is checked), checked
(JPEG, PNG or WebP, 5 MB at most, based on the real content of the file) and then sent to HomeBox. It is
never kept by the extension. The result shows, per product: *Photo added.*, *Photo not requested.*, *No
photo available.* or *Photo upload failed.* If the photo fails, the item and its invoice are kept:
**Retry the photo upload** reruns only the photo, without recreating the item.

## Choose the location

The summary offers an optional location field: start typing (case and accents are ignored; "etagere"
finds "Étagère"), then pick from the list with the mouse or keyboard (arrows, Enter, Escape). Each
suggestion shows its **full path** ("Home › Garage"), which tells apart locations with the same name. A
HomeBox item has only one location.

- **A single product** (manual entry or a one-item order): a single field, **Location (optional)**.
- **Several products**: the **Location for the products** field, placed before the product list, applies
  to all checked products. Each product shows *Same location as the other products*.
- **A different location for one product**: **Change**, under that product, opens its own picker; this
  choice replaces the order's for that product only. **Use the order's location** goes back to the shared
  choice.
- **Last location**: the one from the last import that created at least one item on this instance is
  preselected; **Clear** empties the field (the item will be created without a location).
- **Empty or unavailable list**: if HomeBox has no location, or if the list could not be read, a message
  says so and the import remains possible without a location. Create the locations in HomeBox: the
  extension never creates, renames or deletes any.
- **Location gone**: if it was deleted in HomeBox between the choice and the submission, no item is
  created for that product. Choose another location and retry, or **Import without a location**.

## Tags

Each product of the summary has a **Tags** section, after the warranty. The extension suggests, already
checked: the store brand (for example "Amazon", the same for every Amazon store) and the tags of your own
rules whose text appears in the detected product name (rules and the store-name option are set in the
**Automatic tags** card of the settings, see [Configuration](Configuration.md#automatic-tags)).
Rules are evaluated once, when the summary opens: editing the product name does not change the suggestions.

- **Uncheck** a tag to leave it out; only the checked tags are sent, and only when you confirm. Closing the
  popup sends nothing and creates no tag.
- **Add a tag**: type in the field (case and accents are ignored: "ecran" finds "Écran"), then pick an
  existing HomeBox tag with the mouse or keyboard (arrows, Enter, Escape), or choose *Add "…" (new)*.
  Adding a tag already in the list checks it again instead of duplicating it.
- **new**: the tag does not exist in HomeBox yet; it is created once at confirmation, then attached.
- **not verified**: the HomeBox tag list could not be read (a warning is shown once); you can still import,
  the tags are matched or created when you confirm.
- Tags already on an item are never removed. A name is at most 255 bytes, and a product has at most 50 tags.

If a tag cannot be created or attached, the item and its data are kept: the result shows
*Tags not added: …* and **Retry** applies only the missing tags, without recreating the item or the tags
already created. The chosen tags are never stored in the import history.

## Multi-item orders

The popup lists the "Detected products": check the ones to import. Each becomes a HomeBox item, with the
selected documents attached.

## Manual entry

On a page that is not an Amazon order (product page, another site), the extension shows "No purchase
detected on this page.", the list of the supported Amazon stores (with "(testing)" after the stores still
in testing) and an invitation to report a badly detected page with the Support link, then offers an empty
form. Fill it in and, if needed, attach a PDF from your
computer with **Choose a PDF...** (type: *Invoice*, *Manual*, *Warranty*, *Delivery note* or *Order document*).
The type of each document can still be changed on its row before you confirm.

If your HomeBox instance refuses the *Manual* or *Warranty* type, the document is sent once more as a plain
attachment and the popup tells you ("... was attached as a plain attachment: your HomeBox instance did not
accept the ... type."). The extension only detects a delivery note by itself on pages that offer one as a PDF
(no Amazon page does today); otherwise, add it by hand.

Manual entry is also useful when detection gets it wrong: you can fix each field, or **replace the
detected invoice** with a local file instead of adding to it. This choice is only offered for an *Invoice* or an
*Order document*: adding a manual, a warranty or a delivery note keeps the detected invoice checked.

## Accepted files

Only real PDFs are sent: `%PDF-` signature checked, **15 MB maximum**. Local files are checked again by
the service worker before any call to HomeBox, even if the interface already checked them.

## Duplicates

Before sending, the extension looks in HomeBox for an item whose notes contain the same order number and
that has the same name (comparison is case- and whitespace-insensitive). If it finds one, it warns you
("A similar item already exists in HomeBox.") with a link to the existing item, and lets you choose. If
the check fails ("The duplicate check could not be performed."), the import remains possible.

## No invoice

If no document is attached, the extension asks "No invoice will be attached. Create the item anyway?"
before creating the item.

## Import history

Every import you confirm is recorded in a short local history, **encrypted with your passphrase** and
kept only in this browser. Open it with the **clock** button of the popup header, or in the
**Import history** card of the settings page.

- Imports are listed from the most recent: product name, store, import date, purchase date and result:
  **Complete**, **Partial** (what is missing is named, for example "invoice not sent", "manual not sent", "warranty not sent" or "delivery note not sent"), **Failed** (with
  the reason) or **In progress**. Products of the same order are grouped under the order number.
- **Open in HomeBox** opens the item in a new tab; it is offered only for the instance currently
  configured.
- A **Partial** or **Failed** entry says "Can be resumed" while the recovery is still possible: open the
  order page, then the extension (see [Recovery after an error](#recovery-after-an-error)). A successful
  recovery updates the same entry.
- **Delete** removes one entry; **Clear all** erases everything after a confirmation. In the settings, the
  **Keep a local history of my imports** box turns it off (after a confirmation, it erases everything).
- **Locked** extension: the history shows "History locked" and nothing else; unlock to read it. Clearing
  and turning it off still work.
- At most 200 entries and 12 months are kept. Setting up the extension again with a **new passphrase
  while it is locked** erases the history (a warning is shown before sending).

## Recovery after an error

An import is made of several calls (see [Architecture](Architecture.md)). If the item is created but the
rest fails (purchase details or documents), the popup says so, lists each document with its type and state
("The manual could not be sent.") and offers **Retry the document upload**,
**Retry the photo upload** or **Retry the import**, **without recreating the item**. If you close the
popup, the recovery is offered again the next time you open it on the same tab. For a file added by hand,
you must select it again (file bytes are never kept). **Abandon** clears the in-progress import without
contacting HomeBox, even when the extension is locked (the item already created is kept).

If the extension's service worker stopped during an import, the popup says so ("The import was
interrupted before it finished.") and offers to resume it. This recovery only covers that stop:
in-progress imports are kept in session memory, which is cleared when the browser closes and when the
extension is updated. In those two cases, nothing is resumed: check in HomeBox whether the item was
created.

When the creation of an item is uncertain (lost response, timeout, stop during the upload), the recovery
first looks in HomeBox for an item with the **same name**. If one exists, it refuses to retry (a false
positive is possible: the same product bought another time). If this search fails, it also refuses. In
both cases, check in HomeBox, then abandon and restart the import from the summary, which asks for
confirmation in case of a duplicate. This check reduces the risk without eliminating it: a duplicate
remains possible if the item was renamed or if the search does not see it.

## Automatic lock

In the settings, **Automatic lock** sets when the passphrase is asked again: when the browser closes
(default), after 15 minutes, 1 hour or 4 hours of inactivity, or every time the extension is opened. There
is no "never" option. The 🔒 button still locks at once. An import in progress is never interrupted.

## Updates and version

- After an update, a notice "Updated to vX" appears once at the top of the popup and of the settings, with
  a link to the release notes (opened only if you click it). Close it with ✕: it does not come back for
  that version. Nothing is shown after the first installation.
- When Chrome has an update ready, an **Update now** button restarts the extension with the new version
  (the passphrase is then asked again). It is disabled while an import is running or can still be resumed.
  Without the button, Chrome installs the update by itself. No request is made to check for updates.
- The installed version number is shown at the bottom of the popup and in "Help and project", next to the
  GitHub link.

## Themes

The popup follows the system theme by default. The toolbar button cycles through *Automatic (system)*,
*Light* and *Dark*; the choice is remembered.

## Help and project

Two links, "Support" and "GitHub", are always shown at the bottom of the popup (configured or not, locked
or not) and in the "Help and project" section of the settings page.

- "Support" opens the project's issues (`https://github.com/Foufou-exe/homebox-clipper/issues`), where you
  can report a bug or ask for a new merchant.
- "GitHub" opens the project repository (`https://github.com/Foufou-exe/homebox-clipper`).

Each link opens in a new tab. The popup then closes: this is the browser's behavior when focus moves to
another tab. No data is sent: the extension makes no request, the addresses carry no parameter, and the
only request is the one your browser makes when you click.

## Limits

- Amazon stores only (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com), and only the "Order Details"
  page: see [Supported-merchants](Supported-merchants.md). All but Amazon.fr are still in testing.
- HomeBox stores an amount without a currency: for a purchase in a currency other than the euro (pounds on
  Amazon.co.uk, dollars on Amazon.com), the extension warns you before confirmation ("Detected currency:
  GBP. HomeBox will store the amount as is, without conversion.") and never converts it.
- Detection depends on Amazon's HTML, which changes regularly: if a field is not detected, use manual
  entry and [report the badly detected page](https://github.com/Foufou-exe/homebox-clipper/issues).
