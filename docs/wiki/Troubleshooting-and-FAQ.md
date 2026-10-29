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
| Un objet semblable existe déjà dans HomeBox. | `DUPLICATE_SUSPECTED` | Un objet de même nom contient déjà ce numéro de commande dans ses notes. | Ouvrez l'objet existant (lien affiché) ; continuez seulement si c'est voulu. |
| La vérification des doublons n'a pas pu être effectuée. | `DUPLICATE_CHECK_FAILED` | La recherche dans HomeBox a échoué. Non bloquant. | Contrôlez à la main dans HomeBox, puis poursuivez. |
| La création de l'objet dans HomeBox a échoué. | `CREATE_FAILED` | HomeBox a refusé ou n'a pas pu traiter la création. Rien n'a été créé. | Vérifiez l'état de l'instance, puis « Réessayer l'import ». |
| L'objet a été créé mais les informations d'achat n'ont pas été enregistrées. | `UPDATE_FAILED` | La mise à jour (prix, date, vendeur, notes) a échoué après la création. | « Réessayer l'import » : l'objet existant est complété, jamais recréé. |
| L'objet a été créé mais l'envoi de la facture a échoué. | `ATTACHMENT_FAILED` | Instance injoignable ou erreur HomeBox pendant l'envoi de la pièce jointe. | « Réessayer l'envoi de la facture » : un seul objet, avec sa facture. |

## Interne

| Message affiché | Code | Cause probable | Solution |
|-----------------|------|----------------|----------|
| Erreur interne de l’extension. | `BAD_MESSAGE` | Message interne invalide, import introuvable, ou erreur inattendue. | Rechargez l'extension (↻ dans `chrome://extensions`) puis rouvrez la page. Si cela persiste, [ouvrez une issue](https://github.com/Foufou-exe/homebox-companion/issues). |

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
