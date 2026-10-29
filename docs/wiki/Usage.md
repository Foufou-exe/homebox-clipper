# Usage

Prérequis : l'extension est [installée](Installation.md) et [configurée](Configuration.md), et
déverrouillée pour la session en cours.

## Importer un achat Amazon.fr

1. Sur Amazon.fr, ouvrez **Vos commandes** puis **Afficher les détails de la commande**.
2. Cliquez sur l'icône de l'extension. À ce moment seulement, l'extension injecte son code de détection
   dans cet onglet (permission `activeTab`) et affiche le résumé de l'achat.
3. Vérifiez et corrigez les champs : nom du produit (obligatoire), description, prix d'achat, quantité,
   date d'achat, numéro de commande, vendeur. Les champs non détectés sont signalés « non détecté ».
4. Contrôlez les documents à joindre (facture détectée ou fichier local).
5. Cliquez sur **Ajouter à HomeBox**. Un message confirme l'ajout, avec le lien **Ouvrir dans HomeBox**.

Aucune écriture n'a lieu dans HomeBox avant ce clic. Le popup affiche en permanence l'instance ciblée
(« HomeBox : <adresse> »), avec la mention « HTTP non chiffré » si elle est en HTTP.

## Ce qui est créé dans HomeBox

| Information du résumé | Champ HomeBox |
|-----------------------|---------------|
| Nom du produit | Nom |
| Description (par défaut « Acheté sur Amazon.fr le JJ/MM/AAAA ») | Description |
| Quantité | Quantité |
| Prix unitaire | Prix d'achat |
| Date d'achat | Date d'achat |
| Vendeur (par défaut « Amazon.fr ») | Acheté chez |
| N° de commande et lien de la page de commande | Notes (« Commande Amazon.fr : <numéro> » puis l'adresse de la page) |
| Facture PDF | Pièce jointe de type **Reçu** |
| Bon de commande ajouté à la main | Pièce jointe de type **Pièce jointe** |

L'objet est créé avec le type par défaut de HomeBox, sans emplacement ni étiquette. La photo du produit
n'est affichée que dans le résumé : elle n'est pas envoyée.

## Commande à plusieurs articles

Le popup liste les « Produits détectés » : cochez ceux à importer. Chacun devient un objet HomeBox, avec
les documents sélectionnés joints.

## Saisie manuelle

Sur une page qui n'est pas une commande Amazon (page produit, autre site), l'extension indique
« Aucun achat détecté sur cette page » et propose un formulaire vide. Remplissez-le et, si besoin, joignez
un PDF depuis votre ordinateur avec **Choisir un PDF…** (type : *Facture* ou *Bon de commande*).

La saisie manuelle sert aussi quand la détection se trompe : vous pouvez corriger chaque champ, ou
**remplacer la facture détectée** par un fichier local plutôt que de l'ajouter.

## Fichiers acceptés

Seuls de vrais PDF sont envoyés : signature `%PDF-` vérifiée, **15 Mo maximum**. Les fichiers locaux sont
revérifiés par le service worker avant tout appel à HomeBox, même si l'interface les a déjà contrôlés.

## Doublons

Avant l'envoi, l'extension cherche dans HomeBox un objet dont les notes contiennent le même numéro de
commande et qui porte le même nom (comparaison insensible à la casse et aux espaces). Si elle en trouve un,
elle vous avertit (« Un objet semblable existe déjà dans HomeBox. ») avec un lien vers l'objet existant, et
vous laisse choisir. Si la vérification échoue (« La vérification des doublons n'a pas pu être effectuée. »),
l'import reste possible.

## Pas de facture

Si aucun document n'est joint, l'extension demande « Aucune facture ne sera jointe. Créer l'objet quand
même ? » avant de créer l'objet.

## Reprise sur erreur

Un import se fait en plusieurs appels (voir [Architecture](Architecture.md)). Si l'objet est créé mais que
la suite échoue (informations d'achat ou facture), le popup l'indique et propose **Réessayer l'envoi de la
facture** ou **Réessayer l'import**, **sans recréer l'objet**. Si vous fermez le popup, la reprise vous est
reproposée à sa prochaine ouverture sur le même onglet. Pour un fichier ajouté à la main, il faut le
sélectionner à nouveau (les octets des fichiers ne sont jamais conservés). **Abandonner** efface l'import
en cours sans contacter HomeBox, même extension verrouillée.

## Thèmes

Le popup suit le thème du système par défaut. Le bouton de la barre d'en-tête fait défiler
*Automatique*, *Clair* et *Sombre*; le choix est mémorisé.

## Limites

- Amazon.fr uniquement, et seulement la page « Détails de la commande » : voir [Supported-merchants](Supported-merchants.md).
- HomeBox enregistre un montant sans devise : pour un achat dans une autre devise que l'euro, l'extension
  vous prévient (« Devise détectée : … ») mais ne convertit pas.
- La détection dépend du HTML d'Amazon, qui change régulièrement : en cas de champ non détecté, utilisez la
  saisie manuelle et [signalez la page mal détectée](https://github.com/Foufou-exe/homebox-companion/issues).
