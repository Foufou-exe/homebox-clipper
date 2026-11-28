---
title: "Configuration"
description: "Connectez l'extension à vos instances HomeBox : adresse, clé API, phrase de passe, collection et options."
---

**Public visé** : les utilisateurs qui ont [installé](/homebox-clipper/fr/getting-started/installation/)
l'extension et veulent la connecter à leur instance HomeBox. Les étapes 1 et 2 suffisent pour démarrer ; les
autres sections sont des options que vous pouvez régler plus tard.

Avant le premier import, l'extension a besoin de l'adresse de votre instance HomeBox et d'une clé API.
Tout se fait dans la page de configuration (cliquez sur l'icône de l'extension puis sur ⚙, ou faites un clic droit puis *Options*).

## Avant de commencer

- L'adresse de votre instance HomeBox, par exemple `https://homebox.example.com` (ou
  `http://192.0.2.10:7745` sur votre réseau local).
- Un compte HomeBox sur cette instance.

## 1. Créer une clé API dans HomeBox

1. Connectez-vous à HomeBox.
2. Ouvrez **Profil** puis **Clés API**.
3. Créez une clé et copiez-la (elle commence par `hb_`). Elle n'est affichée qu'une seule fois : collez-la
   dans un endroit sûr jusqu'à l'étape 2.

:::tip
Créez une clé **dédiée à l'extension, avec une date d'expiration** : HomeBox affiche sa dernière
utilisation et permet de la révoquer sans toucher à vos autres clés.
:::

## 2. Renseigner l'extension

1. **Adresse de l’instance HomeBox**, par exemple `https://homebox.example.com`. Il n'est pas nécessaire
   d'ajouter `/api` : l'extension normalise l'adresse (elle retire le `/` final ainsi que tout `/api` ou `/api/v1`).
2. **Clé API** : collez la clé `hb_...`.
3. **Phrase de passe** (au moins **10 caractères**, saisie deux fois) : elle chiffre la clé API sur le disque.
   Retenez-la : elle ne peut pas être récupérée.
4. Cliquez sur **Tester et enregistrer**.
5. Le navigateur demande l'autorisation d'accéder à **cette adresse uniquement** : acceptez.

L'extension vérifie que l'adresse répond comme une instance HomeBox (`GET /api/v1/status`) et que la
clé est acceptée (`GET /api/v1/users/self`), puis affiche l'instance connectée et sa version. Le résultat
du dernier test est conservé avec les réglages.

**Résultat attendu** : la page de configuration affiche l'instance connectée et sa version HomeBox. Vous
pouvez maintenant [importer un achat](/homebox-clipper/fr/usage/).

**Si ça ne marche pas** : la page affiche un message en langage clair. Les plus courants :

| Message | Solution |
|---------|----------|
| « Une adresse HTTPS est obligatoire. » | L'adresse est publique et commence par `http://` : utilisez son adresse `https://` (voir [Adresses acceptées](#adresses-acceptées)). |
| « Clé API invalide ou expirée. » | Créez une nouvelle clé dans HomeBox (étape 1) et collez-la de nouveau. |
| « HomeBox est inaccessible. Vérifiez l’adresse et votre connexion. » | Ouvrez l'adresse dans un onglet du navigateur : HomeBox doit répondre. Vérifiez qu'il n'y a pas de faute de frappe dans l'adresse. |

Tous les messages et leurs solutions : [Dépannage et FAQ](/homebox-clipper/fr/troubleshooting-and-faq/).

## Adresses acceptées

| Adresse de l'instance | Acceptée ? |
|-----------------------|------------|
| `https://...` (n'importe quelle adresse) | Oui |
| `http://` vers le **réseau local** : `localhost`, `127.0.0.1` (boucle locale), IP privées (`10.x.x.x`, `172.16.x.x` à `172.31.x.x`, `192.168.x.x`), IPv6 `::1` et `fc...`/`fd...`, noms se terminant par `.lan`, `.local`, `.home.arpa`, `.internal`, `.localhost`, ou un nom court sans point (`http://homebox:7745`) | Oui, avec l'avertissement « HTTP non chiffré » |
| `http://` vers une adresse **publique** (nom de domaine public, IP publique) | Non : « Une adresse HTTPS est obligatoire. » |
| Adresse contenant un nom d'utilisateur ou un mot de passe (`https://user:pass@...`) ou un protocole autre que `http`/`https` | Non : « L'adresse HomeBox est invalide ou ne correspond pas à une instance HomeBox. » |

:::caution
En HTTP, votre clé API circule **en clair** sur le réseau à chaque requête. C'est acceptable sur un
réseau local de confiance (homelab), jamais sur Internet. Pour aller plus loin, placez HomeBox derrière un
reverse proxy HTTPS (Caddy, Traefik, Nginx Proxy Manager...).
:::

La règle est appliquée dans `src/background/config/url-policy.ts` et couverte par des tests unitaires. Par exemple, une
instance de test sur une autre machine du réseau local aura une adresse du type
`http://192.0.2.10:3100` (adresse réservée à la documentation) : voir [Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/).

## Verrouillage et déverrouillage

- La clé déchiffrée n'existe qu'en mémoire. Le moment où elle est redemandée dépend de **Configuration →
  Verrouillage automatique** : **à la fermeture du navigateur** (par défaut), **après 15 minutes**, **1 heure** ou
  **4 heures** d'inactivité (sans utiliser la fenêtre de l'extension, la configuration ni un import), ou **à chaque ouverture de l'extension**.
  Modifier ce réglage ne demande pas la phrase de passe. Un import en cours n'est jamais interrompu : le
  verrouillage s'applique à sa fin.
- Il n'y a pas d'option « jamais » : la clé déchiffrée serait alors lisible par toute personne ou tout logiciel ayant
  accès au profil du navigateur. Quel que soit le choix, la clé est oubliée à la fermeture du navigateur.
- Le bouton 🔒 de la fenêtre de l'extension (ou **Verrouiller** dans la configuration) efface la clé de la mémoire. Les imports sont alors
  impossibles jusqu'au prochain déverrouillage.
- Une phrase de passe erronée affiche « Phrase de passe incorrecte. » sans rien modifier.

## Plusieurs instances HomeBox

Vous pouvez configurer **jusqu'à 10 instances** (par exemple une à la maison et une pour un atelier). Avec une seule
instance, la configuration reste identique à l'habitude, avec un champ **Nom d'affichage (facultatif)** et un bouton
**Ajouter une instance**.

- **Ajouter une instance** : nom (facultatif ; vide : l'hôte de l'adresse), adresse, clé API et phrase de passe. La
  phrase de passe est demandée à chaque ajout, même quand l'extension est déverrouillée : c'est votre phrase de passe actuelle (une
  seule phrase de passe protège toutes les clés). Le navigateur demande l'accès à **cette adresse uniquement**. L'adresse ne doit pas être
  déjà configurée ; le bouton est désactivé une fois 10 instances configurées. L'instance est enregistrée même si le
  test de connexion échoue, comme pour la première configuration.
- À partir de deux instances, chacune a sa carte (nom, adresse, clé masquée, état du dernier test) avec :
  - **Tester la connexion** : seule cette instance est contactée (l'extension doit être déverrouillée) ;
  - **Renommer** : aucune phrase de passe n'est nécessaire ; de 1 à 50 caractères, sans être déjà utilisé par une autre instance (casse ignorée) ;
  - **Modifier l'adresse ou la clé** : mêmes règles que ci-dessous pour une instance unique ; une nouvelle origine est demandée au navigateur,
    l'accès à l'ancienne est retiré dès qu'aucune instance ne l'utilise ;
  - **Supprimer cette instance** (confirmation qui la nomme) : efface sa clé, son dernier emplacement, ses entrées
    d'historique des imports et ses imports interrompus, et retire son accès si aucune autre instance n'utilise la même origine. La suppression est
    refusée tant qu'un import vers cette instance est en cours. Supprimer la dernière instance revient à **Supprimer la
    configuration** ;
  - **Redemander l'accès**, affiché quand le navigateur n'accorde plus l'accès à cette instance (autorisation retirée
    dans les réglages du navigateur, par exemple dans `about:addons` › l'extension › **Autorisations** sous Firefox).
- Une clé affichée comme **Clé à ressaisir** n'a pas pu être déchiffrée avec la bonne phrase de passe (données endommagées) :
  changez la clé de cette instance ; les autres instances continuent de fonctionner.
- **Supprimer toute la configuration** (à partir de deux instances) efface toutes les instances, comme **Supprimer la configuration** le fait avec une seule.

## Modifier ou supprimer la configuration

- **Modifier l’adresse ou la clé** : dans la configuration. Pour **conserver la clé actuelle**, laissez le champ
  de la clé vide et saisissez votre phrase de passe actuelle : changer l'adresse d'une clé existante exige donc de
  connaître la phrase de passe (voir [Clé API et sécurité](/homebox-clipper/fr/security-and-privacy/)).
- **Changer la phrase de passe** : **Configuration → Changer la phrase de passe** (phrase actuelle, nouvelle, confirmation)
  rechiffre d'un coup toutes les clés et la clé de l'historique des imports ; en cas d'échec, rien ne change et l'ancienne
  phrase de passe reste valable. Avec une seule instance, vous pouvez aussi saisir à nouveau la clé API avec une nouvelle phrase de passe.
- **Supprimer la configuration** (**Supprimer toute la configuration** avec plusieurs instances) : efface toutes les instances (adresses,
  clés chiffrées), les imports en cours conservés pour la reprise, l'historique des imports (son réglage activé/désactivé est conservé),
  et **retire l'autorisation d'accès** accordée à chaque instance.
- **Historique des imports** : la carte **Historique des imports** active ou désactive l'historique local (le désactiver
  l'efface, après confirmation). Voir [Utilisation](/homebox-clipper/fr/usage/#historique-des-imports).
- **Nouvelle phrase de passe pendant que l'extension est verrouillée** : si l'extension est verrouillée et que vous saisissez une nouvelle clé et une nouvelle
  phrase de passe, l'historique chiffré des imports ne peut plus être lu et est effacé ; un avertissement le signale avant
  l'envoi. Déverrouillez d'abord (depuis la fenêtre de l'extension) pour le conserver.
- **Phrase de passe oubliée** : elle ne peut pas être récupérée. Supprimez la configuration, puis configurez à nouveau l'extension
  avec votre clé API (ou une nouvelle clé).

## Tags automatiques

La carte **Tags automatiques** de la configuration choisit les tags proposés dans le récapitulatif
(voir [Utilisation](/homebox-clipper/fr/usage/#tags)) :

- **Proposer le nom de la boutique comme tag** (activé par défaut) : propose la marque de la boutique, par exemple « Amazon ».
- **Règles** : « Le nom du produit contient » un texte → « Tag » un nom. Le texte est simple : la casse et les accents sont
  ignorés, il n'y a pas d'expression régulière (`.*` est recherché tel quel). Toutes les règles qui correspondent s'appliquent. Saisissez le
  texte et le tag, puis appuyez sur Entrée ou sur **Ajouter la règle** ; modifiez une règle directement, ou cliquez sur **Supprimer**. Un texte
  ou un tag vide est refusé avec un message ; un texte fait au plus 100 caractères, un nom de tag au plus 255 octets.

Le réglage est stocké dans le navigateur (`tagSettings`, `storage.local`), fonctionne que l'extension soit
configurée ou verrouillée, et est conservé quand vous supprimez la configuration. Une modification s'applique aux récapitulatifs suivants.

## Modèle d'objet par défaut

Chaque instance HomeBox peut avoir un **modèle par défaut**, proposé pour chaque produit du récapitulatif (voir
[Utilisation](/homebox-clipper/fr/usage/#modèles-dobjet-homebox)). Il est affiché sous l'instance (dans sa carte à partir de deux instances) :

- tant que l'extension est verrouillée, le nom du modèle par défaut (ou **Aucun**) est affiché mais ne peut pas être modifié :
  l'extension doit être **déverrouillée** pour le changer ;
- **Changer** lit les modèles de **cette instance uniquement** ; choisissez-en un (ou **Aucun**) et cliquez sur **Enregistrer**. Le nom
  conservé est celui que renvoie HomeBox.

Seuls l'identifiant et le nom du modèle sont stockés (`defaultTemplateByInstance`, `storage.local`). Ils
sont effacés avec l'instance ou avec **Supprimer la configuration**. Si le modèle est renommé dans HomeBox, le nom est
mis à jour au récapitulatif suivant ; s'il est supprimé, le récapitulatif le signale et les produits restent sur **Aucun**.

## Lien vers la page de commande

Chaque instance HomeBox a une option **Ajouter un lien vers la page de commande**, désactivée par défaut (y compris pour les instances
configurées avant cette version). Quand elle est activée, chaque objet importé reçoit aussi un **lien externe** pointant vers la
page de commande du marchand, à un clic dans HomeBox (voir [Utilisation](/homebox-clipper/fr/usage/#lien-vers-la-page-de-commande)). Le lien pointe
vers le site du marchand et est enregistré dans HomeBox : l'aide de l'option le précise. Les notes restent identiques.

- L'option peut être lue et modifiée pendant que l'extension est verrouillée (pas de clé, pas de réseau).
- Seule l'option est stockée (`orderLinkByInstance`, `storage.local`). Elle est effacée avec l'instance ou avec
  **Supprimer la configuration**.
- L'instance a besoin des pièces jointes externes de HomeBox (présentes depuis la 0.26.0, version minimale de
  l'extension). Sinon, l'import se termine partiellement avec un message qui en indique la cause.

## Champs de commande en champs personnalisés

Chaque instance HomeBox a une option **Enregistrer la commande en champs personnalisés**, désactivée par défaut (y compris pour les instances
configurées avant cette version). Quand elle est activée, chaque objet importé reçoit aussi trois champs personnalisés texte HomeBox :
le numéro de commande, le marchand et l'adresse de la page de commande (voir [Utilisation](/homebox-clipper/fr/usage/#champs-de-commande-champs-personnalisés-homebox)).
Les notes restent identiques.

- Sous l'option, les noms des trois champs peuvent être modifiés ; ce sont `Order number`, `Merchant` et `Order URL` par
  défaut (noms de données HomeBox, identiques dans toutes les langues). **Rétablir les noms par défaut** les remet.
- Tant que l'extension est déverrouillée, chaque champ de nom suggère les noms des champs personnalisés déjà utilisés dans **cette
  instance uniquement** (les noms seulement, jamais leurs valeurs ; ils ne sont pas conservés). Tant qu'elle est verrouillée, l'option et les
  noms peuvent toujours être lus et modifiés : les suggestions apparaissent après le déverrouillage. Si les noms ne peuvent pas être lus, un
  message propose **Réessayer**, et vous pouvez toujours saisir un nom.
- Un nom est refusé s'il est vide, s'il dépasse 255 octets, s'il est identique à l'un des deux autres (casse ignorée), ou
  s'il contient `=` ou un caractère de contrôle. Un nom qui ne diffère d'un champ existant que par la casse affiche un avertissement avec
  un bouton pour utiliser le nom existant.

Seuls l'option et les trois noms de champs sont stockés (`orderFieldsByInstance`, `storage.local`). Ils sont effacés
avec l'instance ou avec **Supprimer la configuration**. Les objets importés auparavant ne sont jamais modifiés.

## Collection cible

HomeBox stocke l'inventaire dans des **collections**. Une clé API agit pour son utilisateur et, par défaut, va dans la
**collection par défaut de ce compte**, qui peut ne pas être la collection ouverte dans votre navigateur : l'import fonctionne alors,
mais **Ouvrir dans HomeBox** échoue tant que vous n'ouvrez pas cette collection dans HomeBox.

- Après un **Tester la connexion** réussi, la configuration affiche **Collection visée : <nom>**.
- Chaque instance a un réglage **Collection cible**, **Collection par défaut de la clé** par défaut (y compris pour les
  instances configurées avant cette version) : rien ne change pour elles. **Changer la collection** (déverrouillée) lit les
  collections que votre clé peut atteindre sur **cette instance uniquement** et vous laisse en choisir une. Avec une seule collection, il n'y a
  rien à choisir.
- Avec une collection choisie, chaque requête vers cette instance la nomme (en-tête `X-Tenant`) : emplacements, tags, modèles,
  doublons et objet créé sont ceux de cette collection. Le récapitulatif et le résultat nomment la collection.
- Si la collection choisie n'est plus accessible (vous l'avez quittée, elle a été supprimée), l'extension affiche **La collection
  HomeBox choisie pour cette instance n'est plus accessible avec cette clé** et n'importe jamais ailleurs : choisissez une autre
  collection, ou celle par défaut.
- Changer l'adresse de l'instance remet le réglage à la valeur par défaut ; changer seulement la clé le conserve.
- Un import garde la collection dans laquelle il a démarré : une nouvelle tentative y retourne même si vous avez changé le réglage entre-temps.
- Si le réglage stocké ne peut pas être lu, l'instance refuse les imports avec le même message jusqu'à ce que vous choisissiez à nouveau une
  collection.

Seuls l'identifiant et le nom de la collection choisie et de la dernière lue sont stockés
(`collectionByInstance`, `storage.local`) ; ils sont effacés avec l'instance ou avec **Supprimer la configuration**.

## Apparence

Le thème (**Automatique (système)**, **Clair** ou **Sombre**) se choisit dans la section *Apparence* de la
configuration, ou d'un clic sur le bouton de la barre d'outils de la fenêtre de l'extension.

## Migration depuis une version qui stockait la clé en clair

Une version antérieure enregistrait la clé API en clair. Au démarrage, l'extension la retire du disque et
la garde en mémoire jusqu'à ce que vous définissiez une phrase de passe dans la configuration ; sinon elle est perdue à la fermeture
du navigateur.

Une question ou une erreur ? Consultez [Dépannage et FAQ](/homebox-clipper/fr/troubleshooting-and-faq/).
