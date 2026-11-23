---
title: "Sécurité et confidentialité"
description: "Ce que l'extension stocke, ce qu'elle envoie et à qui, et les permissions qu'elle demande."
---

La clé API HomeBox donne accès à tout votre inventaire : la protéger est le principe central du projet. Cette
page décrit ce que l'extension fait, ce qu'elle ne fait pas, et ses limites. Pour signaler une vulnérabilité,
consultez la [politique de sécurité](https://github.com/Foufou-exe/homebox-clipper/blob/main/SECURITY.md).

## Ce que la clé API ne fait jamais

- Elle n'est **jamais envoyée à Amazon** (ni à aucun autre marchand).
- Elle n'est **jamais envoyée à un serveur intermédiaire** : il n'y en a pas, et il n'existe ni statistiques
  d'usage ni télémétrie. L'extension ne contacte que le marchand (pour lire la page et télécharger la facture
  avec votre session) et **votre** instance HomeBox.
- Elle n'est **jamais écrite dans les journaux**.
- Elle n'est **jamais incluse dans le code source** (ni dans les fichiers versionnés, ni dans les fixtures de test).

## Plusieurs instances HomeBox

Vous pouvez configurer plusieurs instances (jusqu'à 10). Chaque instance a sa propre clé API, chiffrée séparément
avec la **même phrase de passe** (un seul déverrouillage ouvre toutes les clés, un seul verrouillage les ferme
toutes) et avec l'adresse de **sa propre** instance comme donnée associée : une clé déplacée vers l'adresse d'une
autre instance ne peut pas être déchiffrée. La clé du coffre dérivée de la phrase de passe n'est jamais stockée ni
conservée dans la session, c'est pourquoi la phrase de passe est redemandée à chaque ajout d'une instance. Chaque
message qui contacte HomeBox désigne sa cible ; le client d'une requête est construit à partir de cette seule
instance, l'en-tête `Authorization` n'est ajouté qu'aux requêtes vers son adresse, et il n'existe aucun repli vers
une autre instance : une clé, un achat, un document ou un nom d'instance n'est jamais envoyé à une autre instance
(un import interrompu est repris sur l'instance où il a commencé). Chaque instance a sa propre permission
facultative, pour l'origine exacte de son adresse, demandée lors du clic qui l'ajoute ; elle est retirée dès
qu'aucune instance ne l'utilise (suppression d'une instance, changement de son adresse). Supprimer une instance
efface sa clé, son dernier emplacement, les entrées de son historique des imports (identifiées par l'identifiant
opaque `inst` stocké à côté de chaque entrée chiffrée, ce qui fonctionne même en étant verrouillé) et ses imports
interrompus.

## Modèle de menaces

| Menace | Protection |
|--------|------------|
| Un fichier du profil du navigateur est lu (copie de disque, sauvegarde) | La clé n'est stockée que **chiffrée** (AES-GCM 256, clé dérivée de votre phrase de passe avec PBKDF2-SHA256, 600 000 itérations, sel et IV aléatoires) dans `storage.local`. L'historique des imports est chiffré lui aussi (voir [Historique des imports](#historique-des-imports)) : seuls le nombre d'entrées et leur taille approximative sont visibles. |
| Quelqu'un modifie l'adresse stockée pour détourner la clé vers un autre serveur | L'adresse de l'instance sert de **donnée associée** au chiffrement : la modifier sans la phrase de passe rend le déchiffrement impossible. |
| Une page web (Amazon) tente de lire la clé | Seul le **service worker** utilise la clé. Le script injecté dans la page n'a accès ni au stockage ni aux réglages, et aucun message qui lui est adressé ne contient l'adresse ou la clé. |
| Un script de page tente d'appeler le service worker | Les messages sont **typés et validés** à la réception ; ceux qui touchent aux réglages, au déverrouillage, à la détection et aux imports sont refusés s'ils ne viennent pas d'une page de l'extension (fenêtre contextuelle, options). |
| La clé est envoyée au mauvais hôte | L'en-tête `Authorization: Bearer` n'est ajouté qu'aux requêtes dont l'adresse commence par l'adresse configurée. |
| Écoute sur le réseau local en HTTP | HTTP n'est accepté que pour le réseau local, avec l'avertissement « HTTP non chiffré » ; HTTPS est obligatoire pour toute adresse publique. |
| Création d'objets non désirés | Aucune écriture dans HomeBox sans un clic sur « Ajouter à HomeBox » ; tous les champs sont modifiables avant l'envoi. |
| Un script de page lit ou crée des tags HomeBox | `tag/list` est réservé aux pages de l'extension (le préfixe `tag/` est refusé depuis une page web). Les tags ne sont créés et rattachés qu'après la confirmation, et seulement ceux qui sont cochés ; un PUT conserve toujours les tags déjà présents sur l'objet. Aucun nouveau destinataire : les tags sont lus et créés sur votre instance uniquement. |
| Un objet HomeBox existant est modifié sans votre accord | **Compléter un objet existant** (spec 021) est une écriture : elle n'a lieu qu'après la fenêtre de confirmation, qui liste chaque changement (pièce jointe, tag, champ et valeur, ligne de notes, quantité), l'objet et l'instance. Elle ne fait qu'ajouter : une valeur déjà renseignée n'est jamais écrasée, et le nom, la description et l'emplacement ne changent jamais. L'objet est relu juste avant la mise à jour ; le PUT unique conserve les tags, l'emplacement, les champs personnalisés et les détails de vente lus sur l'objet. Les requêtes vont à votre instance uniquement, et rien de l'objet lu n'est journalisé ni stocké en dehors de l'import en cours. |
| URL d'image piégée (page marchande modifiée) | L'URL est vérifiée deux fois (à l'extraction, puis dans le service worker) : `https`, hôte **strictement égal** à celui du marchand (`m.media-amazon.com`), sans port ni identifiants. Redirections refusées. |
| Fichier piégé présenté comme une photo (HTML, SVG, GIF) | Seuls les JPEG, PNG et WebP (signature d'octets vérifiée) de 5 Mo au plus sont envoyés ; le type envoyé provient de la signature, pas de l'en-tête de la réponse. |
| La clé déchiffrée reste en mémoire alors que l'ordinateur est laissé sans surveillance | **Verrouillage automatique** (réglages) : après 15 minutes, 1 heure ou 4 heures d'inactivité, ou à chaque ouverture de l'extension ; pas d'option « jamais ». Sans la permission `alarms`, le navigateur ne peut pas réveiller l'extension à une heure fixe : l'expiration est **paresseuse**. La clé est effacée à la première utilisation de l'extension après l'échéance (ouverture de la fenêtre ou des réglages, n'importe quel message, ou redémarrage de son service worker), **avant** de pouvoir être lue : aucun chemin ne lit la clé sans vérifier d'abord l'échéance. Jusque-là, la clé reste en mémoire du navigateur uniquement, jamais sur le disque. Aucune durée ne survit à un redémarrage du navigateur. |
| Fichier piégé présenté comme une facture | Seuls les vrais PDF (signature `%PDF-`) de 15 Mo au plus sont envoyés ; téléchargement limité à l'origine exacte de la boutique Amazon de la commande (par exemple `https://www.amazon.de`) ; un lien vers une autre boutique ou un autre site est refusé. |

## Où les données sont stockées

| Donnée | Emplacement | Durée de vie |
|--------|-------------|--------------|
| Instances HomeBox (`homeboxInstances`) : adresse, nom affiché, clé API **chiffrée**, clé masquée (`hb_••••abcd`), résultat du dernier test, pour chaque instance ; l'instance du dernier import réussi (`lastInstanceId`) | `storage.local` | Jusqu'à « Supprimer cette instance », « Supprimer la configuration » / « Supprimer toute la configuration » ou la désinstallation |
| Clés API **déchiffrées**, par instance | `storage.session` (mémoire) | Jusqu'au verrouillage (🔒), à la fermeture du navigateur, ou au rechargement, à la mise à jour ou à la désactivation de l'extension |
| Phrase de passe | **Nulle part** | Jamais enregistrée |
| Imports en cours (données d'achat nécessaires à une reprise) | `storage.session` (mémoire) | Effacés dès que l'import réussit ou est abandonné ; sans octets de fichiers. Seul un extrait minimal et **chiffré** est conservé dans l'historique des imports (ligne suivante) |
| Historique des imports (`importHistory:<id>`, une enveloppe **chiffrée** par produit) et son réglage activé/désactivé (`importHistorySettings`) | `storage.local` | 200 entrées et 12 mois au plus ; effacé par « Tout effacer », la désactivation de l'historique, ou « Supprimer la configuration » (le réglage activé/désactivé est conservé) |
| Clé de l'historique, **scellée** avec la phrase de passe (dans la configuration) / **ouverte** (à côté de la clé API déchiffrée) | `storage.local` / `storage.session` (mémoire) | Comme la clé API |
| URL de la photo d'un import en cours | `storage.session` (mémoire) | Effacée avec l'import (succès ou abandon) ; **jamais les octets de l'image** |
| Dernier emplacement utilisé, par instance (`lastLocationByInstance`) : **identifiants uniquement**, jamais un nom d'emplacement | `storage.local` | Jusqu'à « Supprimer la configuration » (effacé avec elle) ou la désinstallation |
| Modèle d'objet par défaut par instance (`defaultTemplateByInstance`) : identifiant et nom du modèle uniquement | `storage.local` | Effacé avec l'instance (« Supprimer cette instance ») ou avec « Supprimer la configuration », ou à la désinstallation |
| Dernier type d'objet utilisé, par instance (`lastEntityTypeByInstance`) : **identifiant uniquement**, jamais un nom de type | `storage.local` | Effacé avec l'instance (« Supprimer cette instance ») ou avec « Supprimer la configuration », ou à la désinstallation |
| Réglage des champs de commande par instance (`orderFieldsByInstance`) : l'option et les trois noms de champs uniquement, jamais une valeur | `storage.local` | Effacé avec l'instance (« Supprimer cette instance ») ou avec « Supprimer la configuration », ou à la désinstallation |
| Collection cible par instance (`collectionByInstance`) : identifiant et nom de la collection choisie et de la collection lue en dernier, jamais un objet | `storage.local` | Réinitialisée quand l'adresse de l'instance change ; effacée avec l'instance (« Supprimer cette instance ») ou avec « Supprimer la configuration », ou à la désinstallation |
| Thème choisi | `storage.local` | Préférence d'affichage |
| Réglage du verrouillage automatique (`lockSettings` : `{ v: 1, policy }`, un choix, aucun secret) | `storage.local` | Jusqu'à la désinstallation (conservé quand vous supprimez la configuration) |
| Dernier moment d'utilisation de l'extension en étant déverrouillée (`homeboxActivity` : `{ at }`, un horodatage technique, jamais affiché ni journalisé) | `storage.session` (mémoire) | Écrit avec la clé déchiffrée, effacé avec elle (verrouillage, fermeture du navigateur, « Supprimer la configuration ») |
| Version de la dernière annonce de mise à jour (`updateNotice` : version et indication de fermeture) | `storage.local` | Remplacée à la mise à jour suivante ; conservée quand vous supprimez la configuration |
| Version prête à être installée, signalée par le navigateur (`updateReady`) | `storage.session` (mémoire) | Jusqu'à la fermeture du navigateur ou au redémarrage de l'extension |
| Réglage de la garantie par défaut (`warrantySettings` : activé/désactivé et une durée en années, en clair : une préférence, aucune donnée personnelle) | `storage.local` | Jusqu'à la désinstallation (conservé quand vous supprimez la configuration) |
| Garantie d'un import en cours (date d'expiration, détails) | `storage.session` (mémoire), dans l'import en cours | Effacée avec l'import ; jamais dans l'historique des imports et jamais dans les journaux |
| Réglage des tags automatiques (`tagSettings` : option du nom de la boutique et règles « contient … → tag … », en clair : des préférences, aucun secret) | `storage.local` | Jusqu'à la désinstallation (conservé quand vous supprimez la configuration) |
| Tags choisis et tags non ajoutés d'un import en cours (`draft.tags`, `failedTags`) | `storage.session` (mémoire), dans l'import en cours | Effacés avec l'import ; les tags ne sont jamais stockés dans l'historique des imports |
| Réglage du lien vers la page de commande de chaque instance (`orderLinkByInstance` : l'option, en clair, aucun secret) | `storage.local` | Effacé avec l'instance ou avec **Supprimer la configuration** |
| Lien vers la page de commande d'un import en cours (`draft.orderLink`, l'adresse est celle de la page déjà présente dans l'import) | `storage.session` (mémoire), dans l'import en cours | Effacé avec l'import ; jamais dans l'historique des imports et jamais dans les journaux. Une fois ajouté, le lien vers la page de commande est stocké dans HomeBox (il pointe vers le site du marchand), pas dans l'extension |

Aucune donnée n'est placée dans `storage.sync`.

## Historique des imports

L'extension conserve un court historique des imports que vous avez confirmés, **uniquement dans ce navigateur** :

- **Stocké**, par produit : nom, identifiant de la boutique, numéro de commande, dates d'import et d'achat, adresse
  de l'instance, identifiant de l'objet, résultat (complet, partiel, échoué, en cours) et ce qui manque (informations
  d'achat, facture, manuel, garantie, bon de livraison, documents, photo), avec un **code** d'erreur en cas d'échec.
- **Jamais stocké** : la clé API, votre adresse de livraison, votre moyen de paiement, le contenu des factures ou des
  photos, l'adresse de la page Amazon, l'adresse de la photo, le prix, le vendeur, la description ou
  l'emplacement.
- **Chiffrement** : chaque entrée est chiffrée en AES-GCM 256 sous une **clé d'historique** aléatoire de 256 bits,
  avec un IV aléatoire neuf à chaque écriture et la clé de stockage comme donnée associée. Rien d'une entrée (date,
  statut, boutique) n'est stocké en clair. La clé d'historique est scellée avec la **même** clé dérivée de la phrase
  de passe que la clé API (PBKDF2-SHA256, 600 000 itérations) : une seule dérivation par déverrouillage. Tant que
  l'extension est déverrouillée, la clé d'historique ouverte reste en mémoire de session à côté de la clé API, et
  disparaît avec elle.
- **Verrouillé** : l'historique ne peut pas être lu ; l'extension affiche « Historique verrouillé ». Supprimer une
  entrée, « Tout effacer » et désactiver l'historique fonctionnent toujours (ils suppriment des données chiffrées
  sans les lire).
- **Phrase de passe oubliée** : l'historique ne peut pas être récupéré, comme la clé API. Reconfigurer l'extension
  avec une nouvelle phrase de passe alors qu'elle est **verrouillée** l'efface ; la page de configuration prévient
  avant l'envoi. Tant qu'elle est **déverrouillée**, changer la phrase de passe le conserve.
- Aucun journal, aucune requête réseau, aucune nouvelle permission. Les messages `history/*` sont refusés s'ils ne
  viennent pas d'une page de l'extension.
- L'élagage (200 entrées, 12 mois) a besoin de la clé, puisque les dates sont chiffrées : il s'exécute à
  l'ouverture de l'historique et à chaque nouvel import, tant que l'extension est déverrouillée. Le simple
  déverrouillage n'élague pas. La liste est élaguée avant d'être affichée, donc une entrée au-delà des limites
  n'est jamais montrée.

## Permissions du manifeste

| Permission | Pourquoi |
|------------|----------|
| `storage` | Mémoriser l'adresse, la clé chiffrée, le thème et l'état des imports en cours. |
| `activeTab` | Lire l'onglet Amazon **uniquement quand vous ouvrez l'extension**. Aucun accès permanent à Amazon. |
| `scripting` | Injecter le code de détection dans cet onglet, à ce moment-là. |
| Accès à vos instances (**facultatif**, `https://*/*` et `http://*/*`) | Demandé à l'exécution pour **l'origine exacte** de chaque instance que vous configurez, retiré dès qu'aucune instance ne l'utilise (suppression d'une instance, changement de son adresse, suppression de la configuration). Le joker n'est jamais accordé en bloc ; la restriction de HTTP au réseau local est appliquée par le code. |

Dans Firefox, l'accès à une instance peut être retiré à tout moment dans `about:addons` › l'extension ›
**Permissions**, avec le même effet que dans Chrome : l'extension ne peut plus l'atteindre tant que vous ne
l'accordez pas de nouveau (**Redemander l’accès**). Le manifeste Firefox déclare aussi, comme Firefox l'exige, sa
catégorie de collecte de données : `websiteContent` (obligatoire), ce qui signifie que le contenu de la page de
commande Amazon et la facture ne vont qu'à votre propre instance HomeBox après votre confirmation, et nulle part
ailleurs (voir
[PRIVACY.fr.md](https://github.com/Foufou-exe/homebox-clipper/blob/main/PRIVACY.fr.md)). Les permissions sont les
mêmes dans les deux navigateurs.

Le manifeste ne déclare ni `host_permissions` statiques ni scripts de contenu statiques, et sa politique de
sécurité du contenu interdit `eval` et le code distant. `bun run test:build` vérifie ces points sur la build de
production.

## La photo du produit

- La requête d'image vers le serveur du marchand est un **GET anonyme** : sans cookies, sans en-tête `Referer`,
  sans clé API, vers l'hôte exact du marchand uniquement. Elle est faite par un module distinct du client HomeBox
  (`src/background/import/photo-fetch.ts`), qui n'a pas accès à la clé.
- La photo n'est lue qu'après votre clic sur « Ajouter à HomeBox », et seulement si sa case est cochée.
- Les octets ne sont **jamais conservés** (ni dans `storage.session` ni dans `storage.local`) ; une reprise
  télécharge à nouveau la photo.
- **Aucune permission n'est ajoutée** au manifeste pour cela.
- **Aucune URL d'image n'est écrite dans les journaux** (seuls un modèle, un statut et une durée le sont).
- La fenêtre contextuelle affiche la miniature depuis le serveur d'images du marchand : c'est la seule requête
  d'image faite avant votre confirmation, et elle est faite par votre navigateur, comme sur la page d'Amazon.

## La page produit (fabricant et modèle)

- Pour pré-remplir le fabricant et le numéro de modèle, le script injecté dans l'onglet de la commande lit la
  **page produit** Amazon de chaque produit de la commande : `<origine de la boutique>/dp/<ASIN>`, construite à partir
  du lien produit de la page de commande, sur la **même origine** que la page de commande uniquement (10 pages au
  plus, 3 à la fois, 8 secondes chacune, 10 secondes pour l'ensemble de la recherche, 5 Mo par page comptés pendant
  la lecture).
- La requête est envoyée **sans cookies** (`credentials: 'omit'`) et **sans referrer** : elle n'est pas liée à votre
  compte Amazon et ne révèle pas l'adresse de la commande. Elle ne porte aucune clé API ni aucune adresse ou donnée
  HomeBox (le script injecté ne les reçoit jamais).
- **Aucune permission n'est ajoutée** : c'est une requête de même origine du script déjà injecté via `activeTab`,
  comme la lecture du menu des factures.
- Aucune valeur, aucune adresse de page produit et aucun ASIN n'est écrit dans les journaux. Les valeurs ne sont
  envoyées à votre instance HomeBox qu'après votre confirmation, et ne sont conservées qu'avec l'import en cours.

## L'emplacement

- La liste des emplacements est une **lecture** (`GET /entities/tree`) sur l'instance que vous avez configurée, avec
  la clé API, comme les autres appels : rien n'est envoyé ailleurs.
- Les messages `location/*` sont réservés aux pages de l'extension (fenêtre contextuelle, options), jamais aux
  scripts injectés dans une page marchande.
- `storage.local` ne contient que des identifiants (`lastLocationByInstance`) ; ils sont effacés avec la
  configuration.
- **Aucun nom ni chemin d'emplacement n'est écrit dans les journaux.**
- **Aucune permission n'est ajoutée** au manifeste pour cela.

## Journaux et données personnelles

Le seul point d'accès à la console est `src/shared/logger.ts`. Sa signature est fermée : il n'accepte que des codes
d'erreur, des statuts HTTP, des durées et un **modèle** de point d'accès (par exemple
`POST /entities/{id}/attachments`, `GET /tags`), jamais une adresse réelle, un nom de produit, un prix ou un numéro
de commande. Aucun nom de tag et aucun texte d'une règle de tag n'est jamais journalisé.
Quand un objet existant est complété, rien de l'objet lu (nom, notes, champs personnalisés, tags, valeurs) n'est
journalisé : seulement les modèles de points d'accès (`GET /entities/{id}`, `PUT /entities/{id}`).
Les journaux de débogage ne sont émis qu'en mode développement ; en production, seul un avertissement générique
(« handler threw » et le type du message) est émis. Une règle ESLint interdit `console.*` ailleurs.

Seuls les champs listés dans [Utilisation](/homebox-clipper/fr/usage/) sont lus sur la page de commande : jamais
votre adresse de livraison ni votre moyen de paiement.

## Limites à connaître

- **Extension déverrouillée** : la clé est alors en mémoire. Un logiciel malveillant qui contrôle votre session de
  navigateur peut la lire, comme avec n'importe quel gestionnaire de mots de passe déverrouillé. Le chiffrement
  protège les fichiers du profil et l'extension **verrouillée**.
- **Phrase de passe faible** : le minimum est de 10 caractères ; une phrase de passe courte ou devinable affaiblit
  le chiffrement. Préférez une phrase de passe longue.
- **HTTP local** : sur un réseau où d'autres machines sont hostiles, la clé peut être interceptée. Utilisez HTTPS.
- **Phrase de passe perdue** : aucune récupération n'est possible, par conception (pour la clé API et l'historique des
  imports).
- **Historique des imports** : le nombre d'entrées est visible sur le disque ; les entrées au-delà des limites (plus
  anciennes que 12 mois, ou au-delà de la 200e) restent chiffrées sur le disque jusqu'à ce que l'historique soit
  ouvert ou qu'un import soit fait avec l'extension déverrouillée, ce qui les élague. Dans l'état « indisponible »
  (clé d'historique illisible, ou clé migrée sans phrase de passe), rien n'est élagué tant que l'extension n'est pas
  reconfigurée avec une phrase de passe, ce qui les efface ; « Tout effacer » fonctionne à tout moment.
- **Clé dédiée** : créez dans HomeBox une clé réservée à l'extension, avec une date d'expiration, pour limiter
  l'impact d'une fuite.

Pour aller plus loin sur l'implémentation : `src/background/config/key-vault.ts` (chiffrement),
`config-store.ts` (stockage) et `url-policy.ts` (adresses), détaillés dans
[Architecture](/homebox-clipper/fr/contributing/architecture/).
