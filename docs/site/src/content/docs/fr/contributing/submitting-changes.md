---
title: "Proposer une modification"
description: "D'une branche à une pull request : format des commits, vérifications locales et ce que la relecture attend."
---

**Public visé** : les contributeurs qui ont [installé le projet](/homebox-clipper/fr/contributing/development-setup/)
et veulent proposer une correction, une fonctionnalité, un marchand, une traduction ou une modification de la
documentation.

## Avant de commencer

- Pour une grosse modification, ouvrez d'abord un ticket (ou une [discussion Ideas](https://github.com/Foufou-exe/homebox-clipper/discussions/categories/ideas)),
  pour valider l'approche avant d'écrire le code.
- Si vous n'avez pas d'accès en écriture au dépôt, faites un fork sur GitHub et clonez votre fork.

## Étapes

1. Mettez `main` à jour et créez une branche nommée d'après le sujet :

   ```bash
   git switch main
   git pull
   git switch -c fix/short-description
   ```

   Préfixes : `feat/…`, `fix/…`, `docs/…`, `chore/…`, `ci/…`.

2. Faites votre modification. Restez sur un seul sujet. Selon ce que vous changez, lisez aussi :
   - un texte de l'interface : [Traductions](/homebox-clipper/fr/contributing/translations/) (anglais **et**
     français dans la même modification) ;
   - une page de marchand : [Tests et fixtures](/homebox-clipper/fr/contributing/testing-and-fixtures/) et
     [Ajouter un marchand](/homebox-clipper/fr/contributing/adding-a-merchant/) ;
   - l'interface : vérifiez-la dans les thèmes clair **et** sombre (les couleurs sont des variables CSS dans
     `src/ui/theme.css`) ;
   - le site de documentation : voir [Modifier la documentation](#modifier-la-documentation).

3. Faites un commit avec un message au format [Conventional Commits](https://www.conventionalcommits.org/fr/).
   Il est **obligatoire** : le numéro de version et le journal des modifications en sont calculés.

   ```bash
   git commit -m "fix: keep the order date when the page is in English"
   ```

   | Votre modification | Type à utiliser |
   |--------------------|-----------------|
   | Nouvelle fonctionnalité ou nouveau marchand | `feat:` |
   | Correction de bug | `fix:` |
   | Performance | `perf:` |
   | Documentation seulement | `docs:` |
   | Changement de code sans nouveau comportement | `refactor:` |
   | Tests seulement | `test:` |
   | Outillage, dépendances | `chore:` ou `build:` |
   | Workflows de CI | `ci:` |
   | Changement incompatible | `!` après le type (`feat!:`) ou un pied de message `BREAKING CHANGE:` |

   L'anglais ou le français sont tous deux acceptés. Ne modifiez pas `CHANGELOG.md` ni la version de
   `package.json` : ils sont générés à la publication d'une version.

4. Lancez toutes les vérifications :

   ```bash
   bun run ci
   ```

   **Résultat attendu** : aucune erreur. Si vous avez installé le hook `pre-push`, il lance cette commande
   pour vous à chaque push et bloque le push en cas d'erreur.

5. Poussez la branche :

   ```bash
   git push -u origin fix/short-description
   ```

6. Sur GitHub, ouvrez une pull request vers `main` et remplissez le modèle (résumé, type de modification,
   ticket lié, vérifications).
   - **Donnez à la pull request un titre au format Conventional Commits** (`fix: …`) : la pull request est
     fusionnée en « squash », donc son titre devient le commit qui alimente le journal des modifications.
   - Si vous avez modifié le manifeste (permissions, `host_permissions`, CSP), dites-le et justifiez-le.

7. Attendez les vérifications de la pull request.
   **Résultat attendu** : la CI est verte. Pour une pull request ouverte depuis une branche du dépôt, une
   analyse SonarQube Cloud s'exécute aussi ; pour une pull request depuis un fork, elle est ignorée et ne vous
   bloque jamais.

## Les règles du projet que la relecture vérifie

- **Clé API** : seul le service worker l'utilise. Elle est chiffrée au repos, envoyée uniquement à
  l'instance HomeBox et jamais journalisée. Aucun `console.*` en dehors de `src/shared/logger.ts` (une règle
  ESLint le vérifie).
- **Confirmation explicite** : rien n'est écrit dans HomeBox sans un clic de l'utilisateur.
- **Permissions minimales** : tout changement du manifeste est signalé et justifié dans la pull request.
  `bun run test:build` vérifie le manifeste compilé.
- **Sélecteurs de marchand** : uniquement dans le `selectors.ts` du dossier du marchand, avec plusieurs
  sélecteurs par champ ; les textes dans la langue de la page uniquement dans
  `src/content/merchants/amazon/page-locales.ts`.
- **Tests sur des pages anonymisées uniquement**. **Ne commitez jamais** une page brute d'un marchand, une
  clé API, un pepper ou une adresse d'instance réelle.
- **Textes de l'interface** dans `src/locales/en.yml` **et** `src/locales/fr.yml`, dans la même modification.

## Modifier la documentation

Le site de documentation est le dossier `docs/site/` (Astro Starlight). Chaque page existe en anglais
(`docs/site/src/content/docs/`) et en français (`docs/site/src/content/docs/fr/`, même nom de fichier) :
modifiez les deux dans la même pull request.

1. Modifiez la page, ou utilisez le lien « Modifier la page » en bas d'une page du site.
2. Prévisualisez-la (facultatif) :

   ```bash
   bun run docs:dev
   ```

   **Résultat attendu** : le site est servi sur <http://localhost:4321/homebox-clipper/> et se recharge à
   l'enregistrement.
3. Vérifiez-la :

   ```bash
   bun run docs:build
   ```

   **Résultat attendu** : la compilation se termine par `All internal links are valid.` et `Complete!`.
   Le site ne fait pas partie de `bun run ci` : lancez cette commande vous-même pour toute modification de la
   documentation.

`docs:build` demande une version récente de Node.js (Astro vérifie la version et s'arrête avec un message
clair si elle est trop ancienne) : avec mise, `mise install` s'en charge.

## Si ça ne marche pas

| Symptôme | Solution |
|----------|----------|
| Le hook `pre-push` bloque le push | `bun run ci` a trouvé une erreur : lisez la première, corrigez-la, faites un commit, poussez de nouveau. |
| Le titre de la pull request n'est pas au format Conventional Commits | Cliquez sur **Edit** à côté du titre sur GitHub et renommez-la (`fix: …`, `feat: …`). |
| `bun run docs:build` signale un lien cassé | Corrigez le lien ou l'ancre nommé(e) ; les liens vers une autre page commencent par `/homebox-clipper/` (ou `/homebox-clipper/fr/` dans les pages françaises). |
| `bun run check:config` échoue sur `en.yml`/`fr.yml` | Une clé ou une substitution `$n` n'existe que dans un seul catalogue : ajoutez-la à l'autre. |

Les questions sont les bienvenues dans les [discussions Q&A](https://github.com/Foufou-exe/homebox-clipper/discussions/categories/q-a).
