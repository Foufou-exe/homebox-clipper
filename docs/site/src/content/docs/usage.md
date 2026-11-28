---
title: "Usage"
description: "Import a purchase into HomeBox: confirmation, duplicates, completing an item, templates, tags, order fields and more."
---

**Who this page is for**: users who want to import a purchase into HomeBox. The first section is the
everyday procedure; the other sections explain each option of the confirmation screen.

Prerequisite: the extension is [installed](/homebox-clipper/getting-started/installation/) and [configured](/homebox-clipper/configuration/), and
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

**Expected result**: the item exists in HomeBox, with its invoice attached when one was detected. Click
**Open in HomeBox** to see it.

**If it does not work**: "No purchase detected on this page." means you are not on an order details page
(you can still fill in the form by hand, see [Manual entry](#manual-entry)). For any other message, see
[Troubleshooting and FAQ](/homebox-clipper/troubleshooting-and-faq/): it lists every message with its fix.

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
| Manufacturer, model number, serial number (only when filled in the **Identification** section) | Manufacturer, Model number, Serial number (never replacing a value already on the item) |
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

## Manufacturer, model and serial number

Each product of the summary has an **Identification** section:

- **Manufacturer** and **Model number** are pre-filled from the Amazon **product page** of the product. When the
  popup opens, the extension reads that page (one request per product, at most 10, on the same Amazon store as the
  order, without cookies or referrer, with no API key and no HomeBox data) and looks for the « Manufacturer » and
  « Item model number » rows of its detail tables, in every language of the supported stores. The brand is not
  used as the manufacturer.
- **Serial number** is always empty: type it from the label of your device; it is never read on a page.
- Every value can be changed or emptied before you confirm. An empty field is not sent; a value already set on
  the item is never replaced (for example on a retry, if you filled it in HomeBox meanwhile). A value is at most
  255 bytes.
- If the product page cannot be read (network, robot check, other layout, time limit), the fields stay empty and
  a discreet note says « Manufacturer and model not found on the product page »: the import is never blocked.
- With an item template, the manufacturer and model are those of the template section (filled with the values of
  the product page when the template has none); the **Identification** section then only shows the serial number.
- Completing an existing item never adds these values.

## The product photo

The photo is retrieved from the merchant's server at import time (only if the box is checked), checked
(JPEG, PNG or WebP, 5 MB at most, based on the real content of the file) and then sent to HomeBox. It is
never kept by the extension. The result shows, per product: *Photo added.*, *Photo not requested.*, *No
photo available.* or *Photo upload failed.* If the photo fails, the item and its invoice are kept:
**Retry the photo upload** reruns only the photo, without recreating the item.

## Choose the HomeBox instance

With two instances or more (see [Configuration](/homebox-clipper/configuration/#several-homebox-instances)), the summary shows
a **HomeBox instance selector** above the fields, with the name and host of each instance; with a single
instance nothing changes. The instance proposed is the one of your **last successful import** (otherwise the
first one of the list); you can change it before confirming. Changing the instance reloads its locations and
its tags (the last location of that instance is preselected, tags that do not exist there are marked **new**);
the fields you edited, the selection, the documents, the photo and the warranty are kept. The selector is
disabled while the import runs, and the confirmation shows the chosen instance. Everything of the import
(duplicate check, item, documents, photo, tags) goes **to this instance only**. The extension never switches to
another instance by itself, even when the chosen one cannot be reached. The result and the import history show
the name of the instance and open the item there.

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
**Automatic tags** card of the settings, see [Configuration](/homebox-clipper/configuration/#automatic-tags)).
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

## Item type

If your HomeBox instance has at least two item types (HomeBox v0.26.0 or later), a **Type** select appears under
each product of the summary. It lists the item types of the instance (never the location types), set to the last
type you used on this instance, or else to the **server default** (the type HomeBox gives an item when none is
sent). With the default type, no type is sent and the import is exactly the same as without this choice.

- The type is chosen **per product**; changing the target instance resets the choices, because a type belongs to one
  instance.
- With a single item type, or on an instance that does not offer types, no select is shown and nothing changes.
- If the type you chose was deleted in HomeBox meanwhile, nothing is created and the message says so: abandon the
  import and start again with another type.
- The extension only reads the types (`GET /api/v1/entity-types`); it never creates, changes or deletes one.

## HomeBox item templates

If your HomeBox instance has item templates (HomeBox v0.22.1 or later), a **Template** picker appears under each
product of the summary. It is set to **None** by default (or to the default template of the instance, see
[Configuration](/homebox-clipper/configuration/#default-item-template)); with **None**, the import is exactly the same as without
templates.

When you choose a template:

- its values are shown and can be edited before you confirm: manufacturer, model number, insured, and its custom
  fields (text, number, yes/no and date), in the order of the template: all the custom fields can be edited. A field of an unknown type is shown read-only
  and copied as is. At most 100 fields per template and 50 distinct templates per import;
- the name of the product is never changed, and the description of the product comes first: the default
  description of the template is only used when the product has none. The default quantity of the template is only
  used for a manual entry. A warranty found for the product is kept; otherwise the warranty of the template is shown;
- its default tags are added (only those that still exist in HomeBox; a tag of a template is never created) and its
  default location is proposed when the product has none;
- **a location is required**: HomeBox needs one to create an item from a template. **Add** stays disabled, with a
  message, until a location is chosen;
- numbers, yes/no and dates are **saved as text** in the custom fields (HomeBox only shows the text): a whole number
  in digits, `true` or `false`, a date as `YYYY-MM-DD`; numbers and yes/no are also sent with their type. After the
  import, the extension reads the item again and checks every value; a gap is shown as a failed « Template fields »
  step that you can retry without creating the item again.

Changing the template, or going back to **None**, removes what the template had set and keeps what you changed
yourself. Changing the target instance removes the templates: templates belong to one instance.

Just before the import, the templates are checked again. A template **changed or deleted** in HomeBox since you
chose it stops the import: nothing is created, your entries are kept, and the changes (or the deleted template and
the products concerned) are listed; confirm again, or choose another template or **None**. As always, nothing is
created before you confirm.

## Order fields (HomeBox custom fields)

When the option **Save the order as custom fields** is on for the target instance (see
[Configuration](/homebox-clipper/configuration/#order-fields-as-custom-fields)), an **Order fields** section appears under each
product of the summary. It shows, before you confirm, the name and the value of each custom field that will be
created on the item:

- the **order number**: its single entry is the existing « Order number » field of the product (the same value
  feeds the notes, the duplicate check and the custom field); the section shows it read-only;
- the **merchant** (the store of origin, for example `Amazon.fr`) and the **order URL** (the address of the order
  page): you can edit the merchant and the order URL in the section without changing the notes;
- an empty value means the field is not created for this product (« Not set »); an order URL must be an `http` or
  `https` web address. HomeBox limits a field name to 255 bytes and a value to 500 bytes (UTF-8 bytes, so an
  accented letter counts twice): a longer value blocks **Add** until you shorten or clear it; nothing is cut
  silently.

With a template whose text field has the same name as an order field, the two are merged: a single field is shown
(in **Order fields**) and created. A template field of the same name of another type (number, yes/no, date) is
kept: the order field is not created for this product and a message says so; the information stays in the notes.
Changing the template keeps the values you typed.

The notes of the item stay exactly the same as without the option. After the import, the extension reads the item
again and checks every order field; a gap or a refusal from HomeBox is shown as a failed « Order fields » step,
with a link to the item and a retry of this step alone (the item is never created again, the purchase data is
kept). Changing the target instance shows, renames or removes the section according to the settings of the new
instance. With the option off, the summary and the import are exactly the same as before.

## Link to the order page

When the option **Add a link to the order page** is on for the target instance (see
[Configuration](/homebox-clipper/configuration/#link-to-the-order-page)), a box **Add a link to the order page** appears under each
product of the summary. It is ticked by default and shows the web address that will be **stored in HomeBox**: it is
the address of the order page, the same as in the notes, and it points to the merchant's website. Untick the box to
add no link for this product. A page without an `http` or `https` address has no box.

After the item is created, the link is added as an external link of the item. The notes of the item stay the same
as without the option. If the link cannot be added, the import is shown as partial with the message, the link
step is shown as failed and **Retry the order link** adds only the link (the item is never created again, and a
link already on the item is never added twice). An instance that does not accept external links gives a message
that tells to update HomeBox or turn the option off. With the option off, the summary and the import are exactly
the same as before.

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

After you confirm and before anything is sent, the extension checks each selected product in HomeBox for:

- a **certain duplicate**: an item whose notes contain the same order number and that has the same name
  (comparison is case- and whitespace-insensitive), as before. When the option **Save the order as custom
  fields** is on for the target instance, HomeBox is also asked for the items whose **order number custom field**
  holds exactly this number (exact search on the server), in addition to the search in the text, which is still
  used for the items imported before. The window does not change. If this extra search fails, the check is
  reported as incomplete;
- **similar items**: items of your **whole inventory**, whatever their origin (another order, another store,
  added by hand without any note), whose name is close to the product name. Case, accents, punctuation, word
  order and a few extra or missing words are ignored: two names are close when at least 80 % of the significant
  words of the shorter one are shared, with at least 2 shared words. A name with a single significant word is
  only flagged when it is identical.

A product **without an order number** (manual entry, or number not detected) is checked too, by close name.

If anything is found, the window "A similar item already exists in HomeBox." lists, under the name of each
product concerned, a **Certain duplicate** section first, then a **Similar items** section (at most 5 per
product, with a mention when there are others). Each item is shown with its HomeBox name and a link that opens
it. You choose **Create anyway** or **Cancel**: nothing is created, skipped or merged until you choose, and
Cancel brings you back to the summary with your choices intact. Variants of a product (for example "1 To" and
"2 To") can be flagged: open the item to compare.

### Complete the existing item

For each product listed in the window, you can also choose, instead of **Create a new item** (checked by
default), **Complete** one of the items found, a certain duplicate or a similar item. The choice is made per
product: the other products of the order are created as usual, in the same import. As soon as one product is set
to **Complete**, the main button becomes **Review the changes**: the extension reads each chosen item again in
HomeBox and shows what completing it would add, in four categories that you can uncheck:

- **Attachments**: the invoice and the other selected documents, and the photo. A document whose name is already
  among the attachments of the item is not sent again ("Already attached"). The photo becomes the primary photo
  only when the item has none;
- **Missing tags**: the checked tags that the item does not have yet. No tag is ever removed;
- **Purchase and warranty, only if empty**: price, purchase date, seller and warranty, each one only when it is
  empty in HomeBox;
- **Order details, only if absent**: the order custom fields (when the option is on for the instance) that do not
  exist yet on the item, and a line with the order at the end of the notes, unless the notes already contain the
  order number.

The extension never overwrites a value already set in HomeBox: what is already filled is listed as "Already set
in HomeBox, unchanged", without its value. The name, the description and the location of the item never change;
the template and the location chosen in the summary do not apply to an existing item. The quantity is only
increased when you check **Increase the quantity by N**, unchecked by default. **Back** returns to the window with
your choices intact; nothing is sent before **Confirm**. Just before writing, the item is read once more: a value
filled in HomeBox in the meantime is not changed, and the result says so ("Filled in HomeBox meanwhile, not
changed"). The history shows such an import as "Existing item completed".

The detection is an aid, **not a guarantee**: it only sees what your HomeBox instance returns for the searched
words, and a duplicate under a very different name is not found.

If the check fails, for every product or only some of them ("The duplicate check could not be performed."),
the import remains possible: the window lists the products that could not be checked, and the message stays
visible on the result screen, during the import and with its result.

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

An import is made of several calls (see [Architecture](/homebox-clipper/contributing/architecture/)). If the item is created but the
rest fails (purchase details or documents), the popup says so, lists each document with its type and state
("The manual could not be sent.") and offers **Retry the document upload**,
**Retry the photo upload** or **Retry the import**, **without recreating the item**. If you close the
popup, the recovery is offered again the next time you open it on the same tab. For a file added by hand,
you must select it again (file bytes are never kept). **Abandon** clears the in-progress import without
contacting HomeBox, even when the extension is locked (the item already created is kept).

With several instances, an interrupted import is always resumed on the instance it was started on, whatever
instance is proposed in the summary; the recovery shows its name ("Interrupted import to …"). Deleting that
instance also erases its interrupted imports.

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
- When the browser has an update ready, an **Update now** button restarts the extension with the new version
  (the passphrase is then asked again). It is disabled while an import is running or can still be resumed.
  Without the button, the browser installs the update by itself (in Firefox, only an installation from Firefox
  Add-ons is updated; a temporarily loaded add-on never shows the button). No request is made to check for updates.
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
  page: see [Supported-merchants](/homebox-clipper/supported-merchants/). All but Amazon.fr are still in testing.
- HomeBox stores an amount without a currency: for a purchase in a currency other than the euro (pounds on
  Amazon.co.uk, dollars on Amazon.com), the extension warns you before confirmation ("Detected currency:
  GBP. HomeBox will store the amount as is, without conversion.") and never converts it.
- Detection depends on Amazon's HTML, which changes regularly: if a field is not detected, use manual
  entry and [report the badly detected page](https://github.com/Foufou-exe/homebox-clipper/issues).
