# Architecture

HomeBox Clipper est une extension Manifest V3 construite avec [WXT](https://wxt.dev) (base Vite),
[Vue 3](https://vuejs.org) et TypeScript strict. Le code est découpé en couches qui ne se connaissent que
par des contrats typés : ajouter un marchand ne touche ni le client HomeBox ni l'interface.

## Vue d'ensemble

```
Popup / Options (Vue)  ──messages typés──▶  Service worker  ──HTTP + clé API──▶  Votre instance HomeBox
                                                  │
                                                  └──messages (sans clé)──▶  Script injecté dans l'onglet marchand
```

- Le **service worker** est le seul à détenir la clé API déchiffrée et le seul à parler à HomeBox.
- Le **script injecté** lit la page marchande et télécharge la facture avec la session de l'utilisateur ; il
  n'a accès ni au stockage ni à la configuration.
- L'**interface** (popup, options) affiche, valide et demande ; elle ne reçoit jamais la clé (seulement une
  version masquée).

## Dossiers de premier niveau de `src/`

| Dossier | Rôle |
|---------|------|
| `assets/` | Ressources statiques du code (logo SVG). Les icônes de l'extension sont dans `public/icon/`, régénérées par `bun run icons`. |
| `background/` | Service worker : `config/` (stockage, chiffrement, règle d'URL, handlers), `homebox/` (client typé de l'API), `import/` (orchestration, doublons, imports en attente), `detect.ts` (injection et détection), `router.ts` (validation et routage des messages). |
| `content/` | Extracteurs par marchand (`content/merchants/<marchand>/`) : `selectors.ts`, `parse.ts`, `extractor.ts`, `download.ts`, plus le contrat `types.ts` et le registre `registry.ts`. Sans secret ni réseau hors téléchargement de la facture. |
| `entrypoints/` | Points d'entrée WXT, volontairement fins : `background.ts`, `popup/`, `options/` et un script injectable par marchand (`amazon-fr.content.ts`). |
| `locales/` | Catalogue des textes de l'interface (`fr.yml`), lu par `@wxt-dev/i18n`. Voir [Translations](Translations.md). |
| `platform/` | Abstraction de l'API navigateur (`browser`, permissions, i18n) : **seul** point d'import de l'API navigateur dans `src/`, pour permettre un portage Firefox. |
| `shared/` | Types, codes d'erreur, messages internes et leur validation, utilitaires PDF, `logger.ts`. |
| `ui/` | Composants Vue (`components/`, `popup/`, `options/`), thème (`theme.css`, `theme.ts`), accès aux textes (`i18n.ts`). |

Hors de `src/` : `tests/` (voir [Testing-and-fixtures](Testing-and-fixtures.md)), `public/`, `scripts/`,
`wxt.config.ts` (manifeste et modules WXT).

## Un import en quatre étapes

L'API HomeBox (v0.27) n'accepte pas le prix, la date ni le vendeur à la création ; d'où :

1. `POST /api/v1/entities` : création (nom, description, quantité) ;
2. `PUT /api/v1/entities/{id}` : informations d'achat (prix, date, vendeur) et notes ; l'objet est relu
   avant la mise à jour pour ne pas écraser ses autres champs ;
3. `POST /api/v1/entities/{id}/attachments` : une requête par document (`multipart/form-data`), de type
   `receipt` pour une facture, `attachment` sinon ;
4. `POST /api/v1/entities/{id}/attachments` pour la photo (`type=photo`, `primary=true`), en dernier : son échec ne
   retarde ni l'objet ni la facture.

L'orchestrateur (`src/background/import/orchestrator.ts`) conserve l'état de chaque étape. **Une étape
réussie n'est jamais rejouée et, une fois l'identifiant de l'objet connu, l'objet n'est jamais recréé** : une
reprise ne fait que les étapes restantes. À la réussite, les données d'achat conservées sont purgées.

### Étape photo (`photo-fetch.ts`)

`src/background/import/photo-fetch.ts` récupère l'image par un `fetch` anonyme, dans un module **séparé du
client HomeBox** (il n'a jamais accès à la clé). Il recontrôle l'URL avec `imageHosts` du marchand
(`draft.photo.merchantId`), refuse les redirections, limite la taille (5 Mo) et décide du format par la
signature. L'orchestrateur le reçoit comme dépendance (`fetchPhoto`) et garde l'état de l'étape
(`not_requested`, `unavailable`, `pending`, `sending`, `done`, `failed`) dans `PendingImport`, avec
`photoError` et `photoAttempted`. `sending` est écrit **avant** le POST : à la reprise, si un envoi a pu
partir, l'objet est relu et la photo n'est pas renvoyée si une pièce jointe de type `photo` existe déjà.
Les octets ne sont jamais persistés ; une même image n'est téléchargée qu'une fois par appel.

### Imports orphelins

Le service worker garde en mémoire l'ensemble des imports actifs (`activeImports`). À la lecture
(`import/pending`), un import `running` absent de cet ensemble n'a plus de processus derrière lui : il passe à
`failed` (objet non créé) ou `partial` (objet créé), marqué `orphaned`, et devient réessayable. Tous les
imports d'un lot sont persistés avant le premier POST. Le POST de création est précédé de l'écriture de
`createAttempted` ; un orphelin sans identifiant dont le POST a démarré est marqué `createUncertain`, comme un
import dont la réponse du POST s'est perdue (`HOMEBOX_UNREACHABLE`). Une erreur HTTP explicite reste un échec
certain. Pour une création incertaine, la reprise cherche d'abord le nom exact (`findDuplicatesByName`, sans
numéro de commande, que l'objet n'a pas avant le PUT) : `DUPLICATE_SUSPECTED` s'il existe,
`DUPLICATE_CHECK_FAILED` si la recherche échoue, dans les deux cas sans POST. Une reprise lancée alors que la
même est déjà en cours (`activeImports`) renvoie l'état courant sans seconde exécution. Le mécanisme ne couvre
que l'arrêt du service worker : `storage.session` est vidé à la fermeture du navigateur et à la mise à jour de
l'extension.

Avant l'import, `duplicate/check` interroge HomeBox (`GET /api/v1/entities?q=…`) pour repérer un doublon
probable (même numéro de commande dans les notes, même nom).

## Messagerie interne

Les échanges passent par des messages déclarés dans `src/shared/messages.ts` : chaque type a un validateur
exécuté à la réception (`isMessage`). Le routeur (`src/background/router.ts`) :

- rejette tout message invalide ou venant d'une autre extension (`BAD_MESSAGE`) ;
- réserve les préfixes `config/`, `session/`, `detect/`, `duplicate/` et `import/` aux pages de
  l'extension (popup, options), jamais aux scripts injectés ;
- convertit toute exception d'un handler en erreur visible, sans détail.

Familles de messages : configuration (`config/get|save|test|delete`), session (`session/unlock|lock`),
détection (`detect/run`), doublons (`duplicate/check`), import (`import/start|retry|abandon|pending`),
extraction dans l'onglet (`amazon/extract`, `amazon/download`) et progression (`import/progress`).
Les réponses sont des `Result` : soit une valeur, soit un code d'erreur du catalogue
(`src/shared/errors.ts`).

## Stockage

| Où | Quoi |
|----|------|
| `storage.local` | Configuration (`homeboxConfig` : adresse, clé **chiffrée**, clé masquée, dernier test) et thème (`uiTheme`). |
| `storage.session` | Clé déchiffrée (`homeboxUnlocked`) et imports en cours (`pendingImport:<onglet>:<id>`). Mémoire, effacée à la fermeture du navigateur. |

Détails de sécurité : [Security-and-privacy](Security-and-privacy.md).

## Textes de l'interface (i18n)

Aucun texte visible n'est écrit en dur dans `src/ui/`. L'interface appelle `t('cle.pointee', [valeurs])`
(`src/ui/i18n.ts`), qui passe par `src/platform/i18n.ts` (seul accès à `browser.i18n`). Les messages
d'erreur sont `errorMessage(code)`, c'est-à-dire `t('error.<CODE>')`. Le service worker n'importe pas
`src/ui/` : il appelle directement `getMessage` (par exemple pour la note « Commande Amazon.fr : … »,
clé `summary.orderNote`). Les clés sont typées à partir de `fr.yml` et vérifiées par les tests.

## Règles qui structurent le code

- Les sélecteurs DOM d'un marchand ne vivent que dans son `selectors.ts`, avec plusieurs sélecteurs de
  secours par champ ; l'échec d'un champ n'interrompt pas les autres.
- Le client HomeBox est un module isolé, typé d'après l'API, indépendant de l'interface et des marchands.
- Aucun `console.*` hors de `src/shared/logger.ts` (règle ESLint).
- Permissions minimales et build unique ; toute modification du manifeste doit être justifiée en pull request.

Les principes complets sont dans la constitution du projet, résumés dans le
[guide de contribution](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md). Pour étendre le code : [Adding-a-merchant](Adding-a-merchant.md).
