# Publier une version

Procédure **locale** (aucune minute de GitHub Actions n'est consommée), réservée au mainteneur. Le format
du [journal des modifications](https://github.com/Foufou-exe/homebox-companion/blob/main/CHANGELOG.md) est celui de
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), la numérotation suit
[SemVer](https://semver.org).

> [!IMPORTANT]
> Créer un tag, le pousser et publier une release sont des actions visibles et difficiles à annuler : ne
> les faites qu'avec l'accord explicite du mainteneur.

## Alimenter le changelog au quotidien

Tout changement visible par un utilisateur ou un contributeur (fonctionnalité, correction, sécurité,
permission, procédure de développement) ajoute une ligne dans la section `[Unreleased]` de
`CHANGELOG.md`, sous le bon type : `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` ou `Security`
(noms standard, conservés en anglais). Les refactorings internes et les tests seuls n'y vont pas. Un
changement qui demande une action de l'utilisateur est préfixé par **Action requise :**. La pull request
rappelle de le faire (case dédiée du modèle).

## Procédure de publication

Pour une version `x.y.z` :

1. **Numéro de version** : `bun pm version x.y.z --no-git-tag-version` (met à jour `package.json`).
2. **Changelog** : renommez `[Unreleased]` en `[x.y.z] - AAAA-MM-JJ`, recréez un `[Unreleased]` vide au-dessus
   et mettez à jour les liens de comparaison en bas du fichier (`[Unreleased]` compare `vx.y.z...HEAD`, et
   `[x.y.z]` pointe vers la release).
3. **Vérification** : `bun run ci` doit passer.
4. **Commit** : `chore(release): vX.Y.Z`.
5. **Tag** : `git tag vX.Y.Z`.
6. **Archive** : `bun run zip`. WXT produit `.output/<nom>-<version>-chrome.zip`.
7. **Release GitHub** (après push de la branche et du tag) :
   ```bash
   bun scripts/release-notes.ts x.y.z | gh release create vX.Y.Z .output/*-chrome.zip --notes-file -
   ```
   `scripts/release-notes.ts` extrait du changelog uniquement la section de la version demandée (sans
   titre ni liens de comparaison).

## Première version

Le tag `v0.1.0` n'existe pas tant que le mainteneur ne l'a pas créé sur le commit du MVP. Tant qu'il est
absent, les liens de comparaison du changelog ne résolvent rien.

## Après la release

- Vérifiez que l'archive jointe se charge dans Chrome (`chrome://extensions`, mode développeur, dossier
  décompressé).
- Si les sources du wiki ont changé, republiez-le : voir la section suivante.

## Publier le wiki

Les pages sont versionnées dans `docs/wiki/` ; le wiki GitHub n'en est qu'une copie.

```bash
bun run wiki:publish -- --dry-run   # contrôles et réécriture des liens, 100 % local, sans réseau
bun run wiki:publish                # clone du wiki, synchronisation, git diff --stat, confirmation y/N, commit, push
```

Le script vérifie que chaque page (hors `_*.md`) figure dans `_Sidebar.md`, que chaque lien interne
pointe vers une page existante et qu'**aucun lien relatif ne sort de `docs/wiki/`** (les cibles hors du wiki
comme `MERCHANTS.md` ou `CHANGELOG.md` sont des URL absolues `blob/main`). Il réécrit ensuite les liens internes pour retirer l'extension `.md` de la cible (l'ancre éventuelle est
conservée), comme l'attend le wiki GitHub.

Prérequis de la publication réelle : le wiki doit être activé et sa **première page créée à la main** depuis
l'onglet « Wiki » du dépôt (GitHub n'initialise pas le dépôt `.wiki.git` avant), et votre accès SSH au dépôt
doit fonctionner. Sans confirmation `y`, rien n'est poussé ; l'option `--yes` est réservée au mainteneur.
