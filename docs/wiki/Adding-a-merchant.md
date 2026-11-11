# Adding a merchant

A merchant is an independent module: you add a folder, an entry point and a line in the registry.
Neither the HomeBox client, nor the import orchestrator, nor the interface has to change.

Prerequisites: [development environment](Maintaining-the-dev-environment.md) ready and a
[local HomeBox instance](Local-HomeBox-instance.md) to try things end to end.

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

## 5. Fixtures and tests

- Capture a real order page in `tests/fixtures/<merchant>/raw/` (ignored by git), anonymize it and copy it
  to `tests/fixtures/<merchant>/`: procedure in [Testing-and-fixtures](Testing-and-fixtures.md).
- Write the extractor and parser tests on these fixtures (simple page, several items, no invoice,
  third-party seller, page that is not an order...).
- **Never commit** a raw page, an API key or a real instance address.

## 6. Update `MERCHANTS.md`

Add a line in the "Supported" (or "Partial") section of
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md): merchant, domains,
country, detected fields, version, limits. A test fails if a registry extractor is not listed there (one
of its domains must appear in a line of the Supported or Partial sections). The status identifiers
(`Supported`, `Partial`, `In progress`, `Planned`, `Requested`) are fixed. Also add an "Added" entry in the
[changelog](https://github.com/Foufou-exe/homebox-clipper/blob/main/CHANGELOG.md).

## 7. Translation keys

Visible texts come from `src/locales/en.yml` and `src/locales/fr.yml`: any text you add goes in **both**
files in the same contribution (rule FR-004c, see [Translations](Translations.md)). If your merchant writes
text into HomeBox, the note "<store> order: ..." and the description "Purchased on <store> on ..." already
take the store name from `MERCHANT_CATALOG` (`displayName`): add the merchant to the catalog rather than new
keys. Any other text uses dedicated keys with `$1`, `$2` substitutions, never concatenation in the code.

## 8. Verify

```bash
bun run ci     # typecheck, lint, tests, build, manifest
```

Then try it on a real order with `bun run dev` and your test instance.
