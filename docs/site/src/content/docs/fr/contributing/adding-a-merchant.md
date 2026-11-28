---
title: "Ajouter un marchand"
description: "Guide pas à pas pour prendre en charge une nouvelle boutique en ligne."
---

**Public visé** : les contributeurs qui veulent que l'extension lise les pages de commande d'une nouvelle
boutique en ligne. À la fin, la popup détecte un achat sur cette boutique et `bun run ci` passe.

Un marchand est un module indépendant : vous ajoutez un dossier, un point d'entrée et une ligne dans le registre.
Ni le client HomeBox, ni l'orchestrateur d'import, ni l'interface n'ont à changer.

## Avant de commencer

- Le projet est [installé](/homebox-clipper/fr/contributing/development-setup/) et `bun run ci` passe.
- Une [instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/) tourne, pour tester de bout en bout.
- Vous avez un compte sur la boutique, avec au moins une commande passée dont vous pouvez ouvrir la page de détails.
- Facultatif mais recommandé : un ticket de [demande de marchand](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml),
  pour que personne d'autre ne travaille sur la même boutique.

Lisez d'abord [Architecture](/homebox-clipper/fr/contributing/architecture/) si vous ne connaissez pas encore le code.

## 1. Le contrat `MerchantExtractor`

Défini dans `src/content/merchants/types.ts` :

| Membre | Rôle |
|--------|------|
| `id` | Identifiant du marchand, de type `MerchantId` (`src/content/merchants/catalog.ts`), aujourd'hui un par boutique Amazon (`'amazon.fr'`, `'amazon.de'`...). Jamais renommé : il est conservé dans `DraftPhoto.merchantId`. |
| `displayName` | Nom affiché dans l'interface et écrit dans HomeBox (« Amazon.de »). |
| `domains: readonly string[]` | Les domaines du marchand (par exemple `['www.amazon.de']`). Source de la vérification qui garde `MERCHANTS.md` à jour. |
| `imageHosts: readonly string[]` | **Obligatoire.** Hôtes **exacts** autorisés pour la photo du produit (pas de suffixe ni de joker). Une liste vide signifie « pas de photo pour ce marchand ». |
| `matchesUrl(url)` | Vrai si l'URL appartient à ce marchand ; testé **avant toute injection**. |
| `isOrderPage(doc, pageUrl)` | Vrai si le document est une page de détails de commande (marqueur du DOM, ou chemin connu et numéro de commande lisible). |
| `extract(doc, pageUrl)` | Extraction **pure** : pas de réseau, pas d'effet de bord, ne lève jamais d'exception. Renvoie un `DetectedPurchase`. |
| `resolveDocuments(doc, pageUrl, fetchSameOrigin)` | Résout les vraies URL des PDF (menu « Facture », etc.), même origine uniquement. |

Chaque champ extrait est un `Field<T>` : soit une valeur, soit explicitement absent (avec une raison). Le cœur de
l'extension ne dépend que de ce contrat, jamais du DOM.

Pour la photo, `extract` applique `isAllowedImageUrl(src, imageHosts)` (`src/shared/image.ts`) puis, si
besoin, une réécriture pure de la résolution (`toPhotoUrl` pour Amazon), et place le résultat dans `imageUrl`. Le service
worker revérifie l'URL avant le `fetch`. **Question CORS** : la photo est récupérée par un `fetch`
anonyme depuis le service worker, sans permission supplémentaire ; le CDN du marchand doit donc répondre avec un
en-tête `Access-Control-Allow-Origin` adapté. Sinon la photo échoue proprement (`PHOTO_UNAVAILABLE`) et
une décision propre à ce marchand est nécessaire avant d'ajouter un quelconque accès.

## 2. Créer le module

Dans `src/content/merchants/<merchant>/`, sur le modèle de `amazon/` (un module pour plusieurs boutiques du même
marchand, paramétré par une table : `amazon/stores.ts` ; textes selon la langue de la page dans `amazon/page-locales.ts`) :

| Fichier | Contenu |
|---------|---------|
| `selectors.ts` | Le **seul** fichier contenant des sélecteurs. Pour chaque champ, une liste ordonnée du plus spécifique au plus général. |
| `parse.ts` | Fonctions d'analyse pures (prix, dates, numéro de commande, quantité). |
| `extractor.ts` | L'objet qui implémente `MerchantExtractor`, avec l'utilitaire de sélecteurs de repli. |
| `download.ts` | Téléchargement de la facture dans le contexte de la page (cookies first-party), vérification du PDF et de la taille. |

Règles : un sélecteur qui échoue passe au suivant ; une origine différente de celle du marchand est refusée
au téléchargement ; aucune dépendance au DOM en dehors de ce dossier.

## 3. Point d'entrée injectable

Créez `src/entrypoints/<merchant>.content.ts` sur le modèle de `amazon.content.ts` :
`registration: 'runtime'` (jamais un script statique), `matches` limité aux pages du marchand, à l'écoute des messages
d'extraction et de téléchargement (`sender.id` vérifié, message validé). Le script est injecté à la
demande, à l'ouverture du popup, grâce à `activeTab`. Regardez `src/background/detect.ts` pour voir comment le script du marchand
détecté est injecté (aujourd'hui la constante `AMAZON_SCRIPT`).

Aucune permission d'hôte ne doit être ajoutée au manifeste : si votre marchand semble en exiger une, dites-le et
justifiez-le dans la pull request.

## 4. Déclarer le marchand dans le registre

`src/content/merchants/registry.ts` exporte `MERCHANTS`, la liste des extracteurs. Ajoutez le vôtre : le service
worker retient le premier extracteur dont `matchesUrl` est vrai pour l'onglet actif.

### Garantie (facultatif)

La garantie proposée dans le récapitulatif nécessite deux entrées dans le catalogue (`CatalogEntry`) : `country` (code ISO de
la boutique) et `ownSellers` (les noms sous lesquels la boutique vend elle-même, ou `'any'` pour un marchand sans
place de marché). La garantie légale par défaut n'est proposée que pour un pays de la table de
`src/shared/warranty.ts` (France, Allemagne, Italie, Belgique, Espagne) et seulement lorsque le vendeur lu sur la ligne
du produit est égal à l'un des `ownSellers` ; un nouveau pays nécessite d'abord une ligne sourcée (texte officiel lu). Lire une
garantie depuis la page de commande est optionnel : déclarez vos propres sélecteurs `warranty…` dans votre `selectors.ts` (avec
des replis) et renseignez `DetectedProduct.pageWarranty` avec `parseWarrantyText` depuis
`src/content/merchants/warranty-text.ts` ; sans cela, la propriété reste absente.

## 5. Fixtures et tests

- Capturez une vraie page de commande dans `tests/fixtures/<merchant>/raw/` (ignoré par git), anonymisez-la et copiez-la
  dans `tests/fixtures/<merchant>/` : procédure dans [Tests et fixtures](/homebox-clipper/fr/contributing/testing-and-fixtures/).
- Écrivez les tests de l'extracteur et de l'analyseur sur ces fixtures (page simple, plusieurs articles, sans facture,
  vendeur tiers, page qui n'est pas une commande...).
- **Ne commitez jamais** une page brute, une clé API ou une vraie adresse d'instance.

## 6. Mettre à jour `MERCHANTS.md`

Ajoutez une ligne dans la section « Supported » (ou « Partial ») de
[MERCHANTS.fr.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.fr.md) : marchand, domaines,
pays, champs détectés, version, limites. Un test échoue si un extracteur du registre n'y figure pas (l'un
de ses domaines doit apparaître dans une ligne des sections Supported ou Partial). Les identifiants de statut
(`Supported`, `Partial`, `In progress`, `Planned`, `Requested`) sont fixes. Faites de même dans
[MERCHANTS.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/MERCHANTS.md).

Ne modifiez pas `CHANGELOG.md` : il est généré à la publication d'une version à partir du titre de votre
pull request. Utilisez un titre `feat:`, par exemple `feat: support the order pages of <shop>` (voir
[Proposer une modification](/homebox-clipper/fr/contributing/submitting-changes/)).

## 7. Clés de traduction

Les textes visibles viennent de `src/locales/en.yml` et `src/locales/fr.yml` : tout texte que vous ajoutez va dans **les deux**
fichiers dans la même contribution (règle FR-004c, voir [Traductions](/homebox-clipper/fr/contributing/translations/)). Si votre marchand écrit
du texte dans HomeBox, la note « Commande <boutique> : ... » et la description « Acheté sur <boutique> le ... » prennent déjà
le nom de la boutique dans `MERCHANT_CATALOG` (`displayName`) : ajoutez le marchand au catalogue plutôt que de nouvelles
clés. Tout autre texte utilise des clés dédiées avec des substitutions `$1`, `$2`, jamais de concaténation dans le code.

## 8. Vérifier

1. Lancez toutes les vérifications :

   ```bash
   bun run ci     # typecheck, lint, tests, build, manifest
   ```

   **Résultat attendu** : aucune erreur.
2. Lancez `bun run dev`, connectez-vous à la boutique dans le navigateur de développement, ouvrez la page de
   détails d'une de vos commandes, puis cliquez sur l'icône de l'extension.
   **Résultat attendu** : la popup affiche le produit, le prix, la date et le numéro de commande.
3. Cliquez sur **Ajouter à HomeBox** et vérifiez l'objet dans votre instance de test.

## Si ça ne marche pas

| Symptôme | Solution |
|----------|----------|
| « Aucun achat détecté sur cette page. » | `matchesUrl` ou `isOrderPage` renvoie false : vérifiez la liste des domaines et le repère DOM de la page de commande. |
| Un champ affiche « non détecté » | Ses sélecteurs ne correspondent pas : ajoutez un sélecteur de repli dans `selectors.ts` et un test sur votre fixture. |
| Le test sur `MERCHANTS.md` échoue | L'un des domaines du marchand doit apparaître dans une ligne de la section Supported ou Partial. |
| La photo est absente (`PHOTO_UNAVAILABLE`) | L'hôte de l'image n'est pas dans `imageHosts`, ou le CDN de la boutique refuse la requête anonyme (voir la question CORS de la section 1). |

Ouvrez ensuite une pull request : [Proposer une modification](/homebox-clipper/fr/contributing/submitting-changes/).
