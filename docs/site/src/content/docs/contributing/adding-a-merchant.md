---
title: "Adding a merchant"
description: "Step-by-step guide to support a new online shop."
---

**Who this page is for**: contributors who want the extension to read the order pages of a new online
shop. At the end, the popup detects a purchase on that shop and `bun run ci` passes.

A merchant is an independent module: you add a folder, an entry point and a line in the registry.
Neither the HomeBox client, nor the import orchestrator, nor the interface has to change.

## Before you start

- The project is [set up](/homebox-clipper/contributing/development-setup/) and `bun run ci` passes.
- A [local HomeBox instance](/homebox-clipper/contributing/local-homebox-instance/) runs, to try things end to end.
- You have an account on the shop, with at least one past order whose details page you can open.
- Optional but recommended: a [merchant request](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml)
  issue, so nobody else works on the same shop.

Read [Architecture](/homebox-clipper/contributing/architecture/) first if you do not know the code yet.

## 1. The `MerchantExtractor` contract

Defined in `src/content/merchants/types.ts`:

| Member | Role |
|--------|------|
| `id` | Merchant identifier, of type `MerchantId` (`src/content/merchants/catalog.ts`), today one per Amazon store (`'amazon.fr'`, `'amazon.de'`...). Never renamed: it is persisted in `DraftPhoto.merchantId`. |
| `displayName` | Name shown in the interface and written into HomeBox ("Amazon.de"). |
| `domains: readonly string[]` | The merchant's domains (for example `['www.amazon.de']`). Source of the check that keeps `MERCHANTS.md` up to date. |
| `imageHosts: readonly string[]` | **Required.** **Exact** hosts allowed for the product photo (no suffix or wildcard). An empty list means "no photo for this merchant". |
| `matchesUrl(url)` | True if the URL belongs to this merchant; tested **before any injection**. |
| `isOrderPage(doc, pageUrl)` | True if the document is an order details page (DOM marker, or known path and readable order number). |
| `extract(doc, pageUrl)` | **Pure** extraction: no network, no side effect, never throws. Returns a `DetectedPurchase`. |
| `resolveDocuments(doc, pageUrl, fetchSameOrigin)` | Resolves the real PDF URLs ("Invoice" menu, etc.), same origin only. |

Each extracted field is a `Field<T>`: either a value, or explicitly absent (with a reason). The core of the
extension depends only on this contract, never on the DOM.

For the photo, `extract` applies `isAllowedImageUrl(src, imageHosts)` (`src/shared/image.ts`) then, if
needed, a pure resolution rewrite (`toPhotoUrl` for Amazon), and puts the result in `imageUrl`. The service
worker rechecks the URL before the `fetch`. **CORS question**: the photo is retrieved by an anonymous
`fetch` from the service worker, with no added permission; the merchant's CDN must therefore answer with a
suitable `Access-Control-Allow-Origin` header. Otherwise the photo fails cleanly (`PHOTO_UNAVAILABLE`) and
a decision specific to that merchant is needed before adding any access.

## 2. Create the module

In `src/content/merchants/<merchant>/`, modeled on `amazon/` (one module for several stores of the same
merchant, parameterized by a table: `amazon/stores.ts`; page-language texts in `amazon/page-locales.ts`):

| File | Content |
|------|---------|
| `selectors.ts` | The **only** file containing selectors. For each field, an ordered list from the most specific to the most general. |
| `parse.ts` | Pure parsing functions (price, dates, order number, quantity). |
| `extractor.ts` | The object implementing `MerchantExtractor`, with the fallback-selector helper. |
| `download.ts` | Invoice download in the page context (first-party cookies), PDF and size check. |

Rules: a selector that fails falls through to the next; an origin different from the merchant's is refused
at download; no DOM dependency outside this folder.

## 3. Injectable entry point

Create `src/entrypoints/<merchant>.content.ts` modeled on `amazon.content.ts`:
`registration: 'runtime'` (never a static script), `matches` limited to the merchant's pages, listening to
extraction and download messages (`sender.id` checked, message validated). The script is injected on
demand, when the popup opens, thanks to `activeTab`. Look in `src/background/detect.ts` to see how the
detected merchant's script is injected (today the `AMAZON_SCRIPT` constant).

No host permission must be added to the manifest: if your merchant seems to require one, say so and
justify it in the pull request.

## 4. Declare the merchant in the registry

`src/content/merchants/registry.ts` exports `MERCHANTS`, the list of extractors. Add yours: the service
worker keeps the first extractor whose `matchesUrl` is true for the active tab.

### Warranty (optional)

The warranty proposed in the summary needs two entries in the catalog (`CatalogEntry`): `country` (ISO code of
the store) and `ownSellers` (the names under which the store itself sells, or `'any'` for a merchant without
marketplace). The default legal warranty is proposed only for a country of the table in
`src/shared/warranty.ts` (France, Germany, Italy, Belgium, Spain) and only when the seller read on the product
row equals one of `ownSellers`; a new country needs a sourced line (official text read) first. Reading a
warranty from the order page is opt-in: declare your own `warranty…` selectors in your `selectors.ts` (with
fallbacks) and set `DetectedProduct.pageWarranty` with `parseWarrantyText` from
`src/content/merchants/warranty-text.ts`; without it, the property stays absent.

## 5. Fixtures and tests

- Capture a real order page in `tests/fixtures/<merchant>/raw/` (ignored by git), anonymize it and copy it
  to `tests/fixtures/<merchant>/`: procedure in [Testing-and-fixtures](/homebox-clipper/contributing/testing-and-fixtures/).
- Write the extractor and parser tests on these fixtures (simple page, several items, no invoice,
  third-party seller, page that is not an order...).
- **Never commit** a raw page, an API key or a real instance address.

## 6. Update `MERCHANTS.md`

Add a line in the "Supported" (or "Partial") section of
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md): merchant, domains,
country, detected fields, version, limits. A test fails if a registry extractor is not listed there (one
of its domains must appear in a line of the Supported or Partial sections). The status identifiers
(`Supported`, `Partial`, `In progress`, `Planned`, `Requested`) are fixed. Do the same in
[MERCHANTS.fr.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.fr.md).

Do not edit `CHANGELOG.md`: it is generated at release time from the title of your pull request. Use a
`feat:` title, for example `feat: support the order pages of <shop>` (see
[Submit a change](/homebox-clipper/contributing/submitting-changes/)).

## 7. Translation keys

Visible texts come from `src/locales/en.yml` and `src/locales/fr.yml`: any text you add goes in **both**
files in the same contribution (rule FR-004c, see [Translations](/homebox-clipper/contributing/translations/)). If your merchant writes
text into HomeBox, the note "<store> order: ..." and the description "Purchased on <store> on ..." already
take the store name from `MERCHANT_CATALOG` (`displayName`): add the merchant to the catalog rather than new
keys. Any other text uses dedicated keys with `$1`, `$2` substitutions, never concatenation in the code.

## 8. Verify

1. Run all the checks:

   ```bash
   bun run ci     # typecheck, lint, tests, build, manifest
   ```

   **Expected result**: no error.
2. Start `bun run dev`, sign in to the shop in the development browser, open the details page of one of
   your orders, then click the extension icon.
   **Expected result**: the popup shows the product, the price, the date and the order number.
3. Click **Add to HomeBox** and check the item in your test instance.

## If it does not work

| Symptom | Fix |
|---------|-----|
| "No purchase detected on this page." | `matchesUrl` or `isOrderPage` returns false: check the domain list and the DOM marker of the order page. |
| A field shows "not detected" | Its selectors do not match: add a fallback selector in `selectors.ts` and a test on your fixture. |
| The test on `MERCHANTS.md` fails | One of the merchant domains must appear in a line of the Supported or Partial section. |
| The photo is missing (`PHOTO_UNAVAILABLE`) | The image host is not in `imageHosts`, or the shop's CDN does not allow the anonymous request (see the CORS question in section 1). |

Then open a pull request: [Submit a change](/homebox-clipper/contributing/submitting-changes/).
