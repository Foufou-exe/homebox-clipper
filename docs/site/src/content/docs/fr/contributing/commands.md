---
title: "Commandes"
description: "Toutes les commandes du projet qu'un contributeur utilise, ce qu'elles font et quand les lancer."
---

**Public visé** : les contributeurs qui cherchent la bonne commande. Chaque commande se lance depuis le
dossier du projet avec `bun run <script>`. Première fois ? Commencez par
[Installer le projet](/homebox-clipper/fr/contributing/development-setup/).

## Tous les jours

| Commande | Ce qu'elle fait | Quand |
|----------|-----------------|-------|
| `bun run dev` | Ouvre un Chrome de développement avec l'extension, rechargée à chaque modification | Pendant que vous codez |
| `bun run dev:firefox` | Pareil avec Firefox (Firefox doit être installé) | Pour tester sur Firefox |
| `bun run test:watch` | Relance les tests à chaque modification | Pendant que vous écrivez des tests |
| `bun run ci` | **Toutes les vérifications**, dans l'ordre : `check:config`, `typecheck`, `lint`, `test`, `build`, `test:build` | Avant chaque push |

## Les vérifications, une par une

| Commande | Ce qu'elle fait |
|----------|-----------------|
| `bun run check:config` | Valide les fichiers de réglages : syntaxe JSON/YAML, même version de Bun partout, modèles de tickets et labels, mêmes clés dans `en.yml` et `fr.yml` |
| `bun run typecheck` | Vérification des types (`vue-tsc`) |
| `bun run lint` | ESLint |
| `bun run test` | Tests unitaires et de contrat (Vitest ; **pas** `bun test`) |
| `bun run test:coverage` | Tests avec un rapport de couverture dans `coverage/` (ignoré par git). Informatif : aucun seuil |
| `bun run build` | Compile l'extension dans `.output/chrome-mv3/` et `.output/firefox-mv3/` |
| `bun run test:build` | Vérifie le manifeste compilé (permissions, CSP) ; à lancer **après** `bun run build` |

## Instance HomeBox locale

| Commande | Ce qu'elle fait |
|----------|-----------------|
| `bun run homebox:up` | Démarre l'instance HomeBox de test sur <http://localhost:3100> |
| `bun run homebox:down` | L'arrête (les données sont conservées) |
| `bun run homebox:logs` | Suit ses journaux (Ctrl+C pour quitter) |

Détails : [Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/).

## Site de documentation

| Commande | Ce qu'elle fait |
|----------|-----------------|
| `bun run docs:dev` | Prévisualise le site sur <http://localhost:4321/homebox-clipper/>, rechargé à l'enregistrement |
| `bun run docs:build` | Compile le site et vérifie chaque lien interne et chaque ancre, dans les deux langues |
| `bun run docs:install` | Installe uniquement les dépendances du site (les deux commandes ci-dessus le font déjà) |

Le site ne fait pas partie de `bun run ci` : lancez `bun run docs:build` vous-même après une modification de
la documentation.

## Occasionnelles

| Commande | Ce qu'elle fait |
|----------|-----------------|
| `bun run setup` | Prépare votre machine : vérification des outils, dépendances, `.env` du HomeBox local, hook `pre-push` facultatif. Peut être relancée sans risque |
| `bun run zip` | Construit les archives à distribuer dans `.output/` (`homebox-clipper-<version>-chrome.zip`, `-firefox.zip` et `-sources.zip`) |
| `bun run icons` | Régénère `public/icon/*.png` à partir de `src/assets/logo.svg` (demande `rsvg-convert`) |
