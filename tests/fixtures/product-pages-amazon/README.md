# Amazon product page fixtures (spec 027)

Minimal, **entirely fictional** HTML excerpts of Amazon product pages, used by
`tests/unit/amazon-product-details.test.ts` to test the reading of the manufacturer and the model number
(`src/content/merchants/amazon/product-details.ts`). Every value (product names, brands, manufacturers, model
numbers, ASINs `B00000000N`) is invented. No real page, no order, no account data: these files were **written by
hand**, not captured, and there is no `raw/` folder for them.

## Where each structure comes from

No real product page could be observed while writing spec 027: `https://www.amazon.fr/dp/…` answered HTTP 503 to the
automated fetch (Amazon blocks automated clients). The structures below are the product-detail blocks commonly
documented for Amazon product pages (stable element ids, used by public scraping libraries for years and named in the
feature request). They are reproduced with the smallest markup that keeps the ids, the `th`/`td` or bold-label/value
shape, and the invisible marks Amazon inserts.

| Fixture | Structure reproduced | Language | Status |
|---------|----------------------|----------|--------|
| `product-techspec-fr.html` | `#prodDetails` > `table#productDetails_techSpec_section_1` and `table#productDetails_detailBullets_sections1`, rows `th.prodDetSectionEntry` / `td.prodDetAttrValue`, values prefixed with U+200E | fr | to confirm on a real page |
| `product-detail-bullets-de.html` | `#detailBullets_feature_div` > `ul.detail-bullet-list` > `li` > `span.a-list-item` > `span.a-text-bold` (label followed by U+200F « : » U+200E) + `span` (value) | de | to confirm on a real page |
| `product-technical-specs-en.html` | `table#technicalSpecifications_section_1`, rows `th` / `td` (older layout) | en | to confirm on a real page |
| `product-techspec-es.html` | same as the French techSpec table | es | to confirm on a real page |
| `product-detail-bullets-it.html` | same as the German detail bullets | it | to confirm on a real page |
| `product-techspec-nl.html` | `table#productDetails_detailBullets_sections1` alone, model given only as « Referentie fabrikant » | nl | to confirm on a real page |
| `product-no-details.html` | a page without any detail block (shape of the "type the characters" robot check) | fr | to confirm on a real page |

The labels (« Fabricant », « Numéro du modèle de l'article », « Hersteller », « Modellnummer »…) are listed with
their status in `specs/027-product-identifiers/research.md` (R3) and in `src/content/merchants/amazon/page-locales.ts`.

## To confirm on a real page (manual test of the user)

On a real order of each store, with the extension loaded: the manufacturer and model fields are pre-filled for a
product whose page shows them. If a store uses another block or another label, add it to `selectors.ts` or
`page-locales.ts` **with a new fictional fixture reproducing the structure** (constitution, principle VII); never
commit a captured page.
