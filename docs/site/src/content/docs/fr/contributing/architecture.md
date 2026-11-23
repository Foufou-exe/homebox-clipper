---
title: "Architecture"
description: "Comment le code est organisé : couches, étapes d'import, messagerie et stockage."
---

HomeBox Clipper est une extension Manifest V3 construite avec [WXT](https://wxt.dev) (basé sur Vite),
[Vue 3](https://vuejs.org) et TypeScript strict. Le code est découpé en couches qui ne se connaissent qu'à
travers des contrats typés : ajouter un marchand ne touche ni le client HomeBox ni l'interface.

## Vue d'ensemble

```
Popup / Options (Vue)  ──typed messages──▶  Service worker  ──HTTP + API key──▶  Your HomeBox instance
                                                  │
                                                  └──messages (no key)──▶  Script injected into the merchant tab
```

- Le **service worker** est le seul à détenir la clé API déchiffrée et le seul à communiquer avec HomeBox.
- Le **script injecté** lit la page du marchand et télécharge la facture avec la session de l'utilisateur ;
  il n'a accès ni au stockage ni aux réglages.
- L'**interface** (popup, options) affiche, valide et demande ; elle ne reçoit jamais la clé (seulement une
  version masquée).

## Dossiers de premier niveau de `src/`

| Dossier | Rôle |
|---------|------|
| `assets/` | Ressources statiques utilisées par le code (logo SVG). Les icônes de l'extension sont dans `public/icon/`, régénérées par `bun run icons`. |
| `background/` | Service worker : `config/` (stockage, chiffrement, règle d'URL, gestionnaires), `homebox/` (client d'API typé), `import/` (orchestration, doublons, imports en attente), `location/` (liste des emplacements : `handlers.ts` ; mémoire du dernier emplacement par instance : `last-location.ts`), `history/` (historique local des imports : projection pure `entry.ts`, chiffrement AES-GCM `history-crypto.ts`, stockage chiffré et élagage `history-store.ts`, gestionnaires `history/*`), `detect.ts` (injection et détection), `router.ts` (validation et routage des messages). |
| `content/` | Extracteurs par marchand (`content/merchants/<merchant>/`) : `selectors.ts`, `parse.ts`, `extractor.ts`, `download.ts`, plus le contrat `types.ts` et le registre `registry.ts`. Aucun secret et aucun accès réseau, sauf le téléchargement de la facture. |
| `entrypoints/` | Points d'entrée WXT, volontairement minces : `background.ts`, `popup/`, `options/` et un script injectable par marchand (`amazon.content.ts`, partagé par les huit boutiques Amazon). |
| `locales/` | Catalogues des textes de l'interface (`en.yml`, par défaut et de référence, et `fr.yml`), lus par `@wxt-dev/i18n`. Voir [Traductions](/homebox-clipper/fr/contributing/translations/). |
| `platform/` | Abstraction de l'API du navigateur (`browser`, permissions, i18n) : le **seul** endroit qui importe l'API du navigateur dans `src/`, pour permettre un portage Firefox. |
| `shared/` | Types, codes d'erreur, messages internes et leur validation, utilitaires PDF, `logger.ts`. |
| `ui/` | Composants Vue (`components/`, `popup/`, `options/`), thème (`theme.css`, `theme.ts`), accès aux textes (`i18n.ts`). |

En dehors de `src/` : `tests/` (voir [Tests et fixtures](/homebox-clipper/fr/contributing/testing-and-fixtures/)), `public/`, `scripts/`,
`wxt.config.ts` (manifeste et modules WXT).

## Un import en quatre étapes

L'API HomeBox (v0.27) n'accepte pas le prix, la date ni le vendeur à la création ; d'où :

1. `POST /api/v1/entities` : création (nom, description, quantité) ;
2. `PUT /api/v1/entities/{id}` : informations d'achat (prix, date, vendeur) et notes ; l'objet est relu
   avant la mise à jour pour ne pas écraser ses autres champs ;
3. `POST /api/v1/entities/{id}/attachments` : une requête par document (`multipart/form-data`), de type
   `receipt` pour une facture, `manual` pour un manuel, `warranty` pour une garantie, `attachment` sinon
   (bon de livraison, document de commande). Si l'instance répond 422 à `manual` ou `warranty`, le même
   fichier est renvoyé une fois en `attachment` et le popup l'indique ;
4. `POST /api/v1/entities/{id}/attachments` pour la photo (`type=photo`, `primary=true`), en dernier : son
   échec ne retarde ni l'objet ni la facture.

L'orchestrateur (`src/background/import/orchestrator.ts`) garde l'état de chaque étape. **Une étape réussie
n'est jamais rejouée et, une fois l'identifiant de l'objet connu, l'objet n'est jamais recréé** : une reprise
n'exécute que les étapes restantes. En cas de succès, les données d'achat conservées sont purgées.

### Type d'objet des objets importés (spec 023)

Le récapitulatif lit une fois les types d'objet de l'instance cible (`entity-type/list`, `GET /api/v1/entity-types`,
lecture seule, pages de l'extension uniquement) et affiche un select natif « Type d'objet » par produit quand il y a au moins deux
types hors emplacement. Le service worker détermine le type par défaut du serveur (le plus ancien type hors
emplacement, celui que HomeBox applique quand aucun n'est envoyé) et le dernier type utilisé sur l'instance
(`lastEntityTypeByInstance`, effacé quand le type a disparu). `ImportDraft.entityTypeId` n'est présent que pour un type
autre que le type par défaut du serveur, jamais avec `complete` ; `createEntity` et `createFromTemplate` n'ajoutent
`entityTypeId` au corps que s'il est présent, de sorte qu'un brouillon sans lui produit exactement les requêtes
d'avant. Après un échec de création définitif avec un type, les types sont relus une fois : un type disparu donne
`ENTITY_TYPE_NOT_FOUND`. Après un lot qui a créé un objet, le type du dernier produit créé est mémorisé (`null`
efface la mémoire). Un 404, une erreur ou un seul type masque le select.

### Import avec un modèle d'objet HomeBox (spec 018)

Quand un modèle est choisi pour un produit (`ImportDraft.template`), l'orchestrateur suit un chemin « modèle »,
sélectionné uniquement par `draft.template` (sans modèle, le code, les requêtes et les états persistés sont
inchangés : le snapshot `orchestrator-call-sequence` n'est jamais régénéré) :

1. avant toute persistance, chaque modèle distinct du lot est relu (`GET /api/v1/templates/{id}`) et son
   empreinte SHA-256 comparée à celle qui a été confirmée : supprimé donne `TEMPLATE_NOT_FOUND`, modifié donne
   `TEMPLATE_CHANGED`, et rien n'est créé pour aucun produit du lot ;
2. `POST /api/v1/templates/{id}/create-item` avec exactement `{ name, description?, quantity, parentId }` remplace
   `POST /api/v1/entities` (un emplacement est obligatoire ; jamais de repli vers `POST /entities`) ;
3. un seul `PUT /api/v1/entities/{id}` porte les données d'achat, les valeurs du modèle (assuré, fabricant,
   numéro de modèle, la garantie affichée), les champs personnalisés appariés par `(name, type)` (les champs
   étrangers sont renvoyés tels quels) et les tags ; un tag par défaut d'un modèle n'est jamais créé
   (`noCreate`) ;
4. l'extension relit l'objet (`GET /api/v1/entities/{id}`) et compare chaque champ confirmé : un écart fait
   échouer l'étape « Champs du modèle » (`steps.templateFields`, `TEMPLATE_FIELDS_FAILED`), l'objet est conservé
   et l'étape peut être relancée seule, sans recréer l'objet.

Une reprise avant la création revérifie le modèle de la même façon ; une fois l'objet créé, le modèle n'est
jamais relu. La liste des modèles est indisponible (`TEMPLATES_UNAVAILABLE`) ou non prise en charge par
l'instance (`TEMPLATES_UNSUPPORTED`, 404) : un import sans modèle reste possible.

### Champs de commande en champs personnalisés HomeBox (spec 019)

Quand l'option « Enregistrer la commande en champs personnalisés » est activée pour l'instance cible, chaque
brouillon confirmé porte `ImportDraft.orderFields` (1 à 3 champs texte : numéro de commande, marchand, adresse
de la page de commande, avec les noms des réglages de cette instance). L'orchestrateur ne suit le chemin des
champs de commande que si cette clé existe (option désactivée : aucun nouveau code ne s'exécute, les requêtes
et les états persistés sont inchangés, le snapshot `orchestrator-call-sequence` n'est jamais régénéré) :

1. le `PUT /api/v1/entities/{id}` d'achat existant porte aussi les champs de commande dans `fields` (aucune
   écriture supplémentaire) : un champ texte de même nom déjà présent sur l'objet (issu d'un modèle ou d'une
   tentative précédente) est mis à jour sur place, tout autre champ personnalisé est renvoyé tel quel (#109) ;
   les notes restent exactement celles d'aujourd'hui ;
2. un refus définitif de ce PUT (statut HTTP connu autre que 401/403) est renvoyé une fois sans les champs de
   commande, à partir du même état lu auparavant, de sorte que les données d'achat, les notes, les tags et les
   champs du modèle ne sont jamais perdus ;
3. après un PUT portant les champs de commande, l'extension relit l'objet (`GET /api/v1/entities/{id}`, la même
   lecture que la vérification du modèle quand il y a un modèle) et vérifie que chaque champ de commande est
   présent exactement une fois avec sa valeur : un écart ou un refus fait échouer l'étape « Champs de commande »
   (`steps.orderFields`, `ORDER_FIELDS_FAILED`), l'objet est conservé et l'étape peut être relancée seule, avec
   les noms et valeurs confirmés au départ.

Les noms des champs personnalisés existants sont lus uniquement pour les suggestions des réglages
(`GET /api/v1/entities/fields`, déverrouillé, instance du message uniquement ; jamais les valeurs) ; une lecture
impossible donne `FIELD_NAMES_UNAVAILABLE`.

### Page de commande en lien externe (spec 025)

Quand l'option « Ajouter un lien vers la page de commande » est activée pour l'instance cible et que la case d'un
produit est cochée, le brouillon confirmé porte `ImportDraft.orderLink: true` (absent sinon, jamais `false` ;
l'adresse est le `pageUrl` du brouillon, http(s) sans identifiants). `import/start` le refuse (`BAD_MESSAGE`, avant
toute requête) quand l'option est désactivée pour la cible, ou sur un brouillon qui complète un objet existant.
L'orchestrateur n'ajoute l'étape `steps.orderLink` que si la clé existe, de sorte que sans l'option les requêtes,
les états persistés et le snapshot `orchestrator-call-sequence` (jamais régénéré) sont inchangés :

1. après la photo, un `POST /api/v1/entities/{id}/attachments/external` avec le corps
   `{ source_type: "link", external_id: <address>, title, attachment_type: "attachment" }` (HomeBox n'accepte que
   le type de source `link`, et une adresse http(s) sans identifiants ; il ne dédoublonne pas les liens) ;
2. `orderLinkAttempted` est écrit avant le POST ; la reprise d'une étape tentée relit l'objet
   (`GET /api/v1/entities/{id}`) et cherche une pièce jointe de type `link/url` avec le même chemin : trouvée,
   l'étape est terminée sans envoi ; introuvable, le POST est envoyé ; illisible, rien n'est envoyé. L'extension ne
   crée jamais un second lien ;
3. un échec laisse l'import partiel (`steps.orderLink: 'failed'`, `ORDER_LINK_FAILED`), après la photo et avant les
   tags dans l'ordre des erreurs signalées, et n'arrête jamais les autres étapes. Un 404 de la route suivi d'un
   objet lisible donne `ORDER_LINK_UNSUPPORTED` (instance sans liens externes).

Le réglage est `storage.local.orderLinkByInstance` (`{ [instanceId]: { enabled } }`, effacé avec l'instance ou les
réglages), lu et écrit par `order-link/get` et `order-link/set`. Le chemin de complétion de la spec 021 n'exécute
jamais l'étape. Ni l'adresse, ni le titre, ni l'identifiant de l'objet ne sont journalisés (gabarit du point
d'accès, statut et durée uniquement).

### Fabricant, modèle et numéro de série (spec 027)

Le script injecté (`amazon/extract`) exécute `extractWithLookups` (`src/content/merchants/extract-all.ts`) :
l'extraction de la page, puis, en parallèle, `resolveDocuments` et le `resolveProductIdentifiers` facultatif du
contrat de marchand. Pour Amazon, `src/content/merchants/amazon/product-details.ts` lit `<origin>/dp/<ASIN>` pour
chaque ASIN distinct (10 au plus, 3 à la fois, 8 s chacun et 10 s pour l'ensemble de la recherche, 5 Mo comptés sur
le corps lu en flux, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`,
adresse finale sur la même origine, HTML uniquement) et lit les lignes de détail (`SELECTORS.productDetailRow`, libellés
`productDetailLabels` de `page-locales.ts`). Chaque `DetectedProduct` porte alors `manufacturer` et `modelNumber`
(`Field<string>`) uniquement si sa page a été lue (`not_found` : lue, sans ligne correspondante) ; un produit dont
la page n'a pas été lue (pas d'ASIN, au-delà de 10, échec, budget dépassé) n'a aucun de ces champs, et aucun avis
n'est affiché. Jamais d'erreur.

Le récapitulatif les affiche dans `IdentifiersSection.vue` avec un numéro de série vide ; le brouillon confirmé
porte `ImportDraft.identifiers` (`{ manufacturer?, modelNumber?, serialNumber? }`, propres, non vides, 255 octets
au plus ; absent sans aucune valeur, jamais avec `complete`, le numéro de série seulement avec un modèle). Aucune
nouvelle étape et aucune nouvelle requête : `purchaseBase` ajoute `identifiersPatch(draft.identifiers, current)` au
PUT d'achat, chaque valeur seulement quand l'objet lu ou créé n'en a pas. Sans identifiants, le PUT et le snapshot
`orchestrator-call-sequence` sont inchangés.

### Collection cible (spec 024)

`collectionByInstance` (`storage.local`) garde, par instance, la collection choisie (`chosen`, ou aucune : la
collection par défaut de la clé) et celle lue en dernier (`seen`, avec `several`). `configStore.getCredentials`
n'ajoute `tenant` que lorsqu'une collection est choisie ; le client envoie alors `X-Tenant: <id>` sur chaque requête
authentifiée de cette instance (jamais sur le `GET /status` public, jamais dans l'URL). Sans collection choisie,
aucun en-tête n'est envoyé et les requêtes sont inchangées (`orchestrator-call-sequence` et son snapshot
intacts). Les messages `instance/collections` et `instance/set-collection` lisent `GET /api/v1/groups/all` et
`GET /api/v1/groups` **sans** `X-Tenant` (une collection perdue ne doit pas empêcher d'en choisir une autre). Un
403 avec l'en-tête donne `COLLECTION_UNAVAILABLE`, jamais réessayé sans lui (pas de PUT de repli dans
l'orchestrateur non plus ; la détection des doublons le signale aussi) ; une liste illisible donne
`COLLECTIONS_UNAVAILABLE`. Chaque entrée mémorise l'adresse sur laquelle elle a été lue : après un changement
d'adresse, elle ne s'applique plus (pas de seconde écriture). Les écritures sont en compare-and-write dans la file
d'écriture de la configuration. Une entrée illisible fait échouer `getCredentials` avec `COLLECTION_UNAVAILABLE`
(jamais la collection par défaut) ; les lectures de découverte utilisent `getKeyCredentials`. Un import garde la
collection avec laquelle il a démarré (`PendingImport.collection`) : chaque reprise l'utilise, quel que soit le
réglage actuel, et le résultat la nomme. Le récapitulatif nomme la collection à partir de la vue
(`InstanceView.collection`), sans aucune requête.

### Compléter un objet existant (spec 021)

Dans la fenêtre des doublons, un produit peut être réglé sur **Compléter** un objet trouvé (doublon certain ou
objet similaire) au lieu d'en créer un. Le popup envoie alors `import/complete-preview` (`{ instanceId, entityId,
draft }`) pour chaque produit choisi : le service worker lit l'objet sur l'instance cible (`GET
/api/v1/entities/{id}` ; 404 → `ITEM_NOT_FOUND`) et le module pur `src/background/import/completion.ts` calcule
les modifications possibles (`planCompletion` : documents dont le titre n'est pas encore sur l'objet, la photo,
tags manquants, valeurs d'achat et de garantie vides, champs personnalisés de commande absents, la ligne de
notes). La réponse ne contient que des clés, le nom de l'objet et sa quantité : rien d'autre de l'objet n'atteint
le popup, et rien n'est stocké ni journalisé.

Après la confirmation, le même `import/start` porte chaque produit ; un produit complété porte
`ImportDraft.complete` (`entityId`, `itemName`, `keys` confirmées, `quantityIncrease` facultatif), jamais de
modèle, et `location: null`. L'orchestrateur ne le crée jamais : son import démarre avec `entityId` renseigné et
l'étape de création terminée. À chaque exécution (la première et les reprises), il relit l'objet, recoupe les
clés confirmées avec ce qui est encore applicable (`completionPatch` ; les autres vont dans `completion.skipped`),
puis envoie **un seul PUT** construit par `preservingUpdate` dans `src/background/homebox/client.ts` : chaque
propriété de l'objet lu, y compris les tags, l'emplacement, les champs personnalisés et les détails de vente
(`soldDate`, `soldTo`, `soldPrice`, `soldNotes`) et `syncChildEntityLocations` que `entityOutToUpdate` (chemin de
création, inchangé) ne copie pas, plus les ajouts uniquement. Aucun PUT n'est envoyé quand il ne reste rien à
écrire (`completion.noChange`). Les documents sont joints par l'étape existante, sauf ceux dont le titre est déjà
sur l'objet (`completion.present`) ; la photo est envoyée avec `primary=true` seulement quand l'objet n'a pas de
photo principale. Garde-fous de reprise : le nombre de photos est mémorisé avant le POST de la photo
(`completion.photoCountBefore`), et la base et la cible de quantité sont mémorisées avant le PUT
(`completion.quantityBase`, `completion.quantityTarget`), de sorte qu'une reprise n'envoie jamais un document, la
photo ou l'augmentation de quantité deux fois. L'entrée d'historique reçoit `completed: true`.

### Étape de la photo (`photo-fetch.ts`)

`src/background/import/photo-fetch.ts` récupère l'image avec un `fetch` anonyme, dans un module
**séparé du client HomeBox** (il n'a jamais accès à la clé). Il revérifie l'URL par rapport aux `imageHosts` du
marchand (`draft.photo.merchantId`), refuse les redirections, limite la taille (5 Mo) et détermine le format
d'après la signature. L'orchestrateur le reçoit comme dépendance (`fetchPhoto`) et garde l'état de l'étape
(`not_requested`, `unavailable`, `pending`, `sending`, `done`, `failed`) dans `PendingImport`,
avec `photoError` et `photoAttempted`. `sending` est écrit **avant** le POST : à la reprise, si un envoi a pu
partir, l'objet est relu et la photo n'est pas renvoyée si une pièce jointe de type `photo` existe déjà. Les
octets ne sont jamais persistés ; la même image n'est téléchargée qu'une seule fois par appel.

### Imports orphelins

Le service worker garde en mémoire l'ensemble des imports actifs (`activeImports`). À la lecture
(`import/pending`), un import `running` absent de cet ensemble n'a plus de processus derrière lui : il devient
`failed` (objet non créé) ou `partial` (objet créé), marqué `orphaned`, et peut être relancé. Tous les
imports d'un lot sont persistés avant le premier POST. Le POST de création est précédé de l'écriture de
`createAttempted` ; un orphelin sans identifiant dont le POST a démarré est marqué `createUncertain`,
comme un import dont la réponse au POST a été perdue (`HOMEBOX_UNREACHABLE`). Une erreur HTTP explicite reste
un échec certain. Pour une création incertaine, la reprise cherche d'abord le nom exact
(`findDuplicatesByName`, sans le numéro de commande, que l'objet n'a pas avant le PUT) :
`DUPLICATE_SUSPECTED` s'il existe, `DUPLICATE_CHECK_FAILED` si la recherche échoue, dans les deux cas sans
POST. Une reprise lancée alors que la même est déjà en cours (`activeImports`) renvoie l'état courant sans
seconde exécution. Le mécanisme ne couvre que l'arrêt du service worker : `storage.session` est
vidé à la fermeture du navigateur et à la mise à jour de l'extension.

Avant l'import, `duplicate/check` interroge HomeBox pour chaque produit sélectionné et renvoie
`{ matches, similar, moreSimilar, incomplete }` : au plus 4 recherches par produit, en parallèle
(`GET /api/v1/entities?q=...`) : le numéro de commande entre guillemets (doublon certain : même numéro de commande
dans les notes, même nom, inchangé) et au plus 3 mots significatifs du nom (`pageSize=50`). La proximité des noms
(FR-004 de la spec 015) est calculée dans le service worker par le module pur `src/shared/similarity.ts` ; HomeBox
ne fournit que des candidats. `similar` contient au plus 5 objets, jamais un doublon certain ; `incomplete` signifie
que certaines recherches ont échoué (produit non vérifié). La reprise d'une création incertaine garde
`findDuplicatesByName` (nom exact). Quand l'option des champs de commande est activée pour l'instance cible (lue
dans le réglage de l'instance par le service worker ; le message `duplicate/check` est inchangé) et que le numéro
de commande n'est pas vide, une cinquième requête s'exécute en parallèle :
`GET /api/v1/entities?fields=<name>=<number>` (correspondance exacte sur le champ personnalisé du numéro de
commande). Un objet trouvé uniquement par ce filtre, avec le même nom, est confirmé par
`GET /api/v1/entities/{id}` (5 lectures au plus, sinon `incomplete`), car un serveur peut ignorer le filtre. Rien
n'est stocké et aucune donnée personnelle n'est journalisée.

## Emplacement

`location/list` lit l'arbre `GET /entities/tree` (sans les objets), `src/shared/locations.ts`
l'aplatit en une liste triée de chemins (uniquement les nœuds de type emplacement, profondeur bornée) et
`lastLocation.resolve` y rattache l'identifiant mémorisé s'il existe toujours. Le composant `LocationPicker.vue`
(combobox ARIA, sans dépendance) ne fait que choisir parmi les emplacements existants. À la création, l'emplacement
est envoyé comme **`parentId`** et non comme `locationId` (HomeBox refuse un `locationId` inconnu avec une erreur
422) ; le `PUT` de mise à jour renvoie toujours `parentId`, sinon l'emplacement serait perdu. Un emplacement
disparu au moment de la soumission donne `LOCATION_NOT_FOUND` : rien n'est créé pour ce produit.

## Messagerie interne

Les échanges passent par des messages déclarés dans `src/shared/messages.ts` : chaque type a un validateur exécuté
à la réception (`isMessage`). Le routeur (`src/background/router.ts`) :

- répond `BAD_MESSAGE` à tout message invalide ou venant d'une autre extension, sans exécuter de
  gestionnaire ;
- réserve les préfixes `config/`, `session/`, `detect/`, `duplicate/`, `import/`, `location/`, `history/`,
  `update/`, `tag/`, `instance/`, `entity-type/` et `template/` aux pages de l'extension (popup, options), jamais aux scripts injectés ;
- appelle le crochet d'activité du verrouillage automatique (`src/background/config/auto-lock.ts`) pour chaque
  message accepté venant d'une page de l'extension, avant le gestionnaire ;
- convertit toute exception de gestionnaire en erreur visible, sans détail.

Familles de messages : configuration (`config/get|delete`), instances HomeBox
(`instance/add|update|rename|test|delete`), session
(`session/unlock|lock|open|get-policy|set-policy|change-passphrase`), mises à jour (`update/state|dismiss|apply`, gérées dans
`src/background/update/`),
détection (`detect/run`), emplacements (`location/list`), types d'objet HomeBox (`entity-type/list`, lecture seule, `src/background/entity-types/`), tags HomeBox (`tag/list`, lecture seule, `src/background/tags/`),
modèles d'objet HomeBox (`template/list`, `template/get`, `template/check`, `template/get-default`,
`template/set-default`, `src/background/templates/` : lecture seule sur les modèles, jamais d'écriture de modèle ;
`template/get-default` n'a besoin ni du réseau ni de la clé), champs de commande en champs personnalisés HomeBox
(`order-fields/get`, `order-fields/set` : le réglage d'une instance, lisible et modifiable pendant le verrouillage, sans
réseau ni clé ; `order-fields/names` : les noms des champs personnalisés existants, déverrouillé,
`src/background/order-fields/`), le lien vers la page de commande (`order-link/get`, `order-link/set` : le réglage d'une instance, lisible et modifiable pendant le verrouillage, sans réseau ni clé ; `src/background/order-link/`), la collection cible (`instance/collections`, `instance/set-collection`,
déverrouillé, `src/background/collections/`), doublons (`duplicate/check`), import
(`import/start|retry|abandon|pending`), extraction dans l'onglet (`amazon/extract`, `amazon/download`) et
progression (`import/progress`). Les réponses sont des valeurs `Result` : soit une valeur, soit un code d'erreur
du catalogue (`src/shared/errors.ts`).

Chaque message qui contacte HomeBox nomme son instance cible : `location/list`, `tag/list`, `duplicate/check`
et `import/start` portent un `instanceId` (validé, 1 à 64 caractères) ; il n'y a aucun repli vers une instance par
défaut. Chaque gestionnaire construit son client HomeBox une seule fois, à partir de `configStore.getCredentials(instanceId)` (erreurs dans
cet ordre : `NOT_CONFIGURED`, `INSTANCE_NOT_FOUND`, `LOCKED`, `KEY_UNREADABLE`, `PERMISSION_DENIED`).
`import/retry` ne porte aucune cible : il lit `instanceId` dans l'import interrompu, renseigné par le gestionnaire d'import
(le `store` et le `notify` donnés à l'orchestrateur sont enveloppés). L'orchestrateur lui-même ne connaît rien des
instances et reste inchangé (`src/background/import/orchestrator.ts`) ; son snapshot de contrat
(`tests/contract/__snapshots__/orchestrator-call-sequence.test.ts.snap`) n'est jamais régénéré.

## Stockage

| Où | Quoi |
|----|------|
| `storage.local` | Instances HomeBox (`homeboxInstances` : le coffre `{ kdf, iterations, salt, check, historyKey }` et 1 à 10 instances `{ id, name, baseUrl, key, maskedKey, lastCheck }`, chaque clé **chiffrée** avec l'adresse de son instance comme donnée associée), l'instance du dernier import réussi (`lastInstanceId`), le thème (`uiTheme`) et le dernier emplacement par instance (`lastLocationByInstance`, indexé par identifiant d'instance : identifiants uniquement, effacé avec l'instance ou les réglages). Historique des imports : une enveloppe **chiffrée** `{ v, iv, ct, inst? }` par produit (`importHistory:<id>`), où `inst` est l'identifiant de son instance en clair (hors du texte chiffré, non authentifié), et son réglage (`importHistorySettings`) ; la clé de l'historique est scellée dans le coffre. Réglage du verrouillage automatique (`lockSettings`), dernier avis de mise à jour (`updateNotice`) et réglage des tags automatiques (`tagSettings`). Modèle d'objet par défaut par instance (`defaultTemplateByInstance` : `{ [instanceId]: { id, name } }`, effacé avec l'instance ou les réglages, spec 018). Réglage des champs de commande par instance (`orderFieldsByInstance` : `{ [instanceId]: { enabled, names: { orderNumber, merchant, orderUrl } } }`, effacé avec l'instance ou les réglages, spec 019), le réglage du lien de chaque instance (`orderLinkByInstance` : `{ [instanceId]: { enabled } }`, effacé avec l'instance ou les réglages, spec 025). Dernier type d'objet utilisé par instance (`lastEntityTypeByInstance` : `{ [instanceId]: typeId }`, identifiants uniquement, effacé avec l'instance ou les réglages, spec 023). |
| `storage.session` | Clés déchiffrées par instance et clé d'historique ouverte (`homeboxUnlocked`, `{ v: 2, keys, historyKey }` ; un ancien `{ apiKey }` est lu comme la clé de l'instance unique), dernière activité (`homeboxActivity`, pour le verrouillage par inactivité), version prête à installer (`updateReady`) et imports en cours (`pendingImport:<tab>:<id>`). Mémoire, vidée à la fermeture du navigateur. |

Le coffre et les instances vivent dans `src/background/config/instance-store.ts` (lectures validées, une seule
file d'écriture) et `src/background/config/vault-crypto.ts` (une dérivation PBKDF2 par opération ouvre ou scelle
chaque clé ; la clé du coffre n'est jamais stockée ni placée dans la session). L'ancienne configuration unique
(`homeboxConfig`, jusqu'à la 0.6.0) est migrée au démarrage vers la première instance (id `migrated`) : la migration
est idempotente et peut être reprise après une interruption, ne demande ni phrase de passe ni permission, et tant
qu'elle n'a pas réussi une vue de repli lit `homeboxConfig`. Revenir à une version antérieure à la prise en charge
multi-instance (une **rétrogradation**) n'est pas pris en charge : une telle version ne lit pas `homeboxInstances`.

Détails de sécurité : [Sécurité et confidentialité](/homebox-clipper/fr/security-and-privacy/).

## Textes de l'interface (i18n)

Aucun texte visible n'est écrit en dur dans `src/ui/`. L'interface appelle `t('dotted.key', [values])`
(`src/ui/i18n.ts`), qui passe par `src/platform/i18n.ts` (le seul accès à `browser.i18n`). Les messages d'erreur
sont `errorMessage(code)`, c'est-à-dire `t('error.<CODE>')`. Le service worker n'importe pas
`src/ui/` : il appelle `getMessage` directement (par exemple pour la note « Commande Amazon.de : ... », clé
`summary.orderNote`). Les clés sont typées d'après le catalogue et vérifiées par les tests.

**Choix de la langue.** Deux catalogues existent, `src/locales/en.yml` (référence) et `src/locales/fr.yml`,
avec les mêmes clés. `default_locale` vaut `en` dans `wxt.config.ts` ; le navigateur sert le français quand sa
langue d'interface est le français. Dans les pages, `uiLanguage()` (`src/ui/i18n.ts`) déduit la langue de
la langue d'interface du navigateur (`fr` pour `fr`, `fr-CA`..., sinon `en`) et pilote l'attribut `lang`
et `formatDate`. La parité entre les catalogues est imposée : voir [Traductions](/homebox-clipper/fr/contributing/translations/).

## Règles qui structurent le code

- Les sélecteurs DOM d'un marchand vivent uniquement dans son `selectors.ts`, avec plusieurs sélecteurs de repli
  par champ ; l'échec d'un champ n'interrompt pas les autres.
- Le client HomeBox est un module isolé, typé d'après l'API, indépendant de l'interface et des
  marchands.
- Aucun `console.*` en dehors de `src/shared/logger.ts` (règle ESLint).
- Permissions minimales et un seul build ; toute modification du manifeste doit être justifiée dans la pull request.

Les principes complets sont dans la constitution du projet, résumée dans le
[guide de contribution](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md). Pour étendre
le code : [Ajouter un marchand](/homebox-clipper/fr/contributing/adding-a-merchant/).
