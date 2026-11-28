---
title: "Traductions et textes de l'interface"
description: "Comment les textes de l'interface sont traduits et comment en ajouter ou en modifier un."
---

**Public visé** : les contributeurs qui corrigent une faute, améliorent une formulation, ajoutent un texte à
l'interface ou le traduisent. Prérequis : le projet est [installé](/homebox-clipper/fr/contributing/development-setup/).
Pour corriger un texte, les sections [Modifier un texte existant](#modifier-un-texte-existant) et
[Ajouter un texte](#ajouter-un-texte) suffisent.

Tous les textes visibles de l'extension viennent de **catalogues** : `src/locales/en.yml` (anglais, langue
par défaut et référence) et `src/locales/fr.yml` (français). Aucun texte n'est écrit en dur dans les
composants Vue ni dans le code de `src/ui/`.

## Quelle langue est affichée

- `default_locale` vaut `en` dans `wxt.config.ts` : les textes du manifeste (`extName`, `extDescription`)
  viennent de `en.yml`, et le français est servi depuis `_locales/fr` quand le navigateur est réglé en
  français.
- Dans l'interface, `uiLanguage()` (`src/ui/i18n.ts`) choisit la langue d'après la langue d'interface du
  navigateur : `fr` pour `fr`, `fr-CA`..., `en` pour tout le reste. Elle pilote aussi l'attribut `lang` des
  pages et le format des dates (`formatDate` : `22/10/2026` en français, `22 October 2026` en anglais).
- Les notes écrites dans HomeBox (par exemple « Commande Amazon.de : <numéro> ») suivent la même langue ;
  le nom de la boutique vient du code (`MERCHANT_CATALOG`), jamais des catalogues.

## Format des catalogues

- YAML imbriqué au format `@wxt-dev/i18n`, un message par feuille.
- Les clés sont regroupées par écran ou par couche : `extName`, `extDescription`, `common.*`, `header.*`,
  `theme.*`, `fields.*`, `documents.*`, `popup.*`, `summary.*`, `location.*`, `result.*`, `recovery.*`,
  `unlock.*`, `options.*`, `error.<CODE>`.
- **Nommage** : segments en `camelCase`, sauf le dernier segment de `error.*`, qui reprend le code d'erreur
  en `UPPER_SNAKE_CASE` (`error.UNAUTHORIZED`, `error.NOT_AN_ORDER_PAGE`).
- Les valeurs dynamiques utilisent des **substitutions positionnelles** `$1`, `$2`..., jamais de
  concaténation dans le code (exemple : `summary.orderNote` vaut « $1 order: $2 » en anglais, `$1` étant la
  boutique et `$2` le numéro de commande).
- `extName` et `extDescription` alimentent le nom et la description de l'extension dans le manifeste.
- Interdit dans un message : la clé API, une adresse d'instance, des données d'achat.

## Parité entre `en` et `fr`

`en.yml` et `fr.yml` doivent toujours rester synchronisés :

- **Mêmes clés** : exactement le même ensemble de clés dans les deux fichiers.
- **Mêmes substitutions** : chaque clé a les mêmes paramètres `$n` dans les deux langues.
- **Aucun texte non traduit** : une valeur identique dans les deux langues (par exemple un nom propre) doit
  figurer dans la liste d'exceptions explicite du test (`IDENTICAL_OK`), avec la raison en commentaire ; une
  exception devenue inutile fait aussi échouer le test.
- **Aucun caractère accentué dans `en.yml`**.

La parité est vérifiée à deux endroits : `bun run check:config` (clés et substitutions, lancé en premier par
`bun run ci` et donc par le hook `pre-push`) et `tests/unit/locales.test.ts` (lancé par `bun run test`).

:::caution[Important]
**Règle FR-004c.** Tout texte d'interface ajouté ou modifié l'est dans les **deux catalogues**
(`src/locales/en.yml` et `src/locales/fr.yml`) **dans la même contribution**. Une pull request qui ne
touche qu'un des deux ne passe pas `bun run ci`.
:::

## Modifier un texte existant

1. Trouvez la clé dans `src/locales/en.yml` (le texte affiché est la valeur) et sa jumelle dans `fr.yml`.
2. Modifiez la valeur dans les **deux** fichiers. Ne renommez pas une clé sans mettre à jour tous ses usages.
3. Lancez `bun run test` puis `bun run ci`.
   **Résultat attendu** : aucune erreur. Avec `bun run dev`, le nouveau texte apparaît dans l'extension après
   son rechargement (passez le navigateur en français pour voir le texte français).

## Ajouter un texte

1. Ajoutez la clé à **`en.yml` et `fr.yml`**, dans le bon groupe, avec les mêmes substitutions.
2. Dans un composant ou un module de `src/ui/`, appelez `t('group.key')` (ou `t('group.key', [value])`)
   depuis `src/ui/i18n.ts`. Les clés sont **typées** d'après le catalogue : une clé inconnue ne compile pas.
3. Pour un code d'erreur, ajoutez le code à `src/shared/errors.ts` **et** la clé `error.<CODE>` (dans les deux
   fichiers) : le test refuse un code sans message. Utilisez `errorMessage(code)` pour l'afficher.
4. Dans le service worker (qui n'importe pas `src/ui/`), utilisez `getMessage` depuis
   `src/platform/i18n.ts`.
5. Les dates passent par `formatDate`, les tailles de fichiers par les clés `common.size*`.

Le nom du message côté navigateur est la clé dont les points sont remplacés par des tirets bas
(`popup.pageTitle` devient `popup_pageTitle`). Vous n'avez pas à le gérer vous-même.

## Ajouter une autre langue

Ajouter une langue suit le même principe : un fichier `src/locales/<language>.yml` avec toutes les clés, les
mêmes substitutions que `en.yml`, et le test de parité étendu à ce fichier. Mettez à jour `uiLanguage()` et
`formatDate` dans `src/ui/i18n.ts`, qui ne distinguent aujourd'hui que `fr` de l'`en` par défaut.

## Ce que vérifient les tests

`tests/unit/locales.test.ts` : parité `en`/`fr` (clés, substitutions, texte non traduit, aucun accent dans
`en.yml`), aucune valeur vide, un message `error.<CODE>` pour chaque code d'erreur, présence de `extName` et
`extDescription`, et existence dans le catalogue de chaque clé littérale passée à `t()` ou `getMessage()`
dans `src/`. `tests/unit/ui-i18n-render.test.ts` vérifie que l'avertissement « HTTP non chiffré » affiché
est exactement la valeur du catalogue.

## Si ça ne marche pas

| Symptôme | Solution |
|----------|----------|
| `bun run check:config` signale une clé ou une substitution manquante | Ajoutez la clé (ou le `$n`) à l'autre catalogue. |
| `typecheck` échoue sur `t('…')` | La clé n'existe pas dans `en.yml` : vérifiez son orthographe ou ajoutez-la. |
| Le test signale une valeur identique dans les deux langues | Traduisez-la ou, pour un nom propre, ajoutez-la à `IDENTICAL_OK` dans `tests/unit/i18n-harness.ts` avec la raison. |
| Le test signale un caractère accentué | `en.yml` ne doit pas contenir d'accents : écrivez le texte anglais sans eux. |

Voir aussi [Architecture](/homebox-clipper/fr/contributing/architecture/) (couche i18n) et
[Tests et fixtures](/homebox-clipper/fr/contributing/testing-and-fixtures/).
