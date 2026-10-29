# Traductions et textes de l'interface

Tous les textes visibles de l'extension viennent d'un **catalogue** : `src/locales/fr.yml`. Aucun texte
n'est écrit en dur dans les composants Vue ni dans le code de `src/ui/`.

> Étape actuelle : le catalogue est **français seul**, et le français est la langue par défaut
> (`default_locale: fr` dans `wxt.config.ts`). Une version anglaise est prévue ensuite.

## Format du catalogue

- YAML imbriqué au format de `@wxt-dev/i18n`, un message par feuille.
- Les clés sont regroupées par écran ou couche : `extName`, `extDescription`, `common.*`, `header.*`,
  `theme.*`, `fields.*`, `documents.*`, `popup.*`, `summary.*`, `result.*`, `recovery.*`, `unlock.*`,
  `options.*`, `error.<CODE>`.
- **Nommage** : segments en `camelCase`, sauf le dernier segment de `error.*` qui reprend le code d'erreur
  en `MAJUSCULES_SNAKE` (`error.UNAUTHORIZED`, `error.NOT_AN_ORDER_PAGE`).
- Les valeurs dynamiques passent par des **substitutions positionnelles** `$1`, `$2`…, jamais par
  concaténation dans le code (exemple : `summary.orderNote` vaut « Commande Amazon.fr : $1 »).
- `extName` et `extDescription` alimentent le nom et la description de l'extension dans le manifeste.
- Interdit dans un message : la clé API, l'adresse d'une instance, des données d'achat.

## Modifier un texte existant

1. Repérez la clé dans `src/locales/fr.yml` (le texte affiché est la valeur).
2. Changez la valeur. Ne renommez pas la clé sans mettre à jour tous ses usages.
3. Lancez `bun run test` puis `bun run ci`.

## Ajouter un texte

1. Ajoutez la clé dans `fr.yml`, au bon groupe, avec ses substitutions éventuelles.
2. Dans un composant ou un module de `src/ui/`, appelez `t('groupe.cle')` (ou `t('groupe.cle', [valeur])`)
   depuis `src/ui/i18n.ts`. Les clés sont **typées** à partir de `fr.yml` : une clé inconnue ne compile pas.
3. Pour un code d'erreur, ajoutez le code dans `src/shared/errors.ts` **et** la clé `error.<CODE>` : le
   test refuse un code sans message. Utilisez `errorMessage(code)` pour l'afficher.
4. Dans le service worker (qui n'importe pas `src/ui/`), utilisez `getMessage` de `src/platform/i18n.ts`.
5. Les dates passent par `formatDate`, les tailles de fichier par les clés `common.size*`.

Le nom de message du navigateur est la clé avec les points remplacés par des soulignés
(`popup.pageTitle` devient `popup_pageTitle`). Vous n'avez pas à le gérer vous-même.

## Ce que vérifient les tests

`tests/unit/locales.test.ts` : aucune valeur vide, un message `error.<CODE>` pour chaque code d'erreur,
présence de `extName` et `extDescription`, existence dans `fr.yml` de chaque clé littérale passée à `t()` ou
`getMessage()` dans `src/`. `tests/unit/ui-i18n-render.test.ts` contrôle que l'avertissement « HTTP non
chiffré » affiché est exactement la valeur du catalogue.

## Préparation de l'étape suivante : l'anglais

Quand l'anglais sera ajouté :

- `src/locales/en.yml` devient le catalogue de référence et `default_locale` passe à `en` ; le navigateur
  choisit la langue selon sa propre langue d'interface.
- **Parité** : `en.yml` et `fr.yml` doivent avoir exactement le même ensemble de clés, et chaque clé le même
  nombre de substitutions dans les deux langues (le test échoue sinon).
- Une valeur identique dans les deux langues (par exemple un nom propre) doit figurer dans une liste
  d'exceptions explicite du test, avec la raison en commentaire ; une exception devenue inutile fait aussi
  échouer le test.
- Ajouter une autre langue suivra le même principe : un fichier `src/locales/<langue>.yml` avec toutes les clés.

Voir aussi [Architecture](Architecture.md) (couche i18n) et [Testing-and-fixtures](Testing-and-fixtures.md).
