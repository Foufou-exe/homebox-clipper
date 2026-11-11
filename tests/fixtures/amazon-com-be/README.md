# Amazon.com.be fixtures

Order pages of Amazon.com.be (`https://www.amazon.com.be`) used by the extractor tests (constitution, principle VII).

## Current state: reconstructed pages, store status "testing" (2026-11-11)

No real Amazon.com.be page has been captured yet. These pages are **reconstructed** by
`scripts/fixtures/reconstruct-amazon.ts` from the **already anonymized** Amazon.fr fixtures
(`tests/fixtures/amazon-fr/real-*.html`); the script never reads a `raw/` folder. Their structure is
therefore the one of Amazon.fr, assumed identical: this is exactly what the "testing" status of the store
announces (FR-014). Their content is 100 % fictional.

Method (research.md, R7):

1. `<html lang>` set to the page language: French (`fr-be`); variant in Dutch (`nl-be`, suffix `-nl`);
2. only the generic labels are replaced (invoice, "sold by", order date, from `src/content/merchants/amazon/page-locales.ts`); the other interface texts stay those of the Amazon.fr pages;
3. fictional date rewritten as `9 novembre 2026` / `9 november 2026` (day ≤ 12, so a day/month swap is detected, SC-002);
4. fictional prices rewritten as `1 111,11 €` / `€ 1.111,11` (EUR, amounts ≥ 1000, so a factor of 1000 is detected, SC-003);
5. absolute links moved to `https://www.amazon.com.be`.

Regenerate with `bun scripts/fixtures/reconstruct-amazon.ts` (never edit these files by hand).

| Fixture | Source | Expected content |
|---------|--------|------------------|
| `reconstructed-order-single.html` | `real-order-single.html` without its invoice menu | 1 product, every field, no invoice |
| `reconstructed-order-multi.html` | `real-order-qty.html` | 2 products, quantities 2 and 3, third-party seller "Vendeur Fictif", invoice through the menu |
| `reconstructed-order-invoice.html` | `real-order-single.html` | 1 product, 1 PDF invoice through the "Invoice" menu |
| `reconstructed-invoice-popover.html` | `real-invoice-popover-single.html` | content of the "Invoice" menu |
| `reconstructed-order-invoice-nl.html` | same as the main file, in another page language | same values as the main language |
| `reconstructed-order-multi-nl.html` | same as the main file, in another page language | same values as the main language |
| `reconstructed-order-single-nl.html` | same as the main file, in another page language | same values as the main language |

## Moving to "supported"

A real order page of the user is saved in `raw/` (ignored by git, never committed nor attached to an
issue), anonymized with `scripts/fixtures/anonymize-amazon.ts` (allow list, leak check = 0), checked with
`grep -iE "@|\+[0-9]{2}|\b0[67][0-9 ]{8}\b|<script"` (empty), then added here as `real-order-*.html`. Only then
can the status of the store become `supported` in `src/content/merchants/amazon/stores.ts`, `MERCHANTS.md`
and `MERCHANTS.fr.md`, in the same pull request (tests check the three).
