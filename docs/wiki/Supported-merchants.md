# Marchands pris en charge

HomeBox Clipper vise à terme les boutiques en ligne en général. Cette page résume l'état actuel ; la
liste complète, tenue à jour à chaque ajout de marchand, est dans
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md).

## En bref

| Marchand | Domaine | Pays | Ce qui est détecté | Limites |
|----------|---------|------|--------------------|---------|
| Amazon France | `www.amazon.fr` | FR | nom, prix, devise, date, numéro de commande, vendeur, quantité, image, facture(s) PDF | Page « Détails de la commande » uniquement |

D'autres marchands (Amazon Allemagne, Espagne, Italie, États-Unis, eBay, Fnac, Darty, Boulanger,
Leroy Merlin…) figurent sur la feuille de route, sans date. Le statut de chacun est dans
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md).

## Comment l'extension choisit un marchand

Chaque marchand est un module d'extraction indépendant qui déclare ses domaines. Au clic sur l'icône, le
service worker cherche, dans le registre des marchands (`src/content/merchants/registry.ts`, qui exporte
`MERCHANTS`), le premier extracteur dont `matchesUrl` est vrai pour l'onglet actif, puis n'injecte que
son script. Si aucun marchand ne correspond, l'extension propose la saisie manuelle
(voir [Usage](Usage.md)).

## Votre boutique manque ?

- **La demander** : ouvrez une issue avec le modèle « marchand » du dépôt
  ([issues](https://github.com/Foufou-exe/homebox-clipper/issues)).
- **L'ajouter vous-même** : voir [Adding-a-merchant](Adding-a-merchant.md). Ni le client HomeBox, ni
  l'orchestrateur d'import, ni l'interface n'ont à changer.
- **Une page Amazon mal détectée ?** Signalez-la sans joindre la page brute (elle contient vos données
  personnelles) : indiquez le type de commande (vendeur Amazon ou tiers, plusieurs articles…) et le champ
  concerné.
