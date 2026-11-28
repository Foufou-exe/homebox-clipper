# Publier une version

**Public visé** : le mainteneur du projet, seul à pouvoir publier une version et l'envoyer au Chrome Web
Store et sur addons.mozilla.org (AMO).

> [!CAUTION]
> Fusionner la pull request de release publie immédiatement une version. Une version publiée est
> difficile à annuler.

## Ce qu'il faut savoir avant de commencer

- Les versions sont pilotées par [Release Please](https://github.com/googleapis/release-please) et
  publiées par GitHub Actions (`.github/workflows/release.yml`).
- La seule étape manuelle côté GitHub est la **fusion de la pull request de release**.
- La numérotation suit [SemVer](https://semver.org). La version et `CHANGELOG.md` sont calculés à partir
  des titres de commits au format [Conventional Commits](https://www.conventionalcommits.org/en/)
  (voir [Types de commits et journal des modifications](#types-de-commits-et-journal-des-modifications)).
- Ne modifiez jamais `CHANGELOG.md` ni la version de `package.json` à la main.
- Pousser un tag à la main ne publie rien : cela contournerait le journal des modifications.

## Prérequis

- Droits d'administration sur le dépôt `Foufou-exe/homebox-clipper`.
- Pour l'envoi automatique au Chrome Web Store : l'environnement `chrome-web-store` et ses cinq secrets
  (voir [Chrome Web Store : configuration unique](#chrome-web-store--configuration-unique)). Sans eux, la
  release fonctionne quand même, seul l'envoi au store est ignoré.
- Pour Firefox : un compte Mozilla avec accès au module sur AMO.

## Publier une version, pas à pas

1. Ouvrez l'onglet **Pull requests** du dépôt et trouvez la pull request intitulée
   `chore: release X.Y.Z` (ouverte par le bot Release Please).
   - **Résultat attendu** : elle modifie `package.json`, `.release-please-manifest.json` et ajoute une
     section à `CHANGELOG.md`.
   - Si une entrée du journal est fausse, corrigez-la dans la pull request **avant** de la fusionner.
2. Vérifiez que la documentation des nouveautés est déjà fusionnée dans `main` : la release doit la livrer.
3. Fusionnez la pull request de release.
   - **Résultat attendu** : Release Please crée le tag `vX.Y.Z` et la release GitHub, avec la section du
     journal comme notes.
4. Ouvrez l'onglet **Actions**, puis l'exécution du workflow **Release** liée à la fusion. Attendez la fin
   du job `publish`. Ce job :
   1. lance `bun run ci` (toutes les vérifications et la compilation) ;
   2. échoue si le tag n'est pas exactement `v` + la version de `package.json` ;
   3. échoue si `CHANGELOG.md` n'a pas de section non vide pour cette version (`bun run release:notes`) ;
   4. construit les archives avec `bun run zip` et vérifie leurs noms, la version du `manifest.json` des
      archives Chrome et Firefox, l'identifiant fixe du module Firefox, et le contenu de l'archive des
      sources (une entrée `homebox/`, `tests/`, `specs/`, `raw/`, `.env*` ou `*.pepper` fait échouer la
      release) ;
   5. joint à la release **trois archives**, chacune avec son `.sha256` :
      `homebox-clipper-X.Y.Z-chrome.zip`, `homebox-clipper-X.Y.Z-firefox.zip` et
      `homebox-clipper-X.Y.Z-sources.zip`, et ajoute une section `## Checksums` aux notes ;
   6. ouvre une annonce dans la catégorie `announcements` des Discussions (ignorée si la release a déjà
      une discussion ; un avertissement, jamais un échec, si la catégorie manque).
   - **Résultat attendu** : le job `publish` est vert.
5. Attendez la fin du job `chrome-web-store`.
   - **Résultat attendu** : il est vert (archive envoyée et soumise à la relecture de Google), ou ignoré
     avec une notice si les secrets ne sont pas configurés.
6. Ouvrez la page de la release et vérifiez les notes, les trois archives avec leurs fichiers `.sha256`
   et la section Checksums.
7. Vérifiez que l'archive Chrome se charge :
   1. téléchargez `homebox-clipper-X.Y.Z-chrome.zip` et son `.sha256`, puis lancez
      `sha256sum -c homebox-clipper-X.Y.Z-chrome.zip.sha256` ;
   2. décompressez l'archive ;
   3. dans `chrome://extensions`, activez le **mode développeur**, cliquez sur **Charger l'extension non
      empaquetée** et choisissez le dossier décompressé.
   - **Résultat attendu** : l'extension apparaît avec le numéro de la nouvelle version.
8. Vérifiez que l'archive Firefox se charge : `sha256sum -c` sur son `.sha256`, puis dans
   `about:debugging#/runtime/this-firefox`, **Charger un module complémentaire temporaire…** sur le fichier
   `-firefox.zip`.
9. Soumettez la version Firefox sur AMO (voir [addons.mozilla.org](#addonsmozillaorg)).
10. Si la documentation a changé, vérifiez qu'elle est publiée : voir
    [Publier le site de documentation et le wiki](publier-la-documentation.md).

### Pourquoi tout est dans le même workflow

Un tag créé avec le `GITHUB_TOKEN` par défaut ne déclenche pas d'autre workflow : la compilation est donc
dans `release.yml`. Le jeton du job `publish` est limité à `contents: write` (plus
`pull-requests: write` pour le bot et `discussions: write` pour l'annonce). Les seuls autres secrets sont
les cinq de l'environnement `chrome-web-store`. Il n'y a ni job ni secret pour AMO : la soumission Firefox
est manuelle.

## Si une release échoue

| Situation | Que faire |
|-----------|-----------|
| Une vérification du job `publish` échoue | Le tag et la release existent déjà, sans archive. Corrigez la cause sur `main`, puis **Actions** → **Release** → **Run workflow** avec le tag existant (par exemple `v0.3.0`) : le workflow recompile depuis ce tag et rattache les fichiers. |
| La correction doit faire partie du code publié | Supprimez la release et le tag, corrigez sur `main`, et laissez Release Please les recréer. |
| Le job `chrome-web-store` échoue (jeton expiré, refus du store, envoi encore en cours…) ou a été ignoré | Corrigez la cause, puis relancez **Release** → **Run workflow** avec le tag existant. Le store refuse une version qui n'est pas supérieure à celle qu'il a déjà : si l'envoi avait réussi, faites seulement la soumission à la relecture depuis la console. |
| Le job échoue avec `invalid_grant` | Le refresh token a expiré : l'application OAuth est probablement restée en *Testing*. Refaites les étapes 3 (point 4) et 4 de la configuration Chrome Web Store, puis remplacez le secret `CWS_REFRESH_TOKEN`. |
| Une entrée du journal est fausse après la fusion | Voir la procédure `BEGIN_COMMIT_OVERRIDE` de Release Please sur la pull request fusionnée ; ne modifiez pas `CHANGELOG.md` à la main. |

## Types de commits et journal des modifications

| Type | Incrément de version (avant 1.0.0) | Section du journal des modifications |
|------|------------------------------------|--------------------------------------|
| `feat` | mineure | Features |
| `fix` | correctif | Bug Fixes |
| `perf` | correctif | Performance |
| `docs`, `refactor`, `revert`, `build` | aucun à eux seuls | Documentation, Code Refactoring, Reverts, Build System |
| `ci`, `test`, `style`, `chore` | aucun | masqué |
| `!` après le type, ou un pied de page `BREAKING CHANGE:` | mineure (majeure à partir de 1.0.0) | l'entrée est signalée comme incompatible |

La configuration est dans `release-please-config.json` ; la dernière version publiée est dans
`.release-please-manifest.json`. Les entrées antérieures à la 0.3.0 gardent le format
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). `bun run release:notes X.Y.Z` affiche la
section d'une version et lit les deux formats.

## Chrome Web Store : configuration unique

Après chaque release, le job `chrome-web-store` envoie l'archive au store et la soumet à la relecture
avec l'[API Chrome Web Store v2](https://developer.chrome.com/docs/webstore/using-api), par de simples
appels `curl`. Google relit la mise à jour (de quelques heures à quelques jours) puis la publie
automatiquement. L'API ne peut que mettre à jour un élément existant : le compte, la fiche et la première
version se créent à la main, une seule fois.

### 1. Créer le compte développeur

1. Connectez-vous à la [console développeur du Chrome Web Store](https://chrome.google.com/webstore/devconsole)
   avec le compte Google propriétaire de l'extension. Activez la **validation en deux étapes** : Google
   l'exige pour publier.
2. Réglez les frais d'inscription uniques (5 USD) et acceptez le contrat développeur.

### 2. Faire la première soumission à la main

1. Téléchargez `homebox-clipper-X.Y.Z-chrome.zip` depuis la dernière release GitHub.
2. Dans la console, cliquez sur **Add new item** et envoyez le zip.
3. Remplissez l'onglet **Store listing** et l'onglet **Privacy** à partir de
   [`docs/store/listing.md`](../store/listing.md) (captures : [`docs/store/screenshots/`](../store/screenshots/)),
   puis cliquez sur **Submit for review**.
4. Gardez la visibilité par défaut. Si vous la changez plus tard à la main, publiez une fois
   manuellement avant que l'API puisse de nouveau publier.
5. Notez l'**item ID** (32 caractères, onglet *Package* de l'élément) et le **publisher ID** (console,
   *Publisher* puis *Settings*).

### 3. Créer les identifiants OAuth (Google Cloud Console)

1. Dans la [Google Cloud Console](https://console.cloud.google.com), créez ou choisissez un projet, puis
   activez la **Chrome Web Store API** (*APIs & Services* puis *Library*).
2. *OAuth consent screen* : choisissez **External**, renseignez le nom de l'application et votre e-mail,
   ignorez les scopes, et ajoutez votre compte Google comme **utilisateur de test**.
3. *Credentials* → *Create credentials* → **OAuth client ID**, type **Web application**, URI de
   redirection autorisée `https://developers.google.com/oauthplayground`. Gardez le **client ID** et le
   **client secret**.
4. Revenez sur l'écran de consentement et cliquez sur **Publish app** (état *In production*). Sinon,
   Google fait expirer le refresh token au bout de 7 jours (`invalid_grant`).

### 4. Générer le refresh token

1. Ouvrez l'[OAuth 2.0 Playground](https://developers.google.com/oauthplayground), cliquez sur l'icône
   d'engrenage, cochez **Use your own OAuth credentials** et saisissez le client ID et le secret.
2. À l'*étape 1*, saisissez le scope `https://www.googleapis.com/auth/chromewebstore` et cliquez sur
   **Authorize APIs**. Connectez-vous avec le compte qui **possède l'élément** et acceptez.
3. À l'*étape 2*, cliquez sur **Exchange authorization code for tokens** et copiez le **refresh token**.
   Traitez-le comme un mot de passe : jamais dans une issue, un commit ou une discussion.

### 5. Créer l'environnement et les secrets GitHub

1. Dans le dépôt : **Settings** → **Environments** → **New environment**, nommé exactement
   `chrome-web-store`.
2. Facultatif : cochez **Required reviewers** et ajoutez-vous. Chaque release attend alors votre
   approbation avant l'envoi à Google.
3. Ajoutez ces cinq **secrets d'environnement** (noms exacts) :

| Secret | Contenu |
|--------|---------|
| `CWS_CLIENT_ID` | client ID OAuth (étape 3) |
| `CWS_CLIENT_SECRET` | client secret OAuth (étape 3) |
| `CWS_REFRESH_TOKEN` | refresh token (étape 4) |
| `CWS_PUBLISHER_ID` | publisher ID (étape 2) |
| `CWS_EXTENSION_ID` | item ID (étape 2) |

**Résultat attendu** : à la release suivante, le job `chrome-web-store` n'est plus ignoré. Tant que les
cinq secrets n'existent pas, il est ignoré avec une notice. Les forks ne les ont jamais.

## addons.mozilla.org

Le module Firefox est soumis **à la main** à addons.mozilla.org (AMO) : rien n'est automatisé et aucun
secret AMO n'est stocké dans le dépôt. Les textes à coller sont dans
[`docs/store/amo-listing.md`](../store/amo-listing.md) (fiche en anglais et en français, justification
des permissions, déclaration de collecte de données, notes pour le relecteur, liste de contrôle). La
reconstruction pour les relecteurs est décrite dans [`docs/store/amo-build.md`](../store/amo-build.md).
La politique de confidentialité est `PRIVACY.md` / `PRIVACY.fr.md`.

### Première soumission

1. Connectez-vous au [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) avec un
   compte Mozilla (authentification en deux étapes activée) et acceptez le contrat de distribution.
2. Téléchargez `homebox-clipper-X.Y.Z-firefox.zip` et `homebox-clipper-X.Y.Z-sources.zip` depuis la même
   release, et vérifiez-les avec `sha256sum -c` et leurs fichiers `.sha256`.
3. Cliquez sur **Submit a New Add-on**, distribution **On this site**, et envoyez l'archive Firefox.
   - **Résultat attendu** : le validateur ne signale aucune erreur bloquante (lisez les avertissements).
4. Plateformes : gardez **Firefox** seulement et **décochez « Firefox for Android »** : Android n'est pas
   pris en charge.
5. Code source : répondez que le code est minifié, joignez l'archive `-sources.zip` et indiquez
   `docs/store/amo-build.md`.
6. Remplissez la fiche, la déclaration de collecte de données (`websiteContent`, obligatoire, comme dans
   le manifeste) et les notes pour le relecteur (un HomeBox de démonstration avec des données fictives,
   jamais un vrai compte ni une vraie clé), à partir de `docs/store/amo-listing.md`.
7. Soumettez.
   - **Résultat attendu** : Mozilla relit le module (de quelques heures à quelques jours) puis le publie.

### Versions suivantes

À chaque release :

1. Envoyez le nouveau `-firefox.zip` comme nouvelle version du même module.
2. Joignez le `-sources.zip` de la même release.
3. Laissez « Firefox for Android » décoché.
4. Mettez la fiche à jour seulement si elle a changé.

### Si ça ne marche pas

| Symptôme | Que faire |
|----------|-----------|
| Le validateur AMO signale une erreur bloquante | Ne soumettez pas. Corrigez dans une pull request, publiez une nouvelle version, puis recommencez. |
| Le relecteur ne peut pas reconstruire l'archive | Vérifiez que `docs/store/amo-build.md` correspond toujours à la version de Bun du projet. |
