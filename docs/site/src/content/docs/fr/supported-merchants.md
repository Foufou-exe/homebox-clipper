---
title: "Marchands pris en charge"
description: "Les boutiques en ligne que HomeBox Clipper sait lire, et comment en demander une nouvelle."
---

**Public visé** : les utilisateurs qui veulent savoir sur quelles boutiques l'extension fonctionne, et
comment en demander une nouvelle.

HomeBox Clipper vise les boutiques en ligne en général. Cette page résume l'état actuel ; la liste
complète, tenue à jour à chaque ajout de marchand, se trouve dans
[MERCHANTS.fr.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.fr.md).

## En un coup d'œil

Chaque boutique Amazon détecte les mêmes champs : nom, prix, devise, date, numéro de commande, vendeur,
quantité, image et facture(s) PDF, uniquement sur la page « Détails de la commande ».

| Marchand | Domaine | Pays | Devise | Langues de la page | Statut |
|----------|---------|------|--------|--------------------|--------|
| Amazon France | `www.amazon.fr` | FR | EUR | français | ✅ pris en charge |
| Amazon Allemagne | `www.amazon.de` | DE | EUR | allemand, anglais | 🟡 en test |
| Amazon Espagne | `www.amazon.es` | ES | EUR | espagnol, anglais | 🟡 en test |
| Amazon Italie | `www.amazon.it` | IT | EUR | italien, anglais | 🟡 en test |
| Amazon Belgique | `www.amazon.com.be` | BE | EUR | français, néerlandais, anglais | 🟡 en test |
| Amazon Pays-Bas | `www.amazon.nl` | NL | EUR | néerlandais, anglais | 🟡 en test |
| Amazon Royaume-Uni | `www.amazon.co.uk` | GB | GBP | anglais | 🟡 en test |
| Amazon États-Unis | `www.amazon.com` | US | USD | anglais | 🟡 en test |

**En test** signifie que la boutique fonctionne mais n'a été vérifiée que sur des pages de test reconstituées
à partir des pages d'Amazon.fr, pas encore sur une vraie page de commande anonymisée : signalez toute
détection erronée. Une page dans une autre langue (le turc sur Amazon.de, par exemple) est lue sans
deviner : la date et le vendeur sont laissés à la saisie manuelle. Les prix en livres ou en dollars sont
conservés tels quels, avec un avertissement avant la confirmation : HomeBox enregistre le montant sans
conversion. Sur Amazon.com, la facture est souvent seulement un récapitulatif HTML imprimable : l'import
continue alors sans pièce jointe.

Les autres marchands (Amazon Canada, eBay, Fnac, Darty, Boulanger, Leroy Merlin...) sont sur la feuille de
route, sans date. Le statut de chacun figure dans
[MERCHANTS.fr.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.fr.md).

## Comment l'extension choisit un marchand

Chaque marchand est un module d'extraction indépendant qui déclare ses domaines. Quand vous cliquez sur
l'icône, le service worker cherche, dans le registre des marchands (`src/content/merchants/registry.ts`,
qui exporte `MERCHANTS`), le premier extracteur dont `matchesUrl` est vrai pour l'onglet actif, puis
injecte uniquement son script. Si aucun marchand ne correspond, l'extension propose la saisie manuelle
(voir [Utilisation](/homebox-clipper/fr/usage/)).

## Votre boutique manque ?

- **La demander** : ouvrez une issue avec le modèle « merchant » du dépôt
  ([issues](https://github.com/Foufou-exe/homebox-clipper/issues)).
- **L'ajouter vous-même** : voir [Ajouter un marchand](/homebox-clipper/fr/contributing/adding-a-merchant/).
  Ni le client HomeBox, ni l'orchestrateur d'import, ni l'interface n'ont à changer.
- **Une page Amazon mal détectée ?** Signalez-la avec le lien Support de l'extension, sans joindre la page
  brute (elle contient vos données personnelles) : indiquez la boutique, la langue de la page, le type de
  commande (Amazon ou vendeur tiers, plusieurs articles...) et le champ concerné.
