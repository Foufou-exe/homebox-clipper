# Sécurité et confidentialité

La clé API HomeBox donne accès à tout votre inventaire : sa protection est le principe central du projet.
Cette page décrit ce que l'extension fait, ce qu'elle ne fait pas, et ses limites. Pour signaler une
vulnérabilité, voir la [politique de sécurité](https://github.com/Foufou-exe/homebox-clipper/blob/main/SECURITY.md).

## Ce que la clé API ne fait jamais

- Elle n'est **jamais envoyée à Amazon** (ni à un autre marchand).
- Elle n'est **jamais envoyée à un serveur intermédiaire** : il n'y en a pas, et aucune statistique d'usage
  ni télémétrie n'existe. L'extension ne contacte que le marchand (pour lire la page et télécharger la
  facture avec votre session) et **votre** instance HomeBox.
- Elle n'est **jamais écrite dans les journaux**.
- Elle n'est **jamais incluse dans le code source** (ni dans les fichiers versionnés, ni dans les fixtures
  de test).

## Modèle de menace

| Menace | Protection |
|--------|------------|
| Un fichier du profil Chrome est lu (copie du disque, sauvegarde) | La clé n'est stockée que **chiffrée** (AES-GCM 256, clé dérivée de votre phrase de passe par PBKDF2-SHA256, 600 000 itérations, sel et IV aléatoires) dans `storage.local`. |
| Quelqu'un modifie l'adresse stockée pour détourner la clé vers un autre serveur | L'adresse de l'instance sert de **donnée associée** au chiffrement : la modifier sans la phrase de passe rend le déchiffrement impossible. |
| Une page web (Amazon) tente de lire la clé | Seul le **service worker** utilise la clé. Le script injecté dans la page n'a accès ni au stockage ni à la configuration, et aucun message qui lui est destiné ne contient l'adresse ou la clé. |
| Un script de page tente d'appeler le service worker | Les messages sont **typés et validés** à la réception ; ceux qui touchent à la configuration, au déverrouillage, à la détection et aux imports sont refusés s'ils ne viennent pas d'une page de l'extension (popup, options). |
| La clé est envoyée au mauvais hôte | L'en-tête `Authorization: Bearer` n'est ajouté qu'aux requêtes dont l'adresse commence par l'adresse configurée. |
| Écoute du réseau local en HTTP | HTTP n'est accepté que pour le réseau local, avec l'avertissement « HTTP non chiffré » ; HTTPS est obligatoire pour toute adresse publique. |
| Création d'objets non voulus | Aucune écriture dans HomeBox sans clic sur « Ajouter à HomeBox » ; tous les champs sont modifiables avant l'envoi. |
| URL d'image piégée (page marchande modifiée) | L'URL est contrôlée deux fois (à l'extraction, puis dans le service worker) : `https`, hôte **strictement égal** à celui du marchand (`m.media-amazon.com`), sans port ni identifiants. Redirections refusées. |
| Fichier piégé présenté comme une photo (HTML, SVG, GIF) | Seuls JPEG, PNG et WebP (signature des octets vérifiée) de 5 Mo au plus sont envoyés ; le type envoyé vient de la signature, pas de l'en-tête de la réponse. |
| Fichier piégé présenté comme une facture | Seuls de vrais PDF (signature `%PDF-`) de 15 Mo maximum sont envoyés ; téléchargement limité à l'origine `https://www.amazon.fr`. |

## Où sont stockées les données

| Donnée | Emplacement | Durée de vie |
|--------|-------------|--------------|
| Adresse de l'instance, clé API **chiffrée**, clé masquée (`hb_••••abcd`), résultat du dernier test | `storage.local` | Jusqu'à « Supprimer la configuration » ou la désinstallation |
| Clé API **déchiffrée** | `storage.session` (mémoire) | Jusqu'au verrouillage (🔒), à la fermeture du navigateur ou au rechargement, à la mise à jour ou à la désactivation de l'extension |
| Phrase de passe | **Nulle part** | Jamais enregistrée |
| Imports en cours (données d'achat nécessaires à une reprise) | `storage.session` (mémoire) | Effacés dès que l'import réussit ou est abandonné ; sans les octets des fichiers |
| URL de la photo d'un import en cours | `storage.session` (mémoire) | Effacée avec l'import (succès ou abandon) ; **jamais les octets de l'image** |
| Thème choisi | `storage.local` | Préférence d'affichage |

Aucune donnée n'est placée dans `storage.sync`.

## Permissions du manifeste

| Permission | Pourquoi |
|------------|----------|
| `storage` | Mémoriser l'adresse, la clé chiffrée, le thème et l'état des imports en cours. |
| `activeTab` | Lire l'onglet Amazon **uniquement quand vous ouvrez l'extension**. Aucun accès permanent à Amazon. |
| `scripting` | Injecter le code de détection dans cet onglet, à ce moment-là. |
| Accès à votre instance (**optionnel**, `https://*/*` et `http://*/*`) | Demandé à l'exécution pour **l'origine exacte** que vous configurez, retiré quand vous supprimez la configuration. Le joker n'est jamais accordé en bloc ; la restriction de HTTP au réseau local est appliquée par le code. |

Le manifeste ne déclare ni `host_permissions` statiques ni scripts de contenu statiques, et sa politique de
sécurité de contenu interdit `eval` et le code distant. `bun run test:build` vérifie ces points sur le
build de production.

## La photo du produit

- La requête d'image vers le serveur du marchand est un **GET anonyme** : sans cookies, sans en-tête
  `Referer`, sans clé API, vers l'hôte exact du marchand uniquement. Elle est faite par un module séparé du
  client HomeBox (`src/background/import/photo-fetch.ts`), qui n'a pas accès à la clé.
- La photo n'est lue qu'après votre clic sur « Ajouter à HomeBox », et seulement si sa case est cochée.
- Les octets ne sont **jamais conservés** (ni dans `storage.session`, ni dans `storage.local`) ; une reprise
  retélécharge la photo.
- **Aucune permission n'est ajoutée** au manifeste pour cela.
- **Aucune URL d'image n'est écrite dans les journaux** (seuls un gabarit, un statut et une durée le sont).
- Le popup affiche la vignette depuis le serveur d'images du marchand : c'est la seule requête d'image faite
  avant votre confirmation, et elle est faite par votre navigateur, comme sur la page d'Amazon.

## Journaux et données personnelles

L'unique point d'accès à la console est `src/shared/logger.ts`. Sa signature est fermée : il n'accepte que
des codes d'erreur, des statuts HTTP, des durées et un **gabarit** d'endpoint (par exemple
`POST /entities/{id}/attachments`), jamais une adresse réelle, un nom de produit, un prix ou un numéro de
commande. Les journaux de debug ne sont émis qu'en mode développement ; seul un avertissement générique (« handler threw » et le type du message) est émis en production. Une règle ESLint interdit `console.*`
ailleurs.

Seuls les champs listés dans [Usage](Usage.md) sont lus sur la page de commande : jamais votre adresse de
livraison ni votre moyen de paiement.

## Limites à connaître

- **Extension déverrouillée** : la clé est alors en mémoire. Un programme malveillant qui contrôle votre
  session de navigateur peut la lire, comme pour tout gestionnaire de mots de passe déverrouillé. Le
  chiffrement protège les fichiers du profil et l'extension **verrouillée**.
- **Phrase de passe faible** : le minimum est de 10 caractères ; une phrase courte ou devinable affaiblit le
  chiffrement. Préférez une phrase longue.
- **HTTP local** : sur un réseau où d'autres machines sont hostiles, la clé peut être interceptée. Utilisez
  HTTPS.
- **Perte de la phrase de passe** : aucune récupération possible, par conception.
- **Clé dédiée** : créez dans HomeBox une clé réservée à l'extension, avec expiration, pour limiter l'impact
  d'une fuite.

Pour aller plus loin sur l'implémentation : `src/background/config/key-vault.ts` (chiffrement),
`config-store.ts` (stockage) et `url-policy.ts` (adresses), détaillés dans [Architecture](Architecture.md).
