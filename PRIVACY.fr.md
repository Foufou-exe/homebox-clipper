[English](PRIVACY.md) | **Français**

# Politique de confidentialité

**homebox-clipper** (l'« extension », publiée sous le nom « HomeBox Clipper ») · Date d'effet : **12 novembre 2026**

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
| Détails de l'achat lus sur la page de commande ouverte d'une boutique Amazon prise en charge (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) : nom du produit, prix, quantité, date d'achat, numéro de commande, vendeur, adresse de la page de commande, adresse de la photo du produit | Page « Détails de la commande » de cette boutique Amazon, lue **uniquement quand vous ouvrez l'extension** sur cet onglet | Préremplir le récapitulatif que vous relisez et modifiez | Affichés dans la fenêtre de l'extension ; envoyés à **votre instance HomeBox** après votre confirmation |
| Facture PDF | Téléchargée uniquement depuis l'origine de la boutique de la commande (par exemple `https://www.amazon.de`), avec votre propre session sur cette boutique, ou PDF choisi sur votre ordinateur | La joindre à l'objet HomeBox | Envoyée à votre instance HomeBox après votre confirmation |
| Photo du produit | Téléchargée depuis le serveur d'images d'Amazon (`m.media-amazon.com`) sans cookie, sans référent ni clé API, uniquement si sa case est cochée | La joindre comme image principale de l'objet | Envoyée à votre instance HomeBox après votre confirmation ; jamais conservée par l'extension |
| Adresse de l'instance HomeBox | Vous la saisissez dans les paramètres | Savoir où envoyer l'import | Stockée localement dans le navigateur |
| Clé API HomeBox | Vous la saisissez dans les paramètres | Authentifier les requêtes vers votre instance | Stockée **chiffrée** localement (AES-GCM 256, clé dérivée de votre phrase de passe avec PBKDF2-SHA256, 600 000 itérations) ; envoyée uniquement à votre instance |
| Phrase de passe | Vous la choisissez | Chiffrer et déverrouiller la clé API | **Jamais enregistrée** |
| Liste des emplacements HomeBox et dernier emplacement utilisé (identifiants uniquement) | Votre instance HomeBox | Vous laisser choisir où ranger l'objet | Lue depuis votre instance ; identifiants conservés localement |
| Préférence de thème | Vous | Affichage | Stockée localement |
| Historique des imports : nom du produit, boutique, numéro de commande, dates d'import et d'achat, adresse de l'instance HomeBox, identifiant de l'objet, résultat (complet, partiel, échoué) et ce qui manque (facture, photo, documents, détails d'achat) | Chaque import que vous confirmez | Retrouver un objet importé, l'ouvrir dans HomeBox et repérer un import incomplet | Stocké localement, **chiffré avec votre phrase de passe** ; jamais envoyé ailleurs (activé par défaut, désactivable) |

L'extension ne lit **pas** votre adresse de livraison, votre moyen de paiement, votre historique de
navigation, ni aucune page autre que la page de commande Amazon sur laquelle vous l'ouvrez. La
facture PDF est transmise telle quelle : elle peut contenir des informations imprimées par Amazon sur le
document, comme votre nom ou votre adresse ; elle ne part que vers votre instance HomeBox.

## Où les données sont traitées et conservées

- **Dans votre navigateur** (`storage.local`) : adresse de l'instance, clé API chiffrée, clé masquée
  (par exemple `hb_••••abcd`), résultat du dernier test de connexion, dernier emplacement utilisé par
  instance, thème, et l'historique des imports (chaque entrée chiffrée en AES-GCM 256 avec une clé
  d'historique aléatoire, elle-même scellée par votre phrase de passe comme la clé API) avec son réglage
  d'activation.
- **En mémoire du navigateur** (`storage.session`, effacée à la fermeture du navigateur ou au
  verrouillage, au rechargement, à la mise à jour ou à la désactivation de l'extension) : la clé API
  déchiffrée tant que l'extension est déverrouillée, et les données d'un import en cours pour pouvoir le
  reprendre après une erreur (sans le contenu des fichiers).
- **Sur votre instance HomeBox** : les objets, factures et photos que vous choisissez d'importer. Sa
  conservation et sa sécurité relèvent de votre responsabilité.
- Rien n'est placé dans `storage.sync`. Rien n'est stocké sur un serveur exploité par l'auteur de
  l'extension.

## Aucun transfert à des tiers

- L'extension ne contacte que : (1) la page de la boutique Amazon sur laquelle vous l'avez ouverte (son
  origine exacte, par exemple `https://www.amazon.de`), pour télécharger votre facture, et le serveur
  d'images d'Amazon (`m.media-amazon.com`) pour la photo du produit, au moment de l'import ; (2) **votre**
  instance HomeBox. Elle ne contacte jamais une autre boutique Amazon que celle de la commande.
- Les prix restent dans la devise de la commande : aucun service de taux de change ni autre tiers n'est
  contacté (aucune conversion de devise).
- Vos données et votre clé API ne sont **jamais** envoyées à l'auteur, à un serveur intermédiaire, à
  Amazon (la clé API ne part jamais de l'extension vers Amazon) ni à un autre tiers.
- Il n'y a ni publicité, ni statistiques, ni télémétrie, ni pistage, ni vente de données.
- L'extension ne charge aucun code distant.
- Rien n'est importé automatiquement : chaque import demande votre confirmation explicite.

## Journaux

L'extension n'écrit aucune donnée personnelle dans la console du navigateur : seulement des codes
d'erreur, des statuts HTTP, des durées et des modèles génériques de points d'accès, jamais une adresse,
un nom de produit, un prix, un numéro de commande ni la clé API.

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
- Les données locales restent jusqu'à ce que vous les supprimiez. **Paramètres → Supprimer la
  configuration** efface l'adresse, la clé chiffrée, les imports en cours, les derniers emplacements,
  l'historique des imports, et
  retire l'autorisation d'accès accordée à votre instance. Désinstaller l'extension supprime tout son
  stockage dans le navigateur.
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
