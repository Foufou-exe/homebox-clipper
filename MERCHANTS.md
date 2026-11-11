**English** | [Français](MERCHANTS.fr.md)

# Merchants roadmap

homebox-clipper imports an online purchase from a merchant's "Your orders" page into your
self-hosted [HomeBox](https://github.com/sysadminsmedia/homebox). One merchant is supported
today, Amazon, on eight stores: Amazon.fr (supported) and Amazon.de, .es, .it, .com.be, .nl, .co.uk
and .com (testing). This page is the roadmap: the best-known order sites, France first, then
country by country, ranked by priority.

Your store is not listed? [Request it](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml).

## Legend

| Status | Meaning |
|--------|---------|
| ✅ supported | Works today and is listed in the extension's merchant registry |
| 🟡 testing | Enabled, checked on reconstructed test pages only, not yet on a real anonymized order page: please report any wrong detection |
| 🧪 planned (next) | Decided, next in line |
| 📋 backlog | Candidate, not scheduled |

| Priority | Meaning |
|----------|---------|
| P1 | Very large audience and/or next step of the plan |
| P2 | Large audience, worth doing after P1 |
| P3 | Niche, second-hand/marketplace or lower expected demand |

The ranking is indicative and mixes audience, how often people buy durable goods there, and how
easy it should be to extract data. Notes such as "PDF invoice to check" are hypotheses to verify
on real pages, not promises. See [Sources](#sources).

## Supported

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon France | `www.amazon.fr` | ✅ supported | P1 | Order detail page; name, price, date, order number, seller, quantity, photo, invoice |
| Amazon Germany | `www.amazon.de` | 🟡 testing | P1 | Same fields as Amazon.fr; reconstructed test pages only; page languages: German, English |
| Amazon Spain | `www.amazon.es` | 🟡 testing | P1 | Same fields as Amazon.fr; reconstructed test pages only; page languages: Spanish, English |
| Amazon Italy | `www.amazon.it` | 🟡 testing | P1 | Same fields as Amazon.fr; reconstructed test pages only; page languages: Italian, English |
| Amazon Belgium | `www.amazon.com.be` | 🟡 testing | P1 | Same fields as Amazon.fr; reconstructed test pages only; page languages: French, Dutch, English |
| Amazon Netherlands | `www.amazon.nl` | 🟡 testing | P1 | Same fields as Amazon.fr; reconstructed test pages only; page languages: Dutch, English |
| Amazon United Kingdom | `www.amazon.co.uk` | 🟡 testing | P1 | Same fields as Amazon.fr; reconstructed test pages only; page languages: English; price in GBP, no conversion |
| Amazon United States | `www.amazon.com` | 🟡 testing | P1 | Same fields as Amazon.fr; reconstructed test pages only; page languages: English; price in USD, no conversion; invoice often HTML only |

**Partial support:** _None yet._

## France

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.fr | `www.amazon.fr` | ✅ supported | P1 | Marketplace and own sales |
| Cdiscount | `www.cdiscount.com` | 📋 backlog | P1 | Marketplace; PDF invoice to check |
| Fnac | `www.fnac.com` | 📋 backlog | P1 | Own sales plus marketplace; PDF invoice to check |
| Boulanger | `www.boulanger.com` | 📋 backlog | P1 | Home appliances and electronics, strong warranty use case |
| Darty | `www.darty.com` | 📋 backlog | P2 | Same group as Fnac; appliances and electronics |
| Leroy Merlin | `www.leroymerlin.fr` | 📋 backlog | P2 | DIY and home; online and in-store orders |
| Decathlon | `www.decathlon.fr` | 📋 backlog | P2 | Sports gear; own sales plus marketplace |
| AliExpress | `fr.aliexpress.com` | 📋 backlog | P2 | Marketplace; no standard invoice expected |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace; no standard invoice expected |
| Leboncoin | `www.leboncoin.fr` | 📋 backlog | P3 | Peer-to-peer classifieds, no invoices |

## Germany

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.de | `www.amazon.de` | 🟡 testing | P1 | Same Amazon extractor; testing until checked on a real page |
| eBay | `www.ebay.de` | 📋 backlog | P1 | Marketplace, private sellers and shops |
| Otto | `www.otto.de` | 📋 backlog | P1 | Generalist retailer plus marketplace |
| MediaMarkt | `www.mediamarkt.de` | 📋 backlog | P2 | Electronics; PDF invoice to check |
| Kaufland | `www.kaufland.de` | 📋 backlog | P2 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace |
| AliExpress | `www.aliexpress.com` | 📋 backlog | P2 | Marketplace |
| Zalando | `www.zalando.de` | 📋 backlog | P3 | Fashion |

## United Kingdom

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.co.uk | `www.amazon.co.uk` | 🟡 testing | P1 | Same Amazon extractor; testing until checked on a real page |
| eBay | `www.ebay.co.uk` | 📋 backlog | P1 | Marketplace |
| Argos | `www.argos.co.uk` | 📋 backlog | P2 | Generalist retailer |
| Currys | `www.currys.co.uk` | 📋 backlog | P2 | Electronics and appliances |
| John Lewis | `www.johnlewis.com` | 📋 backlog | P3 | Home and electronics |
| Etsy | `www.etsy.com` | 📋 backlog | P3 | Marketplace of independent sellers |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |

## Spain

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.es | `www.amazon.es` | 🟡 testing | P1 | Same Amazon extractor; testing until checked on a real page |
| El Corte Inglés | `www.elcorteingles.es` | 📋 backlog | P1 | Department store; PDF invoice to check |
| PcComponentes | `www.pccomponentes.com` | 📋 backlog | P2 | Electronics and computing |
| MediaMarkt | `www.mediamarkt.es` | 📋 backlog | P2 | Electronics |
| AliExpress | `es.aliexpress.com` | 📋 backlog | P2 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace |
| Carrefour | `www.carrefour.es` | 📋 backlog | P3 | Supermarket, non-food orders |
| Wallapop | `es.wallapop.com` | 📋 backlog | P3 | Peer-to-peer classifieds, no invoices |

## Italy

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.it | `www.amazon.it` | 🟡 testing | P1 | Same Amazon extractor; testing until checked on a real page |
| eBay | `www.ebay.it` | 📋 backlog | P2 | Marketplace |
| MediaWorld | `www.mediaworld.it` | 📋 backlog | P2 | Electronics (MediaMarkt group) |
| Unieuro | `www.unieuro.it` | 📋 backlog | P2 | Electronics and appliances |
| AliExpress | `it.aliexpress.com` | 📋 backlog | P2 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace |
| Zalando | `www.zalando.it` | 📋 backlog | P3 | Fashion |

## Belgium

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.com.be | `www.amazon.com.be` | 🟡 testing | P1 | Same Amazon extractor; testing until checked on a real page |
| bol | `www.bol.com` | 📋 backlog | P1 | Marketplace shared with the Netherlands |
| Coolblue | `www.coolblue.be` | 📋 backlog | P2 | Electronics and appliances |
| MediaMarkt | `www.mediamarkt.be` | 📋 backlog | P2 | Electronics |
| AliExpress | `www.aliexpress.com` | 📋 backlog | P3 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |
| Zalando | `www.zalando.be` | 📋 backlog | P3 | Fashion |

## Netherlands

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.nl | `www.amazon.nl` | 🟡 testing | P1 | Same Amazon extractor; testing until checked on a real page |
| bol | `www.bol.com` | 📋 backlog | P1 | Largest Dutch marketplace |
| Coolblue | `www.coolblue.nl` | 📋 backlog | P1 | Electronics and appliances |
| MediaMarkt | `www.mediamarkt.nl` | 📋 backlog | P2 | Electronics |
| Marktplaats | `www.marktplaats.nl` | 📋 backlog | P3 | Peer-to-peer classifieds, no invoices |
| Zalando | `www.zalando.nl` | 📋 backlog | P3 | Fashion |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |

## United States

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.com | `www.amazon.com` | 🟡 testing | P1 | Same Amazon extractor; testing until checked on a real page |
| Walmart | `www.walmart.com` | 📋 backlog | P1 | Own sales plus marketplace |
| eBay | `www.ebay.com` | 📋 backlog | P1 | Marketplace |
| Target | `www.target.com` | 📋 backlog | P2 | Generalist retailer |
| Best Buy | `www.bestbuy.com` | 📋 backlog | P2 | Electronics and appliances |
| Home Depot | `www.homedepot.com` | 📋 backlog | P2 | DIY and home |
| Costco | `www.costco.com` | 📋 backlog | P3 | Membership retailer |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |

## Canada

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.ca | `www.amazon.ca` | 🧪 planned (next) | P1 | Extension of the Amazon extractor |
| Walmart | `www.walmart.ca` | 📋 backlog | P1 | Own sales plus marketplace |
| Best Buy | `www.bestbuy.ca` | 📋 backlog | P2 | Electronics and appliances |
| Canadian Tire | `www.canadiantire.ca` | 📋 backlog | P2 | Home, auto, sports |
| Home Depot | `www.homedepot.ca` | 📋 backlog | P2 | DIY and home |
| Costco | `www.costco.ca` | 📋 backlog | P3 | Membership retailer |
| eBay | `www.ebay.ca` | 📋 backlog | P3 | Marketplace |

## Other countries

Short list; more will follow on request.

| Site | Domain | Status | Priority | Notes |
|------|--------|--------|----------|-------|
| Amazon.com.au (Australia) | `www.amazon.com.au` | 📋 backlog | P2 | Extension of the Amazon extractor |
| Amazon.co.jp (Japan) | `www.amazon.co.jp` | 📋 backlog | P3 | Japanese interface, needs dedicated parsing |
| Amazon.pl (Poland) | `www.amazon.pl` | 📋 backlog | P3 | Extension of the Amazon extractor |
| Allegro (Poland) | `allegro.pl` | 📋 backlog | P3 | Largest Polish marketplace |
| Amazon.se (Sweden) | `www.amazon.se` | 📋 backlog | P3 | Extension of the Amazon extractor |

## How support is added

1. **Amazon domains first.** The Amazon extractor now covers `.fr`, `.de`, `.es`, `.it`, `.com.be`,
   `.nl`, `.co.uk` and `.com`. A store moves from "testing" to "supported" once an anonymized real order
   page covers it. Other Amazon domains (`.ca`, `.pl`, `.se`, ...) will follow on request.
2. **Other sites one by one.** Each site needs a dedicated extractor, written and tested against
   **real order pages, anonymised** (names, addresses, order numbers and prices masked). Never
   attach raw pages or personal data to an issue.
3. **Host permission on demand.** The extension declares no static host permission. It reads the
   merchant tab through `activeTab` when you open the popup, and the only origin it asks for at
   runtime is that of your HomeBox instance, case by case.
4. **Registry and this page.** A merchant is registered in
   `src/content/merchants/registry.ts`, then moved to "Supported" here (a unit test checks the
   consistency). See [CONTRIBUTING.md](CONTRIBUTING.md).

To ask for a site, open a
[merchant request](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml)
(form "Request a new merchant": name, domains, country, language, invoices).

## Sources

Rankings are indicative; no audience figure is reproduced here. Consulted on 9 November 2026.

- France: Fevad / Médiamétrie//NetRatings e-commerce audience barometer, Q2 2026 (published
  1 September 2026), as reported by
  [Blog du Modérateur](https://www.blogdumoderateur.com/sites-e-commerce-visites-france-temu-shein-aliexpress/)
  (10 September 2026). Top 10 in order: Amazon, Leboncoin, Booking.com, Temu, Vinted, E.Leclerc,
  Lidl, Carrefour, Shein, Cdiscount; AliExpress left the top 10. Booking.com, Lidl, Carrefour and
  E.Leclerc are left out of this roadmap (travel or grocery).
- Germany: Semrush "Trending Websites, Retail", February 2025 data, via
  [eCommerce Germany](https://ecommercegermany.com/blog/most-visited-retail-websites-in-germany-2025/)
  (4 April 2025).
- Europe (UK, Spain, Italy, Netherlands, Belgium): ChannelEngine,
  [The top European online marketplaces](https://channelengine.com/en/blog/top-european-online-marketplaces)
  (24 December 2025). Marketplace-oriented, so retailers such as Boulanger, Currys or Coolblue
  were placed by editorial judgement.
- United States, Canada, other countries: no recent ranking was checked; the order is editorial
  judgement.
- Inclusion is not an endorsement; homebox-clipper is not affiliated with any listed merchant.
