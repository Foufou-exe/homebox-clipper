# Dépannage et FAQ

Cette page reprend **tous les messages d'erreur** de l'extension (catalogue `error.*` de
`src/locales/fr.yml`), avec leur cause probable et la solution. Les messages sont classés par moment
d'apparition.

## Configuration

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| L'adresse HomeBox est invalide ou ne correspond pas à une instance HomeBox. | `INVALID_URL` | Adresse mal saisie, avec identifiant/mot de passe ou un autre protocole que http/https ; ou l'adresse ne répond pas comme HomeBox (erreur HTTP autre que 401/403 lors du test de connexion). | Vérifiez l'adresse. Dans un onglet, `<adresse>/api/v1/status` doit renvoyer du JSON. |
| Une adresse HTTPS est obligatoire. | `INSECURE_URL` | L'adresse est en `http://` et pointe vers un hôte public. | Passez en HTTPS (reverse proxy), ou utilisez l'adresse locale de l'instance (IP privée, nom en `.lan`…). Voir [Configuration](Configuration.md). |
| L'autorisation d'accès à votre instance HomeBox a été refusée. | `PERMISSION_DENIED` | Vous avez refusé la demande de Chrome, ou la permission a été retirée. | Cliquez de nouveau sur « Tester et enregistrer » et acceptez. |
| La phrase de passe doit contenir au moins 10 caractères. | `WEAK_PASSPHRASE` | Phrase de passe trop courte. | Choisissez-en une d'au moins 10 caractères. |
| Configurez d'abord votre instance HomeBox. | `NOT_CONFIGURED` | Aucune configuration enregistrée (ou clé migrée sans phrase de passe). | Ouvrez les options et renseignez adresse, clé et phrase de passe. |

## Connexion à HomeBox

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| HomeBox est inaccessible. Vérifiez l’adresse et votre connexion. | `HOMEBOX_UNREACHABLE` | Instance arrêtée, mauvais port, VPN ou pare-feu, ou délai de 15 secondes dépassé. | Vérifiez que l'instance tourne et que l'adresse s'ouvre dans le navigateur. |
| Clé API invalide ou expirée. | `UNAUTHORIZED` | Clé révoquée, expirée, mal copiée, ou invalidée parce que le secret serveur (pepper) a changé. | Recréez une clé dans HomeBox et enregistrez-la de nouveau. |
| Extension verrouillée : saisissez votre phrase de passe. | `LOCKED` | Le navigateur a redémarré ou vous avez cliqué sur 🔒. | Saisissez la phrase de passe dans le popup. |
| Phrase de passe incorrecte. | `WRONG_PASSPHRASE` | Phrase erronée (majuscules ?). | Ressaisissez-la. En cas d'oubli : « Supprimer la configuration » puis reconfigurez. |

## Détection sur la page

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Aucun achat détecté sur cette page. | `NOT_AN_ORDER_PAGE` | Page autre que « Détails de la commande » (liste des commandes, page produit), site non pris en charge, ou injection impossible. | Ouvrez la page **Détails de la commande**, ou utilisez la saisie manuelle ([Usage](Usage.md)). |
| Produit impossible à identifier : complétez les informations. | `PRODUCT_NOT_FOUND` | Le nom du produit n'a pas été détecté (mise en page modifiée) ou il est vide. | Saisissez le nom à la main (champ obligatoire). Signalez la page mal détectée. |
| Aucune facture détectée. | `INVOICE_MISSING` | La commande n'affiche aucun lien de facture (vendeur tiers, commande récente). | Joignez le PDF à la main, ou créez l'objet sans facture. |

## Factures et fichiers

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| La facture n'est pas encore disponible pour cette commande. | `INVOICE_UNAVAILABLE` | Fréquent juste après la commande ou avec certains vendeurs tiers ; lien absent ou réponse d'erreur d'Amazon. | Réessayez plus tard, ou joignez le PDF à la main. |
| Le téléchargement de la facture a été refusé (session Amazon expirée ?). | `DOWNLOAD_REFUSED` | Session Amazon expirée, onglet fermé ou rechargé, ou lien hors `www.amazon.fr`. | Reconnectez-vous à Amazon, rechargez la page, puis réessayez. |
| Le fichier n'est pas un PDF. | `NOT_A_PDF` | Le lien mène à une page HTML (ex. « Récapitulatif de commande »), ou le fichier choisi n'a pas la signature `%PDF-`. | Téléchargez la facture et joignez-la à la main. |
| Le fichier dépasse 15 Mo. | `FILE_TOO_LARGE` | Document trop volumineux. | Compressez le PDF ou n'envoyez qu'une partie. |
| Sélectionnez à nouveau le fichier à joindre pour réessayer. | `MANUAL_FILE_REQUIRED` | Reprise d'un import dont le fichier avait été ajouté à la main : les octets des fichiers ne sont jamais conservés. | Sélectionnez de nouveau le fichier, puis « Réessayer ». |

## Import et doublons

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Un objet semblable existe déjà dans HomeBox. | `DUPLICATE_SUSPECTED` | Au résumé : un objet de même nom contient déjà ce numéro de commande dans ses notes. À la reprise d'une création incertaine : un objet de même nom existe déjà (le numéro de commande n'est pas utilisé, l'objet ne l'a pas encore), y compris un produit acheté une autre fois. | Ouvrez l'objet existant (lien affiché) ; continuez seulement si c'est voulu. Après une reprise refusée : abandonnez, puis relancez depuis le résumé, qui demande confirmation. |
| La vérification des doublons n'a pas pu être effectuée. | `DUPLICATE_CHECK_FAILED` | La recherche dans HomeBox a échoué. Non bloquant au résumé ; **bloquant à la reprise d'une création incertaine** (aucune création n'est envoyée). | Au résumé : contrôlez à la main dans HomeBox, puis poursuivez. À la reprise : vérifiez dans HomeBox si l'objet existe, puis réessayez ou abandonnez. |
| La création de l'objet dans HomeBox a échoué. | `CREATE_FAILED` | HomeBox a refusé ou n'a pas pu traiter la création. Rien n'a été créé. | Vérifiez l'état de l'instance, puis « Réessayer l'import ». |
| L'objet a été créé mais les informations d'achat n'ont pas été enregistrées. | `UPDATE_FAILED` | La mise à jour (prix, date, vendeur, notes) a échoué après la création. | « Réessayer l'import » : l'objet existant est complété, jamais recréé. |
| L'objet a été créé mais l'envoi de la facture a échoué. | `ATTACHMENT_FAILED` | Instance injoignable ou erreur HomeBox pendant l'envoi de la pièce jointe. | « Réessayer l'envoi de la facture » : un seul objet, avec sa facture. |

## Photo du produit

La photo n'est jamais bloquante : l'objet et la facture sont conservés, et **Réessayer l'envoi de la photo**
ne relance que la photo.

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| La photo n'a pas pu être récupérée sur le site du marchand. | `PHOTO_UNAVAILABLE` | Réseau, délai dépassé, redirection, image supprimée ou serveur d'images qui refuse la requête. | Réessayez ; sinon ajoutez la photo à la main dans HomeBox. |
| Le fichier récupéré n'est pas une image valide : il n'a pas été envoyé. | `PHOTO_NOT_IMAGE` | Le serveur a renvoyé une page ou un format refusé (SVG, GIF). | Ajoutez la photo à la main dans HomeBox. |
| La photo dépasse 5 Mo : elle n'a pas été envoyée. | `PHOTO_TOO_LARGE` | Image plus lourde que la limite. | Ajoutez une version réduite à la main dans HomeBox. |
| L'objet a été créé mais l'envoi de la photo a échoué. | `PHOTO_UPLOAD_FAILED` | HomeBox a refusé la photo, ou l'extension n'a pas pu vérifier qu'elle n'était pas déjà jointe. | « Réessayer l'envoi de la photo » ; vérifiez dans HomeBox que l'objet n'a pas déjà sa photo. |

Si l'objet a deux photos, c'est qu'une connexion réutilisée a été coupée juste après le traitement de l'envoi
et que le navigateur a renvoyé la requête de lui-même. L'extension ne supprime rien dans HomeBox :
supprimez la photo en trop dans HomeBox.

**Risque résiduel.** La reprise après arrêt du service worker ne vaut que pour cet arrêt : les imports en
cours sont gardés dans `storage.session`, vidé à la fermeture du navigateur et à la mise à jour de
l'extension. Dans ces cas, rien n'est repris ; vérifiez dans HomeBox si l'objet a été créé.

Quand la réponse de la création est perdue (réseau, délai) ou que le service worker s'arrête pendant
l'envoi, l'objet a pu être créé sans que l'extension le sache (HomeBox ne propose pas de clé d'idempotence).
À la reprise, l'extension cherche alors dans HomeBox un objet de **même nom** (le numéro de commande n'est
écrit qu'à l'étape suivante) et refuse de réessayer si elle en trouve un, ou si cette recherche échoue.
Ce contrôle a des limites : faux positif si vous avez acheté le même produit une autre fois (abandonnez, puis
vérifiez d'abord dans HomeBox, puis abandonnez et relancez depuis le résumé. Attention : le résumé ne demande confirmation que si un objet de même nom contient déjà le numéro de commande, donc pas pour un objet resté incomplet : un second objet peut alors être créé sans nouvelle confirmation) ; doublon toujours possible si l'objet a été renommé
ou si la recherche ne le voit pas ; objet, facture et photo peuvent être doublés dans un cas de réseau rare : si une connexion est coupée juste après l'envoi, le navigateur peut renvoyer la requête de lui-même, et l'extension affiche alors un succès sans le savoir. En cas de doute, vérifiez dans HomeBox ; cette
protection ne peut pas être garantie à 100 %.

## Interne

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Erreur interne de l’extension. | `BAD_MESSAGE` | Message interne invalide, import introuvable, ou erreur inattendue. | Rechargez l'extension (↻ dans `chrome://extensions`) puis rouvrez la page. Si cela persiste, [ouvrez une issue](https://github.com/Foufou-exe/homebox-clipper/issues). |

## FAQ

**L'extension envoie-t-elle mes données quelque part ?** Non : seulement à votre instance HomeBox (et au
marchand pour lire la page). Voir [Security-and-privacy](Security-and-privacy.md).

**Pourquoi l'extension me demande-t-elle une phrase de passe ?** Pour chiffrer votre clé API sur le disque.
Elle est demandée une fois par session du navigateur.

**J'ai oublié ma phrase de passe.** Elle ne peut pas être récupérée : supprimez la configuration dans les
options, puis reconfigurez l'extension.

**Puis-je utiliser une instance en HTTP ?** Oui, sur le réseau local seulement. Voir
[Configuration](Configuration.md).

**Toutes mes clés API sont refusées après le redémarrage de HomeBox.** Le secret serveur (pepper) a changé :
remettez l'ancien, ou recréez les clés. Voir [Local-HomeBox-instance](Local-HomeBox-instance.md).

**Ça marche sur Firefox ?** Pas encore : Chrome et Chromium uniquement. Le portage est prévu (les appels au
navigateur passent par une couche d'abstraction unique, voir [Architecture](Architecture.md)).

**Mon site marchand n'est pas pris en charge.** Voir [Supported-merchants](Supported-merchants.md).

**L'extension a cessé de détecter mes commandes Amazon.** Amazon a probablement changé sa mise en page. Utilisez
la saisie manuelle et signalez le problème sans joindre la page brute. Côté code, la correction ne touche que
`src/content/merchants/amazon-fr/selectors.ts` ([Architecture](Architecture.md)).
