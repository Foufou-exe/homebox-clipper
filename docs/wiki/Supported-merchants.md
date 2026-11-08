# Supported merchants

HomeBox Clipper aims at online shops in general. This page summarizes the current state; the full list,
kept up to date with every merchant addition, is in
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md).

## At a glance

| Merchant | Domain | Country | What is detected | Limits |
|----------|--------|---------|------------------|--------|
| Amazon France | `www.amazon.fr` | FR | name, price, currency, date, order number, seller, quantity, image, PDF invoice(s) | "Order Details" page only |

Other merchants (Amazon Germany, Spain, Italy, United States, eBay, Fnac, Darty, Boulanger,
Leroy Merlin...) are on the roadmap, with no date. The status of each is in
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
- **A badly detected Amazon page?** Report it without attaching the raw page (it contains your personal
  data): state the order type (Amazon or third-party seller, several items...) and the field concerned.
