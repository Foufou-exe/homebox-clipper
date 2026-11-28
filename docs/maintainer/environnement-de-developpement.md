# Mettre à jour l'outillage du projet

**Public visé** : le mainteneur, quand il change une version d'outil (Bun, Node, HomeBox, WXT…), une
extension VS Code, un modèle de ticket, un label ou l'analyse SonarQube Cloud.

Le but : que la machine locale, le conteneur de développement et la CI restent cohérents.
`bun run check:config` détecte une grande partie des oublis.

## Prérequis

- Le projet installé et fonctionnel (`bun run ci` vert sur `main`).
- Une branche dédiée, par exemple `chore/bump-bun`.

## Méthode générale

1. Trouvez la ligne du tableau ci-dessous qui correspond à votre changement.
2. Modifiez **tous** les fichiers de la colonne « Fichiers à mettre à jour ».
3. Lancez :

   ```bash
   bun run check:config
   bun run ci
   ```

   **Résultat attendu** : les deux commandes se terminent sans erreur.
4. Ouvrez une pull request avec un titre `chore: …` (ou `build: …` pour une dépendance de compilation).

## Quand X change, que mettre à jour ?

| Si… | Fichiers à mettre à jour | Note |
|-----|--------------------------|------|
| La version de **Bun** change | `package.json` (`packageManager`), `mise.toml`, `.devcontainer/post-create.sh` | `.github/workflows/ci.yml` installe Bun avec `oven-sh/setup-bun` : vérifiez qu'il suit la même version. `check:config` vérifie que la version majeure.mineure est la même partout. Mettez aussi à jour la version citée dans `docs/store/amo-build.md`. |
| La version de **Node** change | `mise.toml`, `.devcontainer/devcontainer.json` (tag de l'image `typescript-node`), `.github/workflows/ci.yml` (`node-version`) | Le projet suit la version LTS. |
| La version de **HomeBox** change | `compose.yaml` (variable `HOMEBOX_VERSION`), `.env.example`, la version testée dans les pages « Installation » et « Local HomeBox instance » du site (anglais et français) | Rejouez les scénarios de la page « Local HomeBox instance » après la mise à jour. |
| Une **extension VS Code** est ajoutée ou retirée | `.vscode/extensions.json` et `.devcontainer/devcontainer.json` (`customizations.vscode.extensions`) | Les deux listes doivent rester cohérentes. |
| **WXT** ou **Vite** change | `package.json` (dépendances), `wxt.config.ts`, `vitest.config.ts`, `vitest.build.config.ts` | `bun run ci` : le build et le test du manifeste détectent les casses. |
| Un **script** de `package.json` est ajouté ou renommé | `CONTRIBUTING.md` (section « Commands »), la page « Commands » du site (anglais et français), `.vscode/tasks.json`, `scripts/setup.sh` (message final) | Chaque script utile aux contributeurs apparaît sous la forme `bun run <script>`. |
| Un **modèle de ticket** ou un **label** change | `.github/ISSUE_TEMPLATE/*.yml`, `.github/labels.yml`, `REQUIRED_FIELDS` dans `scripts/check-config.ts` | Appliquez ensuite les labels avec `sh scripts/sync-labels.sh` (voir plus bas). |
| Une **dépendance** du site de documentation change | `docs/site/package.json` et `docs/site/bun.lock` | Versions exactes uniquement. Lancez `bun run docs:build`. |

## Ce que vérifie `bun run check:config`

Lancé en tête de `bun run ci` (donc par le hook `pre-push`), il contrôle :

- la syntaxe des fichiers JSON avec commentaires (`.vscode/*.json`, `.devcontainer/devcontainer.json`,
  `tsconfig.json`) et YAML (`.github/**/*.yml`, `compose.yaml`, `src/locales/*.yml`) ;
- que `src/locales/en.yml` et `src/locales/fr.yml` ont les mêmes clés et les mêmes substitutions `$n` ;
- que `package.json`, `mise.toml` et `.devcontainer/post-create.sh` figent la même version de Bun ;
- que les labels cités par les modèles de tickets existent dans `.github/labels.yml`, et que ce fichier est
  bien formé (noms uniques, couleur hexadécimale à 6 chiffres, description de 100 caractères au plus) ;
- que les champs obligatoires des modèles de tickets le sont vraiment, et que les tickets vides sont
  désactivés (`config.yml`).

Les fichiers de `.github/ISSUE_TEMPLATE/` et `.github/labels.yml` ne déclenchent pas la CI GitHub :
`check:config`, lancé en local, est leur seule protection. Le script est testé par
`tests/unit/check-config.test.ts`, sur des dépôts factices dans `tests/fixtures/config/`.

## Synchroniser les labels GitHub

Prérequis : `gh` installé et connecté (`gh auth status`), Bun.

1. Modifiez `.github/labels.yml` dans une pull request et fusionnez-la.
2. Sur `main` à jour, lancez :

   ```bash
   sh scripts/sync-labels.sh
   ```

   **Résultat attendu** : une ligne par label créé ou mis à jour. Les labels absents du fichier ne sont pas
   supprimés.

## Analyse SonarQube Cloud

Le workflow `.github/workflows/sonarqube.yml` et `sonar-project.properties` configurent l'analyse sur
[SonarQube Cloud](https://sonarcloud.io/project/overview?id=Foufou-exe_homebox-clipper), pour les pull
requests ouvertes depuis une branche du dépôt et pour `main`.

- **Secret** : le secret de dépôt `SONAR_TOKEN` doit exister (**Settings** → **Secrets and variables** →
  **Actions**). Les pull requests issues de forks ne peuvent pas le lire : l'analyse est ignorée pour elles.
  Relisez leur code après fusion.
- **Répertoires** : gardez `sonar.sources` et `sonar.tests` alignés sur l'organisation (`src`, `scripts`,
  `tests`) et ajoutez aux exclusions les nouveaux répertoires générés ou de fixtures.
- **Couverture** : le workflow lance `bun run test:coverage` avant l'analyse ;
  `sonar.javascript.lcov.reportPaths` pointe vers `coverage/lcov.info`. `@vitest/coverage-v8` doit rester à
  la même version que `vitest`.
- `bun run check:config` ne valide que la syntaxe YAML du workflow.

### Si ça ne marche pas

| Symptôme | Que faire |
|----------|-----------|
| `check:config` signale des versions de Bun différentes | Alignez `package.json`, `mise.toml` et `.devcontainer/post-create.sh`. |
| L'analyse SonarQube échoue avec une erreur d'authentification | Régénérez un jeton sur SonarQube Cloud et remplacez `SONAR_TOKEN`. |
| Un workflow GitHub échoue sans raison liée au code | Vérifiez d'abord le quota de minutes GitHub Actions du compte (**Settings** → **Billing**). |
