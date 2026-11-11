# Supported merchants

HomeBox Clipper aims at online shops in general. This page summarizes the current state; the full list,
kept up to date with every merchant addition, is in
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md).

## At a glance

Every Amazon store detects the same fields: name, price, currency, date, order number, seller, quantity,
image and PDF invoice(s), on the "Order Details" page only.

| Merchant | Domain | Country | Currency | Page languages | Status |
|----------|--------|---------|----------|----------------|--------|
| Amazon France | `www.amazon.fr` | FR | EUR | French | ✅ supported |
| Amazon Germany | `www.amazon.de` | DE | EUR | German, English | 🟡 testing |
| Amazon Spain | `www.amazon.es` | ES | EUR | Spanish, English | 🟡 testing |
| Amazon Italy | `www.amazon.it` | IT | EUR | Italian, English | 🟡 testing |
| Amazon Belgium | `www.amazon.com.be` | BE | EUR | French, Dutch, English | 🟡 testing |
| Amazon Netherlands | `www.amazon.nl` | NL | EUR | Dutch, English | 🟡 testing |
| Amazon United Kingdom | `www.amazon.co.uk` | GB | GBP | English | 🟡 testing |
| Amazon United States | `www.amazon.com` | US | USD | English | 🟡 testing |

**Testing** means the store works but has only been checked on test pages reconstructed from the
Amazon.fr pages, not yet on a real anonymized order page: please report any wrong detection. A page in
another language (Turkish on Amazon.de, for example) is read without guessing: the date and the seller are
left for manual entry. Prices in pounds or dollars are kept as is, with a warning before confirmation:
HomeBox stores the amount without conversion. On Amazon.com the invoice is often a printable HTML summary
only: the import then goes on without an attachment.

Other merchants (Amazon Canada, eBay, Fnac, Darty, Boulanger, Leroy Merlin...) are on the roadmap, with
no date. The status of each is in
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md).

## How the extension picks a merchant

Each merchant is an independent extraction module that declares its domains. When you click the icon, the
service worker looks, in the merchant registry (`src/content/merchants/registry.ts`, which exports
`MERCHANTS`), for the first extractor whose `matchesUrl` is true for the active tab, then injects only
its script. If no merchant matches, the extension offers manual entry (see [Usage](Usage.md)).

## Your shop is missing?

- **Request it**: open an issue with the repository's "merchant" template
  ([issues](https://github.com/Foufou-exe/homebox-clipper/issues)).
- **Add it yourself**: see [Adding-a-merchant](Adding-a-merchant.md). Neither the HomeBox client, nor the
  import orchestrator, nor the interface has to change.
- **A badly detected Amazon page?** Report it with the Support link of the extension, without attaching
  the raw page (it contains your personal data): state the store, the language of the page, the order type
  (Amazon or third-party seller, several items...) and the field concerned.
