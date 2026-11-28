---
title: "Installer le projet"
description: "Installer le projet, lancer l'extension en mode développement et passer les vérifications, pas à pas."
---

**Public visé** : toute personne qui veut modifier le code, les textes ou la documentation de HomeBox
Clipper. À la fin, l'extension tourne depuis votre copie du code et `bun run ci` passe.

## Avant de commencer

| Outil | Version | Vérifier avec |
|-------|---------|---------------|
| Git | récente | `git --version` |
| [Bun](https://bun.sh) | 1.4 (fixée dans `package.json`, champ `packageManager`) | `bun --version` |
| [Node.js](https://nodejs.org) | LTS (utilisé par Vite et WXT) | `node --version` |
| Docker avec Compose | récente (pour l'instance HomeBox de test) | `docker compose version` |
| Chrome ou Chromium | récente | |
| Firefox | 140 ou plus récent (facultatif, pour tester la version Firefox) | |

[mise](https://mise.jdx.dev) peut installer Bun et Node aux bonnes versions pour vous : lancez `mise install`
dans le dossier du projet (il lit `mise.toml`).

Vous préférez ne rien installer ? Utilisez plutôt le [conteneur de développement](#avec-le-conteneur-de-développement).

## Avec votre machine

1. Récupérez le code :

   ```bash
   git clone https://github.com/Foufou-exe/homebox-clipper.git
   cd homebox-clipper
   ```

2. Facultatif : installez Bun et Node aux versions du projet :

   ```bash
   mise install
   ```

3. Préparez le projet :

   ```bash
   bun run setup
   ```

   La commande vérifie vos outils, installe les dépendances, crée le fichier `.env` de l'instance HomeBox de
   test (avec un secret aléatoire) et propose d'installer un hook `pre-push` qui lance `bun run ci` avant
   chaque push. Répondez `y` pour installer le hook (recommandé).

   **Résultat attendu** : la commande se termine par `Ready. Next:` et une liste de commandes. Une ligne `!`
   n'est qu'un avertissement (par exemple Docker absent) ; une ligne `✗` arrête la préparation et dit ce qui
   manque.

4. Démarrez l'instance HomeBox de test :

   ```bash
   bun run homebox:up
   ```

   Créez ensuite un compte et une clé API dedans : suivez
   [Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/), étapes 3 et 4.

5. Lancez l'extension en mode développement :

   ```bash
   bun run dev           # Chrome
   bun run dev:firefox   # Firefox (Firefox doit être installé)
   ```

   **Résultat attendu** : une fenêtre de navigateur séparée s'ouvre avec l'extension déjà chargée. À chaque
   enregistrement d'un fichier source, l'extension se recharge.

6. Configurez l'extension dans cette fenêtre : adresse `http://localhost:3100`, votre clé API de test et une
   phrase de passe, puis **Tester et enregistrer** (détails : [Configuration](/homebox-clipper/fr/configuration/)).

7. Lancez une fois toutes les vérifications :

   ```bash
   bun run ci
   ```

   **Résultat attendu** : la commande se termine sans erreur. Elle lance, dans l'ordre, `check:config`,
   `typecheck`, `lint`, `test`, `build` et `test:build`.

## Avec le conteneur de développement

Pour VS Code avec l'extension Dev Containers, ou GitHub Codespaces.

1. Ouvrez le dépôt dans VS Code, puis lancez **Dev Containers: Reopen in Container** depuis la palette de
   commandes.
2. Attendez la fin de la première création. Le conteneur installe Bun, les dépendances et le fichier `.env`,
   et a son propre Docker pour HomeBox (le port 3100 est redirigé vers votre machine).
3. Dans le terminal du conteneur, lancez `bun run homebox:up`, puis créez un compte et une clé API sur
   <http://localhost:3100> (voir [Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/)).
4. Il n'y a pas de navigateur dans le conteneur. Lancez `bun run build` (ou `bun run dev`, qui recompile à
   chaque modification), puis, **dans le navigateur de votre machine**, chargez le dossier compilé :
   - Chrome : `chrome://extensions` → **Mode développeur** → **Charger l'extension non empaquetée** →
     `.output/chrome-mv3/` (ou `.output/chrome-mv3-dev/` avec `bun run dev`) ;
   - Firefox : `about:debugging#/runtime/this-firefox` → **Charger un module complémentaire temporaire…** →
     le `manifest.json` de `.output/firefox-mv3/`.
5. Lancez `bun run ci` dans le terminal du conteneur.

   **Résultat attendu** : la commande se termine sans erreur.

## Personnaliser `bun run dev`

Copiez `web-ext.config.example.ts` en `web-ext.config.ts` (ignoré par git) et décommentez ce dont vous avez
besoin : aucun navigateur, un autre navigateur Chromium, Firefox Developer Edition, ou une page de démarrage.

## Éditeur

VS Code propose les extensions recommandées (`.vscode/extensions.json`) : Vue (Volar), ESLint, Prettier,
Vitest, EditorConfig, Bun. Le formatage et les corrections ESLint s'appliquent à l'enregistrement. Les tâches
courantes sont dans **Terminal** → **Exécuter la tâche** (vérifications, mode développement, compilation,
tests en continu, HomeBox local).

## Si ça ne marche pas

| Symptôme | Solution |
|----------|----------|
| `bun run setup` s'arrête avec `Bun is required` ou `Node.js LTS is required` | Installez l'outil manquant (ou lancez `mise install`), puis relancez `bun run setup`. Vous pouvez le relancer sans risque. |
| `Docker not found` pendant la préparation | Installez Docker avec Compose, ou utilisez le conteneur de développement. Seule l'instance HomeBox locale en a besoin. |
| `bun run homebox:up` échoue avec *Set HBOX_AUTH_API_KEY_PEPPER…* | Le fichier `.env` est absent : relancez `bun run setup`. |
| `bun run dev` n'ouvre aucun navigateur | Un fichier `web-ext.config.ts` avec `disabled: true` existe (normal dans le conteneur). Chargez le dossier compilé à la main, comme dans l'option du conteneur. |
| Les tests échouent ou ne sont pas trouvés avec `bun test` | Utilisez `bun run test` : les tests du projet tournent avec Vitest, pas avec le lanceur de tests de Bun. |
| `bun run ci` échoue | Lisez la première erreur : elle nomme l'étape (`typecheck`, `lint`, `test`…). Corrigez-la, puis relancez `bun run ci`. |

Étape suivante : [Proposer une modification](/homebox-clipper/fr/contributing/submitting-changes/).
