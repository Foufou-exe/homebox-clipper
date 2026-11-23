---
title: "Maintenir l'environnement de développement"
description: "Garder l'environnement de développement et ses fichiers de réglages cohérents."
---

Cette page liste les fichiers à mettre à jour quand un outil du projet change, afin que la machine locale, le
conteneur de développement et la CI restent cohérents. Une vérification automatique, `bun run check:config`, détecte une
grande partie des oublis.

## Quand X change, que mettre à jour ?

| Si... | Fichiers à mettre à jour | Note |
|-------|--------------------------|------|
| La version de **Bun** change | `package.json` (`packageManager`), `mise.toml`, `.devcontainer/post-create.sh` | Le workflow `.github/workflows/ci.yml` installe Bun avec `oven-sh/setup-bun` : vérifiez qu'il suit la même version. `check:config` vérifie que la version major.minor est la même partout. |
| La version de **Node** change | `mise.toml`, `.devcontainer/devcontainer.json` (tag de l'image `typescript-node`), `.github/workflows/ci.yml` (`node-version`) | Le projet suit la version LTS. |
| La version de **HomeBox** change | `compose.yaml` (variable `HOMEBOX_VERSION`), `.env.example`, `docs/local-homebox.md`, [Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/), la version testée dans [Installation](/homebox-clipper/fr/getting-started/installation/) | Relancez les scénarios de test locaux après la mise à jour. |
| Une **extension VS Code** est ajoutée ou retirée | `.vscode/extensions.json` et `.devcontainer/devcontainer.json` (`customizations.vscode.extensions`) | Les deux listes doivent rester cohérentes pour les extensions utiles au projet. |
| **WXT** ou **Vite** change | `package.json` (dépendances), `wxt.config.ts`, `vitest.config.ts`, `vitest.build.config.ts` | Lancez `bun run ci` : le build et le test du manifeste détectent les casses. |
| Un **script** de `package.json` est ajouté ou renommé | `CONTRIBUTING.md` (section « Commands »), `.vscode/tasks.json`, `scripts/setup.sh` (message final) | Chaque script doit apparaître dans `CONTRIBUTING.md` sous la forme `bun run <script>`. |
| Un **modèle de ticket** ou un **label** change | `.github/ISSUE_TEMPLATE/*.yml`, `.github/labels.yml`, `REQUIRED_FIELDS` dans `scripts/check-config.ts` | Appliquez ensuite les labels avec `scripts/sync-labels.sh` (action manuelle). |
| Un **texte de l'interface** est ajouté ou modifié | `src/locales/en.yml` **et** `src/locales/fr.yml` | Même contribution (règle FR-004c) ; `check:config` vérifie la parité. Voir [Traductions](/homebox-clipper/fr/contributing/translations/). |

## Vérifier les réglages

```bash
bun run check:config
```

Cette vérification, lancée en tête de `bun run ci` (donc par le hook `pre-push`), contrôle :

- la syntaxe des fichiers JSON avec commentaires (`.vscode/*.json`, `.devcontainer/devcontainer.json`,
  `tsconfig.json`) et des fichiers YAML (`.github/**/*.yml`, `compose.yaml`, `src/locales/*.yml`) ;
- que `src/locales/en.yml` et `src/locales/fr.yml` ont les mêmes clés et les mêmes substitutions `$n` ;
- que `package.json`, `mise.toml` et `.devcontainer/post-create.sh` figent la même version de Bun ;
- que les labels cités par les modèles de tickets existent dans `.github/labels.yml`, et que ce fichier est
  bien formé (noms uniques, couleur hexadécimale à 6 chiffres, description de 100 caractères au plus) ;
- que les champs obligatoires des modèles de tickets le sont réellement, et que les tickets vides sont
  désactivés (`config.yml`).

Les fichiers de `.github/ISSUE_TEMPLATE/` et `.github/labels.yml` ne déclenchent pas la CI GitHub :
`check:config`, lancé en local, est leur seule protection. Pensez à lancer `bun run ci` avant de pousser.

Le script est testé par `tests/unit/check-config.test.ts`, sur des dépôts factices dans
`tests/fixtures/config/`.

## Analyse SonarQube

Le workflow `.github/workflows/sonarqube.yml` et `sonar-project.properties` configurent l'analyse
SonarQube Cloud. Gardez `sonar.sources` et `sonar.tests` alignés sur l'organisation des répertoires
(`src`, `scripts`, `tests`) quand elle change, et étendez les exclusions pour les nouveaux répertoires générés ou de fixtures. Le secret de dépôt `SONAR_TOKEN` doit exister ; les pull requests issues de forks sautent le job
car elles ne peuvent pas le lire. Le workflow lance `bun run test:coverage` avant l'analyse et
`sonar.javascript.lcov.reportPaths` pointe vers `coverage/lcov.info` ; la couverture est ensuite visible sur la
page du projet SonarQube Cloud. En local, lancez `bun run test:coverage` (le dossier `coverage/` est ignoré
par git). La couverture utilise la dépendance de développement `@vitest/coverage-v8`, qui doit rester à la même version que
`vitest` ; son bloc `coverage` dans `vitest.config.ts` liste les fichiers inclus et exclus. `bun run check:config` valide uniquement la syntaxe YAML du workflow.

## Voir aussi

- [Guide de contribution](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md)
- [Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/)
- [Publier une version](/homebox-clipper/fr/maintaining/releasing/)
