# Ajouter un marchand

Un marchand est un module indépendant : on ajoute un dossier, un point d'entrée et une ligne dans le
registre. Ni le client HomeBox, ni l'orchestrateur d'import, ni l'interface n'ont à changer.

Prérequis : [environnement de développement](Maintaining-the-dev-environment.md) prêt et
[instance HomeBox locale](Local-HomeBox-instance.md) pour essayer de bout en bout.

## 1. Le contrat `MerchantExtractor`

Défini dans `src/content/merchants/types.ts` :

| Membre | Rôle |
|--------|------|
| `id` | Identifiant du marchand (type de `DetectedPurchase['source']`, aujourd'hui `'amazon.fr'`). |
| `domains: readonly string[]` | Domaines du marchand (par exemple `['www.amazon.fr']`). Source du contrôle qui garde `MERCHANTS.md` à jour. |
| `matchesUrl(url)` | Vrai si l'URL relève de ce marchand ; testé **avant toute injection**. |
| `isOrderPage(doc)` | Vrai si le document est une page de détail de commande. |
| `extract(doc, pageUrl)` | Extraction **pure** : sans réseau ni effet de bord, ne lève jamais d'exception. Renvoie un `DetectedPurchase`. |
| `resolveDocuments(doc, pageUrl, fetchSameOrigin)` | Résout les URL réelles des PDF (menu « Facture », etc.), même origine uniquement. |

Chaque champ extrait est un `Field<T>` : soit une valeur, soit explicitement absent (avec une raison).
Le cœur de l'extension ne dépend que de ce contrat, jamais du DOM.

## 2. Créer le module

Dans `src/content/merchants/<marchand>/`, sur le modèle d'`amazon-fr/` :

| Fichier | Contenu |
|---------|---------|
| `selectors.ts` | **Seul** fichier contenant des sélecteurs. Pour chaque champ, une liste ordonnée du plus précis au plus général. |
| `parse.ts` | Fonctions pures d'analyse (prix, dates, numéro de commande, quantité). |
| `extractor.ts` | L'objet implémentant `MerchantExtractor`, avec le helper à sélecteurs de secours. |
| `download.ts` | Téléchargement de la facture dans le contexte de la page (cookies de première partie), vérification PDF et taille. |

Règles : un sélecteur qui échoue passe au suivant ; une origine différente de celle du marchand est refusée au
téléchargement ; pas de dépendance au DOM en dehors de ce dossier.

## 3. Point d'entrée injectable

Créez `src/entrypoints/<marchand>.content.ts` sur le modèle de `amazon-fr.content.ts` :
`registration: 'runtime'` (jamais de script statique), `matches` limité aux pages du marchand, écoute des
messages d'extraction et de téléchargement (`sender.id` vérifié, message validé). Le script est injecté à la
demande, à l'ouverture du popup, grâce à `activeTab`. Regardez dans `src/background/detect.ts` comment le
script du marchand détecté est injecté (aujourd'hui la constante `AMAZON_FR_SCRIPT`).

Aucune permission d'hôte ne doit être ajoutée au manifeste : si votre marchand semble en exiger, signalez-le
et justifiez-le dans la pull request.

## 4. Déclarer le marchand dans le registre

`src/content/merchants/registry.ts` exporte `MERCHANTS`, la liste des extracteurs. Ajoutez-y le vôtre : le
service worker retient le premier extracteur dont `matchesUrl` est vrai pour l'onglet actif.

## 5. Fixtures et tests

- Capturez une vraie page de commande dans `tests/fixtures/<marchand>/raw/` (ignoré par git), anonymisez-la
  et copiez-la dans `tests/fixtures/<marchand>/` : procédure dans [Testing-and-fixtures](Testing-and-fixtures.md).
- Écrivez les tests de l'extracteur et des parseurs sur ces fixtures (page simple, plusieurs articles, sans
  facture, vendeur tiers, page qui n'est pas une commande…).
- **Ne commitez jamais** de page brute, de clé API ni d'adresse d'instance réelle.

## 6. Mettre à jour `MERCHANTS.md`

Ajoutez une ligne dans la section « Supported » (ou « Partial ») de [MERCHANTS.md](https://github.com/Foufou-exe/homebox-companion/blob/main/MERCHANTS.md) : marchand,
domaines, pays, champs détectés, version, limites. Un test échoue si un extracteur du registre n'y figure pas
(l'un de ses domaines doit apparaître dans une ligne des sections Supported ou Partial). Les identifiants de
statut (`Supported`, `Partial`, `In progress`, `Planned`, `Requested`) restent en anglais. Ajoutez aussi une
entrée « Added » dans le [journal des modifications](https://github.com/Foufou-exe/homebox-companion/blob/main/CHANGELOG.md).

## 7. Clés de traduction

Les textes visibles viennent de `src/locales/fr.yml`. Si votre marchand écrit du texte dans HomeBox (comme la
note « Commande Amazon.fr : … » ou la description « Acheté sur Amazon.fr le … »), ajoutez des clés dédiées avec
substitutions `$1`, `$2` plutôt que de concaténer dans le code. Voir [Translations](Translations.md).

## 8. Vérifier

```bash
bun run ci     # typecheck, lint, tests, build, manifeste
```

Puis essayez sur une vraie commande avec `bun run dev` et votre instance de test.
