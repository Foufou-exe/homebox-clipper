# Réglages et secrets du dépôt

**Public visé** : le mainteneur, pour savoir quels réglages GitHub et quels secrets le projet utilise,
où ils se trouvent et ce qui se passe s'ils manquent.

> [!WARNING]
> Ne copiez jamais la valeur d'un secret dans une issue, un commit, une pull request, une discussion ou
> un fichier du dépôt. Cette page ne donne que les **noms**.

## Secrets

| Nom | Où (dans **Settings**) | Utilisé par | S'il manque | Procédure |
|-----|------------------------|-------------|-------------|-----------|
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID` | **Environments** → `chrome-web-store` | job `chrome-web-store` de `release.yml` | Job ignoré avec une notice ; la release se fait quand même | [Publier une version](publier-une-version.md#chrome-web-store--configuration-unique) |
| `WIKI_TOKEN` | **Environments** → `wiki` | `wiki.yml` | Job ignoré avec une notice, terminé avec succès | [Publier la documentation](publier-la-documentation.md#publication-automatique) |
| `SONAR_TOKEN` | **Secrets and variables** → **Actions** (secret de dépôt) | `sonarqube.yml` | L'analyse SonarQube Cloud ne peut pas s'authentifier | [Mettre à jour l'outillage](environnement-de-developpement.md#analyse-sonarqube-cloud) |

Aucun secret n'existe pour addons.mozilla.org : la soumission Firefox est manuelle.

## Réglages GitHub

| Réglage | Où | Pourquoi |
|---------|----|----------|
| GitHub Pages, **Source: GitHub Actions** | **Settings** → **Pages** | Publication du site de documentation ([détails](publier-la-documentation.md#configuration-unique-de-github-pages)) |
| Environnement `github-pages` (créé par le premier déploiement) | **Settings** → **Environments** | Facultatif : limiter les *Deployment branches* à `main` |
| Wiki activé, avec une première page créée à la main | **Settings** → **General** → **Features** → **Wikis** | Pages de redirection de `docs/wiki/` |
| Discussions activées, catégories par défaut non renommées | **Settings** → **General** → **Features** → **Discussions** | Support et annonce automatique de version ([détails](moderer-les-discussions.md)) |
| *Private vulnerability reporting* | **Settings** → **Code security** | Signalement privé des failles décrit dans `SECURITY.md`. Si le dépôt ne le permet pas, la solution de repli de `SECURITY.md` s'applique. |
| Labels | `.github/labels.yml` puis `sh scripts/sync-labels.sh` | Labels cités par les modèles de tickets ([détails](environnement-de-developpement.md#synchroniser-les-labels-github)) |

## Quota GitHub Actions

Les minutes de GitHub Actions du compte sont limitées. Quand le quota est épuisé, les workflows échouent
ou ne démarrent pas : ce n'est alors pas un bug du code. Vérifiez d'abord
**Settings** → **Billing** du compte. Les workflows du projet sont conçus pour économiser des minutes
(déclencheurs restreints, `concurrency` avec `cancel-in-progress`, `timeout-minutes` courts,
`ubuntu-latest`) : n'ajoutez ni `schedule` ni matrice.
