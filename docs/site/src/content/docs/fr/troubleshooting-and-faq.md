---
title: "Dépannage et FAQ"
description: "Les messages d'erreur, leur signification et la façon de les corriger, ainsi que les questions fréquentes."
---

Cette page liste **tous les messages d'erreur** de l'extension (le catalogue `error.*` de
`src/locales/en.yml`, l'anglais étant la langue par défaut), avec leur cause probable et la solution. Si votre
navigateur est en français, les mêmes messages apparaissent en français (`src/locales/fr.yml`) ; les codes sont
les mêmes. Les messages sont regroupés selon le moment où ils apparaissent.

## Configuration

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| L'adresse HomeBox est invalide ou ne correspond pas à une instance HomeBox. | `INVALID_URL` | Adresse mal saisie, avec un nom d'utilisateur/mot de passe ou un protocole autre que http/https ; ou l'adresse ne répond pas comme HomeBox (erreur HTTP autre que 401/403 pendant le test de connexion). | Vérifiez l'adresse. Dans un onglet, `<adresse>/api/v1/status` doit renvoyer du JSON. |
| Une adresse HTTPS est obligatoire. | `INSECURE_URL` | L'adresse utilise `http://` et pointe vers un hôte public. | Passez en HTTPS (reverse proxy), ou utilisez l'adresse locale de l'instance (IP privée, nom se terminant par `.lan`...). Voir [Configuration](/homebox-clipper/fr/configuration/). |
| L'autorisation d'accès à votre instance HomeBox a été refusée. | `PERMISSION_DENIED` | Vous avez refusé la demande du navigateur, ou la permission a été retirée (dans Firefox : `about:addons` › l'extension › **Permissions**). | Cliquez de nouveau sur « Tester et enregistrer » et acceptez. Avec plusieurs instances, utilisez **Redemander l’accès** sur la carte de cette instance. |
| La phrase de passe doit contenir au moins 10 caractères. | `WEAK_PASSPHRASE` | Phrase de passe trop courte. | Choisissez-en une d'au moins 10 caractères. |
| Cette instance HomeBox n’existe plus. Choisissez-en une autre. | `INSTANCE_NOT_FOUND` | L'instance a été supprimée (dans un autre onglet de configuration) après l'ouverture du récapitulatif, ou un import interrompu appartient à une instance qui n'existe plus. | Choisissez une autre instance dans le récapitulatif. Rien n'a été envoyé. |
| Vous avez déjà le nombre maximal d’instances HomeBox. | `INSTANCE_LIMIT` | 10 instances sont déjà configurées. | Supprimez une instance que vous n'utilisez plus, puis ajoutez la nouvelle. |
| Cette adresse est déjà configurée. | `INSTANCE_EXISTS` | L'adresse est déjà utilisée par une autre instance (après normalisation : `/` final, casse de l'hôte, port par défaut). | Utilisez cette instance, ou changez son adresse. |
| Le nom doit compter de 1 à 50 caractères. | `INSTANCE_NAME_INVALID` | Le nom affiché est vide (lors d'un renommage) ou dépasse 50 caractères. | Choisissez un nom de 1 à 50 caractères. |
| Une autre instance porte déjà ce nom. | `INSTANCE_NAME_TAKEN` | Une autre instance porte déjà ce nom (casse ignorée). | Choisissez un autre nom. |
| Un import vers cette instance est en cours. Réessayez quand il sera terminé. | `INSTANCE_BUSY` | Un import vers cette instance est en cours d'exécution. | Attendez la fin de l'import, puis supprimez l'instance. |
| La clé API de cette instance est illisible. Saisissez-la à nouveau. | `KEY_UNREADABLE` | La clé de cette instance ne peut pas être déchiffrée avec la bonne phrase de passe (données endommagées) ; affiché comme **Clé à ressaisir**. Les autres instances continuent de fonctionner. | Utilisez **Modifier l’adresse ou la clé** sur cette instance et saisissez à nouveau sa clé API. |
| Configurez d'abord votre instance HomeBox. | `NOT_CONFIGURED` | Aucune configuration enregistrée (ou clé migrée sans phrase de passe). | Ouvrez la configuration et renseignez l'adresse, la clé et la phrase de passe. |

## Connexion à HomeBox

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| HomeBox est inaccessible. Vérifiez l’adresse et votre connexion. | `HOMEBOX_UNREACHABLE` | Instance arrêtée, mauvais port, VPN ou pare-feu, délai de 15 secondes dépassé, ou HTTPS mal configuré. | Vérifiez que l'instance fonctionne et que l'adresse s'ouvre dans le navigateur et s'affiche comme sécurisée. |
| Clé API invalide ou expirée. | `UNAUTHORIZED` | Clé révoquée, expirée, mal copiée, ou invalidée parce que le secret du serveur (pepper) a changé. | Créez une nouvelle clé dans HomeBox et enregistrez-la de nouveau. |
| Extension verrouillée : saisissez votre phrase de passe. | `LOCKED` | Le navigateur a redémarré, l'extension a été mise à jour, vous avez cliqué sur 🔒, ou le verrouillage automatique s'est appliqué (**Configuration → Verrouillage automatique**). | Saisissez la phrase de passe dans la fenêtre contextuelle. |
| La collection HomeBox choisie pour cette instance n'est plus accessible avec cette clé. … | `COLLECTION_UNAVAILABLE` | Vous avez quitté la collection choisie dans **Collection cible**, ou elle a été supprimée. L'extension n'importe jamais ailleurs. | Ouvrez la configuration de l'instance et choisissez une autre collection, ou **Collection par défaut de la clé**. |
| La liste des collections de cette instance HomeBox n'a pas pu être obtenue. | `COLLECTIONS_UNAVAILABLE` | Instance inaccessible, ou version de HomeBox plus ancienne. | Réessayez ; la collection par défaut de la clé continue de fonctionner. |
| L'import fonctionne mais **Ouvrir dans HomeBox** n'affiche pas l'objet. | — | L'objet se trouve dans une autre collection que celle ouverte dans votre navigateur (la collection par défaut de la clé). | Ouvrez dans HomeBox la collection nommée dans le résultat, ou choisissez la collection cible dans la configuration. |
| Phrase de passe incorrecte. | `WRONG_PASSPHRASE` | Mauvaise phrase de passe (majuscules ?). | Saisissez-la de nouveau. En cas d'oubli : « Supprimer la configuration » puis reconfigurez. |

Si vous utilisez HTTPS pour vous connecter à HomeBox, le certificat doit être correctement configuré. Ajouter une exception en visitant votre instance HomeBox ne se transmet pas aux service workers utilisés par l'extension.

## Détection sur la page

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Aucun achat détecté sur cette page. | `NOT_AN_ORDER_PAGE` | Une page autre que « Détails de la commande » (liste des commandes, page produit), un site non pris en charge, ou une injection impossible. | Ouvrez la page **Détails de la commande**, ou utilisez la saisie manuelle ([Utilisation](/homebox-clipper/fr/usage/)). |
| Produit impossible à identifier : complétez les informations. | `PRODUCT_NOT_FOUND` | Le nom du produit n'a pas été détecté (mise en page modifiée) ou est vide. | Saisissez le nom à la main (champ obligatoire). Signalez la page mal détectée. |
| Aucune facture détectée. | `INVOICE_MISSING` | La commande n'affiche aucun lien de facture (vendeur tiers, commande récente). | Joignez le PDF à la main, ou créez l'objet sans facture. |

## Factures et fichiers

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Le document n'est pas encore disponible pour cette commande. | `INVOICE_UNAVAILABLE` | Fréquent juste après la commande ou avec certains vendeurs tiers ; lien manquant ou réponse d'erreur d'Amazon. | Réessayez plus tard, ou joignez le PDF à la main. |
| Le téléchargement du document a été refusé (session Amazon expirée ?). | `DOWNLOAD_REFUSED` | Session Amazon expirée, onglet fermé ou rechargé, ou lien en dehors de l'origine de la boutique de la commande (par exemple `www.amazon.de`). | Reconnectez-vous à Amazon, rechargez la page, puis réessayez. |
| Le fichier n'est pas un PDF. | `NOT_A_PDF` | Le lien mène à une page HTML (par exemple « Récapitulatif de commande »), ou le fichier choisi n'a pas la signature `%PDF-`. | Téléchargez la facture et joignez-la à la main. |
| Le fichier dépasse 15 Mo. | `FILE_TOO_LARGE` | Document trop volumineux. | Compressez le PDF ou n'en envoyez qu'une partie. |
| Sélectionnez à nouveau le fichier à joindre pour réessayer. | `MANUAL_FILE_REQUIRED` | Reprise d'un import dont le fichier a été ajouté à la main : les octets des fichiers ne sont jamais conservés. | Sélectionnez à nouveau le fichier, puis « Réessayer ». |

## Import et doublons

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Un objet semblable existe déjà dans HomeBox. | `DUPLICATE_SUSPECTED` | Au récapitulatif : un objet du même nom porte déjà ce numéro de commande dans ses notes (doublon certain), ou un objet a un nom proche (objets semblables, quelle que soit leur origine : autre commande, autre boutique, ajouté à la main). Lors de la reprise d'une création incertaine : un objet du même nom existe déjà (le numéro de commande n'est pas utilisé, l'objet ne l'a pas encore), y compris un produit acheté une autre fois. | Ouvrez l'objet (lien affiché) et comparez ; ne continuez que si c'est voulu. Après une reprise refusée : abandonnez, puis recommencez depuis le récapitulatif, qui demande une confirmation. |
| La vérification des doublons n'a pas pu être effectuée. | `DUPLICATE_CHECK_FAILED` | La recherche dans HomeBox a échoué, pour tous les produits ou seulement certains. Non bloquant au récapitulatif : la fenêtre des doublons liste les produits qui n'ont pas pu être vérifiés, et le message reste visible sur l'écran de résultat, pendant l'import et avec son résultat. **Bloquant lors de la reprise d'une création incertaine** (aucune création n'est envoyée). | Au récapitulatif : vérifiez à la main dans HomeBox, puis continuez. Pendant la reprise : vérifiez dans HomeBox si l'objet existe, puis réessayez ou abandonnez. |
| La création de l'objet dans HomeBox a échoué. | `CREATE_FAILED` | HomeBox a refusé ou n'a pas pu traiter la création. Rien n'a été créé. | Vérifiez l'état de l'instance, puis « Réessayer l'import ». |
| L'objet a été créé mais les informations d'achat n'ont pas été enregistrées. | `UPDATE_FAILED` | La mise à jour (prix, date, vendeur, notes) a échoué après la création. | « Réessayer l'import » : l'objet existant est complété, jamais recréé. |
| L'objet a été créé mais l'envoi d'un document a échoué. | `ATTACHMENT_FAILED` | Instance inaccessible ou erreur HomeBox pendant l'envoi de la pièce jointe. La fenêtre contextuelle nomme aussi le document (« Le manuel n'a pas pu être envoyé. »). | « Réessayer l'envoi des documents » : un seul objet, avec ses documents. |
| L'objet a été créé, mais le lien vers la page de commande n'a pas pu être ajouté. | `ORDER_LINK_FAILED` | L'option **Ajouter un lien vers la page de commande** est activée, et le lien externe n'a pas pu être ajouté après la création (instance inaccessible ou erreur HomeBox). | « Réessayer le lien de commande » : seul le lien est envoyé, et un lien déjà présent sur l'objet n'est jamais ajouté deux fois. |
| L'objet a été créé, mais cette instance HomeBox n'accepte pas les liens externes. | `ORDER_LINK_UNSUPPORTED` | L'instance a répondu 404 à la route des liens externes (HomeBox antérieur à 0.26.0, ou proxy qui la bloque). | Mettez HomeBox à jour ou désactivez l'option pour cette instance dans la configuration, puis abandonnez ou réessayez. |
| L'objet HomeBox choisi n'existe plus. Rien n'a été modifié. | `ITEM_NOT_FOUND` | Vous avez choisi **Compléter** un objet existant, et il a été supprimé dans HomeBox (ou n'est plus lisible avec cette clé) avant l'aperçu ou avant la mise à jour. Rien n'a été écrit et aucun objet n'a été créé à la place. | Revenez au récapitulatif, relancez la vérification des doublons, puis choisissez **Créer un nouvel objet** ou un autre objet. |

## Photo du produit

La photo n'est jamais bloquante : l'objet et la facture sont conservés, et **Réessayer l'envoi de la photo**
ne relance que la photo.

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| La photo n'a pas pu être récupérée sur le site du marchand. | `PHOTO_UNAVAILABLE` | Réseau, délai dépassé, redirection, image supprimée ou serveur d'images qui refuse la requête. | Réessayez ; sinon ajoutez la photo à la main dans HomeBox. |
| Le fichier récupéré n'est pas une image valide : il n'a pas été envoyé. | `PHOTO_NOT_IMAGE` | Le serveur a renvoyé une page ou un format refusé (SVG, GIF). | Ajoutez la photo à la main dans HomeBox. |
| La photo dépasse 5 Mo : elle n'a pas été envoyée. | `PHOTO_TOO_LARGE` | Image plus lourde que la limite. | Ajoutez une version plus légère à la main dans HomeBox. |
| L'objet a été créé mais l'envoi de la photo a échoué. | `PHOTO_UPLOAD_FAILED` | HomeBox a refusé la photo, ou l'extension n'a pas pu vérifier qu'elle n'était pas déjà jointe. | « Réessayer l'envoi de la photo » ; vérifiez dans HomeBox que l'objet n'a pas déjà sa photo. |

Si l'objet a deux photos, une connexion réutilisée a été coupée juste après le traitement de l'envoi et le
navigateur a renvoyé la requête de lui-même. L'extension ne supprime rien dans HomeBox : supprimez la photo en
trop dans HomeBox.

**Risque résiduel.** La reprise après l'arrêt d'un service worker ne couvre que cet arrêt : les imports en cours
sont conservés dans `storage.session`, qui est vidé à la fermeture du navigateur et à la mise à jour de
l'extension. Dans ces cas, rien n'est repris ; vérifiez dans HomeBox si l'objet a été créé.

Quand la réponse à la création est perdue (réseau, délai dépassé) ou que le service worker s'arrête pendant
l'envoi, l'objet a pu être créé sans que l'extension le sache (HomeBox n'offre aucune clé d'idempotence).
À la reprise, l'extension cherche alors dans HomeBox un objet du **même nom** (le numéro de commande n'est écrit
qu'à l'étape suivante) et refuse de réessayer si elle en trouve un, ou si cette recherche échoue. Cette
vérification a des limites : un faux positif si vous avez acheté le même produit une autre fois (abandonnez, puis
vérifiez d'abord dans HomeBox, puis abandonnez et recommencez depuis le récapitulatif. Attention : le récapitulatif
ne demande une confirmation que si un objet du même nom contient déjà le numéro de commande, donc pas pour un
objet laissé incomplet : un second objet peut alors être créé sans nouvelle confirmation) ; un doublon reste
possible si l'objet a été renommé ou si la recherche ne le voit pas ; l'objet, la facture et la photo peuvent être
doublés dans un cas réseau rare : si une connexion est coupée juste après l'envoi, le navigateur peut renvoyer la
requête de lui-même, et l'extension affiche alors un succès sans le savoir. En cas de doute, vérifiez dans
HomeBox ; cette protection ne peut pas être garantie à 100 %. Il en va de même quand HomeBox répond avec succès à
la création mais que la réponse est illisible : la création est alors traitée comme incertaine et la reprise
cherche d'abord l'objet par son nom.

## Emplacement

L'emplacement n'est jamais bloquant, sauf s'il a disparu de HomeBox.

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| La liste des emplacements n'a pas pu être obtenue. | `LOCATIONS_UNAVAILABLE` | HomeBox inaccessible, clé refusée ou réponse inattendue lors de la lecture des emplacements. | Importez sans emplacement (rangez ensuite l'objet dans HomeBox), ou vérifiez la connexion dans la configuration puis rouvrez la fenêtre contextuelle. |
| Cet emplacement n'existe plus dans HomeBox. Choisissez-en un autre ou importez sans emplacement. | `LOCATION_NOT_FOUND` | L'emplacement a été supprimé dans HomeBox entre le choix et l'envoi. Aucun objet n'a été créé pour ce produit. | Choisissez un autre emplacement et réessayez, ou **Importer sans emplacement**. |

Si la liste est vide, créez d'abord un emplacement dans HomeBox : l'extension n'en crée aucun. Le dernier
emplacement mémorisé, s'il n'existe plus, est simplement ignoré.

## Tags

Les tags ne sont jamais bloquants : l'objet est toujours créé en premier.

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| La liste des tags HomeBox n'a pas pu être obtenue. | `TAGS_UNAVAILABLE` | HomeBox inaccessible ou réponse inattendue lors de la lecture des tags. Au récapitulatif, les tags sont marqués *non vérifié* ; à l'import, les tags n'ont pas été ajoutés. | Importez quand même : les tags sont rapprochés au moment de votre confirmation. Si le résultat affiche *Tags non ajoutés*, vérifiez la connexion, puis **Réessayer**. |
| L'objet a été créé mais certains tags n'ont pas pu être ajoutés. | `TAG_FAILED` | HomeBox a refusé de créer ou de rattacher un tag (par exemple un tag supprimé entre-temps). L'objet et ses informations d'achat sont conservés. | **Réessayer** : seuls les tags manquants sont appliqués ; les tags déjà créés sont retrouvés, jamais dupliqués. |

Les tags déjà présents sur un objet sont toujours conservés : l'extension ne fait qu'ajouter des tags, elle n'en
retire jamais.

## Interne

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Erreur interne de l’extension. | `BAD_MESSAGE` | Message interne invalide, import introuvable, ou erreur inattendue. | Rechargez l'extension (↻ dans `chrome://extensions`) puis rouvrez la page. Si le problème persiste, [ouvrez une issue](https://github.com/Foufou-exe/homebox-clipper/issues). |

## FAQ

**L'extension envoie-t-elle mes données quelque part ?** Non : uniquement à votre instance HomeBox (et au
marchand pour lire la page). Voir [Sécurité et confidentialité](/homebox-clipper/fr/security-and-privacy/).

**Pourquoi l'extension demande-t-elle une phrase de passe ?** Pour chiffrer votre clé API sur le disque. Elle est
redemandée à chaque verrouillage de l'extension : à la fermeture du navigateur par défaut, ou selon **Configuration →
Verrouillage automatique**.

**Pourquoi la phrase de passe est-elle redemandée ?** L'extension s'est verrouillée : le navigateur a été fermé,
l'extension a été mise à jour ou rechargée, vous avez cliqué sur 🔒, ou le verrouillage automatique que vous avez
choisi s'est appliqué (inactivité, ou à chaque ouverture). Vérifiez **Configuration → Verrouillage automatique**.

**Pourquoi n'y a-t-il pas d'option « jamais » ?** La clé déchiffrée serait alors lisible par toute personne ou
tout logiciel ayant accès à votre profil de navigateur. Le choix le plus long la garde jusqu'à la fermeture du
navigateur.

**J'ai oublié ma phrase de passe.** Elle ne peut pas être récupérée : supprimez la configuration dans la page des
options, puis reconfigurez l'extension. Si vous l'avez oubliée alors que plusieurs instances sont configurées,
aucune clé ne peut plus être lue : utilisez **Supprimer toute la configuration**, puis ajoutez de nouveau vos
instances (l'historique des imports est effacé, comme avec une seule instance).

**Puis-je utiliser plusieurs instances HomeBox ?** Oui, jusqu'à 10, avec une seule phrase de passe. Ajoutez-les dans
la configuration et choisissez la cible dans le récapitulatif. Voir
[Configuration](/homebox-clipper/fr/configuration/#plusieurs-instances-homebox).

**Puis-je utiliser une instance en HTTP ?** Oui, sur le réseau local uniquement. Voir [Configuration](/homebox-clipper/fr/configuration/).

**Toutes mes clés API sont refusées après le redémarrage de HomeBox.** Le secret du serveur (pepper) a changé :
remettez l'ancien, ou recréez les clés. Voir [Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/).

**Est-ce que cela fonctionne sur Firefox ?** Oui : Firefox 140 ou ultérieur sur ordinateur (Firefox pour Android
n'est pas pris en charge). Voir
[Installation](/homebox-clipper/fr/getting-started/installation/#charger-lextension-dans-firefox).

- **Fenêtres de navigation privée.** Firefox n'exécute pas les extensions dans les fenêtres privées par défaut :
  autorisez-le dans `about:addons` › l'extension › **Exécuter dans les fenêtres privées**.
- **Accès retiré dans `about:addons`.** Si vous retirez l'accès à votre instance dans `about:addons` ›
  l'extension › **Permissions**, l'extension affiche le message « accès refusé » et **Redemander l’accès** :
  cliquez dessus et acceptez.
- **Pas de bouton « Mettre à jour maintenant » après un chargement depuis GitHub.** Un module chargé
  temporairement n'est pas mis à jour par le navigateur (voir ci-dessous).
- **Une facture ne peut pas être téléchargée.** Les messages existants s'appliquent (`INVOICE_UNAVAILABLE`,
  `DOWNLOAD_REFUSED`, voir le tableau ci-dessus) : reconnectez-vous à Amazon et réessayez, ou joignez le PDF à la
  main.

**Différences entre Firefox et Chrome.**

- L'archive de GitHub (`-firefox.zip`) n'est pas signée par Mozilla : elle ne peut être chargée que temporairement
  (`about:debugging`) et est retirée au redémarrage de Firefox. Une installation durable passe par Firefox Add-ons.
- Le bouton **Mettre à jour maintenant** n'apparaît que pour une installation depuis Firefox Add-ons, pas pour un
  chargement temporaire.
- Les fenêtres privées doivent être autorisées par l'utilisateur.
- Firefox pour Android n'est pas pris en charge.
- Les mêmes permissions et, pour le reste, le même comportement : une build par navigateur, aucun accès
  supplémentaire.

**Le site de mon marchand n'est pas pris en charge.** Voir [Marchands pris en charge](/homebox-clipper/fr/supported-merchants/).

**L'extension ne détecte plus mes commandes Amazon.** Amazon a probablement changé sa mise en page. Utilisez la
saisie manuelle et signalez le problème sans joindre la page brute. Côté code, la correction ne touche que
`src/content/merchants/amazon/selectors.ts` (ou `amazon/page-locales.ts` pour un libellé ou un nom de mois d'une
langue de page) ([Architecture](/homebox-clipper/fr/contributing/architecture/)).

**Dans quelle langue l'extension s'affiche-t-elle ?** En anglais, sauf si la langue de l'interface du navigateur
est le français. Voir [Traductions](/homebox-clipper/fr/contributing/translations/).
