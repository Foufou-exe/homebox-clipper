# Amazon.fr fixtures

Amazon.fr order HTML pages used by the extractor tests (constitution, principle VII). The pages are
intentionally in French (the merchant's language), as are the generated fictional values.

## Current state: anonymized fixtures derived from real pages (2026-11-02)

The `real-*.html` files keep the **structure** of real "Détails de la commande" (order details)
pages captured on 2026-11-02 (tags, nesting, classes, `data-component`, number of rows). Their
**content is entirely fictional**: no value comes from the original pages. The other files remain
synthetic, written by hand on 2026-10-22, to cover cases absent from the captures (third-party
seller, old page layout, non-order page...).

## Anonymization method for the `real-*` fixtures

The raw captures stay in `raw/` (ignored by git). A script generates the fixtures with an
**allow list**; nobody needs to read the raw pages:

1. only the `#orderDetails` subtree is kept, inside a `<html lang="fr-fr"><body>` skeleton;
2. scripts, styles, comments and sensitive components are removed entirely (address,
   payment, order summary, buyer, gifts, personalization, advertising, actions);
3. only `class`, `id` without digits and `data-component` are kept; `href`, `src` and
   `data-a-popover` are rebuilt with fictional values, any other attribute is removed;
4. every text node is replaced with a generated value (`Produit fictif N`, `11,11 €`,
   `15 mars 2024`, `999-0000000-00000NN`, `Vendeur Fictif`, `Texte fictif`), except for an exact
   match with a list of generic interface labels ("Facture", "Vendu par :"...);
5. a leak check compares each fixture with all the values extracted from the raw page (texts,
   attributes, ASINs, numbers, digit sequences, emails, phone numbers, postal codes): 0 expected.
   This check is itself tested by contaminating throwaway copies.

| Fixture | Original order type | Expected content |
|---------|---------------------|------------------|
| `real-order-single.html` | 1 item, with invoice | 1 product, 1 invoice via the menu |
| `real-order-multi.html` | 2 items, 2 shipments, 2 invoices | 2 products, 2 invoices via the menu |
| `real-order-qty.html` | 2 items with quantity > 1 | 2 products, quantity badge (2 and 3) |
| `real-order-no-invoice.html` | 3 items, no invoice | 3 products, no "Facture" menu |
| `real-invoice-popover-single.html` | "Facture" menu of the 1-item order | 1 invoice + printable summary |
| `real-invoice-popover-multi.html` | "Facture" menu of the 2-invoice order | 2 invoices + printable summary |

## Manual capture and anonymization procedure (synthetic fixtures)

1. On an Amazon.fr order details page: right click → "Enregistrer sous" (Save as) → *Web page, HTML
   only*, into `tests/fixtures/amazon-fr/raw/` (ignored by git — NEVER commit this folder).
2. Copy the file out of `raw/`, then:
   - remove all `<script>`, `<style>`, `<link>`, `<iframe>` tags and comments;
   - replace the name, delivery address and payment method with fictional values
     (`Jean Exemple`, `1 rue Fictive`, `Carte se terminant par 0000`);
   - replace the order number with `999-0000000-00000NN` and the document identifiers
     (`/documents/download/<uuid>/`) with fictional UUIDs;
   - keep the DOM structure (tags, classes, `data-*` attributes) intact.
3. Check: `grep -iE "@|\b0[67][0-9 ]{8}\b|<script" file.html` must return nothing.
4. Record below the capture date and the original page (order type, not the real URL).

Hand-written fixtures:

| Fixture | Expected content | Origin |
|---------|------------------|--------|
| `order-single-item-invoice.html` | 1 product, all fields, 1 PDF invoice | synthetic |
| `order-multi-item.html` | 2 products (one with quantity 3), 1 invoice | synthetic |
| `order-multi-shipment-invoices.html` | 2 invoices | synthetic |
| `order-no-invoice.html` | no invoice | synthetic |
| `order-marketplace-seller.html` | third-party seller, no invoice | synthetic |
| `order-alt-layout.html` | old page layout, invoice via the menu | synthetic |
| `not-an-order.html` | product page (not an order) | synthetic |
| `invoice-popover.html` | content of the "Facture" menu | synthetic |
