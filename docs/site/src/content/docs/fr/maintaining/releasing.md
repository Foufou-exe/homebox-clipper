---
title: "Publier une version"
description: "Comment une version est publiée, puis envoyée aux boutiques d'extensions des navigateurs."
---

Les versions sont pilotées par [Release Please](https://github.com/googleapis/release-please) et publiées par
GitHub Actions. La décision de publier revient au mainteneur : fusionner la pull request de release est
la seule étape manuelle. La numérotation suit [SemVer](https://semver.org) ; les commits suivent
[Conventional Commits](https://www.conventionalcommits.org/en/), ce qui est **obligatoire** car la prochaine
version et le journal des modifications en sont calculés.

:::caution[Important]
Fusionner la pull request de release publie immédiatement une version, et une version publiée est difficile à
annuler : ne le faites qu'avec l'accord explicite du mainteneur.
:::

## Fonctionnement

1. Chaque push sur `main` lance `.github/workflows/release.yml`. Son job `release-please` lit les
   Conventional Commits depuis la dernière version et ouvre (ou met à jour) une pull request intitulée
   `chore: release X.Y.Z` qui incrémente `package.json` et `.release-please-manifest.json` et ajoute une
   section à `CHANGELOG.md`.
2. Quand le mainteneur fusionne cette pull request, Release Please crée le tag `vX.Y.Z` et la release GitHub
   (avec la section du journal des modifications comme notes).
3. Dans la même exécution du workflow, le job `publish` récupère le tag et :
   1. lance `bun run ci` (toutes les vérifications et la compilation) ;
   2. échoue si le tag n'est pas exactement `v` + la version de `package.json` ;
   3. échoue si `CHANGELOG.md` n'a pas de section non vide pour cette version (`bun run release:notes`) ;
   4. construit les archives avec `bun run zip` et vérifie qu'elles existent sous les noms attendus, que le
      `manifest.json` des archives Chrome et Firefox porte la même version, que celui de Firefox a
      l'identifiant de module fixe, et que l'archive des sources ne contient que des fichiers autorisés (une entrée `homebox/`, `tests/`,
      `specs/`, `raw/`, `.env*` ou `*.pepper` fait échouer la release) ;
   5. joint à la release **trois archives**, chacune avec son `.sha256` : `homebox-clipper-X.Y.Z-chrome.zip`,
      `homebox-clipper-X.Y.Z-firefox.zip` et `homebox-clipper-X.Y.Z-sources.zip` (l'archive des sources est destinée aux
      relecteurs de addons.mozilla.org), et complète les notes avec une section `## Checksums` (le SHA-256
      des trois archives) ;
4. puis le job `chrome-web-store` télécharge cette archive depuis la release, l'envoie au Chrome Web
   Store et la soumet à la relecture (voir [Chrome Web Store](#chrome-web-store)). Il est ignoré avec une
   notice si ses secrets ne sont pas configurés.

La compilation est dans le même workflow parce qu'un tag créé avec le `GITHUB_TOKEN` par défaut ne déclenche pas
d'autres workflows. Le jeton du job `publish` est limité à `contents: write` (plus `pull-requests: write` pour le
bot) ; les seuls autres secrets sont les cinq de l'environnement `chrome-web-store`, utilisés par ce seul job.
Il n'y a ni job ni secret pour addons.mozilla.org : la soumission à Firefox est manuelle (voir
[addons.mozilla.org](#addonsmozillaorg)). Pousser un tag à la main ne publie plus rien : cela contournerait le journal des modifications.

## Chrome Web Store

Après chaque release, le job `chrome-web-store` de `release.yml` envoie l'archive au store et
la soumet à la relecture avec l'[API Chrome Web Store v2](https://developer.chrome.com/docs/webstore/using-api),
par de simples appels `curl` (aucune action tierce). Google relit ensuite la mise à jour (cela peut prendre de quelques heures
à quelques jours) ; une fois approuvée, elle est publiée automatiquement. Le job échoue avec un message explicite à la moindre erreur
de l'API, et est **ignoré avec une `::notice::`** (pas une erreur) quand les secrets ci-dessous sont absents.

L'API ne peut que mettre à jour un élément existant : le compte, la fiche et la première version sont créés à la main.

### 1. Créer le compte développeur

1. Connectez-vous à la [console développeur du Chrome Web Store](https://chrome.google.com/webstore/devconsole)
   avec le compte Google qui sera propriétaire de l'extension. Activez-y la **validation en deux étapes** : Google
   l'exige pour publier.
2. Réglez les frais d'inscription uniques (5 USD) et acceptez le contrat de distribution pour les développeurs.

### 2. Faire la première soumission à la main

1. Téléchargez `homebox-clipper-X.Y.Z-chrome.zip` depuis la dernière release GitHub.
2. Dans la console, choisissez **Add new item** et envoyez le zip.
3. Remplissez l'onglet **Store listing** (description, captures d'écran, icône, catégorie) et l'onglet **Privacy**
   (finalité unique, justification des permissions, URL de la politique de confidentialité), puis **Submit for review**.
4. Gardez la visibilité par défaut. Si vous modifiez la visibilité à la main par la suite, publiez manuellement une fois avant
   que l'API puisse de nouveau publier.
5. Notez les deux identifiants : l'**item ID** (32 caractères, dans l'onglet *Package* de l'élément, ou dans
   `chrome://extensions` avec le mode développeur activé) et le **publisher ID** (console, *Publisher* puis
   *Settings* ; si vous appartenez à plusieurs éditeurs, choisissez le bon).

### 3. Créer les identifiants OAuth (Google Cloud Console)

1. Dans la [Google Cloud Console](https://console.cloud.google.com), créez ou sélectionnez un projet, puis activez
   la **Chrome Web Store API** (*APIs & Services* puis *Library*).
2. *OAuth consent screen* : choisissez **External**, renseignez le nom de l'application et votre e-mail, ignorez les
   scopes, et ajoutez votre propre compte Google comme **utilisateur de test**.
3. *Credentials* puis *Create credentials* puis **OAuth client ID**, type **Web application**, avec l'URI de
   redirection autorisée `https://developers.google.com/oauthplayground`. Conservez le **client ID** et le
   **client secret**.
4. De retour sur l'écran de consentement, cliquez sur **Publish app** (état *In production*). Sinon, tant qu'il reste
   en *Testing*, Google fait expirer le refresh token au bout de 7 jours et le job se met à échouer avec
   `invalid_grant`. Aucune vérification n'est nécessaire pour un usage personnel ; l'avertissement « application non vérifiée » n'apparaît
   qu'au moment de l'autorisation.

### 4. Générer le refresh token

1. Ouvrez l'[OAuth 2.0 Playground](https://developers.google.com/oauthplayground), cliquez sur l'icône d'engrenage,
   cochez **Use your own OAuth credentials** et saisissez le client ID et le secret.
2. À l'*étape 1*, saisissez le scope `https://www.googleapis.com/auth/chromewebstore` dans le champ de saisie
   et cliquez sur **Authorize APIs**. Connectez-vous avec le compte qui **possède l'élément** et acceptez.
3. À l'*étape 2*, cliquez sur **Exchange authorization code for tokens** et copiez le **refresh token**. Traitez-le
   comme un mot de passe : ne le collez jamais dans une issue, un commit ou une discussion.

### 5. Créer l'environnement et les secrets GitHub

1. Dans le dépôt : *Settings* puis *Environments* puis **New environment**, nommé exactement
   `chrome-web-store`.
2. Facultatif : cochez **Required reviewers** et ajoutez-vous. Chaque release attend alors votre approbation
   avant que quoi que ce soit soit envoyé à Google.
3. Ajoutez ces cinq **secrets d'environnement** (les noms sont exacts) :

| Secret | Valeur |
|--------|--------|
| `CWS_CLIENT_ID` | client ID OAuth (étape 3) |
| `CWS_CLIENT_SECRET` | client secret OAuth (étape 3) |
| `CWS_REFRESH_TOKEN` | refresh token (étape 4) |
| `CWS_PUBLISHER_ID` | publisher ID (étape 2) |
| `CWS_EXTENSION_ID` | item ID (étape 2) |

Tant que les cinq n'existent pas, le job est ignoré avec une notice. Les forks ne les ont jamais.

### Relancer une publication

Si le job a échoué (jeton expiré, refus du store, envoi encore en cours...) ou a été ignoré, corrigez la
cause, puis lancez manuellement le workflow **Release** (*Actions* puis *Release* puis *Run workflow*) avec le
tag existant, par exemple `v0.3.0`. Le job `publish` recompile et rattache à nouveau l'archive, puis le job
`chrome-web-store` l'envoie de nouveau. Le store refuse un envoi dont la version n'est pas supérieure à
celle qu'il a déjà : si cette version a déjà été envoyée avec succès, il ne reste que la soumission à la relecture,
que vous pouvez faire depuis la console. Vous pouvez suivre l'état de la relecture dans la console.

## addons.mozilla.org

Le module Firefox est soumis **à la main** à addons.mozilla.org (AMO) ; rien n'est automatisé et aucun secret AMO
n'est stocké dans le dépôt. La première version disponible pour Firefox est la 0.8.0. Les textes à coller se trouvent dans
`docs/store/amo-listing.md` (fiche en anglais et en français, justification des permissions, déclaration de collecte
de données, notes pour le relecteur, liste de contrôle) ; la politique est `PRIVACY.md` / `PRIVACY.fr.md`.

### Première soumission

1. Connectez-vous au [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) avec un compte
   Mozilla (activez l'authentification en deux étapes) et acceptez le contrat de distribution.
2. Téléchargez `homebox-clipper-X.Y.Z-firefox.zip` et `homebox-clipper-X.Y.Z-sources.zip` depuis la même release
   GitHub, et vérifiez-les avec `sha256sum -c` à l'aide de leurs fichiers `.sha256`.
3. **Submit a New Add-on**, distribution **On this site** (listed), et envoyez l'archive Firefox. Le
   validateur ne doit signaler aucune erreur bloquante (lisez les avertissements).
4. Plateformes : gardez **Firefox** uniquement et **décochez « Firefox for Android »** : Android n'est pas pris en charge.
5. Code source : répondez que le code est minifié, joignez l'archive `-sources.zip` et indiquez
   `docs/store/amo-build.md` (reconstruction avec Bun 1.4.4 : le résultat a le même SHA-256 que le fichier soumis).
6. Remplissez la fiche à partir de `docs/store/amo-listing.md` (nom, résumé, description en anglais et en français,
   catégories, liens de support, politique de confidentialité), la déclaration de collecte de données (elle doit correspondre au manifeste :
   `websiteContent`, obligatoire) et les notes pour le relecteur (un HomeBox de démonstration avec des données fictives, aucun compte
   ni clé réels).
7. Soumettez. Mozilla relit le module (cela peut prendre de quelques heures à quelques jours) et le publie.

### Versions suivantes

À chaque release : envoyez le nouveau `-firefox.zip` de la release comme nouvelle version du même module, joignez à nouveau
le `-sources.zip` de cette release, laissez « Firefox for Android » décoché, et ne mettez la fiche à jour que si
elle a changé. Une automatisation ultérieure (un environnement `amo` dédié, sur le modèle de `chrome-web-store`) n'est pas
prévue.

## Types de commits et journal des modifications

| Type | Incrément de version (avant 1.0.0) | Section du journal des modifications |
|------|------------------------------------|--------------------------------------|
| `feat` | mineure | Features |
| `fix` | correctif | Bug Fixes |
| `perf` | correctif | Performance |
| `docs`, `refactor`, `revert`, `build` | aucun à eux seuls | Documentation, Code Refactoring, Reverts, Build System |
| `ci`, `test`, `style`, `chore` | aucun | masqué |
| `!` après le type, ou un pied de page `BREAKING CHANGE:` | mineure (majeure à partir de 1.0.0) | l'entrée est signalée comme incompatible |

La configuration se trouve dans `release-please-config.json` ; la dernière version publiée est dans
`.release-please-manifest.json`. Les entrées antérieures à la 0.3.0 gardent le format
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) de
[CHANGELOG.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/CHANGELOG.md) ; `bun run release:notes`
lit les deux formats. Ne modifiez pas le journal des modifications ni la version à la main : corrigez une entrée erronée en modifiant la
pull request de release avant de la fusionner.

## Si une release échoue

Si une vérification du job `publish` échoue, le tag et la release existent déjà mais n'ont pas d'archive. Corrigez la
cause sur `main`, puis lancez manuellement le workflow **Release** (*Actions → Release → Run workflow*) avec le
tag existant (par exemple `v0.3.0`) : il recompile à partir de ce tag et rattache à nouveau les fichiers. Si la correction
doit faire partie du code publié, supprimez la release et le tag, corrigez, et laissez Release Please les recréer.

## Après la release

- Le job `publish` ouvre une annonce dans la catégorie `announcements` des Discussions (ignorée si la release a déjà une discussion ; un avertissement, jamais un échec, si la catégorie est absente). Voir [Modérer les Discussions](/homebox-clipper/fr/maintaining/moderating-discussions/).
- Ouvrez la page de la release et vérifiez les notes, les trois archives avec leurs fichiers `.sha256` et la section Checksums.
- Vérifiez que l'archive se charge dans Chrome : téléchargez-la, vérifiez-la avec `sha256sum -c`, décompressez-la, puis dans
  `chrome://extensions` activez le mode développeur et utilisez **Charger l'extension non empaquetée** sur le dossier décompressé.
- Vérifiez que l'archive Firefox se charge : vérifiez-la avec `sha256sum -c`, puis dans
  `about:debugging#/runtime/this-firefox` utilisez **Charger un module complémentaire temporaire…** sur le fichier `-firefox.zip`.
- La documentation d'une fonctionnalité est fusionnée **avant** la pull request de release, pour que la release la livre.
- Si la documentation a changé, elle est publiée toute seule une fois fusionnée : voir la section suivante.

## Publier le site de documentation

La documentation se trouve dans `docs/site/` (Astro Starlight, anglais et français) et est publiée sur GitHub
Pages à l'adresse <https://foufou-exe.github.io/homebox-clipper/>. C'est un projet séparé avec son propre
`package.json` et son propre `bun.lock` : il ne fait pas partie de la compilation de l'extension, de ses tests, de son lint ni de l'archive des sources.

```bash
bun run docs:dev     # local preview with live reload (http://localhost:4321/homebox-clipper/)
bun run docs:build   # same build as the workflow: installs docs/site/ (frozen lockfile) and builds it
```

`docs:build` échoue sur un lien ou une ancre interne cassé, dans les deux langues (`starlight-links-validator`).
Lancez-le avant de pousser une modification de la documentation : c'est l'équivalent local du workflow ci-dessous.

Le workflow `.github/workflows/docs.yml` compile et publie le site à chaque push sur `main` qui modifie
`docs/site/` (ou le workflow lui-même), et à la demande depuis l'onglet « Actions » (« Docs », **Run workflow**). Une
exécution plus récente annule celle en cours. Il n'utilise que les actions officielles `actions/upload-pages-artifact` et
`actions/deploy-pages`, avec les permissions `pages: write` et `id-token: write` sur le seul job de déploiement.

Configuration unique : dans le dépôt, ouvrez **Settings**, **Pages**, et sous **Build and deployment** choisissez
**Source: GitHub Actions**. La première exécution du workflow crée l'environnement `github-pages`. Vous pouvez en option
restreindre ses *Deployment branches* à `main` (**Settings**, **Environments**, `github-pages`).

Chaque page a une version anglaise (`docs/site/src/content/docs/`) et une version française
(`docs/site/src/content/docs/fr/`, mêmes noms de fichiers) : modifiez les deux dans la même pull request.

## Le wiki GitHub (pages de redirection)

Le wiki GitHub n'est plus une source de documentation : `docs/wiki/` ne contient que de courtes pages qui renvoient
les lecteurs vers le site (une par ancienne page du wiki, pour que les anciens liens continuent de fonctionner). Elles sont publiées avec le
même script qu'avant :

```bash
bun run wiki:publish -- --dry-run   # checks, 100% local, no network
bun run wiki:publish                # wiki clone, synchronization, git diff --stat, y/N confirmation, commit, push
```

Le script vérifie que chaque page (sauf `_*.md`) renvoie vers le site de documentation et qu'**aucun lien
relatif ne sort de `docs/wiki/`**. Il réécrit ensuite les liens internes pour retirer l'extension `.md` de la
cible (toute ancre est conservée), comme l'attend le wiki GitHub. Les pages qui ne sont plus dans `docs/wiki/` sont
supprimées du wiki.

Prérequis pour la vraie publication : le wiki doit être activé et sa **première page créée à la main**
depuis l'onglet « Wiki » du dépôt (GitHub n'initialise pas le dépôt `.wiki.git` avant cela), et
votre accès SSH au dépôt doit fonctionner. Sans confirmation `y`, rien n'est poussé ; l'option `--yes`
est réservée au mainteneur.

### Publication automatique du wiki

Le workflow `.github/workflows/wiki.yml` lance le même script (`scripts/publish-wiki.sh --yes`) à chaque
push sur `main` qui modifie `docs/wiki/`, et à la demande depuis l'onglet « Actions » (« Wiki », **Run workflow**).
Si le wiki est déjà à jour, rien n'est poussé et l'exécution réussit. Le message de commit est le même
que pour la publication manuelle (`docs: sync wiki from <sha>`).

Le `GITHUB_TOKEN` par défaut n'est pas utilisé pour le wiki : le job a besoin d'un jeton d'accès personnel stocké comme
secret `WIKI_TOKEN` d'un environnement nommé `wiki`. **Sans ce secret, le job est ignoré avec une
notice et se termine avec succès**, si bien que le workflow est inoffensif sur les forks ou avant la configuration.

Configuration unique (la première page du wiki doit déjà exister, voir la section précédente) :

1. Sur GitHub, ouvrez votre avatar, puis **Settings**, **Developer settings**, **Personal access tokens**,
   **Fine-grained tokens**, et **Generate new token**.
2. Donnez-lui un nom (par exemple `homebox-clipper wiki`) et une **expiration** (par exemple 90 jours ou un
   an ; notez la date de renouvellement dans votre agenda, le workflow échoue avec une erreur d'authentification une fois le
   jeton expiré).
3. **Repository access** : *Only select repositories*, puis choisissez `homebox-clipper`.
4. **Permissions**, **Repository permissions** : *Contents: Read and write* (*Metadata: Read-only* est
   ajoutée automatiquement). Aucune autre permission.
5. Générez le jeton et copiez-le (il n'est affiché qu'une seule fois).
6. Dans le dépôt, ouvrez **Settings**, **Environments**, **New environment**, nommez-le exactement `wiki`.
   Ajoutez éventuellement des *Required reviewers* pour approuver chaque publication, et restreignez les *Deployment branches* à
   `main`.
7. Dans cet environnement, sous **Environment secrets**, **Add secret** : nom `WIKI_TOKEN`, valeur le jeton.
8. Vérifiez avec **Actions**, **Wiki**, **Run workflow**.

Pour renouveler le jeton, générez-en un nouveau et remplacez la valeur de `WIKI_TOKEN` ; pour désactiver la publication
automatique, supprimez le secret (ou l'environnement).

La publication manuelle (`bun run wiki:publish`, SSH) reste disponible. Sources de cette
procédure : la documentation GitHub sur les [jetons d'accès personnels à granularité fine](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
et sur les [secrets d'environnement](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment).
La documentation de GitHub sur la [modification des pages de wiki](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)
indique que le wiki est un dépôt Git (`<repository>.wiki.git`) mais ne précise pas quelle permission de jeton
permet d'y écrire : *Contents: Read and write* est la permission qui autorise un push Git vers un dépôt, et
la première exécution le confirme pour le wiki (le job affiche sinon une erreur de clone ou de push).
