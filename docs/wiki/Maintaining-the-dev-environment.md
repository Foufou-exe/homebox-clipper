# Maintenir l'environnement de développement

Cette page liste les fichiers à mettre à jour quand un outil du projet change, afin que le poste
local, le conteneur de développement et la CI restent cohérents. Un contrôle automatique,
`bun run check:config`, détecte une grande partie des oublis.

## Quand X change, que mettre à jour ?

| Si… | Fichiers à mettre à jour | Remarque |
|-----|--------------------------|----------|
| La version de **Bun** change | `package.json` (`packageManager`), `mise.toml`, `.devcontainer/post-create.sh` | Le workflow `.github/workflows/ci.yml` installe Bun avec `oven-sh/setup-bun` : vérifier qu'il suit la même version. `check:config` vérifie que la version majeure.mineure est identique partout. |
| La version de **Node** change | `mise.toml`, `.devcontainer/devcontainer.json` (étiquette de l'image `typescript-node`), `.github/workflows/ci.yml` (`node-version`) | Le projet suit la version LTS. |
| La version de **HomeBox** change | `compose.yaml` (variable `HOMEBOX_VERSION`), `.env.example`, `docs/local-homebox.md`, [Local-HomeBox-instance](Local-HomeBox-instance.md), la version testée dans [Installation](Installation.md) | Relancer les scénarios de test local après la mise à jour. |
| Une **extension VS Code** est ajoutée ou retirée | `.vscode/extensions.json` et `.devcontainer/devcontainer.json` (`customizations.vscode.extensions`) | Les deux listes doivent rester cohérentes pour les extensions utiles au projet. |
| **WXT** ou **Vite** change | `package.json` (dépendances), `wxt.config.ts`, `vitest.config.ts`, `vitest.build.config.ts` | Lancer `bun run ci` : le build et le test du manifeste détectent les ruptures. |
| Un **script** `package.json` est ajouté ou renommé | `CONTRIBUTING.md` (section « Commandes »), `.vscode/tasks.json`, `scripts/setup.sh` (message final) | Chaque script doit apparaître dans `CONTRIBUTING.md` sous la forme `bun run <script>`. |
| Un **modèle d'issue** ou une **étiquette** change | `.github/ISSUE_TEMPLATE/*.yml`, `.github/labels.yml`, `REQUIRED_FIELDS` dans `scripts/check-config.ts` | Puis appliquer les étiquettes avec `scripts/sync-labels.sh` (action manuelle). |

## Vérifier les réglages

```bash
bun run check:config
```

Ce contrôle, lancé en tête de `bun run ci` (donc par le hook `pre-push`), vérifie :

- la syntaxe des fichiers JSON avec commentaires (`.vscode/*.json`, `.devcontainer/devcontainer.json`,
  `tsconfig.json`) et YAML (`.github/**/*.yml`, `compose.yaml`, `src/locales/*.yml`) ;
- que `package.json`, `mise.toml` et `.devcontainer/post-create.sh` épinglent la même version de Bun ;
- que les étiquettes citées par les modèles d'issue existent dans `.github/labels.yml`, et que ce
  fichier est bien formé (noms uniques, couleur hexadécimale de 6 chiffres, description de 100
  caractères au plus) ;
- que les champs obligatoires des modèles d'issue le sont réellement, et que les issues vierges
  sont désactivées (`config.yml`).

Les fichiers de `.github/ISSUE_TEMPLATE/` et `.github/labels.yml` ne déclenchent pas la CI GitHub
(quota limité) : `check:config`, lancé en local, est leur seule garde. Pensez à lancer
`bun run ci` avant de pousser.

Le script est testé par `tests/unit/check-config.test.ts`, sur des dépôts factices dans
`tests/fixtures/config/`.

## Voir aussi

- [Guide de contribution](https://github.com/Foufou-exe/homebox-companion/blob/main/CONTRIBUTING.md)
- [Local-HomeBox-instance](Local-HomeBox-instance.md)
- [Releasing](Releasing.md)
