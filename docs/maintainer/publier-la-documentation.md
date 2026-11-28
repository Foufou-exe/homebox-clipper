# Publier le site de documentation et le wiki

**Public visé** : le mainteneur, qui configure la publication du site sur GitHub Pages et des pages de
redirection du wiki GitHub.

Les contributeurs modifient le site dans des pull requests (voir `CONTRIBUTING.md`). Cette page couvre
uniquement ce qui demande des droits d'administration : la configuration unique de GitHub Pages, le jeton
du wiki et la publication manuelle du wiki.

## Le site de documentation

Le site est le dossier `docs/site/` (Astro Starlight, anglais et français). Il est publié sur
<https://foufou-exe.github.io/homebox-clipper/> par le workflow `.github/workflows/docs.yml` :

- à chaque push sur `main` qui modifie `docs/site/` ou le workflow lui-même ;
- à la demande : **Actions** → **Docs** → **Run workflow**.

Une exécution plus récente annule celle en cours. Le workflow n'utilise que les actions officielles
`actions/upload-pages-artifact` et `actions/deploy-pages`, avec `pages: write` et `id-token: write` sur le
seul job de déploiement.

### Configuration unique de GitHub Pages

1. Dans le dépôt, ouvrez **Settings** → **Pages**.
2. Sous **Build and deployment**, choisissez **Source: GitHub Actions**.
3. Lancez **Actions** → **Docs** → **Run workflow**.
   - **Résultat attendu** : l'exécution est verte, l'environnement `github-pages` est créé et le site
     répond à l'adresse ci-dessus.
4. Facultatif : **Settings** → **Environments** → `github-pages` → limitez les *Deployment branches* à
   `main`.

### Vérifier en local avant de fusionner

```bash
bun run docs:build   # même compilation que le workflow ; échoue sur un lien ou une ancre cassé
bun run docs:dev     # aperçu sur http://localhost:4321/homebox-clipper/
```

`docs:build` demande Node.js ≥ 22.23.4 (exigence d'Astro). Avec mise, lancez `mise install` d'abord.

### Si ça ne marche pas

| Symptôme | Que faire |
|----------|-----------|
| Le workflow **Docs** échoue à l'étape de déploiement | Vérifiez que **Source: GitHub Actions** est bien choisi dans **Settings** → **Pages**. |
| Le workflow ne démarre pas | Vérifiez le quota de minutes GitHub Actions du compte (**Settings** → **Billing**) avant de chercher un bug. |
| `bun run docs:build` échoue sur un lien | Corrigez le lien indiqué dans le message (les deux langues sont vérifiées). |

## Le wiki GitHub (pages de redirection)

Le wiki n'est plus une source de documentation. `docs/wiki/` ne contient que de courtes pages qui
renvoient vers le site, une par ancienne page du wiki, pour que les anciens liens fonctionnent encore.
Elles ne renvoient jamais vers `docs/maintainer/`.

### Publication automatique

Le workflow `.github/workflows/wiki.yml` lance `scripts/publish-wiki.sh --yes` à chaque push sur `main` qui
modifie `docs/wiki/`, et à la demande (**Actions** → **Wiki** → **Run workflow**). Il a besoin du secret
`WIKI_TOKEN` de l'environnement `wiki`. **Sans ce secret, le job est ignoré avec une notice et se termine
avec succès.**

Configuration unique (la première page du wiki doit déjà exister : créez-la à la main depuis l'onglet
**Wiki** du dépôt, GitHub n'initialise pas le dépôt `.wiki.git` avant) :

1. Sur GitHub : avatar → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. Donnez un nom (par exemple `homebox-clipper wiki`) et une **expiration** (par exemple 90 jours). Notez
   la date de renouvellement dans votre agenda.
3. **Repository access** : *Only select repositories*, puis `homebox-clipper`.
4. **Repository permissions** : *Contents: Read and write* (*Metadata: Read-only* s'ajoute tout seul).
   Aucune autre permission.
5. Générez le jeton et copiez-le (il n'est affiché qu'une fois).
6. Dans le dépôt : **Settings** → **Environments** → **New environment**, nommé exactement `wiki`.
   Facultatif : *Required reviewers* et *Deployment branches* limitées à `main`.
7. Dans cet environnement, **Environment secrets** → **Add secret** : nom `WIKI_TOKEN`, valeur : le jeton.
8. Lancez **Actions** → **Wiki** → **Run workflow**.
   - **Résultat attendu** : l'exécution est verte. Si le wiki est déjà à jour, rien n'est poussé.

Pour renouveler le jeton, générez-en un nouveau et remplacez la valeur de `WIKI_TOKEN`. Pour désactiver la
publication automatique, supprimez le secret ou l'environnement.

### Publication manuelle

Prérequis : wiki activé avec une première page, accès SSH au dépôt.

1. Vérifiez sans rien envoyer :

   ```bash
   bun run wiki:publish -- --dry-run
   ```

   **Résultat attendu** : les vérifications passent (chaque page sauf `_*.md` renvoie vers le site, aucun
   lien relatif ne sort de `docs/wiki/`).
2. Publiez :

   ```bash
   bun run wiki:publish
   ```

   Le script clone le wiki, synchronise les pages, affiche `git diff --stat` et demande une confirmation
   `y/N`. Sans `y`, rien n'est poussé. Le message de commit est `docs: sync wiki from <sha>`.

Le script retire l'extension `.md` des liens internes (comme l'attend le wiki GitHub) et supprime du wiki
les pages qui ne sont plus dans `docs/wiki/`.

### Si ça ne marche pas

| Symptôme | Que faire |
|----------|-----------|
| Erreur d'authentification dans le workflow **Wiki** | Le jeton a expiré : générez-en un nouveau et remplacez `WIKI_TOKEN`. |
| Erreur de clone du wiki | La première page du wiki n'existe pas : créez-la depuis l'onglet **Wiki**. |
| Le job est « ignoré » | Le secret `WIKI_TOKEN` manque dans l'environnement `wiki`. |
