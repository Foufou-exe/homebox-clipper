[English](MERCHANTS.md) | **Français**

# Feuille de route des marchands

homebox-clipper importe un achat en ligne depuis la page « Vos commandes » d'un marchand vers votre
instance [HomeBox](https://github.com/sysadminsmedia/homebox) auto-hébergée. Un marchand est
supporté aujourd'hui, Amazon, sur huit boutiques : Amazon.fr (supported, prise en charge) et Amazon.de,
.es, .it, .com.be, .nl, .co.uk et .com (testing, en test). Cette page est la feuille de route : les sites de commande les
plus connus, la France d'abord, puis pays par pays, classés par priorité.

Votre boutique n'y figure pas ? [Demandez-la](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml).

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ supported | Fonctionne aujourd'hui et figure dans le registre des marchands de l'extension |
| 🟡 testing | Activé (en test), vérifié seulement sur des pages de test reconstituées, pas encore sur une vraie page de commande anonymisée : signalez toute détection erronée |
| 🧪 planned (next) | Décidé, prochain sur la liste |
| 📋 backlog | Candidat, non planifié |

| Priorité | Signification |
|----------|---------------|
| P1 | Très forte audience et/ou prochaine étape du plan |
| P2 | Forte audience, à faire après les P1 |
| P3 | Niche, occasion/marketplace ou demande attendue plus faible |

Le classement est indicatif : il combine l'audience, la fréquence d'achat de biens durables sur le
site et la facilité attendue d'extraction des données. Les notes du type « facture PDF à vérifier »
sont des hypothèses à confirmer sur de vraies pages, pas des promesses. Voir [Sources](#sources).

## Supported (supportés)

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon France | `www.amazon.fr` | ✅ supported | P1 | Page de détail d'une commande ; nom, prix, date, numéro de commande, vendeur, quantité, photo, facture |
| Amazon Allemagne | `www.amazon.de` | 🟡 testing | P1 | Mêmes champs qu'Amazon.fr ; pages de test reconstituées seulement ; langues de page : allemand, anglais |
| Amazon Espagne | `www.amazon.es` | 🟡 testing | P1 | Mêmes champs qu'Amazon.fr ; pages de test reconstituées seulement ; langues de page : espagnol, anglais |
| Amazon Italie | `www.amazon.it` | 🟡 testing | P1 | Mêmes champs qu'Amazon.fr ; pages de test reconstituées seulement ; langues de page : italien, anglais |
| Amazon Belgique | `www.amazon.com.be` | 🟡 testing | P1 | Mêmes champs qu'Amazon.fr ; pages de test reconstituées seulement ; langues de page : français, néerlandais, anglais |
| Amazon Pays-Bas | `www.amazon.nl` | 🟡 testing | P1 | Mêmes champs qu'Amazon.fr ; pages de test reconstituées seulement ; langues de page : néerlandais, anglais |
| Amazon Royaume-Uni | `www.amazon.co.uk` | 🟡 testing | P1 | Mêmes champs qu'Amazon.fr ; pages de test reconstituées seulement ; langues de page : anglais ; prix en GBP, sans conversion |
| Amazon États-Unis | `www.amazon.com` | 🟡 testing | P1 | Mêmes champs qu'Amazon.fr ; pages de test reconstituées seulement ; langues de page : anglais ; prix en USD, sans conversion ; facture souvent HTML seulement |

**Support partiel :** _None yet._ (aucun pour l'instant)

## France

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.fr | `www.amazon.fr` | ✅ supported | P1 | Marketplace et ventes en propre |
| Cdiscount | `www.cdiscount.com` | 📋 backlog | P1 | Marketplace ; facture PDF à vérifier |
| Fnac | `www.fnac.com` | 📋 backlog | P1 | Ventes en propre et marketplace ; facture PDF à vérifier |
| Boulanger | `www.boulanger.com` | 📋 backlog | P1 | Électroménager et électronique, usage garantie fort |
| Darty | `www.darty.com` | 📋 backlog | P2 | Même groupe que Fnac ; électroménager et électronique |
| Leroy Merlin | `www.leroymerlin.fr` | 📋 backlog | P2 | Bricolage et maison ; commandes en ligne et en magasin |
| Decathlon | `www.decathlon.fr` | 📋 backlog | P2 | Matériel de sport ; ventes en propre et marketplace |
| AliExpress | `fr.aliexpress.com` | 📋 backlog | P2 | Marketplace ; pas de facture standard attendue |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace ; pas de facture standard attendue |
| Leboncoin | `www.leboncoin.fr` | 📋 backlog | P3 | Petites annonces entre particuliers, pas de factures |

## Allemagne

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.de | `www.amazon.de` | 🟡 testing | P1 | Même extracteur Amazon ; en test tant qu'il n'est pas vérifié sur une vraie page |
| eBay | `www.ebay.de` | 📋 backlog | P1 | Marketplace, particuliers et boutiques |
| Otto | `www.otto.de` | 📋 backlog | P1 | Généraliste avec marketplace |
| MediaMarkt | `www.mediamarkt.de` | 📋 backlog | P2 | Électronique ; facture PDF à vérifier |
| Kaufland | `www.kaufland.de` | 📋 backlog | P2 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace |
| AliExpress | `www.aliexpress.com` | 📋 backlog | P2 | Marketplace |
| Zalando | `www.zalando.de` | 📋 backlog | P3 | Mode |

## Royaume-Uni

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.co.uk | `www.amazon.co.uk` | 🟡 testing | P1 | Même extracteur Amazon ; en test tant qu'il n'est pas vérifié sur une vraie page |
| eBay | `www.ebay.co.uk` | 📋 backlog | P1 | Marketplace |
| Argos | `www.argos.co.uk` | 📋 backlog | P2 | Généraliste |
| Currys | `www.currys.co.uk` | 📋 backlog | P2 | Électronique et électroménager |
| John Lewis | `www.johnlewis.com` | 📋 backlog | P3 | Maison et électronique |
| Etsy | `www.etsy.com` | 📋 backlog | P3 | Marketplace de vendeurs indépendants |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |

## Espagne

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.es | `www.amazon.es` | 🟡 testing | P1 | Même extracteur Amazon ; en test tant qu'il n'est pas vérifié sur une vraie page |
| El Corte Inglés | `www.elcorteingles.es` | 📋 backlog | P1 | Grand magasin ; facture PDF à vérifier |
| PcComponentes | `www.pccomponentes.com` | 📋 backlog | P2 | Électronique et informatique |
| MediaMarkt | `www.mediamarkt.es` | 📋 backlog | P2 | Électronique |
| AliExpress | `es.aliexpress.com` | 📋 backlog | P2 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace |
| Carrefour | `www.carrefour.es` | 📋 backlog | P3 | Supermarché, commandes hors alimentaire |
| Wallapop | `es.wallapop.com` | 📋 backlog | P3 | Petites annonces entre particuliers, pas de factures |

## Italie

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.it | `www.amazon.it` | 🟡 testing | P1 | Même extracteur Amazon ; en test tant qu'il n'est pas vérifié sur une vraie page |
| eBay | `www.ebay.it` | 📋 backlog | P2 | Marketplace |
| MediaWorld | `www.mediaworld.it` | 📋 backlog | P2 | Électronique (groupe MediaMarkt) |
| Unieuro | `www.unieuro.it` | 📋 backlog | P2 | Électronique et électroménager |
| AliExpress | `it.aliexpress.com` | 📋 backlog | P2 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P2 | Marketplace |
| Zalando | `www.zalando.it` | 📋 backlog | P3 | Mode |

## Belgique

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.com.be | `www.amazon.com.be` | 🟡 testing | P1 | Même extracteur Amazon ; en test tant qu'il n'est pas vérifié sur une vraie page |
| bol | `www.bol.com` | 📋 backlog | P1 | Marketplace partagée avec les Pays-Bas |
| Coolblue | `www.coolblue.be` | 📋 backlog | P2 | Électronique et électroménager |
| MediaMarkt | `www.mediamarkt.be` | 📋 backlog | P2 | Électronique |
| AliExpress | `www.aliexpress.com` | 📋 backlog | P3 | Marketplace |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |
| Zalando | `www.zalando.be` | 📋 backlog | P3 | Mode |

## Pays-Bas

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.nl | `www.amazon.nl` | 🟡 testing | P1 | Même extracteur Amazon ; en test tant qu'il n'est pas vérifié sur une vraie page |
| bol | `www.bol.com` | 📋 backlog | P1 | Première marketplace néerlandaise |
| Coolblue | `www.coolblue.nl` | 📋 backlog | P1 | Électronique et électroménager |
| MediaMarkt | `www.mediamarkt.nl` | 📋 backlog | P2 | Électronique |
| Marktplaats | `www.marktplaats.nl` | 📋 backlog | P3 | Petites annonces entre particuliers, pas de factures |
| Zalando | `www.zalando.nl` | 📋 backlog | P3 | Mode |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |

## États-Unis

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.com | `www.amazon.com` | 🟡 testing | P1 | Même extracteur Amazon ; en test tant qu'il n'est pas vérifié sur une vraie page |
| Walmart | `www.walmart.com` | 📋 backlog | P1 | Ventes en propre et marketplace |
| eBay | `www.ebay.com` | 📋 backlog | P1 | Marketplace |
| Target | `www.target.com` | 📋 backlog | P2 | Généraliste |
| Best Buy | `www.bestbuy.com` | 📋 backlog | P2 | Électronique et électroménager |
| Home Depot | `www.homedepot.com` | 📋 backlog | P2 | Bricolage et maison |
| Costco | `www.costco.com` | 📋 backlog | P3 | Distributeur sur abonnement |
| Temu | `www.temu.com` | 📋 backlog | P3 | Marketplace |

## Canada

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.ca | `www.amazon.ca` | 🧪 planned (next) | P1 | Extension de l'extracteur Amazon |
| Walmart | `www.walmart.ca` | 📋 backlog | P1 | Ventes en propre et marketplace |
| Best Buy | `www.bestbuy.ca` | 📋 backlog | P2 | Électronique et électroménager |
| Canadian Tire | `www.canadiantire.ca` | 📋 backlog | P2 | Maison, auto, sport |
| Home Depot | `www.homedepot.ca` | 📋 backlog | P2 | Bricolage et maison |
| Costco | `www.costco.ca` | 📋 backlog | P3 | Distributeur sur abonnement |
| eBay | `www.ebay.ca` | 📋 backlog | P3 | Marketplace |

## Autres pays

Liste courte ; d'autres suivront sur demande.

| Site | Domaine | Statut | Priorité | Notes |
|------|---------|--------|----------|-------|
| Amazon.com.au (Australie) | `www.amazon.com.au` | 📋 backlog | P2 | Extension de l'extracteur Amazon |
| Amazon.co.jp (Japon) | `www.amazon.co.jp` | 📋 backlog | P3 | Interface japonaise, analyse dédiée nécessaire |
| Amazon.pl (Pologne) | `www.amazon.pl` | 📋 backlog | P3 | Extension de l'extracteur Amazon |
| Allegro (Pologne) | `allegro.pl` | 📋 backlog | P3 | Première marketplace polonaise |
| Amazon.se (Suède) | `www.amazon.se` | 📋 backlog | P3 | Extension de l'extracteur Amazon |

## Comment un marchand est ajouté

1. **Les domaines Amazon d'abord.** L'extracteur Amazon couvre désormais `.fr`, `.de`, `.es`, `.it`,
   `.com.be`, `.nl`, `.co.uk` et `.com`. Une boutique passe de « en test » à « prise en charge » dès
   qu'une vraie page de commande anonymisée la couvre. Les autres domaines Amazon (`.ca`, `.pl`, `.se`,
   ...) suivront à la demande.
2. **Les autres sites un par un.** Chaque site demande un extracteur dédié, écrit et testé sur de
   **vraies pages de commande, anonymisées** (noms, adresses, numéros de commande et prix masqués).
   Ne joignez jamais de page brute ni de donnée personnelle à un ticket.
3. **Permission d'hôte au cas par cas.** L'extension ne déclare aucune permission d'hôte statique.
   Elle lit l'onglet du marchand via `activeTab` à l'ouverture de la popup, et la seule origine
   demandée à l'exécution est celle de votre instance HomeBox, au cas par cas.
4. **Registre et cette page.** Un marchand est enregistré dans
   `src/content/merchants/registry.ts`, puis passe dans « Supported » ici (un test unitaire vérifie
   la cohérence). Voir [CONTRIBUTING.md](CONTRIBUTING.md).

Pour demander un site, ouvrez une
[demande de marchand](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml)
(formulaire « Request a new merchant » : nom, domaines, pays, langue, factures).

## Sources

Les classements sont indicatifs ; aucun chiffre d'audience n'est repris ici. Consultées le
9 novembre 2026.

- France : baromètre d'audience e-commerce Fevad / Médiamétrie//NetRatings, T2 2026 (publié le
  1er septembre 2026), relayé par
  [Blog du Modérateur](https://www.blogdumoderateur.com/sites-e-commerce-visites-france-temu-shein-aliexpress/)
  (10 septembre 2026). Top 10 dans l'ordre : Amazon, Leboncoin, Booking.com, Temu, Vinted,
  E.Leclerc, Lidl, Carrefour, Shein, Cdiscount ; AliExpress est sorti du top 10. Booking.com, Lidl,
  Carrefour et E.Leclerc sont écartés de cette feuille de route (voyage ou grande distribution
  alimentaire).
- Allemagne : Semrush « Trending Websites, Retail », données de février 2025, via
  [eCommerce Germany](https://ecommercegermany.com/blog/most-visited-retail-websites-in-germany-2025/)
  (4 avril 2025).
- Europe (Royaume-Uni, Espagne, Italie, Pays-Bas, Belgique) : ChannelEngine,
  [The top European online marketplaces](https://channelengine.com/en/blog/top-european-online-marketplaces)
  (24 décembre 2025). Centré sur les marketplaces : des enseignes comme Boulanger, Currys ou
  Coolblue sont placées par jugement éditorial.
- États-Unis, Canada, autres pays : aucun classement récent vérifié ; l'ordre relève du jugement
  éditorial.
- Une présence dans la liste n'est pas une recommandation ; homebox-clipper n'est affilié à aucun
  des marchands cités.
