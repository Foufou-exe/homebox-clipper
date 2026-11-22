[English](PRIVACY.md) | **Français**

# Politique de confidentialité

**homebox-clipper** (l'« extension », publiée sous le nom « HomeBox Clipper ») · Date d'effet : **22 novembre 2026**

En bref : l'extension n'a **aucun serveur, aucun compte, aucune statistique et aucune télémétrie**. Les
données qu'elle traite vont de votre navigateur vers **votre propre** instance HomeBox, uniquement au
moment où vous cliquez sur « Ajouter à HomeBox », et nulle part ailleurs. L'auteur de l'extension ne
reçoit jamais aucune de vos données.

## Responsable du traitement

L'extension s'exécute entièrement dans votre navigateur. Aucun service n'est exploité par l'auteur. Les
données que vous envoyez à votre instance HomeBox sont conservées par **cette instance, que vous (ou la
personne qui l'héberge pour vous) maîtrisez** : vous êtes responsable de ces données. Page du projet :
<https://github.com/Foufou-exe/homebox-clipper>.

## Données traitées

| Donnée | Origine | Finalité | Destination |
|--------|---------|----------|-------------|
| Détails de l'achat lus sur la page de commande ouverte d'une boutique Amazon prise en charge (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) : nom du produit, prix, quantité, date d'achat, numéro de commande, vendeur, adresse de la page de commande, adresse de la photo du produit | Page « Détails de la commande » de cette boutique Amazon, lue **uniquement quand vous ouvrez l'extension** sur cet onglet | Préremplir le récapitulatif que vous relisez et modifiez | Affichés dans la fenêtre de l'extension ; envoyés à **votre instance HomeBox** après votre confirmation (hors la recherche de doublons décrite à la ligne suivante) |
| Numéro de commande et jusqu'à 3 mots du nom de chaque produit coché | Le récapitulatif que vous relisez | Signaler les objets déjà présents dans votre inventaire ou au nom proche | Recherchés sur **votre instance HomeBox** dès que vous cliquez sur « Ajouter », avant votre choix dans la fenêtre de doublon et même si vous annulez ensuite ; rien n'est stocké ni journalisé ; aucun autre destinataire. Si l'option des champs de commande est activée, le numéro de commande est aussi envoyé comme filtre de champ à **votre instance HomeBox**, et au plus 5 objets existants de même nom peuvent être relus pour confirmation ; toujours rien de stocké ni journalisé, aucun autre destinataire |
| L'objet HomeBox que vous choisissez de compléter au lieu de créer un doublon (son nom, sa quantité, ses notes, ses champs personnalisés, ses tags, les noms de ses pièces jointes, ses valeurs d'achat et de garantie) | **Votre instance HomeBox**, lu seulement après votre choix « Compléter » dans la fenêtre de doublon, puis de nouveau juste avant la mise à jour | Calculer et afficher ce que le complément ajouterait, puis n'écrire que les ajouts que vous avez confirmés, sans jamais écraser une valeur déjà renseignée | Lu puis mis à jour **sur votre instance HomeBox uniquement**, après votre confirmation ; rien de l'objet n'est stocké hors de l'import en cours ni journalisé ; aucun autre destinataire. L'historique des imports note seulement que l'objet a été « complété » |
| Facture PDF | Téléchargée uniquement depuis l'origine de la boutique de la commande (par exemple `https://www.amazon.de`), avec votre propre session sur cette boutique, ou PDF choisi sur votre ordinateur | La joindre à l'objet HomeBox | Envoyée à votre instance HomeBox après votre confirmation |
| Photo du produit | Téléchargée depuis le serveur d'images d'Amazon (`m.media-amazon.com`) sans cookie, sans référent ni clé API, uniquement si sa case est cochée | La joindre comme image principale de l'objet | Envoyée à votre instance HomeBox après votre confirmation ; jamais conservée par l'extension |
| Adresse et nom d'affichage de l'instance HomeBox (1 à 10 instances) | Vous les saisissez dans les paramètres | Savoir où envoyer l'import ; distinguer les instances | Stockés localement dans le navigateur (`homeboxInstances`) |
| Clé API HomeBox, une par instance | Vous la saisissez dans les paramètres | Authentifier les requêtes vers cette instance | Stockée **chiffrée** localement (AES-GCM 256, clé dérivée de votre phrase de passe avec PBKDF2-SHA256, 600 000 itérations, l'adresse de l'instance liée à sa clé) ; envoyée uniquement à **sa propre** instance |
| Phrase de passe | Vous la choisissez | Chiffrer et déverrouiller les clés API : une seule phrase de passe protège les clés de toutes les instances | **Jamais enregistrée** |
| Liste des emplacements HomeBox et dernier emplacement utilisé (identifiants uniquement) | Votre instance HomeBox | Vous laisser choisir où ranger l'objet | Lue depuis votre instance ; identifiants conservés localement |
| Garantie proposée avec chaque objet (date d'expiration, garantie à vie, détails), calculée depuis la date d'achat, et réglage de la garantie par défaut (activée ou non, durée) | L'extension et vous | Remplir les champs garantie de l'objet HomeBox | La garantie est envoyée à votre instance HomeBox après votre confirmation et n'est pas conservée par l'extension une fois l'import terminé ; le réglage est stocké localement (aucune donnée personnelle) |
| Tags HomeBox proposés (l'enseigne de la boutique, par exemple « Amazon », et les tags de vos propres règles) et tags que vous cochez dans le récapitulatif | L'extension, vos règles et vous | Classer l'objet dans HomeBox avec des tags | Lus sur **votre instance HomeBox** et, pour un tag qui n'existe pas encore, créés sur celle-ci (`GET`/`POST /api/v1/tags`) ; les tags sont créés et appliqués uniquement après votre confirmation, et seulement ceux cochés. Conservés seulement avec l'import en cours (`storage.session`), jamais dans l'historique des imports |
| Réglage des tags automatiques (`tagSettings` : proposer ou non le nom de la boutique, et vos règles « le nom du produit contient … → tag … ») | Vous | Proposer des tags dans le récapitulatif | Stocké localement dans `storage.local`, en clair (aucun secret, aucune donnée d'achat), jamais dans `storage.sync` |
| Modèles d'objets HomeBox choisis dans le récapitulatif (modèle, ses valeurs par défaut et les valeurs des champs personnalisés que vous confirmez) et modèle d'objet par défaut de chaque instance (identifiant et nom du modèle, `defaultTemplateByInstance`) | Votre instance HomeBox et vous | Créer l'objet à partir du modèle avec exactement les valeurs affichées | Les modèles et leurs valeurs sont lus uniquement sur l'instance HomeBox choisie et envoyés uniquement à celle-ci, après votre confirmation ; le modèle choisi et ses valeurs ne sont conservés qu'avec l'import en cours (`storage.session`), jamais dans l'historique des imports. Rien d'un modèle n'est conservé après l'import, hors ce modèle par défaut (identifiant et nom, stockés localement, effacé avec l'instance ou les réglages). Aucun nom de modèle, nom de champ ni valeur de champ n'est écrit dans les journaux |
| Détails de la commande enregistrés en champs personnalisés HomeBox (numéro de commande, marchand, adresse de la page de commande) et réglage des champs de commande de chaque instance (l'option et les trois noms de champs, `orderFieldsByInstance`), effacé avec l'instance ou les réglages | La page de commande, vos réglages et vous | Enregistrer la commande en champs personnalisés HomeBox, seulement si vous activez l'option pour cette instance (désactivée par défaut) | Les champs de commande (numéro de commande, marchand, adresse de la page de commande) sont écrits uniquement dans l'instance HomeBox choisie, après votre confirmation ; leurs valeurs ne sont conservées qu'avec l'import en cours (`storage.session`), jamais dans l'historique des imports, et les notes de l'objet ne changent pas. Les noms des champs personnalisés existants de l'instance sont lus pour les suggestions, jamais leurs valeurs, et ne sont jamais conservés. Aucun nom ni valeur de champ n'est écrit dans les journaux |
| Préférence de thème | Vous | Affichage | Stockée localement |
| Réglage du verrouillage automatique (`lockSettings` : à la fermeture du navigateur, après 15 minutes, 1 heure ou 4 heures d’inactivité, ou à chaque ouverture de l’extension) | Vous | Décider quand la phrase de passe est redemandée | Stocké localement ; un simple choix, sans secret |
| Heure de la dernière utilisation de l'extension déverrouillée (`homeboxActivity`, horodatage technique) | L'extension | Appliquer le verrouillage après inactivité | En mémoire du navigateur uniquement (`storage.session`), jamais sur le disque ; effacée au verrouillage ou à la fermeture du navigateur ; jamais affichée ni journalisée |
| Numéros de version : version annoncée après une mise à jour (`updateNotice`) et la version que le navigateur a prête à installer (`updateReady`) | L'extension et le navigateur | Afficher « Mise à jour vers vX » et le bouton « Mettre à jour maintenant » | `updateNotice` stocké localement ; `updateReady` en mémoire du navigateur uniquement (`storage.session`) |
| Historique des imports : nom du produit, boutique, numéro de commande, dates d'import et d'achat, adresse de l'instance HomeBox, identifiant de l'objet, résultat (complet, partiel, échoué) et ce qui manque (facture, manuel, garantie, bon de livraison, documents, photo, détails d'achat) | Chaque import que vous confirmez | Retrouver un objet importé, l'ouvrir dans HomeBox et repérer un import incomplet | Stocké localement, **chiffré avec votre phrase de passe** ; jamais envoyé ailleurs (activé par défaut, désactivable) |

L'extension ne lit **pas** votre adresse de livraison, votre moyen de paiement, votre historique de
navigation, ni aucune page autre que la page de commande Amazon sur laquelle vous l'ouvrez. La
facture PDF est transmise telle quelle : elle peut contenir des informations imprimées par Amazon sur le
document, comme votre nom ou votre adresse ; elle ne part que vers votre instance HomeBox.

## Plusieurs instances HomeBox

Vous pouvez configurer **plusieurs instances HomeBox** (1 à 10), par exemple une pour la maison et une pour un
atelier, et choisir la cible dans le récapitulatif avant de confirmer un import. Elles sont stockées localement
dans une seule liste (`homeboxInstances`) : pour chaque instance, son adresse, son nom d'affichage, sa clé API
chiffrée, sa clé masquée et le résultat de son dernier test de connexion. **Une seule phrase de passe** protège
toutes les clés ; chaque clé est chiffrée séparément et ne peut être déchiffrée que pour l'adresse de sa propre
instance. Chaque instance a **sa propre permission d’accès**, limitée à l'**origine exacte** de son adresse et
demandée à l'ajout de l'instance ; elle est retirée dès qu'aucune autre instance ne l’utilise. Les données d'un
import ne partent que vers l'instance choisie (une reprise vise toujours l'instance où l'import a commencé),
jamais vers une autre. La dernière instance utilisée pour un import réussi (`lastInstanceId`, un identifiant)
est mémorisée pour la proposer la fois suivante.

Chaque entrée de l'historique des imports porte un **identifiant opaque** (`inst`, hors du contenu chiffré) de
l'instance vers laquelle l'import a été fait, pour que son lien ouvre l'objet dans cette instance et qu'elle
puisse être effacée avec elle. Cet identifiant ne dit rien de l'instance par lui-même (ni adresse, ni nom).

**Supprimer une instance** (Paramètres → **Supprimer cette instance**) efface son adresse, son nom, sa clé API
chiffrée, sa clé masquée, son dernier test de connexion, son dernier emplacement, son modèle d'objet par défaut, ses entrées d’historique et ses
imports interrompus, et retire sa permission d'accès si aucune autre instance ne l’utilise. **Supprimer toute la
configuration** (à partir de deux instances ; **Supprimer la configuration** avec une seule) efface toutes les
instances et ce qui leur est rattaché.

## Où les données sont traitées et conservées

- **Dans votre navigateur** (`storage.local`) : la liste des instances (`homeboxInstances` : adresses, noms
  d'affichage, clés API chiffrées, clés masquées comme `hb_••••abcd`, résultats du dernier test de connexion),
  la dernière instance utilisée pour un import réussi (`lastInstanceId`), le dernier emplacement utilisé par
  instance, le modèle d'objet par défaut de chaque instance (identifiant et nom du modèle,
  `defaultTemplateByInstance`, effacé avec l'instance ou les réglages), le réglage des champs de commande de chaque instance (`orderFieldsByInstance` : l'option et les trois noms de champs, effacé avec l'instance ou les réglages), thème, réglage de la garantie par défaut, réglage des tags automatiques (`tagSettings` : option du nom de la boutique et règles de tags), et l'historique des imports (chaque entrée chiffrée en AES-GCM 256 avec une clé
  d'historique aléatoire, elle-même scellée par votre phrase de passe comme la clé API) avec son réglage
  d'activation, le réglage du verrouillage automatique (`lockSettings`) et la version de la dernière
  annonce de mise à jour (`updateNotice`).
- **En mémoire du navigateur** (`storage.session`, effacée à la fermeture du navigateur ou au
  verrouillage, au rechargement, à la mise à jour ou à la désactivation de l'extension) : les clés API
  déchiffrées des instances tant que l'extension est déverrouillée, et les données d'un import en cours pour pouvoir le
  reprendre après une erreur (sans le contenu des fichiers), l'heure de la dernière utilisation de
  l'extension (`homeboxActivity`) et la version que le navigateur a prête à installer (`updateReady`).
- **Sur votre instance HomeBox** : les objets, factures et photos que vous choisissez d'importer. Sa
  conservation et sa sécurité relèvent de votre responsabilité.
- Rien n'est placé dans `storage.sync`. Rien n'est stocké sur un serveur exploité par l'auteur de
  l'extension.

## Aucun transfert à des tiers

- L'extension ne contacte que : (1) la page de la boutique Amazon sur laquelle vous l'avez ouverte (son
  origine exacte, par exemple `https://www.amazon.de`), pour télécharger votre facture, et le serveur
  d'images d'Amazon (`m.media-amazon.com`) pour la photo du produit, au moment de l'import ; (2) **vos**
  instances HomeBox, chacune uniquement pour les opérations qui la visent (une clé API n'est jamais envoyée à
  une autre instance que la sienne). Elle ne contacte jamais une autre boutique Amazon que celle de la commande.
- Les tags proposés n'ajoutent **aucun nouveau destinataire** : la liste des tags est lue sur votre instance
  HomeBox (`GET /api/v1/tags`) et les tags absents y sont créés (`POST /api/v1/tags`) uniquement après votre
  confirmation. Aucune requête n'est faite à la boutique pour les tags : l'enseigne vient de l'extension elle-même.
- Les prix restent dans la devise de la commande : aucun service de taux de change ni autre tiers n'est
  contacté (aucune conversion de devise).
- Vos données et votre clé API ne sont **jamais** envoyées à l'auteur, à un serveur intermédiaire, à
  Amazon (la clé API ne part jamais de l'extension vers Amazon) ni à un autre tiers.
- Il n'y a ni publicité, ni statistiques, ni télémétrie, ni pistage, ni vente de données.
- L'extension ne charge aucun code distant.
- Rien n'est importé automatiquement : chaque import demande votre confirmation explicite.

## Verrouillage automatique

Vous choisissez quand l'extension oublie la clé API déchiffrée et vous redemande votre phrase de passe
(Configuration → **Verrouillage automatique**) : **à la fermeture du navigateur** (par défaut), **après
15 minutes**, **après 1 heure** ou **après 4 heures** d’inactivité, ou **à chaque ouverture de l’extension**.
L'inactivité correspond à l'absence d'utilisation de l'extension (popup, configuration, import) ; un import
en cours n'est jamais interrompu, le verrouillage s'applique à sa fin. Il n'y a **pas d'option « jamais »** :
la clé déchiffrée serait alors lisible par toute personne ou tout logiciel ayant accès à votre profil de
navigateur. Quel que soit votre choix, la clé est **oubliée à la fermeture du navigateur**, et vous pouvez
verrouiller l'extension à tout moment avec le bouton cadenas. Sans permission supplémentaire, le navigateur
ne réveille pas l'extension à heure fixe : le verrouillage est appliqué au plus tard à la première
utilisation de l'extension après l'échéance, avant tout usage de la clé. Le réglage lui-même ne contient
aucun secret.

## Mises à jour

L'extension ne fait **aucun appel réseau** pour vérifier les mises à jour : elle utilise seulement le
signal que le navigateur donne de lui-même quand une mise à jour a été installée ou est prête. Après une
mise à jour, une courte annonce (« Mise à jour vers vX ») propose un lien vers les notes de version sur
GitHub ; cette page n'est ouverte par le navigateur **que si vous cliquez** sur le lien. Quand le navigateur (Chrome ou Firefox) a une
mise à jour prête, un bouton **Mettre à jour maintenant** redémarre l'extension (la phrase de passe est
alors redemandée) ; il est désactivé tant qu'un import est en cours ou peut encore être repris. Les mises à
jour d'une installation depuis le Chrome Web Store viennent de ce magasin, celles d'une installation depuis
Firefox Add-ons (addons.mozilla.org) viennent de Firefox Add-ons ; l'extension elle-même ne contacte ni l'un
ni l'autre. Une installation Firefox chargée temporairement depuis une archive GitHub ne reçoit aucune mise à
jour du navigateur.

## Journaux

L'extension n'écrit aucune donnée personnelle dans la console du navigateur : seulement des codes
d'erreur, des statuts HTTP, des durées et des modèles génériques de points d'accès, jamais une adresse,
un nom de produit, un prix, un numéro de commande, un nom de tag, le texte d'une règle de tags ni la clé API.

## Conservation et suppression

- **Historique des imports** : au plus **200 entrées** et **12 mois** sont affichés ; les plus anciennes
  sont supprimées à l'ouverture de l'historique ou lors d'un import, extension déverrouillée (d'ici là,
  elles restent chiffrées et illisibles). Il est **chiffré avec votre phrase de passe**, comme la clé API : il est
  **illisible tant que l’extension est verrouillée** et **irrécupérable** si vous oubliez la phrase de
  passe. Il ne contient jamais la clé API, votre adresse de livraison, votre moyen de paiement, les
  factures ni les photos, ni l'adresse de la page Amazon. Vous pouvez l'effacer à tout moment, même
  verrouillée : **Supprimer** sur une entrée, **Tout effacer**, ou le désactiver dans la configuration (ce
  qui l'efface). **Supprimer la configuration** l'efface aussi. Reconfigurer l'extension verrouillée avec
  une nouvelle phrase de passe l'efface (un avertissement s'affiche avant). Désinstaller l'extension le
  supprime.
- Les données locales restent jusqu'à ce que vous les supprimiez. **Paramètres → Supprimer cette
  instance** efface une instance (voir « Plusieurs instances HomeBox » ci-dessus). **Paramètres → Supprimer la
  configuration** (**Supprimer toute la configuration** avec plusieurs instances) efface toutes les instances
  (adresses, noms, clés chiffrées), les imports en cours, les derniers emplacements, la dernière instance
  utilisée, l'historique des imports, et retire l'autorisation d'accès accordée à chaque instance. Le réglage du verrouillage automatique, la
  dernière annonce de mise à jour et le réglage des tags automatiques (`tagSettings`, aucune donnée personnelle) sont conservés. Désinstaller l'extension
  supprime tout son stockage dans le navigateur : dans Chrome depuis `chrome://extensions`, dans Firefox
  depuis `about:addons` (**Supprimer**).
- Vous pouvez aussi révoquer la clé API dans HomeBox à tout moment.
- Les objets déjà importés appartiennent à votre instance HomeBox : supprimez-les depuis celle-ci.
- L'auteur ne détient aucune copie de vos données : il n'y a donc rien à effacer de son côté.

## Vos droits (RGPD)

Comme l'auteur ne reçoit ni ne détient vos données, il n'existe aucune donnée détenue par l'auteur à
consulter, rectifier ou supprimer. Vos données restent sous votre contrôle, dans votre navigateur et sur
votre instance HomeBox, où vous pouvez les consulter, les rectifier, les exporter ou les supprimer à tout
moment. Si vous avez malgré tout une question ou une demande concernant cette politique, contactez-nous
comme indiqué plus bas. Vous avez aussi le droit d'introduire une réclamation auprès de votre autorité de
protection des données (en France, la CNIL).

## Politique relative aux données utilisateur du Chrome Web Store (Limited Use)

L'utilisation des informations reçues par homebox-clipper respecte la Chrome Web Store User Data Policy,
**y compris les exigences de « Limited Use »**. Les données servent uniquement à la finalité unique de
l'extension (importer un achat dans votre instance HomeBox), ne sont pas transférées à des tiers, ne
servent ni à la publicité ni à l'évaluation de solvabilité, et ne sont pas lues par des humains.

## Firefox Add-ons (addons.mozilla.org)

L'extension est aussi construite pour Firefox (version 140 ou ultérieure, ordinateur) et peut être publiée sur
Firefox Add-ons (addons.mozilla.org). **L'engagement est le même que ci-dessus et rien n'est affaibli** : les
données servent uniquement à la finalité unique de l'extension (importer un achat dans votre instance
HomeBox), ne sont pas transférées à des tiers, ne servent ni à la publicité ni à l'évaluation de solvabilité,
ne sont pas lues par des humains, et l'extension n'a ni serveur, ni compte, ni statistique, ni télémétrie.

- **Déclaration de collecte de données.** Firefox demande à chaque extension de déclarer, dans son manifeste
  (`data_collection_permissions`), les données qu'elle collecte ou transmet. HomeBox Clipper déclare une
  catégorie obligatoire : `websiteContent` (contenu de sites web). Elle signifie que le texte et l'adresse de
  la photo du produit de la page de commande Amazon que vous ouvrez, ainsi que la facture PDF, sont lus à votre
  clic et ne quittent le navigateur **que vers votre propre instance HomeBox**, après votre confirmation de
  l'import. Rien ne va vers l'auteur ni vers un tiers, et il n'y a aucune télémétrie ; la déclaration décrit ce
  seul flux, pas un transfert de données vers nous.
- **Accès aux sites.** Aucun accès à un site n'est accordé à l'installation. L'extension lit l'onglet actif
  uniquement à votre clic, et demande l'accès à l'**origine exacte** de chaque instance HomeBox quand vous
  l'ajoutez. Dans Firefox, vous pouvez retirer cet accès à tout moment dans `about:addons` › l'extension ›
  **Permissions** ; l'effet est le même que le retrait dans Chrome : l'extension ne peut plus joindre cette
  instance tant que vous n'accordez pas de nouveau l'accès (la configuration propose alors de redemander
  l'accès).
- **Fenêtres privées.** Firefox n'exécute pas les extensions dans les fenêtres privées sauf si vous
  l'autorisez (`about:addons` › l'extension › **Exécuter dans les fenêtres privées**). Le traitement des données
  est le même si vous l'autorisez.
- **Désinstallation.** Dans `about:addons`, **Supprimer** retire l'extension et ses données locales, comme
  `chrome://extensions` dans Chrome (voir « Conservation et suppression »).

## Sécurité

La clé API est protégée comme décrit sur la page
[Sécurité et confidentialité](https://github.com/Foufou-exe/homebox-clipper/wiki/Security-and-privacy).
Pour signaler une vulnérabilité, suivez [SECURITY.md](SECURITY.md) (pas d'issue publique).

## Modifications de cette politique

Les modifications sont publiées dans ce fichier, avec une date d'effet mise à jour ; son historique est
visible dans le dépôt. Un changement qui modifie le traitement des données sera annoncé dans les notes de
version.

## Contact

Pour toute question sur cette politique, ouvrez une issue sur
<https://github.com/Foufou-exe/homebox-clipper/issues> (n'y joignez jamais de clé API, d'adresse
d'instance ni de donnée personnelle), ou, pour un sujet de sécurité, suivez [SECURITY.md](SECURITY.md).

---

<sub>homebox-clipper est un projet indépendant, non affilié à Amazon ni à l'équipe HomeBox.</sub>
