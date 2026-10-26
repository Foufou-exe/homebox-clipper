# Contribuer à homebox-companion

Merci de votre intérêt ! Ce guide permet d'être opérationnel en quelques minutes.

## Démarrage rapide

**Option A : sur votre poste**

```bash
git clone https://github.com/Foufou-exe/homebox-companion.git
cd homebox-companion
mise install          # facultatif : installe Bun et Node aux versions du projet (mise.toml)
bun run setup         # dépendances, .env de l'instance HomeBox, hook pre-push (au choix)
bun run homebox:up    # HomeBox sur http://localhost:3100
bun run dev           # ouvre un Chrome de développement avec l'extension
```

**Option B : conteneur de développement (VS Code / GitHub Codespaces)**

Ouvrez le dépôt dans VS Code, puis *Reopen in Container*. Le conteneur installe Bun, les
dépendances et le `.env`, et dispose de son propre Docker pour HomeBox (port 3100 redirigé vers
votre poste). Il n'y a pas de navigateur dans le conteneur : lancez `bun run build` (ou
`bun run dev`, qui reconstruit en continu) et chargez le dossier `.output/chrome-mv3/` (ou
`.output/chrome-mv3-dev/`) dans le Chrome de votre poste.

Ensuite :

1. Ouvrez <http://localhost:3100>, créez un compte de test et une clé API
   (détails : [docs/local-homebox.md](docs/local-homebox.md)).
2. Configurez l'extension (adresse `http://localhost:3100`, clé, phrase de passe).

### Prérequis

| Outil | Version | Remarque |
|-------|---------|----------|
| [Bun](https://bun.sh) | 1.4 (`packageManager` dans `package.json`) | gestionnaire de paquets et scripts |
| [Node.js](https://nodejs.org) | LTS | utilisé par Vite / WXT |
| Docker + Compose | récent | instance HomeBox locale |
| Chrome ou Chromium | récent | pour charger l'extension |
| `rsvg-convert` (librsvg) | facultatif | seulement pour `bun run icons` |

[mise](https://mise.jdx.dev) installe Bun et Node aux bonnes versions grâce à `mise.toml`.

### Éditeur

VS Code propose les extensions recommandées (`.vscode/extensions.json`) : Vue (Volar), ESLint,
Prettier, Vitest, EditorConfig, Bun. Le formatage et les corrections ESLint s'appliquent à
l'enregistrement. Les tâches courantes sont dans *Terminal → Run Task*
(vérifications, mode dev, build, tests en continu, HomeBox local).

## Commandes

| Commande | Rôle |
|----------|------|
| `bun run setup` | Préparation du poste (relançable sans risque) |
| `bun run dev` | Mode dev avec rechargement automatique |
| `bun run build` | Build → `.output/chrome-mv3/` |
| `bun run ci` | **Toutes les vérifications** : typecheck, lint, tests, build, manifeste |
| `bun run test` / `bun run test:watch` | Tests (Vitest, **pas** `bun test`) |
| `bun run homebox:up` / `homebox:down` / `homebox:logs` | Instance HomeBox locale |
| `bun run icons` | Régénère `public/icon/*.png` depuis `src/assets/logo.svg` |

`bun run dev` se personnalise avec un fichier local `web-ext.config.ts` : autre navigateur, pas
de navigateur, page de démarrage. Voir `web-ext.config.example.ts`.

## Façon de travailler

1. **Une branche par sujet**, créée depuis `main` à jour : `feat/…`, `fix/…`, `docs/…`,
   `chore/…`, `ci/…`.
2. **Commits** au format [Conventional Commits](https://www.conventionalcommits.org/fr/)
   (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`…).
3. **`bun run ci` doit passer en local avant chaque push.** Le quota de GitHub Actions du dépôt
   est limité : la CI GitHub ne tourne que sur les pull requests de code vers `main`, et la
   vérification de référence est locale. `bun run setup` peut installer un hook `pre-push` qui la
   lance automatiquement.
4. Ouvrez une **pull request** vers `main` en remplissant le modèle.

## Règles du projet

Les principes complets sont dans la constitution du projet. Les essentiels :

- **Clé API** : seul le service worker l'utilise. Elle est chiffrée au repos, jamais envoyée
  ailleurs qu'à l'instance HomeBox et jamais journalisée. Pas de `console.*` hors de
  `src/shared/logger.ts` (règle ESLint).
- **Confirmation explicite** : aucune écriture dans HomeBox sans clic de l'utilisateur.
- **Permissions minimales** : toute modification du manifeste (permissions, CSP) doit être
  signalée et justifiée dans la PR. `bun run test:build` vérifie le manifeste produit.
- **Sélecteurs Amazon** : uniquement dans `src/content/merchants/amazon-fr/selectors.ts`, avec
  plusieurs sélecteurs par champ.
- **Tests** : chaque extracteur est testé sur des pages **anonymisées**
  (`tests/fixtures/amazon-fr/`, procédure dans le README de ce dossier). **Ne commitez jamais**
  de page Amazon brute, de clé API, de pepper ni d'adresse d'instance réelle.

## Cas fréquents

**Amazon a changé sa mise en page** : capturez la page dans `tests/fixtures/amazon-fr/raw/`
(ignoré par git), anonymisez-la, ajoutez un test qui échoue, puis corrigez `selectors.ts`.

**Ajouter un marchand** : un dossier `src/content/merchants/<marchand>/` qui implémente
`MerchantExtractor` (`src/content/merchants/types.ts`), avec ses sélecteurs, ses fixtures et un
point d'entrée injectable dans `src/entrypoints/`. Ni l'orchestrateur d'import, ni le client
HomeBox, ni l'interface n'ont à changer.

**Modifier l'interface** : les couleurs sont des variables CSS dans `src/ui/theme.css`.
Vérifiez vos changements dans les thèmes clair et sombre.

## Signaler un problème

Utilisez les modèles d'issue. Pour une page Amazon mal détectée, indiquez le type de commande
(vendeur Amazon ou tiers, plusieurs articles…) et le champ concerné, **sans** joindre la page
brute.
